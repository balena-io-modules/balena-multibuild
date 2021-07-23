/**
 * @license
 * Copyright 2017 Balena Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type * as Dockerode from 'dockerode';
import * as _ from 'lodash';
import { Builder, BuildHooks, FromTagInfo } from 'resin-docker-build';
import * as semver from 'semver';
import type * as Stream from 'stream';
import { DockerfileParser } from 'dockerfile-ast';

import type { SecretsPopulationMap } from './build-secrets';
import type { BuildTask } from './build-task';
import { BuildProcessError } from './errors';
import { pullExternal } from './external';
import { LocalImage } from './local-image';
import type { RegistrySecrets } from './registry-secrets';
import {
	DockerImageManifest,
	RegistryClient,
} from './registry/registry-client';

function taskHooks(
	task: BuildTask,
	docker: Dockerode,
	resolve: (image: LocalImage) => void,
): BuildHooks {
	let startTime: number;

	const setImageProperties = (
		image: LocalImage,
		layers: string[],
		fromTags: FromTagInfo[],
	) => {
		image.layers = layers;
		image.baseImageTags = fromTags;
		image.startTime = startTime;
		image.endTime = Date.now();
		image.dockerfile = task.dockerfile;
		image.projectType = task.projectType;
	};

	return {
		buildSuccess: (
			imageId: string,
			layers: string[],
			fromTags: FromTagInfo[],
		) => {
			const tag = task.tag != null ? task.tag : imageId;
			const image = new LocalImage(docker, tag, task.serviceName, {
				external: false,
				successful: true,
			});
			setImageProperties(image, layers, fromTags);
			resolve(image);
		},
		buildFailure: (error: Error, layers: string[], fromTags: FromTagInfo[]) => {
			const image = new LocalImage(
				docker,
				layers[layers.length - 1],
				task.serviceName,
				{ external: false, successful: false },
			);
			setImageProperties(image, layers, fromTags);
			image.error = error;
			resolve(image);
		},
		buildStream: (stream: Stream.Duplex) => {
			startTime = Date.now();
			if (_.isFunction(task.streamHook)) {
				task.streamHook(stream);
			}

			task.buildStream!.pipe(stream);
		},
	};
}

const generateBuildArgs = (
	task: BuildTask,
	userArgs?: Dictionary<string>,
): { buildargs?: Dictionary<string> } => {
	return {
		buildargs: { ...task.args, ...userArgs },
	};
};

const generateLabels = (task: BuildTask): { labels?: Dictionary<string> } => {
	return {
		labels: task.labels,
	};
};

/**
 * Given a build task which is primed with the necessary input, perform either
 * a build or a docker pull, and return this as a LocalImage.
 *
 * @param task The build task to perform
 * @param docker The handle to the docker daemon
 * @return a promise which resolves to a LocalImage which points to the produced image
 */
export async function runBuildTask(
	task: BuildTask,
	docker: Dockerode,
	registrySecrets: RegistrySecrets,
	secrets?: SecretsPopulationMap,
	buildArgs?: Dictionary<string>,
): Promise<LocalImage> {
	// Determine how we should handle the `platform` flag.
	// This will be a combination of factors:
	//
	// * _ Does the Docker version support it? _
	//   NOTE: docker api version 1.34 actually introduced platform to the
	//         api but it was broken until fixed in 1.38
	//         https://github.com/moby/moby/commit/7f334d3acfd7bfde900e16e393662587b9ff74a1
	//
	// * _ Do the images support it? _
	//   In order to support `plaform`, all images used in the Dockerfile must use the same
	//   architecture.  Determining this is problematic.  See comments in getRecommendedPlatformhHandling

	const usePlatformOption: boolean =
		!!task.dockerPlatform &&
		semver.satisfies(
			semver.coerce((await docker.version()).ApiVersion) || '0.0.0',
			'>=1.38.0',
		) &&
		(await getRecommendedPlatformhHandling(task, registrySecrets)) ===
			'allowEnginePlatformHandling';

	task.dockerOpts = _.merge(
		usePlatformOption ? { platform: task.dockerPlatform } : {},
		task.dockerOpts,
		// Merge registry secrets (from the build tar stream) last,
		// so that users' Dockerhub secrets may override balena's.
		{ registryconfig: registrySecrets },
	);

	if (task.external) {
		// Handle this separately
		return pullExternal(task, docker);
	}

	// Workaround to deal with timing issues when resolution takes longer.
	// Promise ensures that task is resolved before build process continues.
	const taskResolved = task.resolvedPromise || Promise.resolve();

	return new Promise((resolve, reject) => {
		taskResolved.then(() => {
			if (task.buildStream == null) {
				reject(
					new BuildProcessError('Null build stream on non-external image'),
				);
				return;
			}

			let dockerOpts = task.dockerOpts || {};
			dockerOpts = _.merge(
				dockerOpts,
				generateBuildArgs(task, buildArgs),
				generateLabels(task),
			);

			if (secrets != null && task.serviceName in secrets) {
				if (dockerOpts.volumes == null) {
					dockerOpts.volumes = [];
				}
				dockerOpts.volumes.push(
					`${secrets[task.serviceName].tmpDirectory}:/run/secrets:ro`,
				);
			}

			if (task.tag != null) {
				dockerOpts = _.merge(dockerOpts, { t: task.tag });
			}

			if (task.dockerfilePath != null) {
				dockerOpts = _.merge(dockerOpts, {
					dockerfile: task.dockerfilePath,
				});
			}

			const builder = Builder.fromDockerode(docker);
			const hooks = taskHooks(task, docker, resolve);

			builder.createBuildStream(dockerOpts, hooks, reject);
		});
	});
}

//   This method attempts to calculate if we should pass the `platform` flag to Docker, or
//   not.
//
///  The complexity arises from the fact that old v1 manifests do not describe architecture.
//   In such csaes, Docker will try to guess based on the platform of the image based
//   on the current machine arch.
//
//   When Docker recieves a target platform, these are the possible cases:
//
//      + V2 manifest for all images, and all images support the requested arch
//        Note that "support" means either it is a single arch image with the correct arch
//        or else it is a multi-arch image with one of the images matching arch
//          -> Result: Good to go
//
//      + V2 manifest for all images, and some do not suppor the requested arch
//          -> Result: Docker error
//
//      + Some V1 manifests, the plaform flag matches what Docker guesses
//          -> Result:  Docker will succeed if the guesses are correct or fail with
//                      execution error if one of the guesses is wrong.
//
//      + Some V1 manifests, platform flag does not match what Docker guesses
//          -> Result:  Docker will throw an error even if the images are actually the
//                      correct architecture, because it's guesses are wrong.
//
//   When Docker does not recieve the `plaform` flag, it sort of closes it's eyes and hopes
//   for the bests.  It has to do this in order to maintain backwards-compatible behaviour:
//
//      + V2 manifests for all images. If using multiarch images, Docker will
//        assumee the current platform.  If using single arch images, Docker will
//        assume the declared image arch is the correct platform.
//          -> Result: Docker builds, with a warning if the images do not match the
//                     current platform.  Everything works as long as bin_fmt
//                     is enabled correctly.  Otherwise, an execution error will occur.
//
//      + Some V1 manifests
//          -> Result: Docker builds, assuming that the platforms will match up.
//                     Everything works as long as bin_fmt is enabled correctly.
//                     Otherwise, an execution error will occur.
//
//   So what do we do?
//
//      + In the case of all images having a V2 manfifest, we can simply pass the plaform flag.
//
//      + In the case of having some V1 manifests ...
//          - If we have balenalib images, we know that they have been updated.  Throw an error
//            and tell the user to update
//          - If we do not have balenalib images, don't pass the platform flag.  Let Docker
//            close it's eyes and hope for the best.  This opens the possibility for an exec
//            error, but also allows users to continue to use v1 images if they want to / need to.
//
async function getRecommendedPlatformhHandling(
	task: BuildTask,
	registrySecrets: RegistrySecrets,
): Promise<'allowEnginePlatformHandling' | 'noPlatformHandling' | 'unknown'> {
	let imageReferences: Array<{
		imageName: string;
		tag?: string;
	}>;

	const getHasV1Manfiest = async (imageName: string, tag?: string) => {
		const registry = new RegistryClient({
			name: imageName,
			registrySecrets,
		});
		try {
			const manifest = await registry.getManifest(tag, 2, false);
			if (manifest && typeof manifest === 'object') {
				return (manifest as DockerImageManifest).schemaVersion === 1;
			}
		} catch {
			// eat exception, yummy
		}

		// at this time, treat any errors as true (v1 manifest)
		return true;
	};

	if (task.imageName) {
		imageReferences = [
			{
				imageName: task.imageName,
				tag: task.tag,
			},
		];
	} else {
		if (!task.dockerfile) {
			return 'unknown';
		}
		const parsedDockerfile = DockerfileParser.parse(task.dockerfile);
		const dockerInstructions = parsedDockerfile.getInstructions();
		const fromInstructions = dockerInstructions.filter(
			(inst) => inst.getKeyword() === 'FROM',
		);
		if (fromInstructions.length === 0) {
			// bail out, no FROM lines found?
			return 'unknown';
		}
		imageReferences = [];
		fromInstructions.forEach((inst) => {
			const fromLineArguments = inst.getArguments();
			if (fromLineArguments.length === 0) {
				// bail out, no image specified?
				return;
			}

			const fromSource = fromLineArguments[0].getValue();
			const separatorIndex = fromSource.lastIndexOf(':');

			let imageName = fromSource;
			let tag = 'latest';

			if (
				separatorIndex > 0 &&
				separatorIndex < fromSource.length - 1 &&
				fromSource[separatorIndex + 1] !== '/'
			) {
				// NOTE:  We use only the _first_ FROM directive to determine
				//        if there is a v2 manifest and therefore we can use
				//        the `platform` flag.  Mixing base images between
				//        those that have a v2 manifest and those that do not,
				//        while specifying `platform` is not supported.
				imageName = fromSource.slice(0, separatorIndex);
				tag = fromSource.slice(separatorIndex + 1);
			}

			imageReferences.push({
				imageName,
				tag,
			});
		});
	}

	let hasBalenaImages = false;
	let hasAnyV1Manifest = false;

	await Promise.all(
		imageReferences.map(async (r) => {
			const thisImageHasV1Manifest = await getHasV1Manfiest(r.imageName, r.tag);
			hasAnyV1Manifest = thisImageHasV1Manifest || hasAnyV1Manifest;
			hasBalenaImages = r.imageName.startsWith('balenalib/') || hasBalenaImages;
		}),
	);

	if (!hasAnyV1Manifest) {
		return 'allowEnginePlatformHandling';
	}
	if (hasBalenaImages) {
		throw new BuildProcessError(
			"Using outdated 'balenalib' images that do not support platform targetting.  Please update to the latest `balenalib` images",
		);
	}
	return 'noPlatformHandling';
}

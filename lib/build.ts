import * as Promise from 'bluebird';
import * as Dockerode from 'dockerode';
import * as _ from 'lodash';
import { Builder, BuildHooks, FromTagInfo } from 'resin-docker-build';
import * as semver from 'semver';
import * as Stream from 'stream';

import { SecretsPopulationMap } from './build-secrets';
import { BuildTask } from './build-task';
import { BuildProcessError } from './errors';
import { pullExternal } from './external';
import { LocalImage } from './local-image';
import { RegistrySecrets } from './registry-secrets';

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
	// check if docker supports propagating which platform to build for
	// NOTE: docker api version 1.34 actually introduced platform to the
	// api but it was broken until fixed in
	// https://github.com/moby/moby/commit/7f334d3acfd7bfde900e16e393662587b9ff74a1
	// which is why we check for 1.38 here
	const usePlatformOption: boolean =
		!!task.dockerPlatform &&
		semver.satisfies(
			semver.coerce((await docker.version()).ApiVersion) || '0.0.0',
			'>=1.38.0',
		);

	task.dockerOpts = {
		// First merge in the registry secrets (optionally being
		// overridden by user input) so that they're available for
		// both pull and build
		registryconfig: registrySecrets,
		// then merge in the target platform to ensure pullExternal
		// also considers it
		...(usePlatformOption ? { platform: task.dockerPlatform } : {}),
		...task.dockerOpts,
	};

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

import * as Promise from 'bluebird';
import * as Dockerode from 'dockerode';
import * as _ from 'lodash';
import { Builder, BuildHooks } from 'resin-docker-build';
import * as Stream from 'stream';

import { SecretsPopulationMap } from './build-secrets';
import { BuildTask } from './build-task';
import { BuildProcessError } from './errors';
import { pullExternal } from './external';
import { LocalImage } from './local-image';

function taskHooks(
	task: BuildTask,
	docker: Dockerode,
	resolve: (image: LocalImage) => void,
): BuildHooks {
	let startTime: number;
	return {
		buildSuccess: (imageId: string, layers: string[]) => {
			const tag = task.tag != null ? task.tag : imageId;
			const image = new LocalImage(docker, tag, task.serviceName, {
				external: false,
				successful: true,
			});
			image.layers = layers;
			image.startTime = startTime;
			image.endTime = Date.now();
			image.dockerfile = task.dockerfile;
			image.projectType = task.projectType;

			resolve(image);
		},
		buildFailure: (error: Error, layers: string[]) => {
			const image = new LocalImage(
				docker,
				layers[layers.length - 1],
				task.serviceName,
				{ external: false, successful: false },
			);
			image.layers = layers;
			image.error = error;
			image.startTime = startTime;
			image.endTime = Date.now();
			image.dockerfile = task.dockerfile;
			image.projectType = task.projectType;

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
export function runBuildTask(
	task: BuildTask,
	docker: Dockerode,
	secrets?: SecretsPopulationMap,
	buildArgs?: Dictionary<string>,
): Promise<LocalImage> {
	if (task.external) {
		// Handle this separately
		return pullExternal(task, docker);
	}

	return new Promise((resolve, reject) => {
		if (task.buildStream == null) {
			reject(new BuildProcessError('Null build stream on non-external image'));
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
}

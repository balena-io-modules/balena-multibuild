import * as Promise from 'bluebird';
import { DockerProgress } from 'docker-progress';
import * as Dockerode from 'dockerode';
import * as _ from 'lodash';

import { BuildTask } from './build-task';
import { BuildProcessError } from './errors';
import { LocalImage } from './local-image';

const hasImageTag = (name: string): boolean => {
	const tagRegex = /^.+:[^/]+$/;
	return tagRegex.test(name);
};

export function pullExternal(task: BuildTask, docker: Dockerode): Promise<LocalImage> {
	const dockerProgress = new DockerProgress();
	dockerProgress.docker.modem = docker.modem;

	const progressHook = _.isFunction(task.progressHook) ? task.progressHook : _.noop;

	if (task.imageName == null) {
		throw new BuildProcessError('No image name given for an external image');
	}
	let imageName = task.imageName;

	if (!hasImageTag(imageName)) {
		imageName += ':latest';
	}

	return dockerProgress.pull(
		imageName,
		progressHook,
		{}
	)
	.then(() => {
		return new LocalImage(docker, imageName, task.serviceName, { external: true, successful: true });
	})
	.catch((e) => {
		const image = new LocalImage(docker, null, task.serviceName, { external: true, successful: false });
		image.error = e;
		return image;
	});
}

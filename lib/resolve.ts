import * as Resolve from 'resin-bundle-resolve';
import * as Stream from 'stream';
import * as tar from 'tar-stream';

import { BuildTask } from './build-task';

/**
 * Given a BuildTask, resolve the project type to something that
 * the docker daemon can build (or return image pulls unchanged).
 *
 * @param task a BuildTask to resolve
 * @param architecture The architecture to resolve this project for
 * @param deviceType The device type to resolve this project for
 * @returns A promise which resolves to a new BuildTask
 * @throws ProjectResolutionError
 */
export function resolveTask(
	task: BuildTask,
	architecture: string,
	deviceType: string,
): BuildTask {
	if (task.external) {
		// No resolution needs to be performed for external images
		return task;
	}

	const dockerfileHook = (content: string) => {
		task.dockerfile = content;
	};

	const bundle = new Resolve.Bundle(
		task.buildStream as Stream.Readable,
		deviceType,
		architecture,
		dockerfileHook,
	);

	const resolvers = Resolve.getDefaultResolvers();

	const outStream = Resolve.resolveInput(
		bundle,
		resolvers,
		task.dockerfilePath,
	);
	task.buildStream = outStream as tar.Pack;
	outStream.on('resolver', r => {
		task.projectType = r;
		task.resolved = true;
	});
	outStream.on('resolved-name', name => {
		task.dockerfilePath = name;
	});

	return task;
}

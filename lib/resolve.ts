import * as Promise from 'bluebird';
import * as Resolve from 'resin-bundle-resolve';
import * as Stream from 'stream';

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
): Promise<BuildTask> {

	if (task.external) {
		// No resolution needs to be performed for external images
		return Promise.resolve(task);
	}

	const dockerfileHook = (content: string): Promise<void> => {
		task.dockerfile = content;
		return Promise.resolve();
	};

	const bundle = new Resolve.Bundle(
		task.buildStream as Stream.Readable,
		deviceType,
		architecture,
		dockerfileHook,
	);

	const resolvers = Resolve.getDefaultResolvers();

	return Resolve.resolveBundle(bundle, resolvers)
	.then((res: Resolve.ResolvedBundle) => {
		task.projectType = res.projectType;
		task.buildStream = res.tarStream;
		task.resolved = true;
		return task;
	})
	.catch(() => {
		task.projectType = 'Could not be detected';
		return task;
	});

}

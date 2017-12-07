import * as Promise from 'bluebird';
import * as Dockerode from 'dockerode';
import * as _ from 'lodash';
import * as Stream from 'stream';
import * as tar from 'tar-stream';
import * as TarUtils from 'tar-utils';
import * as Compose from 'resin-compose-parse';

import { runBuildTask } from './build';
import { BuildTask } from './build-task';
import { BuildProcessError, TarError } from './errors';
import { LocalImage } from './local-image';
import * as PathUtils from './path-utils';
import { resolveTask } from './resolve';
import * as Utils from './utils';

// Export external types
export * from './build-task';
export * from './errors';
export * from './local-image';

/**
 * Given a composition and stream which will output a valid tar archive,
 * split this stream into it's constiuent tasks, which may be a docker build,
 * or import of external image using docker pull.
 *
 * @param composition An object representing a parsed composition
 * @param buildStream A stream which will output a valid tar archive when read
 * @return A promise which resolves to an array of build tasks
 */
export function splitBuildStream(
	composition: Compose.Composition,
	buildStream: Stream.Readable,
): Promise<BuildTask[]> {

	return new Promise((resolve, reject) => {
		// Firstly create a list of BuildTasks based on the composition
		const tasks = Utils.generateBuildTasks(composition);

		const extract = tar.extract();

		const entryFn = (
			header: tar.TarHeader,
			stream: Stream.Readable,
			next: () => void,
		): void => {
			// Find the build context that this file should belong to
			const matchingTask = _.find(tasks, (task) => {
				if (task.external) {
					return false;
				}
				return PathUtils.contains(task.context!, header.name);
			});

			if (matchingTask != null) {
				const newHeader = header;
				newHeader.name = PathUtils.relative(matchingTask.context!, header.name);

				TarUtils.streamToBuffer(stream)
				.then((buf) => {
					matchingTask.buildStream!.entry(newHeader, buf);
					next();
					return null;
				})
				.catch((e) => {
					reject(new TarError(e));
				});
			} else {
				// To work around bugs in tar-stream, we need to drain the input
				// stream here, and drop the output
				Utils.drainStream(stream)
				.then(() => {
					next();
					return null;
				})
				.catch((e) => {
					reject(new TarError(e));
				});
			}
		};

		extract.on('entry', entryFn);
		extract.on('finish', () => {
			_.each(tasks, (task) => {
				if (!task.external) {
					task.buildStream!.finalize();
				}
			});
			resolve(tasks);
		});
		extract.on('error', (e) => {
			reject(new TarError(e));
		});

		buildStream.pipe(extract);
	});
}

/**
 * Given a list of build tasks, perform project resolution
 * on these build tasks, and return the new build tasks, ready
 * to be sent to the docker daemon.
 *
 * If analysis needs to occur on the dockerfile, this method must
 * be called before the build task will contain the dockerfile contents.
 *
 * @param tasks The build tasks to resolve
 * @param architecture The architecture to resolve for
 * @param deviceType The device type to resolve for
 * @returns A list of resolved build tasks
 * @throws ProjectResolutionError
 */
export function performResolution(
	tasks: BuildTask[],
	architecture: string,
	deviceType: string,
): Promise<BuildTask[]> {
	return Promise.map(tasks, (task: BuildTask) => {
		return resolveTask(task, architecture, deviceType);
	});
}

/**
 * Given a list of build tasks, and a handle to a docker daemon, this function
 * will perform the tasks and return a list of LocalImage values, which
 * represent images present on the docker daemon provided.
 *
 * @param tasks A list of build tasks to be performed
 * @param docker A handle to a docker daemon, retrieved from Dockerode
 * @return A promise which resolves to a list of LocalImages
 */
export function performBuilds(
	tasks: BuildTask[],
	docker: Dockerode,
): Promise<LocalImage[]> {
	return Promise.map(tasks, (task: BuildTask) => {
		return runBuildTask(task, docker)
		.catch((e) => {
			throw new BuildProcessError(e);
		});
	});
}

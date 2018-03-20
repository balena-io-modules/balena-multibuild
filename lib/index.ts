import * as Bluebird from 'bluebird';
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

const ALTERNATE_DOCKERFILE_PATH = '.resin/Dockerfile';
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
): Bluebird<BuildTask[]> {
	const images = Compose.parse(composition);
	return fromImageDescriptors(images, buildStream);
}

function setDefault<T>(obj: { [ k: string ]: T }, key: string, defaultValue: T): T {
	// setDefault(obj, k, v) -> obj[k] || v, also set obj[k]=v if k not in obj
	const value = obj[key];
	if (_.isUndefined(value)) {
		obj[key] = defaultValue;
		return defaultValue;
	}
	return value;
}

function getAlternateDockerfiles(tasks: BuildTask[]): { [s: string]: BuildTask[] } {
	const result: { [s: string]: BuildTask[] } = {};
	for (const task of tasks) {
		if (task.dockerfile) {
			setDefault(result, task.dockerfile, []).push(task);
			task.dockerfile = ALTERNATE_DOCKERFILE_PATH;
		}
	}
	return result;
}

function copyToTasksBuildStreams(tasks: BuildTask[], buffer: Buffer, header: tar.TarHeader, name: string) {
	// Adds the file to all tasks build streams as name.
	const updatedHeader = _.merge(header, { name });
	tasks.forEach((task) => {
		task.buildStream!.entry(updatedHeader, buffer);
	});
}

export function fromImageDescriptors(images: Compose.ImageDescriptor[], buildStream: Stream.Readable): Bluebird<BuildTask[]> {
	return new Bluebird((resolve, reject) => {
		// Firstly create a list of BuildTasks based on the composition
		const tasks = Utils.generateBuildTasks(images);

		// Dict of { filename: BuildTask } for all alternate Dockerfiles
		const alternateDockerfiles = getAlternateDockerfiles(tasks);

		const extract = tar.extract();

		extract.on('entry', async (header: tar.TarHeader, stream: Stream.Readable, next: () => void): Promise<void> => {
			const tasksMatchingAlternateDockerfile = alternateDockerfiles[PathUtils.normalize(header.name)] || [];

			// Find the build context that this file should belong to
			const matchingTasks = _.filter(tasks, (task) => {
				return !task.external || PathUtils.contains(task.context!, header.name);
			});

			let buf;
			try {
				if (matchingTasks.length || tasksMatchingAlternateDockerfile.length) {
					buf = await TarUtils.streamToBuffer(stream);
				} else {
					await Utils.drainStream(stream);
				}
			} catch (e) {
				reject(new TarError(e));
			}


			if (buf) {
				// Use the first matching context here, as the array must have at least one
				// entry, and the context by definition is the same
				copyToTasksBuildStreams(matchingTasks, buf, header, PathUtils.relative(matchingTasks[0].context!, header.name));

				// Copy the alternate Dockerfile to all the tasks needing it.
				copyToTasksBuildStreams(tasksMatchingAlternateDockerfile, buf, header, ALTERNATE_DOCKERFILE_PATH);
			}

			next();
		});

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
): Bluebird<BuildTask[]> {
	return Bluebird.map(tasks, (task: BuildTask) => {
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
): Bluebird<LocalImage[]> {
	return Bluebird.map(tasks, (task: BuildTask) => {
		return runBuildTask(task, docker)
		.catch((e) => {
			throw new BuildProcessError(e);
		});
	});
}

import * as Promise from 'bluebird';
import * as _ from 'lodash';
import { Readable } from 'stream';
import * as tar from 'tar-stream';

import { BuildTask } from './build-task';
import { Composition } from './types';

/**
 * In the tar-stream implementation, there are bugs which can cause it
 * to freeze if some of the entries are not drained, which can happen
 * when splitting the tar stream into it's constiuent streams.
 *
 * This function will drain a stream and drop the output, returning
 * a promise which resolves when the stream is drained.
 *
 * @param stream A readable stream to be drained
 * @return A promise which resolves when the stream is drained
 */
export function drainStream(stream: Readable): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		stream.on('data', _.noop);
		stream.on('error', reject);
		stream.on('end', resolve);
	});
}

/**
 * Given a composition, generate the set of build tasks which this module
 * will proceed to build.
 *
 * @param composition The composition from resin-compose-parse
 * @returns An array of tasks which make up this multicontainer build
 */
export function generateBuildTasks(composition: Composition): BuildTask[] {
	return _.map(composition.services, (service) => {
		if (_.isString(service.build)) {
			return {
				external: true,
				imageName: service.build,
				serviceName: service.name,
			};
		} else {
			return _.merge({
				external: false,
				serviceName: service.name,
				buildStream: tar.pack(),
			}, service.build);
		}
	});
}

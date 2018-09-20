import * as Promise from 'bluebird';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as fs from 'fs';
import * as _ from 'lodash';
import * as Compose from 'resin-compose-parse';
import * as Stream from 'stream';
import * as tar from 'tar-stream';

import { splitBuildStream } from '../lib/index';

chai.use(chaiAsPromised);
const expect = chai.expect;

const checkIsInStream = (tarStream: Stream.Readable, filenames: string | string[]): Promise<boolean> => {

	if (!_.isArray(filenames)) {
		filenames = [ filenames ];
	}

	return new Promise((resolve, reject) => {
		const extract = tar.extract();

		extract.on('entry', (header, stream, next) => {
			_.remove(filenames, (f) => f === header.name);

			stream.on('data', _.noop);
			stream.on('end', next);
			stream.on('error', reject);
		});
		extract.on('finish', () => {
			resolve(filenames.length === 0);
		});

		extract.on('error', reject);
		tarStream.pipe(extract);
	});
};

describe('Steam splitting', () => {
	it('should correctly split a stream', () => {
		const composeObj = require('../../test/test-files/stream/docker-compose');
		const comp = Compose.normalize(composeObj);

		const stream = fs.createReadStream('test/test-files/stream/project.tar');

		return splitBuildStream(comp, stream)
		.then((tasks) => {
			expect(tasks).to.have.length(2);
			return Promise.map(tasks, (task) => {
				return checkIsInStream(task.buildStream, 'Dockerfile')
				.then((found) => {
					expect(found).to.equal(true);
				});
			});
		});
	});

	it('should allow the sharing of build contexts', () => {
		const composeObj = require('../../test/test-files/stream/docker-compose-shared.json');
		const comp = Compose.normalize(composeObj);

		const stream = fs.createReadStream('test/test-files/stream/project.tar');

		return splitBuildStream(comp, stream)
		.then((tasks) => {
			expect(tasks).to.have.length(2);
			return Promise.map(tasks, (task) => {
				return checkIsInStream(task.buildStream, 'Dockerfile')
				.then((found) => {
					expect(found).to.equal(true);
				});
			});
		});
	});

	it('should allow the sharing of the root build context', () => {
		const composeObj = require('../../test/test-files/stream/docker-compose-shared-root');
		const comp = Compose.normalize(composeObj);

		const stream = fs.createReadStream('test/test-files/stream/shared-root-context.tar');

		return splitBuildStream(comp, stream)
		.then((tasks) => {
			expect(tasks).to.have.length(2);

			return Promise.map(tasks, (task) => {

				if (task.context === './') {
					return checkIsInStream(task.buildStream, [ 'Dockerfile', 'test1/Dockerfile' ])
						.then((found) => expect(found).to.equal(true));
				} else {
					return checkIsInStream(task.buildStream, 'Dockerfile')
						.then((found) => expect(found).to.equal(true));
				}
			});
		});
	});

});

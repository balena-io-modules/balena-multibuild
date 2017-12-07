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

const checkIsInStream = (tarStream: Stream.Readable, filename: string): Promise<boolean> => {
	return new Promise((resolve, reject) => {
		const extract = tar.extract();
		let found = false;

		extract.on('entry', (header, stream, next) => {
			if (header.name === filename) {
				found = true;
			}
			stream.on('data', _.noop);
			stream.on('end', next);
			stream.on('error', reject);
		});
		extract.on('finish', () => {
			resolve(true);
		});

		extract.on('error', reject);
		tarStream.pipe(extract);
	});
};

describe('Steam splitting', () => {
	it('should correctly split a stream', () => {
		const composeObj = require('./test-files/stream/docker-compose');
		const comp = Compose.normalize(composeObj);

		const stream = fs.createReadStream(require.resolve('./test-files/stream/project.tar'));

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
});

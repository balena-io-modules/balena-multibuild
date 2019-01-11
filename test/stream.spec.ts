import * as Bluebird from 'bluebird';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as fs from 'fs';
import * as _ from 'lodash';
import * as Compose from 'resin-compose-parse';
import * as Stream from 'stream';
import * as tar from 'tar-stream';

import { splitBuildStream } from '../lib/index';

chai.use(chaiAsPromised);
chai.should();
const expect = chai.expect;

const checkIsInStream = (
	tarStream: Stream.Readable,
	filenames: string | string[],
): Bluebird<boolean> => {
	if (!_.isArray(filenames)) {
		filenames = [filenames as string];
	}

	return new Bluebird((resolve, reject) => {
		const extract = tar.extract();

		extract.on('entry', (header, stream, next) => {
			_.remove(filenames, f => f === header.name);

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

		return splitBuildStream(comp, stream).then(tasks => {
			expect(tasks).to.have.length(2);
			return Bluebird.map(tasks, task => {
				return checkIsInStream(task.buildStream, 'Dockerfile').then(found => {
					expect(found).to.equal(true);
				});
			});
		});
	});

	it('should allow the sharing of build contexts', () => {
		const composeObj = require('../../test/test-files/stream/docker-compose-shared.json');
		const comp = Compose.normalize(composeObj);

		const stream = fs.createReadStream('test/test-files/stream/project.tar');

		return splitBuildStream(comp, stream).then(tasks => {
			expect(tasks).to.have.length(2);
			return Bluebird.map(tasks, task => {
				return checkIsInStream(task.buildStream, 'Dockerfile').then(found => {
					expect(found).to.equal(true);
				});
			});
		});
	});

	it('should allow the sharing of the root build context', () => {
		const composeObj = require('../../test/test-files/stream/docker-compose-shared-root');
		const comp = Compose.normalize(composeObj);

		const stream = fs.createReadStream(
			'test/test-files/stream/shared-root-context.tar',
		);

		return splitBuildStream(comp, stream).then(tasks => {
			expect(tasks).to.have.length(2);

			return Bluebird.map(tasks, task => {
				if (task.context === './') {
					return checkIsInStream(task.buildStream, [
						'Dockerfile',
						'test1/Dockerfile',
					]).then(found => expect(found).to.equal(true));
				} else {
					return checkIsInStream(task.buildStream, 'Dockerfile').then(found =>
						expect(found).to.equal(true),
					);
				}
			});
		});
	});

	describe('Specifying a Dockerfile', () => {
		it('should throw an error when a build object does not contain a context and dockerfile', done => {
			const composeObj = require('../../test/test-files/stream/docker-compose-specified-dockerfile-no-context.json');
			const comp = Compose.normalize(composeObj);

			const stream = fs.createReadStream(
				'test/test-files/stream/specified-dockerfile.tar',
			);

			Promise.resolve(
				splitBuildStream(comp, stream),
			).should.be.rejected.and.notify(done);
		});

		it('should allow specifying a dockerfile in the composition', async () => {
			const composeObj = require('../../test/test-files/stream/docker-compose-specified-dockerfile.json');
			const comp = Compose.normalize(composeObj);

			const stream = fs.createReadStream(
				'test/test-files/stream/specified-dockerfile.tar',
			);

			const tasks = await splitBuildStream(comp, stream);
			expect(tasks).to.have.length(1);
		});
	});
});

import * as Promise from 'bluebird';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as fs from 'fs';
import * as _ from 'lodash';
import * as Compose from 'resin-compose-parse';
import * as Stream from 'stream';
import * as tar from 'tar-stream';

import { generateBuildArgs } from '../lib/build';
import { splitBuildStream } from '../lib/index';

chai.use(chaiAsPromised);
const expect = chai.expect;

const extractFileFromTarStream = (tarStream: Stream.Readable, filename: string): Promise<Buffer | null> => {
	return new Promise((resolve, reject) => {
		const extract = tar.extract();
		const chunks = [];

		extract.on('entry', (header, stream, next) => {
			stream.on('data', (header.name === filename) ? chunks.push.bind(chunks) : _.noop);
			stream.on('end', next);
			stream.on('error', reject);
		});
		extract.on('finish', () => {
			resolve(chunks.length ? Buffer.concat(chunks) : null);
		});

		extract.on('error', reject);
		tarStream.pipe(extract);
	});
};

const extractFileFromTar = (tarPath: string, filePath: string): Promise<Buffer | null> => {
	return extractFileFromTarStream(fs.createReadStream(require.resolve(tarPath)), filePath);
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
				return extractFileFromTarStream(task.buildStream, 'Dockerfile')
				.then((data) => {
					expect(data).to.not.equal(null);
				});
			});
		});
	});

	it('should allow the sharing of build contexts', () => {
		const composeObj = require('./test-files/stream/docker-compose-shared');
		const comp = Compose.normalize(composeObj);

		const stream = fs.createReadStream(require.resolve('./test-files/stream/project.tar'));

		return splitBuildStream(comp, stream)
		.then((tasks) => {
			expect(tasks).to.have.length(2);
			return Promise.map(tasks, (task) => {
				return extractFileFromTarStream(task.buildStream, 'Dockerfile')
				.then((data) => {
					expect(data).to.not.equal(null);
				});
			});
		});
	});

	it('should correctly split a stream and use the alternate Dockerfile', async () => {
		const projectTarPath = './test-files/stream-alternate-dockerfile/project.tar';
		const composeObj = require('./test-files/stream-alternate-dockerfile/docker-compose');
		const dockerfileContent = await extractFileFromTar(projectTarPath , './test1/Dockerfile');
		const alternateDockerfileContent = await extractFileFromTar(projectTarPath , './test2/Dockerfile-alternate');
		const comp = Compose.normalize(composeObj);
		const stream = fs.createReadStream(require.resolve(projectTarPath));
		const tasks = await splitBuildStream(comp, stream);
		expect(tasks).to.have.length(2);
		expect(await extractFileFromTarStream(tasks[0].buildStream, 'Dockerfile')).to.deep.equal(dockerfileContent);
		expect(await extractFileFromTarStream(tasks[1].buildStream, '.resin/Dockerfile')).to.deep.equal(alternateDockerfileContent);
		expect(tasks[0].dockerfile).to.equal(undefined);
		expect(tasks[1].dockerfile).to.equal('.resin/Dockerfile');
		expect(generateBuildArgs(tasks[0])).to.deep.equal({});
		expect(generateBuildArgs(tasks[1])).to.deep.equal({ dockerfile: '.resin/Dockerfile' });
	});

	it('should allow the sharing of build contexts and use the alternate Dockerfile', async () => {
		const projectTarPath = './test-files/stream-alternate-dockerfile/project.tar';
		const composeObj = require('./test-files/stream-alternate-dockerfile/docker-compose-shared');
		const comp = Compose.normalize(composeObj);
		const dockerfileContent = await extractFileFromTar(projectTarPath , './test1/Dockerfile');
		const alternateDockerfileContent = await extractFileFromTar(projectTarPath , './test1/Dockerfile-alternate');
		const stream = fs.createReadStream(require.resolve('./test-files/stream-alternate-dockerfile/project.tar'));
		const tasks = await splitBuildStream(comp, stream);
		expect(tasks).to.have.length(2);
		expect(await extractFileFromTarStream(tasks[0].buildStream, 'Dockerfile')).to.deep.equal(dockerfileContent);
		expect(await extractFileFromTarStream(tasks[1].buildStream, '.resin/Dockerfile')).to.deep.equal(alternateDockerfileContent);
		expect(tasks[0].dockerfile).to.equal(undefined);
		expect(tasks[1].dockerfile).to.equal('.resin/Dockerfile');
		expect(generateBuildArgs(tasks[0])).to.deep.equal({});
		expect(generateBuildArgs(tasks[1])).to.deep.equal({ dockerfile: '.resin/Dockerfile' });
	});

	it('should allow the sharing of build contexts and use the alternate Dockerfile that is not in a context', async () => {
		const projectTarPath = './test-files/stream-alternate-dockerfile/project.tar';
		const composeObj = require('./test-files/stream-alternate-dockerfile/docker-compose2');
		const comp = Compose.normalize(composeObj);
		const dockerfileContent = await extractFileFromTar(projectTarPath , './test1/Dockerfile');
		const alternateDockerfileContent = await extractFileFromTar(projectTarPath , './Dockerfile3');
		const stream = fs.createReadStream(require.resolve('./test-files/stream-alternate-dockerfile/project.tar'));
		const tasks = await splitBuildStream(comp, stream);
		expect(tasks).to.have.length(2);
		expect(await extractFileFromTarStream(tasks[0].buildStream, 'Dockerfile')).to.deep.equal(dockerfileContent);
		expect(await extractFileFromTarStream(tasks[1].buildStream, '.resin/Dockerfile')).to.deep.equal(alternateDockerfileContent);
		expect(tasks[0].dockerfile).to.equal(undefined);
		expect(tasks[1].dockerfile).to.equal('.resin/Dockerfile');
		expect(generateBuildArgs(tasks[0])).to.deep.equal({});
		expect(generateBuildArgs(tasks[1])).to.deep.equal({ dockerfile: '.resin/Dockerfile' });
	});
});

import * as Promise from 'bluebird';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as fs from 'fs';
import { Pack } from 'tar-stream';

import { BuildTask } from '../lib/build-task';
import { resolveTask } from '../lib/resolve';

chai.use(chaiAsPromised);
const expect = chai.expect;

describe('Project resolution', () => {
	it('should correctly resolve a project type', () => {
		const task: BuildTask = {
			external: false,
			resolved: false,
			buildStream: (fs.createReadStream(
				'test/test-files/templateProject.tar',
			) as any) as Pack,
			serviceName: 'test',
		};

		const newTask = resolveTask(task, 'test', 'test');
		return new Promise(resolve => {
			newTask.buildStream.resume();
			newTask.buildStream.on('end', () => {
				expect(newTask.projectType).to.equal('Dockerfile.template');
				expect(newTask.resolved).to.equal(true);
				resolve();
			});
		});
	});

	it('should indicate if it cannot resolve a project', () => {
		const task: BuildTask = {
			external: false,
			resolved: false,
			serviceName: 'test',
			buildStream: (fs.createReadStream(
				'test/test-files/failedProject.tar',
			) as any) as Pack,
		};

		const newTask = resolveTask(task, 'test', 'test');
		return new Promise((resolve, reject) => {
			newTask.buildStream.resume();
			newTask.buildStream.on('end', () => {
				reject(new Error('No error thrown on resolution failure'));
			});
			newTask.buildStream.on('error', () => {
				resolve();
			});
		});
	});
});

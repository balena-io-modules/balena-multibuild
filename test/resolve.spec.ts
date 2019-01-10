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

		return resolveTask(task, 'test', 'test').then(newTask => {
			expect(newTask.projectType).to.equal('Dockerfile.template');
			expect(newTask.resolved).to.equal(true);
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

		return resolveTask(task, 'test', 'test').then(newTask => {
			expect(newTask)
				.to.have.property('resolved')
				.that.equals(false);
		});
	});
});

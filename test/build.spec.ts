/**
 * @license
 * Copyright 2019 Balena Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import * as Bluebird from 'bluebird';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as Dockerode from 'dockerode';
import * as fs from 'fs';
import * as Path from 'path';
import * as Compose from 'resin-compose-parse';
import * as Stream from 'stream';
import * as tar from 'tar-stream';
import * as Url from 'url';

import { splitBuildStream } from '../lib/';
import { runBuildTask } from '../lib/build';
import BuildMetadata from '../lib/build-metadata';
import { BuildTask } from '../lib/build-task';
import { BuildProcessError } from '../lib/errors';
import { LocalImage } from '../lib/local-image';
import { resolveTask } from '../lib/resolve';

chai.use(chaiAsPromised);
const expect = chai.expect;

let dockerOpts: any;
if (process.env.CIRCLECI != null) {
	let ca: string;
	let cert: string;
	let key: string;

	const certs = ['ca.pem', 'cert.pem', 'key.pem'].map(f =>
		Path.join(process.env.DOCKER_CERT_PATH!, f),
	);
	[ca, cert, key] = certs.map(c => fs.readFileSync(c, 'utf-8'));
	const parsed = Url.parse(process.env.DOCKER_HOST!);

	dockerOpts = {
		host: 'https://' + parsed.hostname,
		port: parsed.port,
		ca,
		cert,
		key,
		Promise: Bluebird,
	};
} else {
	dockerOpts = { socketPath: '/var/run/docker.sock', Promise: Bluebird };
}

const docker = new Dockerode(dockerOpts);

const fileToTarPack = (filename: string): tar.Pack => {
	// A little hacky, but it's fine for the tests
	return (fs.createReadStream(filename) as any) as tar.Pack;
};

const checkExists = (name: string) => {
	return docker.getImage(name).inspect();
};

const printOutput = process.env.DISPLAY_TEST_OUTPUT === '1';
const streamPrinter = (stream: Stream.Readable) => {
	if (printOutput) {
		stream.on('data', data => console.log(data));
	}
};
const buildMetadata = new (BuildMetadata as any)('/tmp/');
buildMetadata.balenaYml = {
	buildSecrets: {},
	buildVariables: {},
};
const secretMap = {};
const buildVars = {};

describe('Project building', () => {
	it('should correctly build a standard dockerfile project', () => {
		const task = {
			resolved: false,
			external: false,
			buildStream: fileToTarPack('test/test-files/standardProject.tar'),
			serviceName: 'test',
			streamHook: streamPrinter,
			buildMetadata,
		};

		return runBuildTask(task, docker, secretMap, buildVars).then(
			(image: LocalImage) => {
				expect(image)
					.to.have.property('successful')
					.that.equals(true);
				expect(image)
					.to.have.property('layers')
					.that.is.an('array');
				return checkExists(image.name!);
			},
		);
	});

	it('should correctly return an image with a build error', () => {
		const task = {
			external: false,
			resolved: false,
			buildStream: fileToTarPack('test/test-files/failingProject.tar'),
			serviceName: 'test',
			streamHook: streamPrinter,
			buildMetadata,
		};

		return runBuildTask(task, docker, secretMap, buildVars).then(
			(image: LocalImage) => {
				expect(image)
					.to.have.property('successful')
					.that.equals(false);
				expect(image)
					.to.have.property('layers')
					.that.is.an('array')
					.and.have.length(1);
				// tslint:disable-next-line:no-unused-expression
				expect(image).to.have.property('error').that.is.not.null;
				return checkExists(image.name!);
			},
		);
	});

	it('should correctly return no layers or name when a base image cannot be downloaded', () => {
		const task = {
			external: false,
			resolved: false,
			buildStream: fileToTarPack('test/test-files/missingBaseImageProject.tar'),
			serviceName: 'test',
			streamHook: streamPrinter,
			buildMetadata,
		};

		return runBuildTask(task, docker, secretMap, buildVars).then(
			(image: LocalImage) => {
				expect(image).to.not.have.property('name');
				expect(image)
					.to.have.property('layers')
					.that.has.length(0);
				// tslint:disable-next-line:no-unused-expression
				expect(image).to.have.property('error').that.is.not.null;
			},
		);
	});

	it('should correctly tag an image', () => {
		const task = {
			external: false,
			resolved: false,
			buildStream: fileToTarPack('test/test-files/standardProject.tar'),
			serviceName: 'test',
			streamHook: streamPrinter,
			tag: 'resin-multibuild-tag',
			buildMetadata,
		};

		return runBuildTask(task, docker, secretMap, buildVars).then(image => {
			expect(image)
				.to.have.property('name')
				.that.equals('resin-multibuild-tag');
			return checkExists('resin-multibuild-tag');
		});
	});

	it('should correctly set the start and end time', () => {
		const task = {
			external: false,
			resolved: false,
			buildStream: fileToTarPack('test/test-files/standardProject.tar'),
			serviceName: 'test',
			streamHook: streamPrinter,
			buildMetadata,
		};

		return runBuildTask(task, docker, secretMap, buildVars).then(image => {
			expect(image)
				.to.have.property('startTime')
				.that.is.a('number');
			expect(image)
				.to.have.property('endTime')
				.that.is.a('number');
		});
	});

	it('should set start and end time for a failed build', () => {
		const task = {
			external: false,
			resolved: false,
			buildStream: fileToTarPack('test/test-files/failingProject.tar'),
			serviceName: 'test',
			streamHook: streamPrinter,
			buildMetadata,
		};

		return runBuildTask(task, docker, secretMap, buildVars).then(image => {
			expect(image)
				.to.have.property('startTime')
				.that.is.a('number');
			expect(image)
				.to.have.property('endTime')
				.that.is.a('number');
		});
	});

	it('should set the start and end time for a build with a missing base image', () => {
		const task = {
			external: false,
			resolved: false,
			buildStream: fileToTarPack('test/test-files/missingBaseImageProject.tar'),
			serviceName: 'test',
			streamHook: streamPrinter,
			buildMetadata,
		};

		return runBuildTask(task, docker, secretMap, buildVars).then(image => {
			expect(image)
				.to.have.property('startTime')
				.that.is.a('number');
			expect(image)
				.to.have.property('endTime')
				.that.is.a('number');
		});
	});
});

describe('Resolved project building', () => {
	it('should correctly build a resolved project', () => {
		const task: BuildTask = {
			external: false,
			resolved: false,
			buildStream: fileToTarPack('test/test-files/templateProject.tar'),
			serviceName: 'test',
			streamHook: streamPrinter,
			buildMetadata,
		};
		return new Promise((resolve, reject) => {
			const resolveListeners = {
				error: [reject],
			};
			const newTask = resolveTask(task, 'x86', 'intel-nuc', resolveListeners);
			resolve(runBuildTask(newTask, docker, secretMap, buildVars));
		}).then((image: LocalImage) => {
			expect(image)
				.to.have.property('successful')
				.that.equals(true);
			return checkExists(image.name!);
		});
	});
});

describe('Invalid build input', () => {
	it('should throw a BuildProcessError on incorrect input', () => {
		const task: BuildTask = {
			external: false,
			resolved: false,
			serviceName: 'test',
			buildMetadata,
		};
		return runBuildTask(task, docker, secretMap, buildVars)
			.then(() => {
				throw new Error('Error not thrown on null buildStream input');
			})
			.catch(BuildProcessError, () => {
				// This is what we want
			})
			.catch(e => {
				throw new Error(
					'Incorrect error thrown on null buildStream input: ' + e,
				);
			});
	});
});

describe('External images', () => {
	it('should correctly pull down external images', () => {
		const task: BuildTask = {
			external: true,
			resolved: false,
			imageName: 'alpine:3.1',
			serviceName: 'test',
			buildMetadata,
		};

		return runBuildTask(task, docker, secretMap, buildVars).then(image => {
			expect(image)
				.to.have.property('successful')
				.that.equals(true);
			expect(image)
				.to.have.property('startTime')
				.that.is.a('number');
			expect(image)
				.to.have.property('endTime')
				.that.is.a('number');
			return checkExists(image.name!);
		});
	});

	it('should correctly report an external image that could not be downloaded', () => {
		const task: BuildTask = {
			external: true,
			resolved: false,
			imageName: 'does-not-exist',
			serviceName: 'test',
			buildMetadata,
		};

		return runBuildTask(task, docker, secretMap, buildVars).then(image => {
			expect(image)
				.to.have.property('successful')
				.that.equals(false);
			expect(image).to.not.have.property('name');
			// tslint:disable-next-line:no-unused-expression
			expect(image).to.have.property('error').that.is.not.null;
			expect(image)
				.to.have.property('startTime')
				.that.is.a('number');
			expect(image)
				.to.have.property('endTime')
				.that.is.a('number');
		});
	});

	it('should call the progress hook', () => {
		let called = false;
		const task: BuildTask = {
			external: true,
			resolved: false,
			imageName: 'alpine:3.1',
			serviceName: 'test',
			progressHook: () => {
				called = true;
			},
			buildMetadata,
		};

		return runBuildTask(task, docker, secretMap, buildVars).then(() => {
			if (!called) {
				throw new Error('Progress callback not called for image pull');
			}
		});
	});

	it('should default to latest when a tag is not provided', () => {
		const task: BuildTask = {
			external: true,
			resolved: false,
			imageName: 'alpine',
			serviceName: 'test',
			buildMetadata,
		};

		return runBuildTask(task, docker, secretMap, buildVars).then(image => {
			expect(image)
				.to.have.property('name')
				.that.equals('alpine:latest');
			expect(image)
				.to.have.property('startTime')
				.that.is.a('number');
			expect(image)
				.to.have.property('endTime')
				.that.is.a('number');
			return checkExists(image.name!);
		});
	});
});

describe('Specifying a dockerfile', () => {
	it('should allow specifying a dockerfile', async () => {
		const composeObj = require('../../test/test-files/stream/docker-compose-specified-dockerfile.json');
		const comp = Compose.normalize(composeObj);

		const stream = fs.createReadStream(
			'test/test-files/stream/specified-dockerfile.tar',
		);

		const tasks = await splitBuildStream(comp, stream);
		expect(tasks).to.have.length(1);

		let newTask: BuildTask;
		await new Promise((resolve, reject) => {
			const resolveListeners = {
				error: [reject],
			};
			newTask = resolveTask(tasks[0], 'test', 'test', resolveListeners);
			resolve(runBuildTask(tasks[0], docker, secretMap, buildVars));
		}).then((image: LocalImage) => {
			expect(newTask).to.have.property('resolved', true);
			expect(newTask).to.have.property('projectType', 'Standard Dockerfile');
			expect(newTask).to.have.property('dockerfilePath', 'test/Dockerfile');
			expect(newTask).to.have.property('dockerfile', 'correct\n');

			expect(image)
				.to.have.property('error')
				.that.has.property('message')
				.that.matches(
					/Dockerfile parse error line 1: unknown instruction: CORRECT/i,
				);
		});
	});

	it('should allow specifying a dockerfile.template', async () => {
		const composeObj = require('../../test/test-files/stream/docker-compose-specified-dockerfile-template.json');
		const comp = Compose.normalize(composeObj);

		const stream = fs.createReadStream(
			'test/test-files/stream/specified-dockerfile-template.tar',
		);

		const tasks = await splitBuildStream(comp, stream);
		expect(tasks).to.have.length(1);

		let newTask: BuildTask;
		await new Promise((resolve, reject) => {
			const resolveListeners = {
				error: [reject],
			};
			newTask = resolveTask(tasks[0], 'test', 'test', resolveListeners);
			resolve(runBuildTask(tasks[0], docker, secretMap, buildVars));
		}).then((image: LocalImage) => {
			expect(newTask).to.have.property('resolved', true);
			expect(newTask).to.have.property('projectType', 'Dockerfile.template');
			expect(newTask).to.have.property('dockerfilePath', 'test/Dockerfile');
			expect(newTask).to.have.property('dockerfile', 'correct\n');

			expect(image)
				.to.have.property('error')
				.that.has.property('message')
				.that.matches(
					/Dockerfile parse error line 1: unknown instruction: CORRECT/i,
				);
		});
	});
});

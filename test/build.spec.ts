import * as Promise from 'bluebird';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as Dockerode from 'dockerode';
import * as fs from 'fs';
import * as Stream from 'stream';
import * as Url from 'url';
import * as Path from 'path';

import { runBuildTask } from '../lib/build';
import { BuildTask } from '../lib/build-task';
import { BuildProcessError, DockerCommunicationError } from '../lib/errors';
import { LocalImage } from '../lib/local-image';
import { resolveTask } from '../lib/resolve';

chai.use(chaiAsPromised);
const expect = chai.expect;

let dockerOpts: any;
if (process.env.CIRCLECI != null) {
	let ca: string;
	let cert: string;
	let key: string;

	const certs = ['ca.pem', 'cert.pem', 'key.pem'].map((f) => Path.join(process.env.DOCKER_CERT_PATH, f));
	[ca, cert, key ] = certs.map((c) => fs.readFileSync(c));
	let parsed = Url.parse(process.env.DOCKER_HOST);

	dockerOpts = {
		host: 'https://' + parsed.hostname,
		port: parsed.port,
		ca,
		cert,
		key,
		Promise,
	};
} else {
	dockerOpts = { socketPath: '/var/run/docker.sock', Promise };
}

const docker = new Dockerode(dockerOpts);

const checkExists = (name: string) => {
	return docker.getImage(name).inspect();
};

const printOutput = process.env.DISPLAY_TEST_OUTPUT === '1';
const streamPrinter = (stream: Stream.Readable) => {
	if (printOutput) {
		stream.on('data', (data) => console.log(data));
	}
};

describe('Project building', () => {
	it('should correctly build a standard dockerfile project', () => {
		const task = {
			external: false,
			buildStream: fs.createReadStream(require.resolve('./test-files/standardProject.tar')),
			serviceName: 'test',
			streamHook: streamPrinter,
		};

		return runBuildTask(task, docker)
		.then((image: LocalImage) => {
			expect(image).to.have.property('successful').that.equals(true);
			expect(image).to.have.property('layers').that.is.an('array');
			return checkExists(image.name);
		});
	});

	it('should correctly return an image with a build error', () => {
		const task = {
			external: false,
			buildStream: fs.createReadStream(require.resolve('./test-files/failingProject.tar')),
			serviceName: 'test',
			streamHook: streamPrinter,
		};

		return runBuildTask(task, docker)
		.then((image: LocalImage) => {
			expect(image).to.have.property('successful').that.equals(false);
			expect(image).to.have.property('layers').that.is.an('array').and.have.length(1);

			expect(image).to.have.property('error').that.is.not.null;
			return checkExists(image.name);
		});
	});

	it('should correctly return no layers or name when a base image cannot be downloaded', () => {
		const task = {
			external: false,
			buildStream: fs.createReadStream(require.resolve('./test-files/missingBaseImageProject.tar')),
			serviceName: 'test',
			streamHook: streamPrinter,
		};

		return runBuildTask(task, docker)
		.then((image: LocalImage) => {
			expect(image).to.not.have.property('name');
			expect(image).to.have.property('layers').that.has.length(0);
			expect(image).to.have.property('error').that.is.not.null;
		});
	});

	it('should correctly tag an image', () => {
		const task = {
			external: false,
			buildStream: fs.createReadStream(require.resolve('./test-files/standardProject.tar')),
			serviceName: 'test',
			streamHook: streamPrinter,
			tag: 'resin-multibuild-tag',
		};

		return runBuildTask(task, docker)
		.then((image) => {
			expect(image).to.have.property('name').that.equals('resin-multibuild-tag');
			return checkExists('resin-multibuild-tag');
		});
	});
});

describe('Resolved project building', () => {
	it('should correctly build a resolved project', () => {
		const task: BuildTask = {
			external: false,
			buildStream: fs.createReadStream(require.resolve('./test-files/templateProject.tar')),
			serviceName: 'test',
			streamHook: streamPrinter,
		};

		return resolveTask(task, 'x86', 'intel-nuc')
		.then((newTask) => runBuildTask(newTask, docker))
		.then((image) => {
			expect(image).to.have.property('successful').that.equals(true);
			return checkExists(image.name);
		});
	});
});

describe('Invalid build input', () => {
	it('should throw a BuildProcessError on incorrect input', () => {
		const task: BuildTask = {
			external: false,
			serviceName: 'test',
		};
		return runBuildTask(task, docker)
		.then(() => {
			throw new Error('Error not thrown on null buildStream input');
		})
		.catch(BuildProcessError, (e) => {
			// This is what we want
		})
		.catch((e) => {
			throw new Error('Incorrect error thrown on null buildStream input: ' + e);
		});
	});
});

describe('External images', () => {
	it('should correctly pull down external images', () => {
		const task: BuildTask = {
			external: true,
			imageName: 'alpine:3.1',
			serviceName: 'test',
		};

		return runBuildTask(task, docker)
		.then((image) => {
			expect(image).to.have.property('successful').that.equals(true);
			return checkExists(image.name);
		});
	});

	it('should correctly report an external image that could not be downloaded', () => {
		const task: BuildTask = {
			external: true,
			imageName: 'does-not-exist',
			serviceName: 'test',
		};

		return runBuildTask(task, docker)
		.then((image) => {
			expect(image).to.have.property('successful').that.equals(false);
			expect(image).to.not.have.property('name');
			expect(image).to.have.property('error').that.is.not.null;
		})
	});

	it('should call the progress hook', () => {
		let called = false;
		const task: BuildTask = {
			external: true,
			imageName: 'alpine:3.1',
			serviceName: 'test',
			progressHook: (data) => {
				called = true;
			},
		};

		return runBuildTask(task, docker)
		.then(() => {
			if (!called) {
				throw new Error('Progress callback not called for image pull');
			}
		});
	});

	it('should default to latest when a tag is not provided', () => {
		const task: BuildTask = {
			external: true,
			imageName: 'alpine',
			serviceName: 'test',
		};

		return runBuildTask(task, docker)
		.then((image) => {
			expect(image).to.have.property('name').that.equals('alpine:latest');
			return checkExists(image.name);
		});
	});
});

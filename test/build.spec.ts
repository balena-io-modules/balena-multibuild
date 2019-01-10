import * as Promise from 'bluebird';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as Dockerode from 'dockerode';
import * as fs from 'fs';
import * as Path from 'path';
import * as Stream from 'stream';
import * as tar from 'tar-stream';
import * as Url from 'url';

import { runBuildTask } from '../lib/build';
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
		Promise,
	};
} else {
	dockerOpts = { socketPath: '/var/run/docker.sock', Promise };
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

describe('Project building', () => {
	it('should correctly build a standard dockerfile project', () => {
		const task = {
			resolved: false,
			external: false,
			buildStream: fileToTarPack('test/test-files/standardProject.tar'),
			serviceName: 'test',
			streamHook: streamPrinter,
		};

		return runBuildTask(task, docker).then((image: LocalImage) => {
			expect(image)
				.to.have.property('successful')
				.that.equals(true);
			expect(image)
				.to.have.property('layers')
				.that.is.an('array');
			return checkExists(image.name!);
		});
	});

	it('should correctly return an image with a build error', () => {
		const task = {
			external: false,
			resolved: false,
			buildStream: fileToTarPack('test/test-files/failingProject.tar'),
			serviceName: 'test',
			streamHook: streamPrinter,
		};

		return runBuildTask(task, docker).then((image: LocalImage) => {
			expect(image)
				.to.have.property('successful')
				.that.equals(false);
			expect(image)
				.to.have.property('layers')
				.that.is.an('array')
				.and.have.length(1);

			expect(image).to.have.property('error').that.is.not.null;
			return checkExists(image.name!);
		});
	});

	it('should correctly return no layers or name when a base image cannot be downloaded', () => {
		const task = {
			external: false,
			resolved: false,
			buildStream: fileToTarPack('test/test-files/missingBaseImageProject.tar'),
			serviceName: 'test',
			streamHook: streamPrinter,
		};

		return runBuildTask(task, docker).then((image: LocalImage) => {
			expect(image).to.not.have.property('name');
			expect(image)
				.to.have.property('layers')
				.that.has.length(0);
			expect(image).to.have.property('error').that.is.not.null;
		});
	});

	it('should correctly tag an image', () => {
		const task = {
			external: false,
			resolved: false,
			buildStream: fileToTarPack('test/test-files/standardProject.tar'),
			serviceName: 'test',
			streamHook: streamPrinter,
			tag: 'resin-multibuild-tag',
		};

		return runBuildTask(task, docker).then(image => {
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
		};

		return runBuildTask(task, docker).then(image => {
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
		};

		return runBuildTask(task, docker).then(image => {
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
		};

		return runBuildTask(task, docker).then(image => {
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
		};

		return resolveTask(task, 'x86', 'intel-nuc')
			.then(newTask => runBuildTask(newTask, docker))
			.then(image => {
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
		};
		return runBuildTask(task, docker)
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
		};

		return runBuildTask(task, docker).then(image => {
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
		};

		return runBuildTask(task, docker).then(image => {
			expect(image)
				.to.have.property('successful')
				.that.equals(false);
			expect(image).to.not.have.property('name');
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
		};

		return runBuildTask(task, docker).then(() => {
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
		};

		return runBuildTask(task, docker).then(image => {
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

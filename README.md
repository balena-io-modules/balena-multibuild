# balena-multibuild

This module is designed to make it easy to build a composition given a
representation of this composition, and a tar stream. The output will be several
images present on the given docker daemon.

(This module is currently in flux, after having subsumed a few of external dependencies
into its tree in order to provide a single bundle that completely covers the use case of
building a composition, and it exports several "raw" APIs as top-level objects. See
furthe below for more info on each one.)

```typescript
import * as Promise from 'bluebird';

import {
	ComposeParse,
	splitBuildStream,
	performBuilds,
} from '@balena/multibuild';

// Get a tar stream and composition from somewhere
const stream = getBuildStream();
const composeFile = getComposeFile();
const docker = getDockerodeHandle();

// Parse the compose file
const comp = ComposeParse.normalize(composeFile);

splitBuildStream(comp, stream);
.then((tasks) => {
	return performResolution(tasks, 'armv7hf', 'raspberrypi3');
})
.map((task) => {
	if (task.external) {
		task.progressHook = (progress) => {
			console.log(task.serviceName + ': ' + progress);
		};
	} else {
		task.streamHook = (stream) => {
			stream.on('data', (data) => {
				console.log(task.serviceName + ': ', data.toString());
			});
		};
	}
	return task;
})
.then((tasks) => {
	return performBuilds(builds, docker);
})
.then((images) => {
	// Do something with your images
});

```


## Reference

```
function splitBuildStream(composition: Composition, buildStream: ReadableStream): Promise<BuildTask[]>
```

Given a Composition which conforms to the type from [compose-parse](./lib/compose-parse)
and a stream which will produce a tar archive, split this tar archive into a set
of build tasks which can then be further processed.

```
function performResolution(
	tasks: BuildTask[],
	architecture: string,
	deviceType: string
): Promise<BuildTask[]>
```

Given a list of build tasks, resolve the projects to a form which the docker
daemon can build. Currently this function supports all project types which
[bundle-resolve](./lib/bundle-resolve) supports.

Note that this function will also populate the `dockerfile` and `projectType`
values in the build tasks.

```
function performBuilds(
	tasks: BuildTask[],
	docker: Dockerode
): Promise<LocalImage[]>
```

Given a list of build tasks, perform the task necessary for the LocalImage to be
produced. A local image represents an image present on the docker daemon given.

Note that one should assign a stream handling function for build output OR a
progress handling function for image pull output **before** calling this
function. The fields for these functions are `streamHook` and `progressHook`.


## Working with compositions

(Currently all related functionality is exported as a top-level
`ComposeParse` object.)

See the [ComposeParse module](./lib/compose-parse) for API reference.


## Working with Dockerfile templates

(Currently all related functionality is exported as a top-level
`DockerfileTemplate` object.)

Process dockerfile templates, a format that allows replacing variables in dockerfiles.

The format of a dockerfile template is the same as a Dockerfile, but augmented with variables.

Variables have the format `%%VARIABLE_NAME%%`, where variable name starts with an uppercase letter,
and can contain uppercase letters and underscores.

Variables in comments (lines that start with #) are not processed.

This module exposes a single `process` method.

It receives a dockerfile template body and key-value pairs and replaces variables in the template.

If the template has variables that cannot be found, it throws an error.

Example:

```javascript
import { DockerfileTemplate } from '@balena/multibuild'

const variables = {
  BASE: "debian",
  TAG: "latest"
}
const result = DockerfileTemplate.process(
	'FROM %%BASE%%:%%TAG%%',
	variables
);
console.log(result)
```

Output:

```
FROM debian:latest
```

You can read [the tests](./test/dockerfile-template) for more examples.


## Resolving bundles

(Currently all related functionality is exported as a top-level
`BundleResolve` object.)

A bundle is a tar archive which contains a type of Dockerfile and metadata used
to create a Dockerfile proper, which docker can understand.

### Which bundles are supported

Currently default resolvers included are;
* Dockerfile.template
   * Resolve template variables with metadata, currently supported:
       * `%%RESIN_MACHINE_NAME%%`
       * `%%RESIN_ARCH%%`
       * `%%BALENA_MACHINE_NAME%%`
       * `%%BALENA_ARCH%%`
* Architecture Specific Dockerfiles
   * Choose the correct Dockerfile for a given build architecture or device type
* Standard Dockerfile projects

### How do I add a resolver?

`bundle-resolver` supports the adding of generic resolvers, by
implementing the `Resolver` interface (see `./lib/bundle-resolve/resolver.ts`).
Examples of this can be found in the `src/resolvers/` directory.

Your resolvers can then be passed to the `resolveBundle` function.

### What is the input and output?

`bundle-resolver` takes a tar stream and outputs a tar stream,
which can be passed to the docker daemon or further processed.


## Building a Dockerfile

(Currently all related functionality is exported as a top-level
`DockerBuild` object.)

A modular, plugin-based approach to building docker containers. `docker-build`
uses streams and hooks to provide a system which can be added to a build pipeline
easily. With a simple but flexible interface.

The `Builder` API has two top-level methods, which are used to trigger builds;

* `createBuildStream(buildOpts: Object, hooks: BuildHooks, handler: ErrorHandler): ReadWriteStream`

Initialise a docker daemon and set it up to wait for some streaming data.
The stream is returned to the caller for both reading and writing. Success and
failure callbacks are provided via the hooks interface (see below). `buildOpts`
is passed directly to the docker daemon and the expected input by the daemon is
is a tar stream.

* `buildDir(directory: string, buildOpts: Object, hooks: BuildHooks, handler: ErrorHandler): ReadWriteStream`

Inform the docker daemon to build a directory on the host. A stream is returned
for reading, and the same success/failure callbacks apply. `buildOpts` is passed
directly to the docker daemon.

* The `handler` parameter:

If an exception is thrown from within the hooks, because it is executing in a
different context to the initial api call they will not be propagated. Using
the error handler means that you can handle the error as necessary (for instance
propagate to your global catch, or integrate it into a promise chain using
`reject` as a handler). The error handler is optional. Note that the error
handler will not be called with a build error, instead with that being dropped
to the `buildFailure` hook, but if that hook throws, the handler will be called.

### Hooks

Currently the hooks supported are;

* `buildStream(stream: ReadWriteStream): void`

Called by the builder when a stream is ready to communicate directly with the daemon. This is useful
for parsing/showing the output and transforming any input before providing it to the docker daemon.

* `buildSuccess(imageId: string, layers: string[]): void`

Called by the builder when the daemon has successfully built the image. `imageId` is the sha digest provided
by the daemon, which can be used for pushing, running etc. `layers` is a list of sha digests pointing to
the intermediate layers used by docker. Can be useful for cleanup.

* `buildFailure(error: Error)`

Called by the builder when a build has failed for whatever reason. The reason is provided as a standard
node error object. This was also close the build stream. No more hooks will be called after this.

### Examples

#### Directory Building

```javascript
import { DockerBuild } from '@balena/multibuild'

const { Builder, BuildHooks } = DockerBuild

const builder = Builder.fromDockerOpts({ socketPath: '/var/run/docker.sock' })

const hooks: BuildHooks = {
	buildStream: (stream: NodeJS.ReadWriteStream): void => {
		stream.pipe(process.stdout)
	},
	buildSuccess: (imageId: string, layers: string[]): void => {
		console.log(`Successful build! ImageId: ${imageId}`)
	},
	buildFailure: (error: Error): void => {
		console.error(`Error building container: ${error}`)
	}
}

builder.buildDir('./my-dir', {}, hooks)
```

#### Building a tar archive

```javascript
import * as fs from 'fs'

import { DockerBuild } from '@balena/multibuild'

const { Builder, BuildHooks } = DockerBuild

const builder = Builder.fromDockerOpts({ socketPath: '/var/run/docker.sock' })

const getHooks = (archive: string): BuildHooks => {
	return {
		buildSuccess: (imageId: string, layers: string[]): void => {
			console.log(`Successful build! ImageId: ${imageId}`)
		},
		buildFailure: (error: Error): void => {
			console.error(`Error building container: ${error}`)
		},
		buildStream: (stream: NodeJS.ReadWriteStream): void => {
			// Create a stream from the tar archive.
			// Note that this stream could be from a webservice,
			// or any other source. The only requirement is that
			// when consumed, it produces a valid tar archive
			const tarStream = fs.createReadStream(archive)

			// Send the tar stream to the docker daemon
			tarStream.pipe(stream)

			stream.pipe(process.stdout)
		}
	}
}

builder.createBuildStream({}, getHooks('my-archive.tar'))
```

## Creating a release on balenaCloud

(Currently all related functionality is exported as a top-level
`Release` object.)

See the [Release module](./lib/release) for API reference.

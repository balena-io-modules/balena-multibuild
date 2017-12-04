# resin-multibuild

This module is designed to make it easy to build a composition given a
representation of this composition, and a tar stream. The output will be several
images present on the given docker daemon.

## API

### splitBuildStream

```
function splitBuildStream(composition: Composition, buildStream: ReadableStream): Promise<BuildTask>
```


## Example (pseudocode)

```typescript
import * as Promise from 'bluebird';

import { parseComposeFile } from 'resin-compose-parse';
import { splitBuildStream, performBuilds } from 'resin-multibuild';

const generatePrintStream = (
	serviceName: string,
	outputStream: NodeJS.ReadableStream,
): void => {
	outputStream.on('data', (data) => {
		console.log(serviceName + ': ' + data.toString());
	});
}

// Get a tar stream and composition from somewhere
const stream = getBuildStream();
const composeFile = getComposeFile();
const docker = getDockerodeHandle();

// Parse the compose file
parseComposeFile(composeFile)
.then((comp) => {
	return splitBuildStream(comp, stream)
})
.map((build) => {
	{ serviceName, outputStream } = build;
	generatePrintStream(serviceName, outputStream);
	return build;
})
.then((builds) => {
	return performBuilds(builds, docker);
})
.then((images) => {
	// Do something with your images
});

```

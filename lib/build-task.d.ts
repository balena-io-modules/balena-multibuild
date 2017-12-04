import * as Dockerode from 'dockerode';
import * as Stream from 'stream';
import * as tar from 'tar-stream';

import { Dict } from './types';

/**
 * A structure representing a list of build tasks to be performed,
 * as defined in a composition. These are generated and then acted
 * upon by this module.
 */
export interface BuildTask {
	/**
	 * Does this task represent the pulling of an external image
	 * from a registry?
	 */
	external: boolean;
	/**
	 * If this task is an external image pull, this is the registry
	 * URL of the image.
	 *
	 * If this task is not an external image pull, this field will be null.
	 */
	imageName?: string;
	/**
	 * If this is a Docker build task, this field will be set to the context
	 * path of the build.
	 */
	context?: string;
	/**
	 * If this is a Docker build task, this field will be set to the build
	 * arguments which are to passed into the daemon
	 */
	args?: Dict;
	/**
	 * If this is a Docker build task, this field will be set to the labels
	 * which should be attached to the resulting image.
	 */
	labels?: Dict;
	/**
	 * If this value is set, the resulting image will be tagged as this
	 * once built (or pulled).
	 */
	tag?: string;
	/**
	 * This field will be set to the dockerfile after resolution.
	 */
	dockerfile?: string;
	/**
	 * An object which will be forwarded to the docker daemon, with options
	 * for the build or pull
	 */
	dockerOpts?: { [key: string]: any };
	/**
	 * This field will be filled with the project type, after resolution
	 */
	projectType?: string;
	/**
	 * A stream which when read will produce a tar archive for an individual
	 * build.
	 *
	 * If this task is an external image pull, this field will be null.
	 */
	buildStream?: tar.Pack;
	/**
	 * A stream which when read will provide an output of the docker
	 * build if this task is a build task. If this task is an external
	 * image pull, this stream will produce the output of the docker pull.
	 */
	outputStream?: Stream.Readable;
	/**
	 * The name of the service that this task if for, as it appears in
	 * the composition
	 */
	serviceName: string;
}

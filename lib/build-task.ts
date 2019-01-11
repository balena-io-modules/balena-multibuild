import { ProgressCallback } from 'docker-progress';
import * as Stream from 'stream';
import * as tar from 'tar-stream';

export interface Dict<T> {
	[key: string]: T;
}

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
	args?: Dict<string>;
	/**
	 * If this is a Docker build task, this field will be set to the labels
	 * which should be attached to the resulting image.
	 */
	labels?: Dict<string>;
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
	 * This will be the path of the dockerfile if specified
	 */
	dockerfilePath?: string;
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
	 * This function should be provided by the caller. It is a hook which will
	 * be called with the docker build output.
	 *
	 * For an external image build this function will not be called.
	 */
	streamHook?: (stream: Stream.Readable) => void;
	/**
	 * This function will be called by docker-progress with objects that
	 * represent the pull progress of external images.
	 *
	 * For docker builds this function will not be called.
	 */
	progressHook?: ProgressCallback;
	/**
	 * The name of the service that this task if for, as it appears in
	 * the composition
	 */
	serviceName: string;
	/**
	 * Has this task failed to be resolved?
	 */
	resolved: boolean;
}

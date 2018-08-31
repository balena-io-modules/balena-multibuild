import { TypedError } from 'typed-error';

/**
 * This error is thrown when a requested removal of an image
 * from a docker daemon fails.
 */
export class ImageRemovalError extends TypedError { }

/**
 * This error is thrown if the given tar stream cannot be written
 * or read.
 */
export class TarError extends TypedError { }

/**
 * This error is thrown in the case of a build not being able to complete
 * properly, due to a non-project error (e.g. docker daemon issues).
 *
 * Note that this error will **not** be thrown for build errors which occur
 * in the build itself (for example typos in the Dockerfile).
 */
export class BuildProcessError extends TypedError { }

/**
 * This error will be thrown when communication with Docker daemon
 * would not occur.
 */
export class DockerCommunicationError extends TypedError { }

import TypedError = require('typed-error');

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
 * This error is thrown when a resin project cannot be resolved
 * to a docker build project.
 */
export class ProjectResolutionError extends TypedError { }

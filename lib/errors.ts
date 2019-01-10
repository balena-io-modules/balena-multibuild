/**
 * @license
 * Copyright 2018 Balena Ltd.
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

import { TypedError } from 'typed-error';

/**
 * This error is thrown when a requested removal of an image
 * from a docker daemon fails.
 */
export class ImageRemovalError extends TypedError {}

/**
 * This error is thrown if the given tar stream cannot be written
 * or read.
 */
export class TarError extends TypedError {}

/**
 * This error is thrown in the case of a build not being able to complete
 * properly, due to a non-project error (e.g. docker daemon issues).
 *
 * Note that this error will **not** be thrown for build errors which occur
 * in the build itself (for example typos in the Dockerfile).
 */
export class BuildProcessError extends TypedError {}

/**
 * This error will be thrown when communication with Docker daemon
 * would not occur.
 */
export class DockerCommunicationError extends TypedError {}

/**
 * JSON schema validation error for private docker registry secrets
 */
export class RegistrySecretValidationError extends TypedError {}

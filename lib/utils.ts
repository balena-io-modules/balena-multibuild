/**
 * @license
 * Copyright 2017 Balena Ltd.
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
import * as _ from 'lodash';
import * as tar from 'tar-stream';

import { ImageDescriptor } from 'resin-compose-parse';

import BuildMetadata from './build-metadata';
import { BuildTask } from './build-task';

/**
 * Given a composition, generate the set of build tasks which this module
 * will proceed to build.
 *
 * @param composition The composition from resin-compose-parse
 * @returns An array of tasks which make up this multicontainer build
 */
export function generateBuildTasks(
	images: ImageDescriptor[],
	buildMetadata: BuildMetadata,
): BuildTask[] {
	return _.map(images, img => {
		if (_.isString(img.image)) {
			return {
				external: true,
				imageName: img.image,
				serviceName: img.serviceName,
				resolved: false,
				buildMetadata,
			};
		} else {
			// Check that if a dockerfile is specified, that we also have a context
			if (img.image.context == null) {
				throw new Error('Must have a context specified with a Dockerfile');
			}
			return _.merge(
				{
					external: false,
					serviceName: img.serviceName,
					buildStream: tar.pack(),
					resolved: false,
					buildMetadata,
				},
				// Add the dockerfile path if we have one
				img.image.dockerfile != null
					? { dockerfilePath: img.image.dockerfile }
					: {},
				// It's possible to specify an image name as well as
				// a build, but that doesn't make sense in a balena
				// ecosystem, so we remove it
				_.omit(img.image, 'image'),
			);
		}
	});
}

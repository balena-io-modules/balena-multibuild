/**
 * @license
 * Copyright 2019 Balena Ltd.
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
import * as Resolve from 'resin-bundle-resolve';
import * as Stream from 'stream';

import { BuildTask } from './build-task';

import { ResolveListeners } from 'resin-bundle-resolve';
export { ResolveListeners };

/**
 * Given a BuildTask, resolve the project type to something that
 * the docker daemon can build (or return image pulls unchanged).
 *
 * @param task a BuildTask to resolve
 * @param architecture The architecture to resolve this project for
 * @param deviceType The device type to resolve this project for
 * @param resolveListeners Event listeners for tar stream resolution.
 * You should always add at least an 'error' handler, or uncaught errors
 * may crash the app.
 * @returns The input task object, with a few updated fields
 */
export function resolveTask(
	task: BuildTask,
	architecture: string,
	deviceType: string,
	resolveListeners: ResolveListeners,
): BuildTask {
	if (task.external) {
		// No resolution needs to be performed for external images
		return task;
	}

	const dockerfileHook = (content: string) => {
		task.dockerfile = content;
	};

	const bundle = new Resolve.Bundle(
		task.buildStream as Stream.Readable,
		deviceType,
		architecture,
		dockerfileHook,
	);

	const resolvers = Resolve.getDefaultResolvers();
	const listeners: ResolveListeners = _.cloneDeep(resolveListeners);

	(listeners['resolver'] = listeners['resolver'] || []).push(
		(resolverName: string) => {
			task.projectType = resolverName;
			task.resolved = true;
		},
	);

	(listeners['resolved-name'] = listeners['resolved-name'] || []).push(
		(resolvedName: string) => {
			task.dockerfilePath = resolvedName;
		},
	);

	task.buildStream = Resolve.resolveInput(
		bundle,
		resolvers,
		listeners,
		task.dockerfilePath,
	);

	return task;
}

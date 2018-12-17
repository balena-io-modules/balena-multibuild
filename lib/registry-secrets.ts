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

/**
 * This module contains interfaces and classes for the validation of the JSON
 * format expected by the balena builder and the docker daemon for the
 * authentication of private docker registries.
 */

import * as ajv from 'ajv';

import { RegistrySecretValidationError } from './errors';
export { RegistrySecretValidationError } from './errors';

export interface RegistrySecrets {
	[registryAddress: string]: {
		username: string;
		password: string;
	};
}

/**
 * JSON schema validator for the private registry "secrets" (username and
 * password entries keyed by hostname:port registry addresses).
 */
export class RegistrySecretValidator {
	private registrySecretJsonSchema = {
		// Sample valid registrySecrets JSON contents:
		//   {  "docker.example.com": {"username": "ann", "password": "hunter2"},
		//      "https://idx.docker.io/v1/": {"username": "mck", "password": "cze14"}
		//   }
		type: 'object',
		patternProperties: {
			'^\\S+$': {
				type: 'object',
				properties: {
					username: { type: 'string' },
					password: { type: 'string' },
				},
				additionalProperties: false,
			},
		},
		additionalProperties: false,
	};
	private validator: ajv.Ajv = new ajv();
	private validateFunction: ajv.ValidateFunction = this.validator.compile(
		this.registrySecretJsonSchema,
	);

	/**
	 * Validate the given JSON object against the registry secrets schema.
	 * Throw an error if validation fails.
	 * @param parsedJson The result of calling JSON.parse()
	 * @returns The input object cast to the RegistrySecrets type if validation succeeds
	 * @throws Throws an error if validation fails
	 */
	public validateRegistrySecrets(parsedJson: object): RegistrySecrets {
		const valid = this.validateFunction(parsedJson);
		if (!valid) {
			throw new RegistrySecretValidationError(
				this.validator.errorsText(this.validateFunction.errors),
			);
		}
		return parsedJson as RegistrySecrets;
	}

	/**
	 * Call JSON.parse() on the given string, then validate the result against
	 * the registry secrets schema.
	 * @param json String containing a JSON representation of registry secrets
	 * @returns A JS object that complies with the RegistrySecrets interface
	 * @throws Throws an error if parsing or validation fails
	 */
	public parseRegistrySecrets(json: string): RegistrySecrets {
		return this.validateRegistrySecrets(JSON.parse(json));
	}
}

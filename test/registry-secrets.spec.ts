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
 * Tests for the registry-secrets.ts module
 */

import { expect } from 'chai';
import { RegistrySecretValidationError } from '../lib/errors';
import { RegistrySecretValidator } from '../lib/registry-secrets';

describe('Registry secret JSON validation', () => {
	const validator = new RegistrySecretValidator();

	it('should pass when given a valid JSON string', () => {
		const validSecrets = {
			'docker.example.com': { username: 'ann', password: 'hunter2' },
			'https://idx.docker.io/v1/': { username: 'mck', password: 'cze14' },
		};
		const validSecretStr = JSON.stringify(validSecrets);
		const parsed = validator.parseRegistrySecrets(validSecretStr);
		expect(parsed).to.deep.equal(validSecrets);
	});

	it('should fail when the registry hostname contains blank space characters', () => {
		const invalidSecrets = {
			'host dot com': { username: 'ann', password: 'hunter2' },
		};
		const parse = () =>
			validator.parseRegistrySecrets(JSON.stringify(invalidSecrets));
		expect(parse).to.throw(
			RegistrySecretValidationError,
			'data should NOT have additional properties',
		);
	});

	it('should fail when the input is blank', () => {
		const parse = () => validator.parseRegistrySecrets(' ');
		expect(parse).to.throw(SyntaxError, 'Unexpected end of JSON input');
	});

	it('should fail when there is a typo in the username or password fields', () => {
		let invalidSecrets: any = {
			hostname: { usrname: 'ann', password: 'hunter2' },
		};
		let parse = () =>
			validator.parseRegistrySecrets(JSON.stringify(invalidSecrets));
		expect(parse).to.throw(
			RegistrySecretValidationError,
			"data['hostname'] should NOT have additional properties",
		);

		invalidSecrets = { hostname: { username: 'ann', pasword: 'hunter2' } };
		parse = () =>
			validator.parseRegistrySecrets(JSON.stringify(invalidSecrets));
		expect(parse).to.throw(
			RegistrySecretValidationError,
			"data['hostname'] should NOT have additional properties",
		);
	});
});

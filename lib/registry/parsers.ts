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
 *
 */

// --- globals
import { CANONICAL_HUB_URL } from '../constants';

export const DEFAULT_INDEX_NAME = 'docker.io';
export const DEFAULT_V2_REGISTRY = 'https://registry-1.docker.io';
export const DEFAULT_LOGIN_SERVERNAME = CANONICAL_HUB_URL;

const VALID_NS = /^[a-z0-9._-]*$/;
const VALID_REPO = /^[a-z0-9_/.-]*$/;

// --- exports

export type ParsedIndex = {
	name: string;
	official: boolean;
	scheme: string;
};

export type ParsedRepo = {
	localName: string;
	canonicalName: string;
	remoteName: string;
	indexUrl: string;
	official: boolean;
	indexName: string;
};

export type ParsedChallenge = {
	scheme?: string;
	realm?: string;
	service?: string;
};

function splitStrOnce(str: string, separator: string) {
	const index = str.indexOf(separator);
	if (index < 0) {
		return str;
	}
	return [str.substring(0, index), str.substring(index + 1)];
}

/**
 * Parse a docker index name or index URL.
 *
 * Examples:
 *      docker.io               (no scheme implies 'https')
 *      index.docker.io         (normalized to docker.io)
 *      https://docker.io
 *      http://localhost:5000
 *
 */
function parseIndex(arg: string | undefined): ParsedIndex {
	const index: Partial<ParsedIndex> = {};

	if (!arg || arg === DEFAULT_LOGIN_SERVERNAME) {
		// Default index.
		index.name = DEFAULT_INDEX_NAME;
		index.official = true;
		index.scheme = 'https';
	} else {
		// Optional protocol/scheme.
		let indexName: string;

		const protoSepIdx = arg.indexOf('://');
		if (protoSepIdx !== -1) {
			const scheme = arg.slice(0, protoSepIdx);
			if (['http', 'https'].indexOf(scheme) === -1) {
				throw new Error(
					'invalid index scheme, must be ' + '"http" or "https": ' + arg,
				);
			}
			index.scheme = scheme;
			indexName = arg.slice(protoSepIdx + 3);
		} else {
			indexName = arg;
		}

		if (!indexName) {
			throw new Error('invalid index, empty host: ' + arg);
		} else if (
			indexName.indexOf('.') === -1 &&
			indexName.indexOf(':') === -1 &&
			indexName !== 'localhost'
		) {
			throw new Error(
				`invalid index, "${indexName}" does not look like a valid host: ${arg}`,
			);
		} else {
			// Allow a trailing '/' as from some URL builder functions that
			// add a default '/' path to a URL, e.g. 'https://docker.io/'.
			if (indexName[indexName.length - 1] === '/') {
				indexName = indexName.slice(0, indexName.length - 1);
			}

			// Ensure no trailing repo.
			if (indexName.indexOf('/') !== -1) {
				throw new Error('invalid index, trailing repo: ' + arg);
			}
		}

		// Per docker.git's `ValidateIndexName`.
		if (indexName === 'index.' + DEFAULT_INDEX_NAME) {
			indexName = DEFAULT_INDEX_NAME;
		}

		index.name = indexName;
		index.official = Boolean(indexName === DEFAULT_INDEX_NAME);

		// Disallow official and 'http'.
		if (index.official && index.scheme === 'http') {
			throw new Error(
				'invalid index, HTTP to official index is disallowed: ' + arg,
			);
		}
	}

	return index as ParsedIndex;
}

/**
 * Parse a docker repo and tag string: [INDEX/]REPO[:TAG|@DIGEST]
 *
 * Examples:
 *    busybox
 *    google/python
 *    docker.io/ubuntu
 *    localhost:5000/blarg
 *    http://localhost:5000/blarg
 *
 */
export function parseRepo(arg: string): ParsedRepo {
	const info: Partial<ParsedRepo> = {};

	// Strip off optional leading `INDEX/`, parse it to `info.index` and
	// leave the rest in `remoteName`.
	let repoNameFromArg: string;
	const protoSepIdx = arg.indexOf('://');
	let index: ParsedIndex;

	if (protoSepIdx !== -1) {
		// (A) repo with a protocol, e.g. 'https://host/repo'.
		const slashIdx = arg.indexOf('/', protoSepIdx + 3);
		if (slashIdx === -1) {
			throw new Error(
				'invalid repository name, no "/REPO" after ' + 'hostame: ' + arg,
			);
		}
		const indexName = arg.slice(0, slashIdx);
		repoNameFromArg = arg.slice(slashIdx + 1);
		index = parseIndex(indexName);
	} else {
		const parts = splitStrOnce(arg, '/');
		if (
			parts.length === 1 ||
			/* or if parts[0] doesn't look like a hostname or IP */
			(parts[0].indexOf('.') === -1 &&
				parts[0].indexOf(':') === -1 &&
				parts[0] !== 'localhost')
		) {
			// (B) repo without leading 'INDEX/'.
			index = parseIndex(undefined);
			repoNameFromArg = arg;
		} else {
			// (C) repo with leading 'INDEX/' (without protocol).
			index = parseIndex(parts[0]);
			repoNameFromArg = parts[1];
		}
	}

	const nameParts = splitStrOnce(repoNameFromArg, '/');
	let ns: string | undefined;
	let name: string;
	if (nameParts.length === 2) {
		name = nameParts[1];

		// Validate ns.
		ns = nameParts[0];
		if (ns.length < 2 || ns.length > 255) {
			throw new Error(
				'invalid repository namespace, must be between ' +
					'2 and 255 characters: ' +
					ns,
			);
		}
		if (!VALID_NS.test(ns)) {
			throw new Error(
				'invalid repository namespace, may only contain ' +
					'[a-z0-9._-] characters: ' +
					ns,
			);
		}
		if (ns[0] === '-' && ns[ns.length - 1] === '-') {
			throw new Error(
				'invalid repository namespace, cannot start or end with a hypen: ' + ns,
			);
		}
		if (ns.indexOf('--') !== -1) {
			throw new Error(
				'invalid repository namespace, cannot contain ' +
					'consecutive hyphens: ' +
					ns,
			);
		}
	} else {
		name = repoNameFromArg;
		if (index.official) {
			ns = 'library';
		}
	}

	// Validate name.
	if (!VALID_REPO.test(name)) {
		throw new Error(
			'invalid repository name, may only contain [a-z0-9_/.-] characters: ' +
				name,
		);
	}

	if (index.official) {
		if (!ns) {
			throw new Error('Namespace undetermined');
		}
		info.remoteName = ns + '/' + name;
		if (ns === 'library') {
			info.localName = name;
		} else {
			info.localName = info.remoteName;
		}
		info.canonicalName = DEFAULT_INDEX_NAME + '/' + info.localName;
		info.indexUrl = DEFAULT_V2_REGISTRY;
		info.official = true;
		info.indexName = DEFAULT_INDEX_NAME;
	} else {
		if (ns) {
			info.remoteName = ns + '/' + name;
		} else {
			info.remoteName = name;
		}
		info.localName = index.name + '/' + info.remoteName;
		info.canonicalName = info.localName;
		info.indexUrl = `${index.scheme || 'https'}://${index.name}`;
		info.official = false;
		info.indexName = index.name;
	}

	return info as ParsedRepo;
}

/*
 * Example challenge headers:
 *  'Bearer realm="https://auth.docker.io/token",service="registry.docker.io"'
 *  'Basic'
 */
export function ParseAuthenticateChallenge(
	challengeHeader: string,
): ParsedChallenge {
	const ParseAuth = /(\w+)\s+(.*)/; // -> scheme, params
	const ParseParams = /(\w+)\s*=\s*(["'])((?:(?!\2).)*)\2/g; // -> realm='...',service="..."

	const parsedChallenge = challengeHeader.match(ParseAuth);
	if (!parsedChallenge) {
		return {};
	}
	const parsedParams = parsedChallenge[2].match(ParseParams);
	if (!parsedParams) {
		return {};
	}

	const realmStr = parsedParams.find((s) => s.startsWith('realm='));
	const serviceStr = parsedParams.find((s) => s.startsWith('service='));
	ParseParams.lastIndex = 0; // reset side effect of global flag
	const realm = realmStr ? ParseParams.exec(realmStr) : undefined;
	ParseParams.lastIndex = 0; // reset side effect of global flag
	const service = serviceStr ? ParseParams.exec(serviceStr) : undefined;

	return {
		scheme: parsedChallenge[1],
		realm: realm?.[3],
		service: service?.[3],
	};
}

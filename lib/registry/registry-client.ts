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
 * Attribution:  Guided by code at https://github.com/joyent/node-docker-registry-client
 */

import * as querystring from 'querystring';
import * as restifyErrors from 'restify-errors';
import * as mod_url from 'url';
import * as restify from 'restify-clients';

import * as parsers from './parsers';
import { RegistrySecrets } from '../registry-secrets';

import assert = require('assert');

// Globals

export const MEDIATYPE_MANIFEST_V2 =
	'application/vnd.docker.distribution.manifest.v2+json';
export const MEDIATYPE_MANIFEST_LIST_V2 =
	'application/vnd.docker.distribution.manifest.list.v2+json';
export const DEFAULT_USERAGENT = 'balena-multibuild';

export type RegistryClientOptions = {
	name: string;
	username?: string;
	password?: string;
	userAgent?: string;
	bearerToken?: string;
	scope?: string;
	registrySecrets?: RegistrySecrets;
	authType?: 'basic' | 'bearer' | 'none';
};

export interface RegistryRepo {
	indexUrl?: string;
	remoteName?: string;
	localName?: string;
	canonicalName?: string;
}

export type DockerImageManifestPlatform = {
	architecture: string;
	os: string;
};

export type DockerImageManifestComponentObject = {
	digest: string;
	platform?: DockerImageManifestPlatform;
};

export type DockerImageManifest = {
	mediaType: string;
	schemaVersion: number;
	name: string;
	tag: string;
	architecture: string;
	config: unknown;
	fsLayers?: unknown[];
	layers?: unknown[];
	history?: unknown[];
	signatures?: unknown[];
	manifests?: DockerImageManifestComponentObject[];
};

type HttpErrorMessageObject = {
	message?: string;
};

type HttpError = {
	body?: {
		errors?: HttpErrorMessageObject[];
		details: string;
	};
	errors?: HttpErrorMessageObject[];
	message?: string;
	statusCode?: number;
};

type HttpResponse = {
	headers: { [key: string]: string };
	statusCode: number;
};

type HttpRequest = {
	_headers: { host: string };
};

type DockerJsonClientCallback = (
	err?: HttpError,
	req?: HttpRequest,
	res?: HttpResponse,
	body?: unknown,
	bodyString?: string | Buffer,
) => void;

interface JsonClient {
	get(options: unknown, callback: DockerJsonClientCallback): void;

	close(): void;
}

interface RegistryLoginAuthInfo {
	type?: 'basic' | 'bearer' | 'none';
	token?: string;
	username?: string;
	password?: string;
}

interface RegistryLoginConfiguration {
	type?: 'basic' | 'bearer' | 'none';
	scope?: string;
	username?: string;
	password?: string;
	bearerAuthToken?: string;
	registrySecrets?: RegistrySecrets;
}

interface RegistryConnectionConfiguration {
	userAgent?: string;
}

type HttpHeaders = {
	[key: string]: string | string[];
};

type BearerTokenBody = {
	token: string | undefined;
};

export class RegistryClient {
	private repo: parsers.ParsedRepo;
	private loginConfig: RegistryLoginConfiguration = {};
	private connectionConfig: RegistryConnectionConfiguration = {};
	private currentAuth?: RegistryLoginAuthInfo;

	public constructor(opts: RegistryClientOptions) {
		assert.ok(opts.name);

		this.repo = parsers.parseRepo(opts.name);

		this.loginConfig.bearerAuthToken = opts.bearerToken;
		this.loginConfig.username = opts.username;
		this.loginConfig.password = opts.password;
		this.loginConfig.scope = opts.scope;
		this.loginConfig.type = opts.authType;
		this.loginConfig.registrySecrets = opts.registrySecrets;

		this.connectionConfig.userAgent = opts.userAgent;
	}

	private createDockerJsonClient(url: string): JsonClient {
		return restify.createJsonClient({
			url,
			userAgent: this.connectionConfig.userAgent || DEFAULT_USERAGENT,
		});
	}

	private formatBasicAuthHeader(username: string, password?: string) {
		const buffer = Buffer.from(username + ':' + (password ?? ''), 'utf8');
		return 'Basic ' + buffer.toString('base64');
	}

	private getLoginCredentials(): { username?: string; password?: string } {
		// try to get login info for registry secrets and fall back on
		// specific username / password

		assert.ok(this.repo?.indexUrl);
		const secrets = this.loginConfig.registrySecrets;

		if (secrets) {
			const getSecretForIndex = (indexUrl: string) => {
				let s = secrets[indexUrl];
				if (!s) {
					if (indexUrl.endsWith('/')) {
						indexUrl = indexUrl.substring(0, indexUrl.length - 1);
					} else {
						indexUrl = indexUrl += '/';
					}
					s = secrets[indexUrl];
				}
				return s;
			};

			let secret: { username: string; password: string } | undefined;
			const namesToCheck = [this.repo.indexUrl, this.repo.indexName];
			if (this.repo.official) {
				namesToCheck.push(parsers.DEFAULT_LOGIN_SERVERNAME);
			}
			for (const name of namesToCheck) {
				secret = getSecretForIndex(name);
				if (secret) {
					break;
				}
			}
			if (secret) {
				return secret;
			}
		}

		if (this.loginConfig.username) {
			return {
				username: this.loginConfig.username,
				password: this.loginConfig.password,
			};
		}

		return {};
	}

	private makeHttpHeaders(authInfo?: RegistryLoginAuthInfo): HttpHeaders {
		if (authInfo) {
			switch (authInfo.type) {
				case undefined:
					if (!authInfo.username) {
						return {};
					} else {
						return {
							authorization: this.formatBasicAuthHeader(
								authInfo.username,
								authInfo.password,
							),
						};
					}
				case 'basic':
					assert.ok(authInfo.username);
					return {
						authorization: this.formatBasicAuthHeader(
							authInfo.username,
							authInfo.password,
						),
					};
				case 'bearer':
					return {
						authorization: 'Bearer ' + authInfo.token,
					};
			}
		}
		return {};
	}

	private getRegistryErrorMessage(err: HttpError) {
		if (err.body && Array.isArray(err.body.errors) && err.body.errors[0]) {
			return err.body.errors[0].message;
		} else if (err.body && err.body.details) {
			return err.body.details;
		} else if (Array.isArray(err.errors) && err.errors[0].message) {
			return err.errors[0].message;
		} else if (err.message) {
			return err.message;
		}
		return err.toString();
	}

	private makeAuthScope(resource: string, name: string, actions: string[]) {
		return `${resource}:${name}:${actions.join(',')}`;
	}

	private parseWWWAuthenticate(header: string): parsers.ParsedChallenge {
		try {
			const parsed = parsers.ParseAuthenticateChallenge(header);
			if (!parsed.scheme) {
				throw new Error('could not parse WWW-Authenticate header');
			}
			return parsed;
		} catch (err) {
			throw new Error(
				'could not parse WWW-Authenticate header "' + header + '": ' + err,
			);
		}
	}

	private getRegistryAuthToken(
		realm: string,
		service: string,
		scope: string,
		callback: (err?: unknown, token?: string) => void,
	) {
		assert.ok(realm, 'realm');
		assert.ok(realm, 'service');
		assert.ok(this.repo.remoteName, 'repo.remoteName');

		// - add https:// prefix (or http) if none on 'realm'
		let tokenUrl = realm;
		const match = /^(\w+):\/\//.exec(tokenUrl);
		if (!match) {
			tokenUrl = 'https://' + tokenUrl;
		} else if (['http', 'https'].indexOf(match[1]) === -1) {
			return callback(
				new Error(
					`unsupported scheme for WWW-Authenticate realm "${realm}": "${match[1]}"`,
				),
			);
		}

		// - GET $realm
		//      ?service=$service
		//      (&scope=$scope)*
		//      (&account=$username)
		//   Authorization: Basic ...

		const query = {
			service,
			scope: [scope],
		} as {
			service?: string;
			scope?: string[];
			account?: string;
		};

		const loginCredentials = this.getLoginCredentials();
		if (loginCredentials.username) {
			query.account = loginCredentials.username;
		}

		if (Object.keys(query).length) {
			tokenUrl += '?' + querystring.stringify(query);
		}

		const parsedUrl = mod_url.parse(tokenUrl);
		const client = this.createDockerJsonClient(
			parsedUrl.protocol + '//' + parsedUrl.host,
		);
		client.get(
			{
				path: parsedUrl.path,
				headers: this.makeHttpHeaders(loginCredentials),
			},
			(_err, _req, _res, body: BearerTokenBody) => {
				client.close();
				if (!body.token) {
					return callback(
						new restifyErrors.UnauthorizedError(
							'authorization ' +
								'server did not include a token in the response',
						),
					);
				}
				callback(null, body.token);
			},
		);
	}

	private getChallengeHeader(res: HttpResponse) {
		assert.ok(res);
		assert.ok(res.headers);

		let chalHeader = res.headers['www-authenticate'];

		// hack for quay.io
		if (!chalHeader && this.repo.indexUrl!.indexOf('quay.io') >= 0) {
			chalHeader = 'Bearer realm="https://quay.io/v2/auth",service="quay.io"';
		}

		return chalHeader;
	}

	private rawPing(
		headers: HttpHeaders,
		callback: (req: HttpRequest, res: HttpResponse, err: unknown) => void,
	) {
		assert.ok(this.repo.indexUrl, 'repo.indexUrl');
		const client = this.createDockerJsonClient(this.repo.indexUrl);

		client.get(
			{
				path: '/v2/',
				// Ping should be fast. We don't want 15s of retrying.
				retry: false,
				connectTimeout: 10000,
				headers,
			},
			(err: HttpError, _, res: HttpResponse, req: HttpRequest) => {
				callback(req, res, err);
				client.close();
			},
		);
	}

	/*
        Checks connectivity to the registry.  This means that if logged in, will check 
        that the registry would work using the current auth info.  If not logged in, 
        checks to see if it is possible to determine the auth scheme and log in
     */
	public ping(): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			this.rawPing(
				this.makeHttpHeaders(this.currentAuth),
				(_req, res: HttpResponse, err: HttpError) => {
					if (this.currentAuth) {
						resolve(!err);
					} else {
						// success = no error or else 401 with challenge header
						resolve(
							!err ||
								(res.statusCode === 401 && !!this.getChallengeHeader(res)),
						);
					}
				},
			);
		});
	}

	public async login(
		forceReset = false, // if we already have auth info, forceReset makes us do it anyway
		forceValidate = false, // if we have auth info (configured or obtained), still do a ping to validate it
	): Promise<boolean> {
		assert.ok(this.repo);
		assert.ok(this.repo.remoteName, 'repo not parsed');

		if (forceReset) {
			this.currentAuth = undefined;
		}
		if (!this.currentAuth) {
			switch (this.loginConfig.type) {
				case 'basic':
					this.currentAuth = {
						type: 'basic',
						...this.getLoginCredentials(),
					};
					break;
				case 'bearer':
					this.currentAuth = {
						type: 'bearer',
						token: this.loginConfig.bearerAuthToken,
					};
					break;
				case 'none':
					this.currentAuth = {
						type: 'none',
					};
					break;
				case undefined:
					// allow the method to go through the process to login, do the challenge, get a token, etc
					break;
			}

			if (this.currentAuth && !forceValidate) {
				return true;
			}
		}

		let challengeHeader: string;

		// Do a raw ping and process challenge header if necessary
		const pingSucceeded = await new Promise<boolean>((resolve, reject) => {
			this.rawPing(
				this.makeHttpHeaders(this.currentAuth),
				(_, res?: HttpResponse, err?: HttpError) => {
					if (!err) {
						// either current auth info worked or else we don't require auth
						return resolve(true);
					} else if (!res) {
						return reject(
							new restifyErrors.UnauthorizedError(
								'Null response from "GET /v2/" (see ' +
									'https://docs.docker.com/registry/spec/api/#api-version-check)',
							),
						);
					} else if (res.statusCode ?? err.statusCode === 401) {
						// Not authorized. Obtain the challenge header

						challengeHeader = this.getChallengeHeader(res);

						if (!challengeHeader) {
							return reject(
								new restifyErrors.UnauthorizedError(
									'missing WWW-Authenticate header in 401 ' +
										'response to "GET /v2/" (see ' +
										'https://docs.docker.com/registry/spec/api/#api-version-check)',
								),
							);
						}

						return resolve(false);
					}

					// some other error occured in the ping.
					return reject(err);
				},
			);
		});

		if (pingSucceeded) {
			if (!this.currentAuth) {
				this.currentAuth = { type: 'none' };
			}
			// current auth info is working or else we don't require auth
			return true;
		}

		// parse auth challenge
		let authChallenge: parsers.ParsedChallenge;

		try {
			authChallenge = this.parseWWWAuthenticate(challengeHeader!);
		} catch {
			return false;
		}

		switch (authChallenge?.scheme?.toLowerCase()) {
			case 'basic':
				this.currentAuth = {
					type: 'basic',
					...this.getLoginCredentials(),
				};
				return true;
			case 'bearer':
				assert.ok(
					authChallenge.realm,
					'Auth challenge parameters did not contain "realm"',
				);
				assert.ok(
					authChallenge.service,
					'Auth challenge parameters did not contain "service"',
				);

				return await new Promise<boolean>((resolve) => {
					this.getRegistryAuthToken(
						authChallenge.realm!,
						authChallenge.service!,
						this.loginConfig.scope ??
							this.makeAuthScope('repository', this.repo.remoteName!, ['pull']),
						(err, token) => {
							if (err) {
								return resolve(false);
							}
							this.currentAuth = {
								type: 'bearer',
								token,
							};
							return resolve(true);
						},
					);
				});
			default:
				return false;
		}
	}

	public async getManifest(
		tag = 'latest',
		maxSchemaVersion = 2,
		acceptManifestLists = true,
	): Promise<DockerImageManifest | number | undefined> {
		assert.ok(this.repo, 'repo');
		assert.ok(this.repo.indexUrl, 'repo.indexUrl');
		assert.ok(this.repo.remoteName, 'repo.remoteName');

		const loginSucceeded = await this.login();
		if (!loginSucceeded) {
			return 401;
		}

		const headers = this.makeHttpHeaders(this.currentAuth);
		if (maxSchemaVersion === 2) {
			const accept: string[] = [];
			accept.push(MEDIATYPE_MANIFEST_V2);
			if (acceptManifestLists) {
				accept.push(MEDIATYPE_MANIFEST_LIST_V2);
			}
			headers.accept = accept;
		}
		const client = this.createDockerJsonClient(this.repo.indexUrl!);

		try {
			return await new Promise<DockerImageManifest>((resolve, reject) => {
				client.get(
					{
						path: `/v2/${encodeURI(
							this.repo.remoteName!,
						)}/manifests/${encodeURI(tag)}`,
						headers,
					},
					(err: HttpError, _, _res, parsedBody: DockerImageManifest) => {
						if (err) {
							if (err.statusCode === 401) {
								// Convert into a 404 error.
								// If we get an Unauthorized error here, it actually
								// means the repo does not exist, otherwise we should
								// have received an unauthorized error during the
								// doLogin step and this code path would not be taken.
								const errMsg = this.getRegistryErrorMessage(err);
								return reject(
									restifyErrors.makeErrFromCode(404, { message: errMsg }),
								);
							}

							return reject(err);
						}

						if (parsedBody.schemaVersion > maxSchemaVersion) {
							throw new restifyErrors.InvalidContentError(
								`unsupported schema version ${parsedBody.schemaVersion} in ${this.repo.localName}:${tag} manifest`,
							);
						}

						resolve(parsedBody);
					},
				);
			});
		} catch (err) {
			const statusCode = (err as HttpError).statusCode;
			if (statusCode) {
				return statusCode;
			} else {
				return;
			}
		}
	}
}

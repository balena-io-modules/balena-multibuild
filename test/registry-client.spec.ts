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

import {
	MEDIATYPE_MANIFEST_LIST_V2,
	MEDIATYPE_MANIFEST_V2,
	RegistryClient,
	DockerImageManifest,
	DockerImageManifestComponentObject,
} from '../lib/registry/registry-client';
import * as parsers from '../lib/registry//parsers';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);
chai.should();
const expect = chai.expect;

class Tester {
	private repoString: string;
	private tag: string;
	private parsedRepo: { remoteName: string };

	public constructor(repoString: string, tag: string) {
		this.repoString = repoString;
		this.tag = tag;
		this.parsedRepo = parsers.parseRepo(repoString);
	}

	public testPing_NoLogin(): void {
		it('should ping successfully without login', async () => {
			const client = new RegistryClient({
				name: this.repoString,
			});
			const pingResult = await client.ping();
			expect(pingResult).to.be.true;
		});
	}

	// TODO:  Do this when we get some test creds
	// public testPingWithGoodLogin(): void {
	//     it('should ping successfully with login', async () => {
	//         const client = new RegistryClient({
	//             name: this.repoString,
	//             username: undefined,
	//             password: undefined
	//         });
	//         const loginResult = await client.login();
	//         expect(loginResult).to.be.true;
	//         const pingResult = await client.ping();
	//         expect(pingResult).to.be.true;
	//     });
	// }

	public testPingBadLogin(): void {
		it('ping should fail with bad login', async () => {
			const client = new RegistryClient({
				name: this.repoString,
				authType: 'basic',
				username: 'userNoExisty',
				password: 'badPasswordIsNoBueno',
			});
			await client.login();
			const pingResult = await client.ping();
			expect(pingResult).to.be.false;
		});
	}

	public testGetManifest_V1Manfest(): void {
		/*
		 *  {
		 *      "name": <name>,
		 *      "tag": <tag>,
		 *      "fsLayers": [
		 *         {
		 *            "blobSum": <tarsum>
		 *         },
		 *         ...
		 *      ],
		 *      "history": <v1 images>,
		 *      "signature": <JWS>
		 *  }
		 */
		it('should return a v1 manifest', async () => {
			const client = new RegistryClient({
				name: this.repoString,
			});
			const result = await client.getManifest(this.tag, 1);
			expect(result).to.be.not.null;
			const manifest = result as DockerImageManifest;
			expect(manifest.schemaVersion).to.be.equal(1);
			expect(manifest.name).to.be.equal(this.parsedRepo.remoteName);
			expect(manifest.tag).to.be.equal(this.tag);
			expect(manifest.architecture).to.be.not.null;
			expect(manifest.fsLayers).to.be.not.null;
			expect(manifest.history).to.be.not.null;
			expect(manifest.signatures).to.be.not.null;
		});
	}

	public testGetManifest_V2List(): void {
		/*
		 * {
		 *   "schemaVersion": 2,
		 *   "mediaType": "application/vnd.docker.dis...ion.manifest.list.v2+json",
		 *   "manifests": [
		 *     {
		 *       "mediaType": "application/vnd.docker.dis...ion.manifest.v2+json",
		 *       "size": 528,
		 *       "digest": "sha256:4b920400cf4c9...29ab9dd64eaa652837cd39c2cdf",
		 *       "platform": {
		 *         "architecture": "amd64",
		 *         "os": "linux"
		 *       }
		 *     }
		 *   ]
		 * }
		 */
		it('should return a v2 manifest list', async () => {
			const client = new RegistryClient({
				name: this.repoString,
			});
			const result = await client.getManifest(this.tag, 2, true);
			expect(result).to.be.not.null;
			const manifest = result as DockerImageManifest;
			expect(manifest.schemaVersion).to.be.equal(2);
			expect(manifest.mediaType).to.be.equal(MEDIATYPE_MANIFEST_LIST_V2);
			expect(manifest.manifests).to.not.be.undefined;
			expect(Array.isArray(manifest.manifests)).to.be.true;
			manifest.manifests!.forEach((m: DockerImageManifestComponentObject) => {
				expect(m.digest).to.be.not.undefined;
				expect(m.platform).to.be.not.undefined;
				expect(m.platform!.architecture).to.be.not.undefined;
				expect(m.platform!.os).to.be.not.undefined;
			});
		});
	}

	public testGetManifest_V2Manifest(): void {
		/*
		 * {
		 *   "schemaVersion": 2,
		 *   "mediaType": "application/vnd.docker.distribution.manifest.v2+json",
		 *   "config": {
		 *     "mediaType": "application/octet-stream",
		 *     "size": 1459,
		 *     "digest": "sha256:2b8fd9751c4c0f5dd266fc...01"
		 *   },
		 *   "layers": [
		 *     {
		 *       "mediaType": "application/vnd.docker.image.rootfs.diff.tar.gzip",
		 *       "size": 667590,
		 *       "digest": "sha256:8ddc19f16526912237dd8af...a9"
		 *     }
		 *   ]
		 * }
		 */
		it('should return a v2 manifest', async () => {
			const client = new RegistryClient({
				name: this.repoString,
			});
			const result = await client.getManifest(this.tag, 2, false);
			expect(result).to.be.not.null;
			const manifest = result as DockerImageManifest;
			expect(manifest.schemaVersion).to.be.equal(2);
			expect(manifest.mediaType).to.be.equal(MEDIATYPE_MANIFEST_V2);
			expect(manifest.config).to.not.be.undefined;
			expect(manifest.layers).to.not.be.undefined;
			expect(manifest.layers!.length).to.be.greaterThan(0);
		});
	}

	public testGetManifest_BadTag(): void {
		it('should return a 404 for an unknown tag', async () => {
			const client = new RegistryClient({
				name: this.repoString,
			});
			const code = await client.getManifest('unknowntag');
			expect(code).to.be.equal(404);
		});
	}

	public testGetManfiest_BadRepo(): void {
		it('should return a 404 for an unknown repo', async () => {
			const client = new RegistryClient({
				name: 'unknownrepo',
			});
			const code = await client.getManifest();
			expect(code).to.be.equal(404);
		});
	}

	public testGetManifest_BadCredentials(): void {
		it('should return a 401 for bad credentials', async () => {
			const client = new RegistryClient({
				name: this.repoString,
				authType: 'basic',
				username: 'userNoExisty',
				password: 'badPasswordIsNoBueno',
			});
			const code = await client.getManifest();
			expect(code).to.be.equal(404);
		});
	}
}

// --- Tests

describe('docker.io', () => {
	const REPO = 'busybox';
	const TAG = 'latest';
	const tester = new Tester(REPO, TAG);

	describe('ping', () => {
		tester.testPing_NoLogin();
		tester.testPingBadLogin();
	});

	describe('getManifest', () => {
		tester.testGetManifest_V1Manfest();
		tester.testGetManifest_V2List();
		tester.testGetManifest_V2Manifest();
		tester.testGetManfiest_BadRepo();
		tester.testGetManifest_BadCredentials();
		tester.testGetManifest_BadTag();
	});
});

describe('grc.io', () => {
	const REPO = 'gcr.io/google_containers/pause';
	const TAG = 'latest';
	const tester = new Tester(REPO, TAG);

	describe('ping', () => {
		tester.testPing_NoLogin();
		tester.testPingBadLogin();
	});

	describe('getManifest', () => {
		tester.testGetManifest_V2Manifest();
		tester.testGetManfiest_BadRepo();
		tester.testGetManifest_BadCredentials();
		tester.testGetManifest_BadTag();
	});
});

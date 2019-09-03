import { Either, isLeft } from 'fp-ts/lib/Either';
import * as t from 'io-ts';
import { PathReporter } from 'io-ts/lib/PathReporter';
import * as jsYaml from 'js-yaml';
import * as _ from 'lodash';
import * as Stream from 'stream';
import * as tar from 'tar-stream';
import * as TarUtils from 'tar-utils';

import { BalenaYml, parsedBalenaYml, ParsedBalenaYml } from './build-secrets';
import {
	BalenaYMLValidationError,
	MultipleMetadataDirectoryError,
	RegistrySecretValidationError,
} from './errors';
import * as PathUtils from './path-utils';
import {
	addCanonicalDockerHubEntry,
	RegistrySecrets,
	RegistrySecretValidator,
} from './registry-secrets';

export const QEMU_BIN_NAME = 'qemu-execve';

enum MetadataFileType {
	Json,
	Yaml,
}

export class BuildMetadata {
	public registrySecrets: RegistrySecrets;
	private metadataFiles: Dictionary<Buffer> = {};
	private balenaYml: BalenaYml;

	public constructor(private metadataDirectories: string[]) {}

	public async extractMetadata(
		tarStream: Stream.Readable,
	): Promise<Stream.Readable> {
		let foundMetadataDirectory: string | null = null;
		// Run the tar file through the extraction stream, removing
		// anything that is a child of the metadata directory
		// and storing it, otherwise forwarding the other files to
		// a tar insertion stream, which is then returned.
		const onEntry = async (
			pack: tar.Pack,
			header: tar.Headers,
			stream: Stream.Readable,
		) => {
			const buffer = await TarUtils.streamToBuffer(stream);

			const entryInformation = this.getMetadataRelativePath(header.name);

			if (
				entryInformation == null ||
				entryInformation.relativePath === QEMU_BIN_NAME
			) {
				pack.entry(header, buffer);
			} else {
				// Keep track of the different metadata directories
				// we've found, and if there is more than one, throw
				// an error (for example both .balena and .resin)
				if (
					foundMetadataDirectory != null &&
					foundMetadataDirectory !== entryInformation.metadataDirectory
				) {
					throw new MultipleMetadataDirectoryError();
				}
				foundMetadataDirectory = entryInformation.metadataDirectory;
				this.addMetadataFile(entryInformation.relativePath, buffer);
			}
		};
		return (await TarUtils.cloneTarStream(tarStream, {
			onEntry,
		})) as Stream.Readable;
	}

	public getBalenaYml() {
		return _.cloneDeep(this.balenaYml);
	}

	public getSecretFile(source: string): Buffer | undefined {
		return this.metadataFiles[PathUtils.join('secrets', source)];
	}

	public parseMetadata() {
		// Yaml takes precedence over json (as our docs are in
		// yaml), but balena takes precedence over resin
		// .yml vs .yaml: https://stackoverflow.com/questions/21059124/is-it-yaml-or-yml/
		const potentials = [
			{ name: 'balena.yml', type: MetadataFileType.Yaml },
			{ name: 'balena.yaml', type: MetadataFileType.Yaml },
			{ name: 'balena.json', type: MetadataFileType.Json },
			{ name: 'resin.yml', type: MetadataFileType.Yaml },
			{ name: 'resin.yaml', type: MetadataFileType.Yaml },
			{ name: 'resin.json', type: MetadataFileType.Json },
		];

		let bufData: Buffer | undefined;
		let foundType: MetadataFileType;

		for (const { name, type } of potentials) {
			if (name in this.metadataFiles) {
				bufData = this.metadataFiles[name];
				foundType = type;
				break;
			}
		}
		if (bufData != null) {
			let result: Either<t.Errors, ParsedBalenaYml>;
			try {
				let value: unknown;
				if (foundType! === MetadataFileType.Json) {
					value = JSON.parse(bufData.toString());
				} else {
					value = jsYaml.safeLoad(bufData.toString());
				}

				result = parsedBalenaYml.decode(value);
				if (isLeft(result)) {
					throw new Error(PathReporter.report(result).join('\n'));
				}
			} catch (e) {
				throw new BalenaYMLValidationError(e);
			}

			this.balenaYml = {
				buildSecrets: result.right['build-secrets'] || {},
				buildVariables: result.right['build-variables'] || {},
			};
		} else {
			this.balenaYml = { buildSecrets: {}, buildVariables: {} };
		}

		this.parseRegistrySecrets();
	}

	public getBuildVarsForService(serviceName: string): Dictionary<string> {
		const vars: Dictionary<string> = {};
		if (this.balenaYml.buildVariables.global != null) {
			_.assign(vars, this.balenaYml.buildVariables.global);
		}
		const services = this.balenaYml.buildVariables.services;
		if (services != null && serviceName in services) {
			_.assign(vars, services[serviceName]);
		}
		return vars;
	}

	private parseRegistrySecrets() {
		const potentials = [
			{ name: 'registry-secrets.json', type: MetadataFileType.Json },
			{ name: 'registry-secrets.yml', type: MetadataFileType.Yaml },
			{ name: 'registry-secrets.yaml', type: MetadataFileType.Yaml },
		];

		let bufData: Buffer | undefined;
		let foundType: MetadataFileType;

		for (const { name, type } of potentials) {
			if (name in this.metadataFiles) {
				bufData = this.metadataFiles[name];
				foundType = type;
			}
		}

		if (bufData != null) {
			// Validate the registry secrets
			const validator = new RegistrySecretValidator();
			let secrets: Dictionary<unknown>;
			try {
				if (foundType! === MetadataFileType.Yaml) {
					secrets = jsYaml.safeLoad(bufData.toString());
				} else {
					secrets = JSON.parse(bufData.toString());
				}
			} catch (e) {
				throw new RegistrySecretValidationError(e);
			}
			validator.validateRegistrySecrets(secrets);
			addCanonicalDockerHubEntry(secrets as RegistrySecrets);
			this.registrySecrets = secrets as RegistrySecrets;
		} else {
			this.registrySecrets = {};
		}
	}

	private addMetadataFile(name: string, data: Buffer) {
		this.metadataFiles[name] = data;
	}

	private getMetadataRelativePath(
		path: string,
	): { relativePath: string; metadataDirectory: string } | undefined {
		for (const metadataDirectory of this.metadataDirectories) {
			if (PathUtils.contains(metadataDirectory, path)) {
				return {
					relativePath: PathUtils.relative(metadataDirectory, path),
					metadataDirectory,
				};
			}
		}
	}
}

export default BuildMetadata;

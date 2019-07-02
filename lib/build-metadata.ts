import { Either, isLeft } from 'fp-ts/lib/Either';
import * as t from 'io-ts';
import { PathReporter } from 'io-ts/lib/PathReporter';
import * as jsYaml from 'js-yaml';
import * as _ from 'lodash';
import * as Stream from 'stream';
import * as tar from 'tar-stream';
import * as TarUtils from 'tar-utils';

import { BalenaYml, parsedBalenaYml, ParsedBalenaYml } from './build-secrets';
import { BalenaYMLValidationError } from './errors';
import * as PathUtils from './path-utils';

enum MetadataFileType {
	Json,
	Yaml,
}

export class BuildMetadata {
	private metadataFiles: Dictionary<Buffer> = {};
	private balenaYml: BalenaYml;

	public constructor(private metadataDirectory: string) {}

	public async extractMetadata(
		tarStream: Stream.Readable,
	): Promise<Stream.Readable> {
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
			const relative = this.getMetadataRelativePath(header.name);

			if (relative != null) {
				this.addMetadataFile(relative, buffer);
			} else {
				pack.entry(header, buffer);
			}
		};
		return (await TarUtils.cloneTarStream(tarStream, {
			onEntry,
		})) as Stream.Readable;
	}

	public getBalenaYml() {
		return this.balenaYml;
	}

	public getSecretFile(source: string): Buffer | undefined {
		return this.metadataFiles[PathUtils.join('secrets', source)];
	}

	public parseMetadata() {
		// Yaml takes precedence over json (as our docs are in
		// yaml), but balena takes precedence over resin
		const potentials = [
			{ name: 'balena.yml', type: MetadataFileType.Yaml },
			{ name: 'balena.json', type: MetadataFileType.Json },
			{ name: 'resin.yml', type: MetadataFileType.Yaml },
			{ name: 'balena.json', type: MetadataFileType.Json },
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

	private addMetadataFile(name: string, data: Buffer) {
		this.metadataFiles[name] = data;
	}

	private getMetadataRelativePath(path: string): string | undefined {
		if (PathUtils.contains(this.metadataDirectory, path)) {
			return PathUtils.relative(this.metadataDirectory, path);
		}
	}
}

export default BuildMetadata;

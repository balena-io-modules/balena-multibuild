declare module 'tar-stream' {
	import * as Stream from 'stream';
	export interface TarHeader {
		name: string;
		size: number;
		mode?: string;
		mtime?: Date;
		type?: string;
		linkname?: string;
		uid?: number;
		gid?: number;
		uname?: string;
		gname?: string;
		devmajor?: number;
		devminor?: number;
	}

	export function extract(): Stream.Duplex;

	export interface Pack extends Stream.Readable {
		entry(header: TarHeader, data: string | Buffer): void;
		entry(header: TarHeader, cb: (err: Error) => void): Stream.Writable;

		finalize(): void;
	}

	export function pack(): Pack;
}

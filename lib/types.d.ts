// These types will come from resin-compose-parse, but they don't
// yet exist
interface Dict {
	[key: string]: string | null;
}

interface BuildInfo {
	context: string;
	args: Dict;
	labels: Dict;
	tag?: string;
}

export type BuildConfig = string | BuildInfo;

export interface Service {
	name: string;
	build: BuildConfig;
}

export interface Composition {
	services: Service[];
}

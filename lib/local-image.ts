import * as Dockerode from 'dockerode';

import { ImageRemovalError } from './errors';

/**
 * LocalImage
 *
 * This class represents an image on a docker daemon. It also provides
 * methods to act on this image.
 */
export class LocalImage {
	/**
	 * The dockerfile which was used to build this image, if one exists
	 */
	public dockerfile?: string;

	/**
	 * Was this image built locally or imported into the docker daemon
	 * from a registry?
	 */
	public external: boolean;

	/**
	 * The reference of this image on the docker daemon
	 */
	public name: string;

	/**
	 * The daemon which this image is stored on
	 */
	public daemon: Dockerode;

	/**
	 * Was this image built successfully?
	 *
	 * Note that in the case of an image not being successfully built,
	 * this class could represent an image which is made up of all
	 * the layers that were successfully built
	 */
	public successful: boolean;

	public constructor(
		daemon: Dockerode,
		name: string,
		external: boolean,
		successful: boolean,
	) {
		this.daemon = daemon;
		this.name = name;
		this.external = external;
		this.successful = successful;
	}

	/**
	 * Get a handle to the dockerode image
	 */
	public getImage(): Dockerode.Image {
		return this.daemon.getImage(this.name);
	}

	/**
	 * Delete an image from the docker daemon
	 *
	 * @throws ImageRemovalError
	 */
	public deleteImage(): Promise<void> {
		const image = this.getImage();
		return image.remove()
		.catch((e) => {
			throw new ImageRemovalError(e);
		});
	}
}

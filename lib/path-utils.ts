import { relative, normalize } from 'path';

// Export all of node's path functions, so that users of this
// module need only import this file
export * from 'path';

/**
 * Given two paths, check whether the first contains the second
 * @param path1 The potentially containing path
 * @param path2 The potentially contained path
 * @return A boolean indicating whether `path1` contains `path2`
 */
export const contains = (path1: string, path2: string): boolean => {

	// First normalise the input, to remove any path weirdness
	path1 = normalize(path1);
	path2 = normalize(path2);

	// Now test if any part of the relative path contains a .. ,
	// which would tell us that path1 is not part of path2
	return !/^\.\.$|\.\.\//.test(relative(path1, path2));
};

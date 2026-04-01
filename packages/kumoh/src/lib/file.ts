/**
 * Converts a filename (without directory prefix) to a Hono sub-path.
 * This is the path RELATIVE to the directory mount point.
 *
 * - `index.ts` → `/`
 * - `hello.ts` → `/hello`
 * - `$id.ts` → `/:id`
 * - `$...slug.ts` → `/:slug{.+}`
 */
export function fileToSubPath(filename: string): string {
  let route = filename.replace(/\.(ts|js)$/, '').replace(/^index$/, '');

  // Catch-all: $...slug → :slug{.+}
  route = route.replace(/\$\.\.\.([^/]+)/g, ':$1{.+}');

  // Dynamic segment: $id → :id
  route = route.replace(/\$([^/]+)/g, ':$1');

  return '/' + route;
}

/**
 * Converts a directory-relative path to a Hono mount path.
 * Applies $param conversion to directory segments.
 *
 * - `""` → `/`
 * - `"api"` → `/api`
 * - `"api/users"` → `/api/users`
 * - `"api/$version"` → `/api/:version`
 */
export function dirToMountPath(dir: string): string {
  if (!dir) {
    return '/';
  }
  let path = `/${dir}`;
  path = path.replace(/\$\.\.\.([^/]+)/g, ':$1{.+}');
  path = path.replace(/\$([^/]+)/g, ':$1');
  return path;
}

/**
 * Sorts route sub-paths: static before dynamic, alphabetical tiebreak.
 * Matches HonoX's in-directory sorting.
 */
export function sortSubPaths<T extends { subPath: string }>(routes: T[]): T[] {
  return routes.sort((a, b) => {
    const aIsDynamic = a.subPath.includes(':');
    const bIsDynamic = b.subPath.includes(':');
    if (aIsDynamic && !bIsDynamic) {
      return 1;
    }
    if (!aIsDynamic && bIsDynamic) {
      return -1;
    }
    return a.subPath.localeCompare(b.subPath);
  });
}

/**
 * Sorts directory keys shallow→deep.
 * Matches HonoX's `sortDirectoriesByDepth`.
 */
export function sortByDepth(dirs: string[]): string[] {
  return dirs.sort((a, b) => {
    const depthA = a ? a.split('/').length : 0;
    const depthB = b ? b.split('/').length : 0;
    return depthA - depthB || a.localeCompare(b);
  });
}

/**
 * Walks up parent directories to find the nearest middleware.
 * Matches HonoX's middleware inheritance (lines 232-252).
 */
export function findInheritedMiddleware(
  dir: string,
  middlewareMap: Map<string, string>,
  appliedDirs: Set<string>
): string | undefined {
  // First check exact directory
  if (middlewareMap.has(dir)) {
    return middlewareMap.get(dir);
  }

  // Walk up parent directories
  const parts = dir.split('/');
  for (let i = parts.length - 1; i >= 0; i--) {
    const parentDir = parts.slice(0, i).join('/');
    const parentMw = middlewareMap.get(parentDir);
    if (!parentMw) {
      continue;
    }

    // Skip if already applied to an ancestor (prevents duplication)
    if (appliedDirs.has(parentDir)) {
      continue;
    }

    return parentMw;
  }

  return undefined;
}

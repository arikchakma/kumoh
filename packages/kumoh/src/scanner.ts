import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, resolve } from 'node:path';

import fg from 'fast-glob';
import { parseSync } from 'oxc-parser';

import type { ScannedCron, ScannedQueue, ScannedRouteGroup } from './types.ts';

export function findServerEntry(
  root: string,
  serverEntry?: string
): string | null {
  if (serverEntry) {
    const abs = isAbsolute(serverEntry)
      ? serverEntry
      : resolve(root, serverEntry);
    return existsSync(abs) ? abs : null;
  }

  const candidates = ['app/server.ts', 'app/server.js'];
  for (const candidate of candidates) {
    const abs = resolve(root, candidate);
    if (existsSync(abs)) {
      return abs;
    }
  }
  return null;
}

/**
 * Converts a filename (without directory prefix) to a Hono sub-path.
 * This is the path RELATIVE to the directory mount point.
 *
 * - `index.ts` → `/`
 * - `hello.ts` → `/hello`
 * - `$id.ts` → `/:id`
 * - `$...slug.ts` → `/:slug{.+}`
 */
function fileToSubPath(filename: string): string {
  let route = filename.replace(/\.(ts|js)$/, '').replace(/^index$/, '');

  route = route.replace(/\$\.\.\.([^/]+)/g, ':$1{.+}');
  route = route.replace(/\$([^/]+)/g, ':$1');

  return '/' + route;
}

/**
 * Groups route files by directory, attaches middleware, and sorts
 * directories shallow→deep (matching HonoX's `sortDirectoriesByDepth`).
 *
 * Each group becomes a Hono sub-app mounted at the directory's path.
 */
export function groupRoutesByDirectory(
  root: string,
  routesDir: string
): ScannedRouteGroup[] {
  const absDir = isAbsolute(routesDir) ? routesDir : resolve(root, routesDir);
  if (!existsSync(absDir)) {
    return [];
  }

  const allFiles = fg.sync('**/*.{ts,js}', { cwd: absDir });

  // Separate middleware from route files
  const middlewareMap = new Map<string, string>();
  const routeFiles: Array<{ file: string; dir: string; name: string }> = [];

  for (const file of allFiles) {
    const name = basename(file);
    const dir = dirname(file) === '.' ? '' : dirname(file);

    if (name.startsWith('_middleware.')) {
      middlewareMap.set(dir, resolve(absDir, file));
    } else if (!name.startsWith('_')) {
      routeFiles.push({ file, dir, name });
    }
  }

  // Group routes by directory
  const dirMap = new Map<string, ScannedRouteGroup>();

  // Ensure directories with only middleware also get a group
  for (const [dir, mwPath] of middlewareMap) {
    if (!dirMap.has(dir)) {
      const mountPath = dir ? `/${dir}` : '/';
      dirMap.set(dir, { mountPath, middlewarePath: mwPath, routes: [] });
    } else {
      dirMap.get(dir)!.middlewarePath = mwPath;
    }
  }

  for (const { file, dir, name } of routeFiles) {
    if (!dirMap.has(dir)) {
      const mountPath = dir ? `/${dir}` : '/';
      dirMap.set(dir, { mountPath, routes: [] });
    }

    const group = dirMap.get(dir)!;
    group.routes.push({
      importPath: resolve(absDir, file),
      subPath: fileToSubPath(name),
    });
  }

  // Sort routes within each directory: static before dynamic
  for (const group of dirMap.values()) {
    group.routes.sort((a, b) => {
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

  // Sort directories shallow→deep (HonoX: sortDirectoriesByDepth)
  const sorted = [...dirMap.entries()].sort(([a], [b]) => {
    const depthA = a ? a.split('/').length : 0;
    const depthB = b ? b.split('/').length : 0;
    return depthA - depthB || a.localeCompare(b);
  });

  // Apply $param conversion to mount paths
  return sorted.map(([_, group]) => ({
    ...group,
    mountPath: group.mountPath
      .replace(/\$\.\.\.([^/]+)/g, ':$1{.+}')
      .replace(/\$([^/]+)/g, ':$1'),
  }));
}

/**
 * Parses a TS/JS file with oxc and extracts the value of
 * `export const cron = '...'`. Returns `null` if not found.
 */
function parseCronSchedule(filePath: string): string | null {
  const code = readFileSync(filePath, 'utf-8');
  const { program } = parseSync(filePath, code);

  for (const node of program.body) {
    if (node.type !== 'ExportNamedDeclaration') {
      continue;
    }

    const declaration = node.declaration;
    if (!declaration || declaration.type !== 'VariableDeclaration') {
      continue;
    }

    for (const declarator of declaration.declarations) {
      if (
        declarator.id.type !== 'Identifier' ||
        declarator.id.name !== 'cron'
      ) {
        continue;
      }

      if (!declarator.init || declarator.init.type !== 'Literal') {
        continue;
      }

      const literal = declarator.init;
      if (typeof literal.value === 'string') {
        return literal.value;
      }
    }
  }

  return null;
}

export function scanCrons(root: string, cronsDir: string): ScannedCron[] {
  const absDir = isAbsolute(cronsDir) ? cronsDir : resolve(root, cronsDir);
  if (!existsSync(absDir)) {
    return [];
  }
  const files = fg.sync('**/*.{ts,js}', { cwd: absDir });

  const crons = files
    .filter((f) => !basename(f).startsWith('_'))
    .map((file) => {
      const filePath = resolve(absDir, file);
      const schedule = parseCronSchedule(filePath);
      if (!schedule) {
        console.warn(
          `[kumoh] ${file}: missing \`export const cron = '...'\`, skipping`
        );
      }
      return {
        filePath,
        name: basename(file, extname(file)),
        importPath: filePath,
        schedule: schedule ?? '',
      };
    })
    .filter((c) => c.schedule !== '');

  const seen = new Map<string, string>();
  for (const cron of crons) {
    const existing = seen.get(cron.schedule);
    if (existing) {
      throw new Error(
        `[kumoh] Duplicate cron schedule "${cron.schedule}" in ${existing} and ${cron.name}.ts.\n` +
          'Each schedule must have exactly one handler. Use a single file per schedule, or use different schedules.'
      );
    }
    seen.set(cron.schedule, cron.name);
  }

  return crons;
}

function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function toUpperSnake(str: string): string {
  return str.replace(/-/g, '_').toUpperCase();
}

export function scanQueues(
  root: string,
  queuesDir: string,
  appName: string
): ScannedQueue[] {
  const absDir = isAbsolute(queuesDir) ? queuesDir : resolve(root, queuesDir);
  if (!existsSync(absDir)) {
    return [];
  }
  const files = fg.sync('**/*.{ts,js}', { cwd: absDir });

  return files
    .filter((f) => !basename(f).startsWith('_'))
    .map((file) => {
      const name = basename(file, extname(file));
      return {
        filePath: resolve(absDir, file),
        name,
        camelName: toCamelCase(name),
        binding: `QUEUE_${toUpperSnake(name)}`,
        queueName: `${appName}-${name}`,
        importPath: resolve(absDir, file),
      };
    });
}

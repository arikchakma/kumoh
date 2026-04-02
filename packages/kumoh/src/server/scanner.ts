import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, resolve } from 'node:path';

import fg from 'fast-glob';
import { parseSync } from 'oxc-parser';

import {
  dirToMountPath,
  fileToSubPath,
  findMiddlewareForDir,
  sortDirectories,
  sortSubPaths,
} from '../lib/file.ts';

export type ScannedRouteFile = {
  importPath: string;
  relativePath: string;
  subPath: string;
};

export type ScannedRouteGroup = {
  mountPath: string;
  middlewarePath?: string;
  routes: ScannedRouteFile[];
};

export type ScannedCron = {
  filePath: string;
  name: string;
  importPath: string;
  schedule: string;
};

export type ScannedQueue = {
  filePath: string;
  name: string;
  camelName: string;
  binding: string;
  queueName: string;
  importPath: string;
};

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
 * Groups route files by directory, attaches middleware (with inheritance),
 * and sorts directories shallow→deep (matching HonoX's pattern).
 *
 * Middleware inheritance: if a directory has no `_middleware.ts`, the nearest
 * ancestor's middleware is inherited (matching HonoX lines 229-252).
 */
export function groupRoutesByDirectory(
  root: string,
  routesDir: string
): ScannedRouteGroup[] {
  const absDir = isAbsolute(routesDir) ? routesDir : resolve(root, routesDir);
  if (!existsSync(absDir)) {
    return [];
  }

  const allFiles = fg.sync('**/*.{ts,js}', {
    cwd: absDir,
    ignore: ['**/*.d.ts'],
  });

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

  const allDirs = new Set<string>();
  for (const [dir] of middlewareMap) {
    allDirs.add(dir);
  }
  for (const { dir } of routeFiles) {
    allDirs.add(dir);
  }

  const dirMap = new Map<string, ScannedRouteGroup>();
  const appliedMiddlewareDirs = new Set<string>();

  for (const dir of sortDirectories([...allDirs])) {
    const mwPath = findMiddlewareForDir(
      dir,
      middlewareMap,
      appliedMiddlewareDirs
    );

    const group: ScannedRouteGroup = {
      mountPath: dirToMountPath(dir),
      routes: [],
    };

    if (mwPath) {
      group.middlewarePath = mwPath;
      const mwDir = [...middlewareMap.entries()].find(
        ([_, p]) => p === mwPath
      )?.[0];
      if (mwDir !== undefined) {
        appliedMiddlewareDirs.add(mwDir);
      }
    }

    dirMap.set(dir, group);
  }

  for (const { file, dir, name } of routeFiles) {
    const group = dirMap.get(dir)!;
    group.routes.push({
      importPath: resolve(absDir, file),
      relativePath: file,
      subPath: fileToSubPath(name),
    });
  }

  for (const group of dirMap.values()) {
    sortSubPaths(group.routes);
  }

  const sorted = sortDirectories([...dirMap.keys()]);
  return sorted.map((dir) => dirMap.get(dir)!);
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
  const files = fg.sync('**/*.{ts,js}', { cwd: absDir, ignore: ['**/*.d.ts'] });

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
  const files = fg.sync('**/*.{ts,js}', { cwd: absDir, ignore: ['**/*.d.ts'] });

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

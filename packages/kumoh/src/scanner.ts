import { existsSync, readFileSync } from 'node:fs';
import { basename, extname, isAbsolute, resolve } from 'node:path';

import fg from 'fast-glob';
import { parseSync } from 'oxc-parser';

import type { ScannedCron, ScannedQueue } from './types.js';

export function findRoutesEntry(
  root: string,
  routesEntry?: string
): string | null {
  if (routesEntry) {
    const abs = isAbsolute(routesEntry)
      ? routesEntry
      : resolve(root, routesEntry);
    return existsSync(abs) ? abs : null;
  }

  const candidates = [
    'routes.ts',
    'routes.js',
    'routes/index.ts',
    'routes/index.js',
  ];

  for (const candidate of candidates) {
    const abs = resolve(root, candidate);
    if (existsSync(abs)) {
      return abs;
    }
  }

  return null;
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

  return files
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
}

export function scanQueues(root: string, queuesDir: string): ScannedQueue[] {
  const absDir = isAbsolute(queuesDir) ? queuesDir : resolve(root, queuesDir);
  if (!existsSync(absDir)) {
    return [];
  }
  const files = fg.sync('**/*.{ts,js}', { cwd: absDir });

  return files
    .filter((f) => !basename(f).startsWith('_'))
    .map((file) => ({
      filePath: resolve(absDir, file),
      name: basename(file, extname(file)),
      importPath: resolve(absDir, file),
    }));
}

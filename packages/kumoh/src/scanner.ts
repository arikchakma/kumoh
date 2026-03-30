import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import fg from 'fast-glob';
import { parseSync } from 'oxc-parser';

import type { ScannedCron, ScannedQueue } from './types.js';

export function findRoutesEntry(
  root: string,
  routesEntry?: string
): string | null {
  if (routesEntry) {
    const abs = path.isAbsolute(routesEntry)
      ? routesEntry
      : path.resolve(root, routesEntry);
    return existsSync(abs) ? abs : null;
  }

  const candidates = [
    'routes.ts',
    'routes.js',
    'routes/index.ts',
    'routes/index.js',
  ];

  for (const candidate of candidates) {
    const abs = path.resolve(root, candidate);
    if (existsSync(abs)) {
      return abs;
    }
  }

  return null;
}

/**
 * Extract `export const cron = '...'` from a TS/JS file using oxc AST parser.
 */
function extractCronSchedule(filePath: string): string | null {
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
  const absDir = path.isAbsolute(cronsDir)
    ? cronsDir
    : path.resolve(root, cronsDir);
  if (!existsSync(absDir)) {
    return [];
  }
  const files = fg.sync('**/*.{ts,js}', { cwd: absDir });

  return files
    .filter((f) => !path.basename(f).startsWith('_'))
    .map((file) => {
      const filePath = path.resolve(absDir, file);
      const schedule = extractCronSchedule(filePath);
      if (!schedule) {
        console.warn(
          `[kumoh] ${file}: missing \`export const cron = '...'\`, skipping`
        );
      }
      return {
        filePath,
        name: path.basename(file, path.extname(file)),
        importPath: filePath,
        schedule: schedule ?? '',
      };
    })
    .filter((c) => c.schedule !== '');
}

export function scanQueues(root: string, queuesDir: string): ScannedQueue[] {
  const absDir = path.isAbsolute(queuesDir)
    ? queuesDir
    : path.resolve(root, queuesDir);
  if (!existsSync(absDir)) {
    return [];
  }
  const files = fg.sync('**/*.{ts,js}', { cwd: absDir });

  return files
    .filter((f) => !path.basename(f).startsWith('_'))
    .map((file) => ({
      filePath: path.resolve(absDir, file),
      name: path.basename(file, path.extname(file)),
      importPath: path.resolve(absDir, file),
    }));
}

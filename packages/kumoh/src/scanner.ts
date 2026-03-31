import { existsSync, readFileSync } from 'node:fs';
import { basename, extname, isAbsolute, resolve } from 'node:path';

import fg from 'fast-glob';
import { parseSync } from 'oxc-parser';

import type { ScannedCron, ScannedQueue } from './types.ts';

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

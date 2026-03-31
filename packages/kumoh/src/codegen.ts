import { genImport, genObjectFromRaw, genSafeVariableName } from 'knitwork';

import type { ScannedCron, ScannedQueue } from './types.js';

interface CronVar {
  handler: string;
  schedule: string;
  importPath: string;
}

interface QueueVar {
  handler: string;
  queueName: string;
  importPath: string;
}

/**
 * Assembles a module from discrete code sections, separated by blank lines.
 * Falsy values are filtered out so callers can conditionally include blocks.
 *
 * ```ts
 * genModule('import ...', hasQueues && genQueueBlock(), 'export default ...')
 * ```
 */
function genModule(...sections: Array<string | false | undefined>): string {
  return sections.filter(Boolean).join('\n\n') + '\n';
}

/**
 * Indents every non-empty line by `depth` levels (2 spaces per level).
 * Empty lines are preserved as-is to keep blank line spacing inside blocks.
 *
 * ```ts
 * indent('const x = 1;\nreturn x;')
 * // '  const x = 1;\n  return x;'
 * ```
 */
function indent(code: string, depth = 1): string {
  const pad = '  '.repeat(depth);
  return code
    .split('\n')
    .map((line) => (line ? `${pad}${line}` : line))
    .join('\n');
}

/**
 * Generates an `async function` declaration with proper indentation.
 *
 * ```ts
 * genAsyncFn('handle', ['req', 'env'], 'return env.DB.get(req.id);')
 * // async function handle(req, env) {
 * //   return env.DB.get(req.id);
 * // }
 * ```
 */
function genAsyncFn(name: string, params: string[], body: string): string {
  return [
    `async function ${name}(${params.join(', ')}) {`,
    indent(body),
    '}',
  ].join('\n');
}

/**
 * Generates all import statements for the worker entry:
 * - Default import for the Hono app
 * - Named imports for each cron handler + its schedule constant
 * - Default import for each queue consumer handler
 */
function genImports(
  routesEntry: string,
  cronVars: CronVar[],
  queueVars: QueueVar[]
): string {
  const lines: string[] = [];

  lines.push(genImport(routesEntry, [{ name: 'default', as: 'app' }]));

  for (const cron of cronVars) {
    lines.push(
      genImport(cron.importPath, [
        { name: 'default', as: cron.handler },
        { name: 'cron', as: cron.schedule },
      ])
    );
  }

  for (const queue of queueVars) {
    lines.push(
      genImport(queue.importPath, [{ name: 'default', as: queue.handler }])
    );
  }

  return lines.join('\n');
}

/**
 * Generates the cron dispatch block. Builds a `cronMap` that maps each
 * schedule string to its handler. Duplicate schedules are caught at scan
 * time so each schedule has exactly one handler — clean retry semantics.
 *
 * Returns `false` when there are no crons so `genModule` filters it out.
 */
function genScheduledBlock(cronVars: CronVar[]): string | false {
  if (!cronVars.length) {
    return false;
  }

  const mapEntries = cronVars
    .map(({ schedule, handler }) => `  [${schedule}]: ${handler},`)
    .join('\n');

  const body = [
    'const handler = cronMap[controller.cron];',
    'if (handler) {',
    '  await handler(controller, env, ctx);',
    '}',
  ].join('\n');

  return [
    `const cronMap = {\n${mapEntries}\n};`,
    '',
    genAsyncFn('handleScheduled', ['controller', 'env', 'ctx'], body),
  ].join('\n');
}

/**
 * Generates the queue dispatch block. Builds a `queueMap` keyed by queue
 * name (derived from the filename, e.g. `email.ts` → `"email"`).
 * The `handleQueue` function looks up the handler by `batch.queue`.
 *
 * Returns `false` when there are no queues so `genModule` filters it out.
 */
function genQueueBlock(queueVars: QueueVar[]): string | false {
  if (!queueVars.length) {
    return false;
  }

  const entries: Record<string, string> = {};
  for (const queue of queueVars) {
    entries[queue.queueName] = queue.handler;
  }

  const body = [
    'const handler = queueMap[batch.queue];',
    'if (handler) {',
    '  await handler(batch, env, ctx);',
    '}',
  ].join('\n');

  return [
    `const queueMap = ${genObjectFromRaw(entries)};`,
    '',
    genAsyncFn('handleQueue', ['batch', 'env', 'ctx'], body),
  ].join('\n');
}

/**
 * Generates the `export default { fetch, scheduled?, queue? }` statement.
 * Only includes `scheduled` and `queue` when their handlers exist.
 */
function genWorkerExport(cronVars: CronVar[], queueVars: QueueVar[]): string {
  const entries: Record<string, string> = { fetch: 'app.fetch' };

  if (cronVars.length) {
    entries.scheduled = 'handleScheduled';
  }
  if (queueVars.length) {
    entries.queue = 'handleQueue';
  }

  return `export default ${genObjectFromRaw(entries)};`;
}

/**
 * Generates a complete Cloudflare Worker entry module that wires together:
 *
 * - **HTTP** — Hono app's `fetch` handler
 * - **Crons** — dispatched by `controller.cron` schedule string
 * - **Queues** — dispatched by `batch.queue` name (derived from filename)
 *
 * Filenames are sanitised with `genSafeVariableName` to produce valid
 * identifiers even for files like `my-cron-job.ts` or `123queue.ts`.
 */
export function generateWorkerEntry(
  routesEntry: string,
  crons: ScannedCron[],
  queues: ScannedQueue[]
): string {
  const cronVars: CronVar[] = crons.map((cron) => {
    const safe = genSafeVariableName(cron.name);
    return {
      handler: `cron_${safe}_handler`,
      schedule: `cron_${safe}_schedule`,
      importPath: cron.importPath,
    };
  });

  const queueVars: QueueVar[] = queues.map((queue) => {
    const safe = genSafeVariableName(queue.name);
    return {
      handler: `queue_${safe}`,
      queueName: queue.queueName,
      importPath: queue.importPath,
    };
  });

  return genModule(
    '// AUTO-GENERATED BY kumoh — do not edit',
    genImports(routesEntry, cronVars, queueVars),
    genScheduledBlock(cronVars),
    genQueueBlock(queueVars),
    genWorkerExport(cronVars, queueVars)
  );
}

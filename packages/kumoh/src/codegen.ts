import { genImport, genObjectFromRaw, genSafeVariableName } from 'knitwork';

import type { ScannedCron, ScannedQueue, ScannedRouteGroup } from './types.ts';

type CronVar = {
  handler: string;
  schedule: string;
  importPath: string;
};

type QueueVar = {
  handler: string;
  queueName: string;
  importPath: string;
};

function genModule(...sections: Array<string | false | undefined>): string {
  return sections.filter(Boolean).join('\n\n') + '\n';
}

function indent(code: string, depth = 1): string {
  const pad = '  '.repeat(depth);
  return code
    .split('\n')
    .map((line) => (line ? `${pad}${line}` : line))
    .join('\n');
}

function genAsyncFn(name: string, params: string[], body: string): string {
  return [
    `async function ${name}(${params.join(', ')}) {`,
    indent(body),
    '}',
  ].join('\n');
}

/**
 * Flattens route groups into a sequential list of imports with stable indices.
 * Returns { middlewareImports, routeImports } with indices matching the codegen output.
 */
function collectImports(groups: ScannedRouteGroup[]) {
  const middlewareImports: Array<{ index: number; path: string }> = [];
  const routeImports: Array<{ index: number; path: string }> = [];

  let mwIdx = 0;
  let routeIdx = 0;

  for (const group of groups) {
    if (group.middlewarePath) {
      middlewareImports.push({ index: mwIdx++, path: group.middlewarePath });
    }
    for (const route of group.routes) {
      routeImports.push({ index: routeIdx++, path: route.importPath });
    }
  }

  return { middlewareImports, routeImports };
}

function genImports(
  serverEntry: string,
  groups: ScannedRouteGroup[],
  cronVars: CronVar[],
  queueVars: QueueVar[]
): string {
  const lines: string[] = [];
  const hasRoutes = groups.length > 0;
  const { middlewareImports, routeImports } = collectImports(groups);

  if (hasRoutes) {
    lines.push("import { Hono } from 'hono';");
  }
  lines.push(genImport(serverEntry, [{ name: 'default', as: 'init' }]));

  for (const mw of middlewareImports) {
    lines.push(`import * as mw_${mw.index} from "${mw.path}";`);
  }
  for (const r of routeImports) {
    lines.push(`import * as route_${r.index} from "${r.path}";`);
  }

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

function genAppInit(): string {
  return ['const app = new Hono();', 'init(app);'].join('\n');
}

/**
 * Generates per-directory sub-app blocks (HonoX pattern).
 *
 * Each directory gets its own `new Hono()`, middleware + routes are added,
 * then it's mounted on the main app with `app.route(mountPath, sub)`.
 */
function genDirectoryBlocks(groups: ScannedRouteGroup[]): string | false {
  if (!groups.length) {
    return false;
  }

  const blocks: string[] = [];
  const METHODS =
    "const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];";
  blocks.push(METHODS);

  let mwIdx = 0;
  let routeIdx = 0;

  for (const group of groups) {
    const lines: string[] = [];
    lines.push('{');
    lines.push('  const sub = new Hono();');

    // Middleware
    if (group.middlewarePath) {
      lines.push(
        `  if (mw_${mwIdx}.default) {`,
        `    const h = Array.isArray(mw_${mwIdx}.default) ? mw_${mwIdx}.default : [mw_${mwIdx}.default];`,
        "    sub.use('*', ...h);",
        '  }'
      );
      mwIdx++;
    }

    // Routes
    for (const route of group.routes) {
      const ri = routeIdx++;
      lines.push(
        `  if (route_${ri}.default && typeof route_${ri}.default === 'object' && 'fetch' in route_${ri}.default) {`,
        `    sub.route('${route.subPath}', route_${ri}.default);`,
        '  } else {',
        `    for (const m of METHODS) {`,
        `      const handler = route_${ri}[m];`,
        `      if (handler) sub.on(m, '${route.subPath}', ...(Array.isArray(handler) ? handler : [handler]));`,
        '    }',
        `    if (route_${ri}.default && typeof route_${ri}.default === 'function' && !route_${ri}.GET) {`,
        `      sub.get('${route.subPath}', route_${ri}.default);`,
        '    }',
        '  }'
      );
    }

    lines.push(`  app.route('${group.mountPath}', sub);`);
    lines.push('}');
    blocks.push(lines.join('\n'));
  }

  return blocks.join('\n\n');
}

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
 * Generates a complete Cloudflare Worker entry module.
 *
 * Uses the HonoX pattern: creates a fresh Hono app, calls the user's
 * init function, then builds per-directory sub-apps and mounts them.
 */
export function generateWorkerEntry(
  serverEntry: string,
  routeGroups: ScannedRouteGroup[],
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
    genImports(serverEntry, routeGroups, cronVars, queueVars),
    routeGroups.length > 0 && genAppInit(),
    genDirectoryBlocks(routeGroups),
    genScheduledBlock(cronVars),
    genQueueBlock(queueVars),
    genWorkerExport(cronVars, queueVars)
  );
}

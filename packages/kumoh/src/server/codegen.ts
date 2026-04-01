import { genImport, genSafeVariableName } from 'knitwork';

import type { ScannedCron, ScannedQueue, ScannedRouteGroup } from '../types.ts';

/**
 * Generates a minimal worker entry that imports modules and
 * calls `defineWorker()` at runtime. All wiring logic lives in
 * `create-app.ts`, not in generated strings.
 */
export function generateWorkerEntry(
  serverEntry: string,
  routeGroups: ScannedRouteGroup[],
  crons: ScannedCron[],
  queues: ScannedQueue[]
): string {
  const lines: string[] = [];

  // Imports
  lines.push("import { defineWorker } from 'kumoh/server';");
  lines.push(genImport(serverEntry, [{ name: 'default', as: 'init' }]));

  // Middleware imports
  const mwEntries: string[] = [];
  let mwIdx = 0;
  for (const group of routeGroups) {
    if (group.middlewarePath) {
      const name = `mw_${mwIdx++}`;
      lines.push(`import * as ${name} from "${group.middlewarePath}";`);
      // Reconstruct relative path key for the middleware
      const key = group.middlewarePath;
      mwEntries.push(`  "${key}": ${name}`);
    }
  }

  // Route imports
  const routeEntries: string[] = [];
  let routeIdx = 0;
  for (const group of routeGroups) {
    for (const route of group.routes) {
      const name = `route_${routeIdx++}`;
      lines.push(`import * as ${name} from "${route.importPath}";`);
      routeEntries.push(`  "${route.relativePath}": ${name}`);
    }
  }

  // Cron imports
  const cronEntries: string[] = [];
  for (const cron of crons) {
    const safe = genSafeVariableName(cron.name);
    const handler = `cron_${safe}`;
    const schedule = `cron_${safe}_schedule`;
    lines.push(
      genImport(cron.importPath, [
        { name: 'default', as: handler },
        { name: 'cron', as: schedule },
      ])
    );
    cronEntries.push(
      `  ${safe}: { handler: ${handler}, schedule: ${schedule} }`
    );
  }

  // Queue imports
  const queueEntries: string[] = [];
  for (const queue of queues) {
    const safe = genSafeVariableName(queue.name);
    const handler = `queue_${safe}`;
    lines.push(genImport(queue.importPath, [{ name: 'default', as: handler }]));
    queueEntries.push(`  "${queue.queueName}": ${handler}`);
  }

  // defineWorker() call
  lines.push('');
  lines.push('export default defineWorker({');
  lines.push('  init,');

  if (routeEntries.length) {
    lines.push('  routes: {');
    lines.push(routeEntries.join(',\n') + ',');
    lines.push('  },');
  }

  if (mwEntries.length) {
    lines.push('  middleware: {');
    lines.push(mwEntries.join(',\n') + ',');
    lines.push('  },');
  }

  if (cronEntries.length) {
    lines.push('  crons: {');
    lines.push(cronEntries.join(',\n') + ',');
    lines.push('  },');
  }

  if (queueEntries.length) {
    lines.push('  queues: {');
    lines.push(queueEntries.join(',\n') + ',');
    lines.push('  },');
  }

  lines.push('});');
  lines.push('');

  return lines.join('\n');
}

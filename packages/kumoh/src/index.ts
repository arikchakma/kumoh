import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cloudflare } from '@cloudflare/vite-plugin';
import type { Plugin } from 'vite-plus';

import { toCamelCase, toUpperSnake } from './lib/case.ts';
import { outputPlugin, virtualModules } from './server/plugin.ts';
import { scanObjects } from './server/scanner.ts';
import { createWorkerConfig } from './server/worker-config.ts';

export type KumohRateLimiter = {
  name: string;
  camelName: string;
  binding: string;
  limit: number;
  period: 10 | 60;
  namespaceId: number;
};

export type KumohDurableObject = {
  name: string;
  className: string;
  camelName: string;
  binding: string;
  importPath: string;
};

export type KumohConfig = {
  appName: string;
  serverEntry: string;
  routesDir: string;
  cronsDir: string;
  queuesDir: string;
  objectsDir: string;
  schemaPath: string;
  rateLimiters: KumohRateLimiter[];
  durableObjects: KumohDurableObject[];
};

export { defineScheduled } from './factory/scheduled.ts';
export { defineQueue } from './factory/queue.ts';
export { defineEmail } from './factory/email-handler.ts';

type KumohJson = {
  name?: string;
  rateLimiters?: Array<{
    name: string;
    limit: number;
    period: 10 | 60;
  }>;
  state?: {
    d1?: string;
    kv?: string;
    domain?: string;
    migrations?: string[];
  };
};

function readConfig(root: string): KumohJson {
  const configPath = resolve(root, 'kumoh.json');
  if (!existsSync(configPath)) {
    return {};
  }
  return JSON.parse(readFileSync(configPath, 'utf-8'));
}

export function resolveConfig(root: string): KumohConfig;
export function resolveConfig(raw: KumohJson, root: string): KumohConfig;
export function resolveConfig(
  rawOrRoot: KumohJson | string,
  root?: string
): KumohConfig {
  const resolvedRoot = typeof rawOrRoot === 'string' ? rawOrRoot : root!;
  const raw = typeof rawOrRoot === 'string' ? readConfig(rawOrRoot) : rawOrRoot;
  return _resolveConfig(raw, resolvedRoot);
}
function _resolveConfig(raw: KumohJson, root: string): KumohConfig {
  return {
    appName: raw.name ?? 'kumoh-app',
    serverEntry: resolve(root, 'app/server.ts'),
    routesDir: resolve(root, 'app/routes'),
    cronsDir: resolve(root, 'app/crons'),
    queuesDir: resolve(root, 'app/queues'),
    objectsDir: resolve(root, 'app/objects'),
    schemaPath: resolve(root, 'app/db/schema.ts'),
    rateLimiters: (raw.rateLimiters ?? []).map((r, i) => ({
      name: r.name,
      camelName: toCamelCase(r.name),
      binding: `RATE_LIMITER_${toUpperSnake(r.name)}`,
      limit: r.limit,
      period: r.period,
      namespaceId: 1001 + i,
    })),
    durableObjects: scanObjects(root, resolve(root, 'app/objects')),
  };
}

export function kumoh(): Plugin[] {
  const root = process.cwd();
  const raw = readConfig(root);
  const config = resolveConfig(raw, root);
  const workerConfig = createWorkerConfig(raw, root);
  const envName = config.appName.replace(/-/g, '_');

  // Two copies of vite-plus-core in the dep tree (@cloudflare/vite-plugin brings
  // its own pinned version) produce technically-incompatible Plugin<any> types.
  // Casting each source to any before collecting into the array sidesteps
  // the "Excessive stack depth" error TypeScript hits when comparing them.
  const cfPlugins = cloudflare({
    config: workerConfig,
    persistState: { path: '.kumoh' },
  }) as unknown as Plugin[];

  return [virtualModules(config), ...cfPlugins, outputPlugin(envName)];
}

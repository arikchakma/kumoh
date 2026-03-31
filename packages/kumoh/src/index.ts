import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cloudflare } from '@cloudflare/vite-plugin';
import type { Plugin } from 'vite';

import { virtualModules } from './plugin.js';
import { scanCrons, scanQueues } from './scanner.js';
import type { KumohConfig } from './types.js';

export type { KumohConfig } from './types.js';
export { defineScheduled } from './scheduled.js';
export { defineQueue } from './queue.js';

type KumohJson = {
  name?: string;
  routes?: string;
  crons?: string;
  queues?: string;
  schema?: string;
};

const bindings = {
  d1: 'DB',
  kv: 'KV',
  r2: 'BUCKET',
} as const;

function readConfig(root: string): KumohJson {
  const configPath = resolve(root, 'kumoh.json');
  if (!existsSync(configPath)) {
    return {};
  }
  return JSON.parse(readFileSync(configPath, 'utf-8'));
}

function resolveConfig(raw: KumohJson, root: string): KumohConfig {
  return {
    appName: raw.name ?? 'kumoh-app',
    routesEntry: raw.routes ? resolve(root, raw.routes) : undefined,
    cronsDir: resolve(root, raw.crons ?? 'app/crons'),
    queuesDir: resolve(root, raw.queues ?? 'app/queues'),
    schemaPath: resolve(root, raw.schema ?? 'app/db/schema.ts'),
  };
}

function createWorkerConfig(raw: KumohJson, root: string) {
  const name = raw.name ?? 'kumoh-app';

  const workerConfig: Record<string, unknown> = {
    name,
    main: 'kumoh/entry',
    compatibility_date: '2025-03-14',
    compatibility_flags: ['nodejs_compat'],
  };

  if (raw.schema) {
    workerConfig.d1_databases = [
      {
        binding: bindings.d1,
        database_name: `${name}-db`,
        database_id: 'local',
      },
    ];
  }

  workerConfig.kv_namespaces = [
    {
      binding: bindings.kv,
      id: 'local',
    },
  ];

  workerConfig.r2_buckets = [
    {
      binding: bindings.r2,
      bucket_name: `${name}-bucket`,
    },
  ];

  // AI binding
  workerConfig.ai = { binding: 'AI' };

  // Email binding
  workerConfig.send_email = [{ name: 'EMAIL' }];

  if (raw.queues) {
    const queuesDir = resolve(root, raw.queues);
    const queues = scanQueues(root, queuesDir, name);
    if (queues.length) {
      workerConfig.queues = {
        producers: queues.map((q) => ({
          binding: q.binding,
          queue: q.queueName,
        })),
        consumers: queues.map((q) => ({
          queue: q.queueName,
        })),
      };
    }
  }

  if (raw.crons) {
    const cronsDir = resolve(root, raw.crons);
    const crons = scanCrons(root, cronsDir);
    if (crons.length) {
      workerConfig.triggers = {
        crons: crons.map((c) => c.schedule),
      };
    }
  }

  return workerConfig;
}

export function kumoh(userConfig?: KumohConfig): Plugin[] {
  const root = process.cwd();
  const raw = readConfig(root);
  const config: KumohConfig = {
    ...resolveConfig(raw, root),
    ...userConfig,
  };
  const workerConfig = createWorkerConfig(raw, root);
  const envName = (raw.name ?? 'kumoh-app').replace(/-/g, '_');

  return [
    virtualModules(config),
    ...cloudflare({ config: workerConfig, persistState: { path: '.kumoh' } }),
    {
      name: 'kumoh:output',
      config: () => ({
        environments: {
          [envName]: { build: { outDir: 'dist' } },
        },
      }),
    } as Plugin,
  ];
}

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { cloudflare } from '@cloudflare/vite-plugin';
import type { Plugin } from 'vite';

import { createVirtualModulesPlugin, createAliasPlugin } from './plugin.js';
import { scanCrons } from './scanner.js';
import type { KumohConfig } from './types.js';

export type { KumohConfig } from './types.js';
export { defineScheduled } from './scheduled.js';
export { defineQueue } from './queue.js';

interface KumohJson {
  name?: string;
  routes?: string;
  crons?: string;
  queues?: string;
  schema?: string;
}

const BINDING_NAMES = {
  d1: 'DB',
  kv: 'KV',
  r2: 'BUCKET',
  queue: 'QUEUE',
} as const;

function loadConfig(root: string): KumohJson {
  const configPath = path.resolve(root, 'kumoh.json');
  if (!existsSync(configPath)) {
    return {};
  }
  return JSON.parse(readFileSync(configPath, 'utf-8'));
}

function toPluginConfig(raw: KumohJson, root: string): KumohConfig {
  return {
    routesEntry: raw.routes ? path.resolve(root, raw.routes) : undefined,
    cronsDir: path.resolve(root, raw.crons ?? 'app/crons'),
    queuesDir: path.resolve(root, raw.queues ?? 'app/queues'),
    schemaPath: path.resolve(root, raw.schema ?? 'app/db/schema.ts'),
  };
}

function buildWorkerConfig(raw: KumohJson, root: string) {
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
        binding: BINDING_NAMES.d1,
        database_name: `${name}-db`,
        database_id: 'local',
      },
    ];
  }

  workerConfig.kv_namespaces = [
    {
      binding: BINDING_NAMES.kv,
      id: 'local',
    },
  ];

  workerConfig.r2_buckets = [
    {
      binding: BINDING_NAMES.r2,
      bucket_name: `${name}-bucket`,
    },
  ];

  if (raw.queues) {
    workerConfig.queues = {
      producers: [
        {
          binding: BINDING_NAMES.queue,
          queue: `${name}-queue`,
        },
      ],
      consumers: [
        {
          queue: `${name}-queue`,
        },
      ],
    };
  }

  // Extract cron schedules from files for wrangler triggers
  if (raw.crons) {
    const cronsDir = path.resolve(root, raw.crons);
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
  const raw = loadConfig(root);
  const config: KumohConfig = {
    ...toPluginConfig(raw, root),
    ...userConfig,
  };
  const workerConfig = buildWorkerConfig(raw, root);
  const envName = (raw.name ?? 'kumoh-app').replace(/-/g, '_');

  return [
    createVirtualModulesPlugin(config),
    createAliasPlugin(config),
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

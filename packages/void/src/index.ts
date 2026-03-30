import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { cloudflare } from '@cloudflare/vite-plugin';
import type { Plugin } from 'vite';

import { createVirtualModulesPlugin, createAliasPlugin } from './plugin.js';
import type { MakeVoidConfig } from './types.js';

export type { MakeVoidConfig, CronContext, QueueContext } from './types.js';

interface VoidJson {
  name?: string;
  routes?: string;
  crons?: string;
  queues?: string;
  schema?: string;
}

// Fixed binding names — the user never needs to know these
const BINDING_NAMES = {
  d1: 'DB',
  kv: 'KV',
  r2: 'BUCKET',
  queue: 'QUEUE',
} as const;

function loadVoidJson(root: string): VoidJson {
  const configPath = path.resolve(root, 'void.json');
  if (!existsSync(configPath)) {
    return {};
  }
  return JSON.parse(readFileSync(configPath, 'utf-8'));
}

function voidJsonToConfig(raw: VoidJson, root: string): MakeVoidConfig {
  return {
    routesEntry: raw.routes ? path.resolve(root, raw.routes) : undefined,
    cronsDir: path.resolve(root, raw.crons ?? 'app/crons'),
    queuesDir: path.resolve(root, raw.queues ?? 'app/queues'),
    schemaPath: path.resolve(root, raw.schema ?? 'app/db/schema.ts'),
  };
}

function buildWorkerConfig(raw: VoidJson) {
  const name = raw.name ?? 'void-app';

  const workerConfig: Record<string, unknown> = {
    name,
    main: 'void/entry',
    compatibility_date: '2025-03-14',
    compatibility_flags: ['nodejs_compat'],
  };

  // Always provision D1 if schema is configured
  if (raw.schema) {
    workerConfig.d1_databases = [
      {
        binding: BINDING_NAMES.d1,
        database_name: `${name}-db`,
        database_id: 'local',
      },
    ];
  }

  // Always provision KV
  workerConfig.kv_namespaces = [
    {
      binding: BINDING_NAMES.kv,
      id: 'local',
    },
  ];

  // Always provision R2
  workerConfig.r2_buckets = [
    {
      binding: BINDING_NAMES.r2,
      bucket_name: `${name}-bucket`,
    },
  ];

  // Provision queues if queues dir is configured
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

  return workerConfig;
}

export function makeVoid(userConfig?: MakeVoidConfig): Plugin[] {
  const root = process.cwd();
  const raw = loadVoidJson(root);
  const config: MakeVoidConfig = {
    ...voidJsonToConfig(raw, root),
    ...userConfig,
  };
  const workerConfig = buildWorkerConfig(raw);
  const envName = (raw.name ?? 'void-app').replace(/-/g, '_');

  return [
    createVirtualModulesPlugin(config),
    createAliasPlugin(config),
    ...cloudflare({ config: workerConfig, persistState: { path: '.void' } }),
    {
      name: 'void:output',
      config: () => ({
        environments: {
          [envName]: { build: { outDir: 'dist' } },
        },
      }),
    } as Plugin,
  ];
}

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cloudflare } from '@cloudflare/vite-plugin';
import type { Plugin } from 'vite';

import { virtualModules } from './server/plugin.ts';
import { scanCrons, scanQueues } from './server/scanner.ts';

export type KumohConfig = {
  appName: string;
  serverEntry: string;
  routesDir: string;
  cronsDir: string;
  queuesDir: string;
  schemaPath: string;
};

export { defineScheduled } from './factory/scheduled.ts';
export { defineQueue } from './factory/queue.ts';
export { defineEmail } from './factory/email-handler.ts';

type KumohJson = {
  name?: string;
  deploy?: {
    d1?: string;
    kv?: string;
    url?: string;
    domain?: string;
    migrations?: string[];
  };
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
    serverEntry: resolve(root, 'app/server.ts'),
    routesDir: resolve(root, 'app/routes'),
    cronsDir: resolve(root, 'app/crons'),
    queuesDir: resolve(root, 'app/queues'),
    schemaPath: resolve(root, 'app/db/schema.ts'),
  };
}

function createWorkerConfig(raw: KumohJson, root: string) {
  const name = raw.name ?? 'kumoh-app';
  const schemaExists = existsSync(resolve(root, 'app/db/schema.ts'));
  const cronsDir = resolve(root, 'app/crons');
  const queuesDir = resolve(root, 'app/queues');

  const workerConfig: Record<string, unknown> = {
    name,
    main: 'kumoh/entry',
    compatibility_date: '2025-03-14',
    compatibility_flags: ['nodejs_compat'],
  };

  if (schemaExists) {
    workerConfig.d1_databases = [
      {
        binding: bindings.d1,
        database_name: `${name}-db`,
        database_id: 'local',
      },
    ];
  }

  workerConfig.kv_namespaces = [{ binding: bindings.kv, id: 'local' }];
  workerConfig.r2_buckets = [
    { binding: bindings.r2, bucket_name: `${name}-bucket` },
  ];
  workerConfig.ai = { binding: 'AI' };
  workerConfig.send_email = [{ name: 'SEND_EMAIL' }];

  if (existsSync(queuesDir)) {
    const queues = scanQueues(root, queuesDir, name);
    if (queues.length) {
      workerConfig.queues = {
        producers: queues.map((q) => ({
          binding: q.binding,
          queue: q.queueName,
        })),
        consumers: queues.map((q) => ({ queue: q.queueName })),
      };
    }
  }

  if (existsSync(cronsDir)) {
    const crons = scanCrons(root, cronsDir);
    if (crons.length) {
      workerConfig.triggers = { crons: crons.map((c) => c.schedule) };
    }
  }

  if (raw.deploy?.domain) {
    workerConfig.custom_domains = [raw.deploy.domain];
  }

  return workerConfig;
}

export function kumoh(): Plugin[] {
  const root = process.cwd();
  const raw = readConfig(root);
  const config = resolveConfig(raw, root);
  const workerConfig = createWorkerConfig(raw, root);
  const envName = config.appName.replace(/-/g, '_');

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

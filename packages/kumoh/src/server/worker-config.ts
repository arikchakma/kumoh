import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { toUpperSnake } from '../lib/case.ts';
import { scanCrons, scanObjects, scanQueues } from './scanner.ts';

type RateLimiter = {
  name: string;
  limit: number;
  period: 10 | 60;
};

type RawConfig = {
  name?: string;
  rateLimiters?: Array<RateLimiter>;
  state?: { domain?: string };
};

const bindings = {
  d1: 'DB',
  kv: 'KV',
  r2: 'BUCKET',
} as const;

export function createWorkerConfig(
  raw: RawConfig,
  root: string
): Record<string, unknown> {
  const name = raw.name ?? 'kumoh-app';
  const schemaExists = existsSync(resolve(root, 'app/db/schema.ts'));
  const cronsDir = resolve(root, 'app/crons');
  const queuesDir = resolve(root, 'app/queues');
  const objectsDir = resolve(root, 'app/objects');

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
        migrations_dir: '../app/db/migrations',
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

  const objects = scanObjects(root, objectsDir);
  if (objects.length) {
    workerConfig.durable_objects = {
      bindings: objects.map((o) => ({
        name: o.binding,
        class_name: o.className,
      })),
    };
  }

  const rateLimiters = (raw.rateLimiters ?? []).map((r, i) => ({
    name: `RATE_LIMITER_${toUpperSnake(r.name)}`,
    type: 'ratelimit',
    namespace_id: String(1001 + i),
    simple: { limit: r.limit, period: r.period },
  }));

  if (rateLimiters.length) {
    workerConfig.unsafe = { bindings: rateLimiters };
  }

  if (raw.state?.domain) {
    workerConfig.routes = [{ pattern: raw.state.domain, custom_domain: true }];
  }

  return workerConfig;
}

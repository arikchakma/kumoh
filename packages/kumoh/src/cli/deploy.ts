import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { defineCommand } from 'citty';

import { scanQueues } from '../server/scanner.ts';
import type { DeployState, KumohJson, MigrationJournal } from './config.ts';
import { loadConfig, migrationsDir, root, saveConfig } from './config.ts';
import { log } from './log.ts';
import { confirm, prompt } from './prompt.ts';
import {
  deleteWorkerQueue,
  ensureLoggedIn,
  getWorkerQueueConsumers,
  removeQueueConsumer,
  wrangler,
  wranglerExec,
} from './wrangler.ts';

function parseJson<T>(raw: string, context: string): T {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`[kumoh] Failed to parse JSON from ${context}:\n${raw}`);
  }
}

async function provisionD1(name: string, state: DeployState): Promise<void> {
  if (state.d1) {
    log.ok(`D1 database "${name}" (${state.d1.slice(0, 8)}…) — exists`);
    return;
  }

  try {
    const info = parseJson<{ uuid: string }>(
      await wrangler(`d1 info ${name} --json`),
      'wrangler d1 info'
    );
    state.d1 = info.uuid;
    log.ok(`D1 database "${name}" (${info.uuid.slice(0, 8)}…) — found`);
  } catch {
    await wrangler(`d1 create ${name}`);
    const info = parseJson<{ uuid: string }>(
      await wrangler(`d1 info ${name} --json`),
      'wrangler d1 info'
    );
    state.d1 = info.uuid;
    log.ok(`D1 database "${name}" (${info.uuid.slice(0, 8)}…) — created`);
  }
}

async function provisionKV(name: string, state: DeployState): Promise<void> {
  if (state.kv) {
    log.ok(`KV namespace (${state.kv.slice(0, 8)}…) — exists`);
    return;
  }

  const list = parseJson<Array<{ id: string; title: string }>>(
    await wrangler('kv namespace list'),
    'wrangler kv namespace list'
  );
  const existing = list.find((ns) => ns.title === name);

  if (existing) {
    state.kv = existing.id;
    log.ok(`KV namespace (${existing.id.slice(0, 8)}…) — found`);
    return;
  }

  await wrangler(`kv namespace create ${name}`);
  const listAfter = parseJson<Array<{ id: string; title: string }>>(
    await wrangler('kv namespace list'),
    'wrangler kv namespace list'
  );
  const created = listAfter.find((ns) => ns.title === name);
  if (!created) {
    throw new Error(
      `[kumoh] KV namespace "${name}" was created but not found in namespace list`
    );
  }
  state.kv = created.id;
  log.ok(`KV namespace (${created.id.slice(0, 8)}…) — created`);
}

// R2 has no "get bucket info" API like D1/KV, so we just try to create
// and treat failure as "already exists"
async function provisionR2(name: string): Promise<void> {
  try {
    await wrangler(`r2 bucket create ${name}`);
    log.ok(`R2 bucket "${name}" — created`);
  } catch {
    log.ok(`R2 bucket "${name}" — exists`);
  }
}

async function provisionQueue(name: string): Promise<void> {
  try {
    await wrangler(`queues create ${name}`);
    log.ok(`Queue "${name}" — created`);
  } catch {
    log.ok(`Queue "${name}" — exists`);
  }
}

async function patchWranglerConfig(state: DeployState): Promise<void> {
  const wranglerPath = resolve(root, 'dist', 'wrangler.json');
  const config = parseJson<Record<string, unknown>>(
    await readFile(wranglerPath, 'utf-8'),
    'dist/wrangler.json'
  );

  if (state.d1 && Array.isArray(config.d1_databases)) {
    (config.d1_databases as Array<Record<string, unknown>>)[0].database_id =
      state.d1;
  }

  if (state.kv && Array.isArray(config.kv_namespaces)) {
    (config.kv_namespaces as Array<Record<string, unknown>>)[0].id = state.kv;
  }

  if (state.domain) {
    config.routes = [{ pattern: state.domain, custom_domain: true }];
  }

  await writeFile(wranglerPath, JSON.stringify(config, null, 2));
}

async function applyMigrations(
  config: KumohJson,
  state: DeployState,
  persist: () => Promise<void>
): Promise<void> {
  const dir = migrationsDir();
  const journalPath = join(dir, 'meta', '_journal.json');

  try {
    await access(journalPath);
  } catch {
    log.warn('No migrations found');
    return;
  }

  const journal = parseJson<MigrationJournal>(
    await readFile(journalPath, 'utf-8'),
    'migrations journal'
  );
  const applied = new Set(state.migrations);
  const pending = journal.entries.filter((e) => !applied.has(e.tag));

  if (!pending.length) {
    log.ok('All migrations already applied');
    return;
  }

  const dbName = `${config.name ?? 'kumoh-app'}-db`;
  for (const entry of pending) {
    const sqlFile = join(dir, `${entry.tag}.sql`);
    await wrangler(`d1 execute ${dbName} --remote --file=${sqlFile}`);
    state.migrations.push(entry.tag);
    await persist();
    log.ok(`${entry.tag}.sql`);
  }
}

async function build(): Promise<void> {
  const child = spawn('vp build', {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  const code = await new Promise<number>((r) =>
    child.on('close', (c) => r(c ?? 1))
  );
  if (code !== 0) {
    process.exit(code);
  }
}

export const deploy = defineCommand({
  meta: {
    name: 'deploy',
    description: 'Build, provision, and deploy to Cloudflare',
  },
  args: {
    ci: {
      type: 'boolean',
      default: false,
      description: 'Non-interactive mode for CI environments',
    },
  },
  async run(ctx) {
    const ci = ctx.args.ci;

    if (!ci) {
      await ensureLoggedIn();
    }

    const config = await loadConfig();
    const appName = config.name ?? 'kumoh-app';
    const state: DeployState = {
      d1: config.deploy?.d1,
      kv: config.deploy?.kv,
      domain: config.deploy?.domain,
      migrations: config.deploy?.migrations ?? [],
    };

    log.step('Building...');
    await build();

    // On re-deploys, check for stale queue bindings that no longer exist locally
    const isRedeploy = !!(state.d1 || state.kv);
    if (isRedeploy) {
      const liveBindings = await getWorkerQueueConsumers(appName);
      const localQueues = new Set(
        scanQueues(root, 'app/queues', appName).map((q) => q.queueName)
      );
      const stale = liveBindings.filter((b) => !localQueues.has(b.queueName));

      if (stale.length) {
        log.step('Stale queue bindings found:');
        for (const b of stale) {
          console.log(`  ${b.queueName}`);
        }
        if (!ci) {
          for (const b of stale) {
            const remove = await confirm(
              `Remove stale queue "${b.queueName}"?`
            );
            if (remove) {
              await removeQueueConsumer(b);
              await deleteWorkerQueue(b);
              log.ok(`Queue "${b.queueName}" — removed`);
            }
          }
        }
      }
    }

    const persist = async () => {
      config.deploy = state;
      await saveConfig(config);
    };

    log.step('Provisioning resources...');
    if (existsSync('app/db/schema.ts')) {
      await provisionD1(`${appName}-db`, state);
    }
    await provisionKV(`${appName}-kv`, state);
    await provisionR2(`${appName}-bucket`);
    for (const q of scanQueues(root, 'app/queues', appName)) {
      await provisionQueue(q.queueName);
    }

    // Save provisioned IDs immediately so a re-run finds existing resources
    await persist();

    if (!state.domain && !ci) {
      const wantsDomain = await confirm('Add a custom domain?');
      if (wantsDomain) {
        const domain = await prompt('Custom domain', 'api.example.com');
        if (domain && domain !== 'api.example.com') {
          state.domain = domain;
          log.ok(`Custom domain "${domain}" — will be assigned`);
        }
      }
    } else if (state.domain) {
      log.ok(`Custom domain "${state.domain}" — exists`);
    }

    await patchWranglerConfig(state);

    if (existsSync('app/db/schema.ts')) {
      log.step('Applying migrations...');
      await applyMigrations(config, state, persist);
    }

    log.step('Deploying worker...');
    await wranglerExec('deploy --config dist/wrangler.json');

    await persist();

    log.done(
      state.domain
        ? `Deployed to https://${state.domain}`
        : 'Deployed to Cloudflare Workers'
    );
    console.log('');
  },
});

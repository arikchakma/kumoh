import { spawn } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { defineCommand } from 'citty';

import type { DeployState, KumohJson, MigrationJournal } from './config.js';
import { loadConfig, migrationsDir, root, saveConfig } from './config.js';
import { log } from './log.js';
import { wrangler, wranglerExec } from './wrangler.js';

async function provisionD1(name: string, state: DeployState): Promise<void> {
  if (state.d1) {
    log.ok(`D1 database "${name}" (${state.d1.slice(0, 8)}…) — exists`);
    return;
  }

  try {
    const info = await wrangler(`d1 info ${name} --json`);
    const { uuid } = JSON.parse(info);
    state.d1 = uuid;
    log.ok(`D1 database "${name}" (${uuid.slice(0, 8)}…) — found`);
  } catch {
    await wrangler(`d1 create ${name}`);
    const info = await wrangler(`d1 info ${name} --json`);
    const { uuid } = JSON.parse(info);
    state.d1 = uuid;
    log.ok(`D1 database "${name}" (${uuid.slice(0, 8)}…) — created`);
  }
}

async function provisionKV(name: string, state: DeployState): Promise<void> {
  if (state.kv) {
    log.ok(`KV namespace (${state.kv.slice(0, 8)}…) — exists`);
    return;
  }

  const list = JSON.parse(await wrangler('kv namespace list'));
  const existing = (list as Array<{ id: string; title: string }>).find(
    (ns) => ns.title === name
  );

  if (existing) {
    state.kv = existing.id;
    log.ok(`KV namespace (${existing.id.slice(0, 8)}…) — found`);
    return;
  }

  await wrangler(`kv namespace create ${name}`);
  const listAfter = JSON.parse(await wrangler('kv namespace list'));
  const created = (listAfter as Array<{ id: string; title: string }>).find(
    (ns) => ns.title === name
  );
  state.kv = created!.id;
  log.ok(`KV namespace (${created!.id.slice(0, 8)}…) — created`);
}

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
  const config = JSON.parse(await readFile(wranglerPath, 'utf-8'));

  if (state.d1 && config.d1_databases?.length) {
    config.d1_databases[0].database_id = state.d1;
  }

  if (state.kv && config.kv_namespaces?.length) {
    config.kv_namespaces[0].id = state.kv;
  }

  await writeFile(wranglerPath, JSON.stringify(config));
}

async function applyMigrations(
  config: KumohJson,
  state: DeployState
): Promise<void> {
  const dir = migrationsDir(config);
  const journalPath = join(dir, 'meta', '_journal.json');

  try {
    await access(journalPath);
  } catch {
    log.warn('No migrations found');
    return;
  }

  const journal: MigrationJournal = JSON.parse(
    await readFile(journalPath, 'utf-8')
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
  async run() {
    const config = await loadConfig();
    const appName = config.name ?? 'kumoh-app';
    const state: DeployState = {
      d1: config.deploy?.d1,
      kv: config.deploy?.kv,
      url: config.deploy?.url,
      migrations: config.deploy?.migrations ?? [],
    };

    log.step('Building...');
    await build();

    log.step('Provisioning resources...');
    if (config.schema) {
      await provisionD1(`${appName}-db`, state);
    }
    await provisionKV(appName, state);
    await provisionR2(`${appName}-bucket`);
    if (config.queues) {
      await provisionQueue(`${appName}-queue`);
    }

    await patchWranglerConfig(state);

    if (config.schema) {
      log.step('Applying migrations...');
      await applyMigrations(config, state);
    }

    log.step('Deploying worker...');
    const output = await wranglerExec('deploy --config dist/wrangler.json');

    const urlMatch = output.match(/https:\/\/[^\s]+\.workers\.dev/);
    if (urlMatch) {
      state.url = urlMatch[0];
    }

    config.deploy = state;
    await saveConfig(config);

    log.done(`Deployed to ${state.url ?? 'Cloudflare Workers'}`);
    console.log('');
  },
});

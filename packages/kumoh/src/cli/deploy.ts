import { spawn } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { defineCommand } from 'citty';

import type { DeployState, KumohJson, MigrationJournal } from './config.js';
import {
  getDeployState,
  loadConfig,
  migrationsDir,
  resolveAppName,
  resolveVars,
  root,
  saveConfig,
  setDeployState,
} from './config.js';
import { log } from './log.js';
import { wrangler, wranglerExec } from './wrangler.js';

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

async function patchWranglerVars(vars: Record<string, string>): Promise<void> {
  const wranglerPath = resolve(root, 'dist', 'wrangler.json');
  const config = parseJson<Record<string, unknown>>(
    await readFile(wranglerPath, 'utf-8'),
    'dist/wrangler.json'
  );
  config.vars = vars;
  await writeFile(wranglerPath, JSON.stringify(config, null, 2));
}

async function patchWranglerName(name: string): Promise<void> {
  const wranglerPath = resolve(root, 'dist', 'wrangler.json');
  const config = parseJson<Record<string, unknown>>(
    await readFile(wranglerPath, 'utf-8'),
    'dist/wrangler.json'
  );
  config.name = name;
  await writeFile(wranglerPath, JSON.stringify(config, null, 2));
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

  await writeFile(wranglerPath, JSON.stringify(config, null, 2));
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
    env: {
      type: 'string',
      description: 'Target environment (e.g. staging, production)',
    },
  },
  async run({ args }) {
    const env = args.env as string | undefined;
    const config = await loadConfig();
    const appName = resolveAppName(config, env);
    const existing = getDeployState(config, env);
    const state: DeployState = {
      d1: existing?.d1,
      kv: existing?.kv,
      url: existing?.url,
      migrations: existing?.migrations ?? [],
    };

    if (env) {
      log.step(`Deploying to ${env}...`);
    }

    log.step('Building...');
    await build();

    // Patch vars with env-specific overrides before deploying
    const vars = resolveVars(config, env);
    if (Object.keys(vars).length) {
      await patchWranglerVars(vars);
    }

    // Override worker name for environment
    if (env) {
      await patchWranglerName(appName);
    }

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

    setDeployState(config, state, env);
    await saveConfig(config);

    log.done(`Deployed to ${state.url ?? 'Cloudflare Workers'}`);
    console.log('');
  },
});

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { defineCommand } from 'citty';

import { scanObjects, scanQueues } from '../server/scanner.ts';
import type { DeployState, KumohJson } from './config.ts';
import { loadConfig, root, saveConfig } from './config.ts';
import { buildDoMigrations } from './do-migrations.ts';
import { log } from './log.ts';
import { confirm, prompt } from './prompt.ts';
import {
  parseJson,
  provisionD1,
  provisionKV,
  provisionQueue,
  provisionR2,
} from './provision.ts';
import {
  deleteWorkerQueue,
  ensureLoggedIn,
  getWorkerQueueConsumers,
  removeQueueConsumer,
  wranglerExec,
} from './wrangler.ts';

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

  if (state.migrations?.length) {
    config.migrations = state.migrations.map((entry) => {
      const m: Record<string, unknown> = { tag: entry.tag };
      if (entry.new_classes?.length) {
        m.new_sqlite_classes = entry.new_classes;
      }
      if (entry.deleted_classes?.length) {
        m.deleted_classes = entry.deleted_classes;
      }
      if (entry.renamed_classes?.length) {
        m.renamed_classes = entry.renamed_classes;
      }
      return m;
    });
  }

  await writeFile(wranglerPath, JSON.stringify(config, null, 2));
}

export async function applyMigrations(config: KumohJson): Promise<void> {
  const dbName = `${config.name ?? 'kumoh-app'}-db`;
  const wranglerConfig = resolve(root, 'dist', 'wrangler.json');
  await wranglerExec(
    `d1 migrations apply ${dbName} --remote --config ${wranglerConfig}`
  );
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
      d1: config.state?.d1,
      kv: config.state?.kv,
      domain: config.state?.domain,
      migrations: config.state?.migrations ?? [],
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
      config.state = state;
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

    const scannedObjects = scanObjects(root, 'app/objects');
    if (scannedObjects.length) {
      log.step('Resolving Durable Object migrations...');
      await buildDoMigrations(
        scannedObjects.map((o) => o.className),
        state,
        ci
      );
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
      await applyMigrations(config);
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

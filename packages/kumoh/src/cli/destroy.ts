import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { defineCommand } from 'citty';

import { loadConfig, root, saveConfig } from './config.ts';
import { log } from './log.ts';
import { confirm, confirmWithInput } from './prompt.ts';
import {
  ensureLoggedIn,
  getWorkerQueueConsumers,
  removeQueueConsumer,
  wrangler,
} from './wrangler.ts';

function extractError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/\[ERROR\]\s+(.+?)(?:\n|$)/);
  if (match) {
    return match[1].trim();
  }
  return (
    msg.split('\n').find((l) => {
      const t = l.trim();
      return (
        t &&
        !t.startsWith('⛅') &&
        !t.startsWith('─') &&
        !t.startsWith('🪵') &&
        !t.startsWith('✘')
      );
    }) ?? msg.split('\n')[0].trim()
  );
}

async function tryDelete(
  label: string,
  fn: () => Promise<unknown>
): Promise<void> {
  try {
    await fn();
    log.ok(`${label} — deleted`);
  } catch (err) {
    log.warn(`${label} — ${extractError(err)}`);
  }
}

export const destroy = defineCommand({
  meta: {
    name: 'destroy',
    description: 'Tear down all deployed Cloudflare resources',
  },
  args: {
    prod: {
      type: 'boolean',
      description: 'Destroy all deployed Cloudflare resources in production',
      default: false,
    },
  },
  async run({ args }) {
    if (!args.prod) {
      const kumohDir = resolve(root, '.kumoh');

      console.log(`\nThis will delete the local .kumoh directory:`);
      console.log(`  ${kumohDir}`);
      console.log(`  (local D1 database, generated types, drizzle config)\n`);

      const confirmed = await confirm('Continue?');
      if (!confirmed) {
        console.log('Aborted.');
        process.exit(0);
      }

      await rm(kumohDir, { recursive: true, force: true });
      log.done('Local resources deleted');
      console.log('');
      return;
    }

    await ensureLoggedIn();

    const config = await loadConfig();
    const appName = config.name ?? 'kumoh-app';
    const deploy = config.deploy;

    if (!deploy) {
      console.error('No deploy state found in kumoh.json. Nothing to destroy.');
      process.exit(1);
    }

    // Fetch live queue consumer bindings from Cloudflare
    const boundQueues = await getWorkerQueueConsumers(appName);

    console.log(
      `\nThis will permanently delete all resources for "${appName}":`
    );
    if (deploy.d1) {
      console.log(`  D1:      ${appName}-db (${deploy.d1.slice(0, 8)}…)`);
    }
    if (deploy.kv) {
      console.log(`  KV:      ${appName}-kv (${deploy.kv.slice(0, 8)}…)`);
    }
    console.log(`  R2:      ${appName}-bucket`);
    for (const q of boundQueues) {
      console.log(`  Queue:   ${q}`);
    }

    const confirmed = await confirmWithInput(
      `Type "${appName}" to confirm destruction`,
      appName
    );
    if (!confirmed) {
      console.log('\nAborted.');
      process.exit(0);
    }

    log.step('Destroying resources...');

    // Must remove consumer bindings before deleting either the worker or the queue
    for (const q of boundQueues) {
      await tryDelete(`Queue consumer "${q}"`, () =>
        removeQueueConsumer(q, appName)
      );
    }

    for (const q of boundQueues) {
      await tryDelete(`Queue "${q}"`, () => wrangler(`queues delete ${q}`));
    }

    await tryDelete(`Worker "${appName}"`, () =>
      wrangler(`delete --name ${appName} --force`)
    );

    await tryDelete(`R2 bucket "${appName}-bucket"`, () =>
      wrangler(`r2 bucket delete ${appName}-bucket`)
    );

    if (deploy.kv) {
      await tryDelete(`KV namespace (${deploy.kv.slice(0, 8)}…)`, () =>
        wrangler(`kv namespace delete --namespace-id ${deploy.kv}`)
      );
    }

    if (deploy.d1) {
      await tryDelete(`D1 database "${appName}-db"`, () =>
        wrangler(`d1 delete ${appName}-db -y`)
      );
    }

    delete config.deploy;
    await saveConfig(config);

    log.done('All resources destroyed');
    console.log('');
  },
});

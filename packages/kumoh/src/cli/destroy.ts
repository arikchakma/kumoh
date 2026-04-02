import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { defineCommand } from 'citty';

import { scanQueues } from '../server/scanner.ts';
import { loadConfig, root, saveConfig } from './config.ts';
import { log } from './log.ts';
import { confirm, confirmWithInput } from './prompt.ts';
import { wrangler } from './wrangler.ts';

async function tryDelete(
  label: string,
  fn: () => Promise<unknown>
): Promise<void> {
  try {
    await fn();
    log.ok(`${label} — deleted`);
  } catch {
    log.warn(`${label} — not found or already deleted`);
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

    const config = await loadConfig();
    const appName = config.name ?? 'kumoh-app';
    const deploy = config.deploy;

    if (!deploy) {
      console.error('No deploy state found in kumoh.json. Nothing to destroy.');
      process.exit(1);
    }

    console.log(
      `\nThis will permanently delete all resources for "${appName}":`
    );
    if (deploy.url) {
      console.log(`  Worker:  ${deploy.url}`);
    }
    if (deploy.d1) {
      console.log(`  D1:      ${appName}-db (${deploy.d1.slice(0, 8)}…)`);
    }
    if (deploy.kv) {
      console.log(`  KV:      ${appName}-kv (${deploy.kv.slice(0, 8)}…)`);
    }
    console.log(`  R2:      ${appName}-bucket`);
    if (scanQueues('.', 'app/queues', appName).length) {
      console.log(`  Queue:   ${appName}-queue`);
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

    await tryDelete(`Worker "${appName}"`, () =>
      wrangler(`delete --name ${appName} --force`)
    );

    if (scanQueues('.', 'app/queues', appName).length) {
      await tryDelete(`Queue "${appName}-queue"`, () =>
        wrangler(`queues delete ${appName}-queue`)
      );
    }

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

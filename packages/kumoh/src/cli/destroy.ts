import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

import { defineCommand } from 'citty';

import { loadConfig, saveConfig } from './config.ts';
import { log } from './log.ts';
import { wrangler } from './wrangler.ts';

async function confirm(appName: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`\nType "${appName}" to confirm destruction: `, (answer) => {
      rl.close();
      resolve(answer.trim() === appName);
    });
  });
}

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
  async run() {
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
      console.log(`  KV:      ${appName} (${deploy.kv.slice(0, 8)}…)`);
    }
    console.log(`  R2:      ${appName}-bucket`);
    if (existsSync('app/queues')) {
      console.log(`  Queue:   ${appName}-queue`);
    }

    const confirmed = await confirm(appName);
    if (!confirmed) {
      console.log('\nAborted.');
      process.exit(0);
    }

    log.step('Destroying resources...');

    await tryDelete(`Worker "${appName}"`, () =>
      wrangler(`delete --name ${appName} --force`)
    );

    if (existsSync('app/queues')) {
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

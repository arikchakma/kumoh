import { createInterface } from 'node:readline';

import { defineCommand } from 'citty';

import {
  getDeployState,
  loadConfig,
  resolveAppName,
  saveConfig,
} from './config.js';
import { log } from './log.js';
import { wrangler } from './wrangler.js';

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
    const deploy = getDeployState(config, env);

    if (!deploy) {
      console.error(
        `No deploy state found for ${env ? `"${env}" environment` : 'default'}. Nothing to destroy.`
      );
      process.exit(1);
    }

    console.log(
      `\nThis will permanently delete all resources for "${appName}"${env ? ` (${env})` : ''}:`
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
    if (config.queues) {
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

    if (config.queues) {
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

    if (env) {
      if (config.deployments) {
        delete config.deployments[env];
      }
    } else {
      delete config.deploy;
    }
    await saveConfig(config);

    log.done('All resources destroyed');
    console.log('');
  },
});

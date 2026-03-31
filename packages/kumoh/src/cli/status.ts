import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { defineCommand } from 'citty';

import { scanCrons } from '../scanner.js';
import type { MigrationJournal } from './config.js';
import {
  getDeployState,
  loadConfig,
  migrationsDir,
  resolveAppName,
} from './config.js';

function row(label: string, value: string): void {
  console.log(`  ${label.padEnd(14)}${value}`);
}

export const status = defineCommand({
  meta: {
    name: 'status',
    description: 'Show deployment status and resource info',
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

    console.log(`\n${appName}${env ? ` (${env})` : ''}`);

    if (!deploy) {
      console.log(
        `  Not deployed yet. Run \`kumoh deploy${env ? ` --env ${env}` : ''}\` to get started.\n`
      );
      return;
    }

    if (deploy.url) {
      row('URL', deploy.url);
    }

    if (deploy.d1) {
      row('D1', `${appName}-db (${deploy.d1.slice(0, 8)}…)`);
    }

    if (deploy.kv) {
      row('KV', `${appName} (${deploy.kv.slice(0, 8)}…)`);
    }

    row('R2', `${appName}-bucket`);

    if (config.queues) {
      row('Queue', `${appName}-queue`);
    }

    if (config.crons) {
      try {
        const crons = scanCrons('.', config.crons);
        if (crons.length) {
          const cronList = crons
            .map((c) => `${c.schedule} (${c.name})`)
            .join(', ');
          row('Crons', cronList);
        }
      } catch {
        // cron dir might not exist
      }
    }

    if (config.schema) {
      const dir = migrationsDir(config);
      const journalPath = join(dir, 'meta', '_journal.json');
      try {
        await access(journalPath);
        const journal: MigrationJournal = JSON.parse(
          await readFile(journalPath, 'utf-8')
        );
        const total = journal.entries.length;
        const applied = deploy.migrations?.length ?? 0;
        const pending = total - applied;
        row(
          'Migrations',
          `${applied} applied${pending > 0 ? `, ${pending} pending` : ''}`
        );
      } catch {
        row('Migrations', 'none');
      }
    }

    console.log('');
  },
});

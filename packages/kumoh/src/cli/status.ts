import { existsSync } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { defineCommand } from 'citty';

import { scanCrons } from '../server/scanner.ts';
import type { MigrationJournal } from './config.ts';
import { loadConfig, migrationsDir } from './config.ts';

function row(label: string, value: string): void {
  console.log(`  ${label.padEnd(14)}${value}`);
}

export const status = defineCommand({
  meta: {
    name: 'status',
    description: 'Show deployment status and resource info',
  },
  async run() {
    const config = await loadConfig();
    const appName = config.name ?? 'kumoh-app';
    const deploy = config.deploy;

    console.log(`\n${appName}`);

    if (!deploy) {
      console.log('  Not deployed yet. Run `kumoh deploy` to get started.\n');
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

    if (existsSync('app/queues')) {
      row('Queue', `${appName}-queue`);
    }

    // Cron schedules
    if (existsSync('app/crons')) {
      try {
        const crons = scanCrons('.', 'app/crons');
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

    // Migration status
    if (existsSync('app/db/schema.ts')) {
      const dir = migrationsDir();
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

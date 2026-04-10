import { mkdir } from 'node:fs/promises';

import { defineCommand } from 'citty';

import { resolveConfig } from '../index.ts';
import { generateTypes } from '../server/typegen.ts';
import { loadConfig, migrationsDir, root } from './config.ts';
import { applyMigrations } from './deploy.ts';
import {
  cleanupTempConfig,
  requireLocalDb,
  runDrizzleKit,
  writeTempConfig,
} from './drizzle.ts';
import { log } from './log.ts';
import { ensureLoggedIn } from './wrangler.ts';

const generate = defineCommand({
  meta: {
    name: 'generate',
    description: 'Generate SQL migration files from your schema',
  },
  async run() {
    await loadConfig();
    await mkdir(migrationsDir(), { recursive: true });
    const tempConfig = await writeTempConfig();
    await runDrizzleKit(`generate --config=${tempConfig}`);
    await cleanupTempConfig();
    generateTypes(resolveConfig(root), root);
    log.ok('Generated .kumoh/kumoh.d.ts');
  },
});

const migrate = defineCommand({
  meta: {
    name: 'migrate',
    description: 'Push schema changes to local D1 database',
  },
  args: {
    remote: {
      type: 'boolean',
      default: false,
      description: 'Apply pending migrations to the remote D1 database',
    },
  },
  async run(ctx) {
    const config = await loadConfig();

    if (ctx.args.remote) {
      if (!config.state?.d1) {
        console.error('No remote D1 found. Run kumoh deploy first.');
        process.exit(1);
      }
      await ensureLoggedIn();
      await applyMigrations(config);
      return;
    }

    const dbPath = await requireLocalDb();
    const tempConfig = await writeTempConfig({
      dbCredentials: { url: dbPath },
    });
    await runDrizzleKit(`push --config=${tempConfig}`);
    await cleanupTempConfig();
  },
});

const studio = defineCommand({
  meta: {
    name: 'studio',
    description: 'Open Drizzle Studio to browse your local database',
  },
  async run() {
    await loadConfig();
    const dbPath = await requireLocalDb();
    const tempConfig = await writeTempConfig({
      dbCredentials: { url: dbPath },
    });
    await runDrizzleKit(`studio --config=${tempConfig}`);
    await cleanupTempConfig();
  },
});

export const db = defineCommand({
  meta: { name: 'db', description: 'Database commands' },
  subCommands: { generate, migrate, studio },
});

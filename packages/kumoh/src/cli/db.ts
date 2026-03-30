import { mkdir } from 'node:fs/promises';

import { defineCommand } from 'citty';

import { loadConfig, migrationsDir } from './config.js';
import {
  cleanupTempConfig,
  requireLocalDb,
  runDrizzleKit,
  writeTempConfig,
} from './drizzle.js';

const generate = defineCommand({
  meta: {
    name: 'generate',
    description: 'Generate SQL migration files from your schema',
  },
  async run() {
    const config = await loadConfig();
    await mkdir(migrationsDir(config), { recursive: true });
    const tempConfig = await writeTempConfig(config);
    await runDrizzleKit(`generate --config=${tempConfig}`);
    await cleanupTempConfig();
  },
});

const migrate = defineCommand({
  meta: {
    name: 'migrate',
    description: 'Push schema changes to local D1 database',
  },
  async run() {
    const config = await loadConfig();
    const dbPath = await requireLocalDb();
    const tempConfig = await writeTempConfig(config, {
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
    const config = await loadConfig();
    const dbPath = await requireLocalDb();
    const tempConfig = await writeTempConfig(config, {
      dbCredentials: { url: dbPath },
    });
    await runDrizzleKit(`studio --config=${tempConfig}`);
    await cleanupTempConfig();
  },
});

export const db = defineCommand({
  meta: { name: 'db', description: 'Database commands' },
  subCommands: { generate, migrate, push: migrate, studio },
});

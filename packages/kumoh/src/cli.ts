#!/usr/bin/env node

import { execSync } from 'node:child_process';
import {
  readFileSync,
  existsSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  readdirSync,
} from 'node:fs';
import { resolve, join } from 'node:path';

import { defineCommand, runMain } from 'citty';

const root = process.cwd();

interface KumohJson {
  name?: string;
  schema?: string;
  bindings?: { d1?: string };
}

function loadKumohJson(): KumohJson {
  const configPath = resolve(root, 'kumoh.json');
  if (!existsSync(configPath)) {
    console.error('No kumoh.json found in current directory.');
    process.exit(1);
  }
  return JSON.parse(readFileSync(configPath, 'utf-8'));
}

function getSchemaPath(config: KumohJson): string {
  return resolve(root, config.schema ?? 'app/db/schema.ts');
}

function getMigrationsDir(config: KumohJson): string {
  const schemaPath = config.schema ?? 'app/db/schema.ts';
  return join(resolve(root, schemaPath, '..'), 'migrations');
}

function getLocalDbPath(): string | null {
  const d1Dir = join(root, '.kumoh', 'v3', 'd1');
  if (!existsSync(d1Dir)) {
    return null;
  }

  for (const subdir of readdirSync(d1Dir)) {
    const dir = join(d1Dir, subdir);
    const dbFile = readdirSync(dir).find((f) => f.endsWith('.sqlite'));
    if (dbFile) {
      return join(dir, dbFile as string);
    }
  }
  return null;
}

function writeTempConfig(
  config: KumohJson,
  extra: Record<string, unknown> = {}
): string {
  mkdirSync(resolve(root, '.kumoh'), { recursive: true });
  const tempPath = resolve(root, '.kumoh', 'drizzle.config.json');
  writeFileSync(
    tempPath,
    JSON.stringify(
      {
        dialect: 'sqlite',
        schema: getSchemaPath(config),
        out: getMigrationsDir(config),
        ...extra,
      },
      null,
      2
    )
  );
  return tempPath;
}

function cleanupTempConfig() {
  const tempPath = resolve(root, '.kumoh', 'drizzle.config.json');
  if (existsSync(tempPath)) {
    unlinkSync(tempPath);
  }
}

function runDrizzleKit(args: string) {
  try {
    execSync(`npx drizzle-kit ${args}`, { cwd: root, stdio: 'inherit' });
  } catch {
    process.exit(1);
  }
}

function requireLocalDb(): string {
  const dbPath = getLocalDbPath();
  if (!dbPath) {
    console.error(
      'No local D1 database found. Run `vite dev` first to initialize it.'
    );
    process.exit(1);
  }
  return dbPath;
}

// --- Commands ---

const generate = defineCommand({
  meta: {
    name: 'generate',
    description: 'Generate SQL migration files from your schema',
  },
  run() {
    const config = loadKumohJson();
    mkdirSync(getMigrationsDir(config), { recursive: true });
    const tempConfig = writeTempConfig(config);
    runDrizzleKit(`generate --config=${tempConfig}`);
    cleanupTempConfig();
  },
});

const migrate = defineCommand({
  meta: {
    name: 'migrate',
    description: 'Push schema changes to local D1 database',
  },
  run() {
    const config = loadKumohJson();
    const dbPath = requireLocalDb();
    const tempConfig = writeTempConfig(config, {
      dbCredentials: { url: dbPath },
    });
    runDrizzleKit(`push --config=${tempConfig}`);
    cleanupTempConfig();
  },
});

const studio = defineCommand({
  meta: {
    name: 'studio',
    description: 'Open Drizzle Studio to browse your local database',
  },
  run() {
    const config = loadKumohJson();
    const dbPath = requireLocalDb();
    const tempConfig = writeTempConfig(config, {
      dbCredentials: { url: dbPath },
    });
    runDrizzleKit(`studio --config=${tempConfig}`);
    cleanupTempConfig();
  },
});

const db = defineCommand({
  meta: { name: 'db', description: 'Database commands' },
  subCommands: { generate, migrate, push: migrate, studio },
});

const main = defineCommand({
  meta: { name: 'kumoh', version: '0.1.0', description: 'The Kumoh CLI' },
  subCommands: { db },
});

void runMain(main);

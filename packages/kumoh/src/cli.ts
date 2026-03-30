#!/usr/bin/env node

import { spawn } from 'node:child_process';
import {
  access,
  mkdir,
  readdir,
  readFile,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { defineCommand, runMain } from 'citty';

const root = process.cwd();

interface KumohJson {
  name?: string;
  schema?: string;
}

async function loadKumohJson(): Promise<KumohJson> {
  const configPath = resolve(root, 'kumoh.json');
  try {
    await access(configPath);
  } catch {
    console.error('No kumoh.json found in current directory.');
    process.exit(1);
  }
  const content = await readFile(configPath, 'utf-8');
  return JSON.parse(content);
}

function getSchemaPath(config: KumohJson): string {
  return resolve(root, config.schema ?? 'app/db/schema.ts');
}

function getMigrationsDir(config: KumohJson): string {
  const schemaPath = config.schema ?? 'app/db/schema.ts';
  return join(resolve(root, schemaPath, '..'), 'migrations');
}

async function getLocalDbPath(): Promise<string | null> {
  const d1Dir = join(root, '.kumoh', 'v3', 'd1');
  try {
    await access(d1Dir);
  } catch {
    return null;
  }

  const subdirs = await readdir(d1Dir);
  for (const subdir of subdirs) {
    const dir = join(d1Dir, subdir);
    const files = await readdir(dir);
    const dbFile = files.find((f) => f.endsWith('.sqlite'));
    if (dbFile) {
      return join(dir, dbFile);
    }
  }
  return null;
}

async function writeTempConfig(
  config: KumohJson,
  extra: Record<string, unknown> = {}
): Promise<string> {
  await mkdir(resolve(root, '.kumoh'), { recursive: true });
  const tempPath = resolve(root, '.kumoh', 'drizzle.config.json');
  await writeFile(
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

async function cleanupTempConfig(): Promise<void> {
  const tempPath = resolve(root, '.kumoh', 'drizzle.config.json');
  try {
    await unlink(tempPath);
  } catch {
    // already cleaned up
  }
}

async function runDrizzleKit(args: string): Promise<void> {
  const child = spawn(`npx drizzle-kit ${args}`, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });

  const exitCode = await new Promise<number>((resolve) => {
    child.on('close', (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

async function requireLocalDb(): Promise<string> {
  const dbPath = await getLocalDbPath();
  if (!dbPath) {
    console.error(
      'No local D1 database found. Run `vite dev` first to initialize it.'
    );
    process.exit(1);
  }
  return dbPath;
}

const generate = defineCommand({
  meta: {
    name: 'generate',
    description: 'Generate SQL migration files from your schema',
  },
  async run() {
    const config = await loadKumohJson();
    await mkdir(getMigrationsDir(config), { recursive: true });
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
    const config = await loadKumohJson();
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
    const config = await loadKumohJson();
    const dbPath = await requireLocalDb();
    const tempConfig = await writeTempConfig(config, {
      dbCredentials: { url: dbPath },
    });
    await runDrizzleKit(`studio --config=${tempConfig}`);
    await cleanupTempConfig();
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

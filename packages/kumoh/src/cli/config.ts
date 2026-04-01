import { access, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const root = process.cwd();
export const configPath = resolve(root, 'kumoh.json');

export type DeployState = {
  d1?: string;
  kv?: string;
  url?: string;
  migrations: string[];
};

export type KumohJson = {
  name?: string;
  server?: string;
  routes?: string;
  schema?: string;
  crons?: string;
  queues?: string;
  deploy?: DeployState;
};

export type MigrationJournal = {
  entries: Array<{ tag: string }>;
};

export async function loadConfig(): Promise<KumohJson> {
  try {
    await access(configPath);
  } catch {
    console.error('No kumoh.json found in current directory.');
    process.exit(1);
  }
  return JSON.parse(await readFile(configPath, 'utf-8'));
}

export async function saveConfig(config: KumohJson): Promise<void> {
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
}

export function schemaPath(config: KumohJson): string {
  return resolve(root, config.schema ?? 'app/db/schema.ts');
}

export function migrationsDir(config: KumohJson): string {
  const schema = config.schema ?? 'app/db/schema.ts';
  return join(resolve(root, schema, '..'), 'migrations');
}

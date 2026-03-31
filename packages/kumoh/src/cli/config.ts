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

export type EnvironmentConfig = {
  vars?: Record<string, string>;
};

export type KumohJson = {
  name?: string;
  vars?: Record<string, string>;
  schema?: string;
  crons?: string;
  queues?: string;
  environments?: Record<string, EnvironmentConfig>;
  deploy?: DeployState;
  deployments?: Record<string, DeployState>;
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

export function resolveAppName(config: KumohJson, env?: string): string {
  const base = config.name ?? 'kumoh-app';
  return env ? `${base}-${env}` : base;
}

export function resolveVars(
  config: KumohJson,
  env?: string
): Record<string, string> {
  const base = config.vars ?? {};
  if (!env) {
    return base;
  }
  const envConfig = config.environments?.[env];
  return { ...base, ...envConfig?.vars };
}

export function getDeployState(
  config: KumohJson,
  env?: string
): DeployState | undefined {
  if (!env) {
    return config.deploy;
  }
  return config.deployments?.[env];
}

export function setDeployState(
  config: KumohJson,
  state: DeployState,
  env?: string
): void {
  if (!env) {
    config.deploy = state;
  } else {
    if (!config.deployments) {
      config.deployments = {};
    }
    config.deployments[env] = state;
  }
}

export function schemaPath(config: KumohJson): string {
  return resolve(root, config.schema ?? 'app/db/schema.ts');
}

export function migrationsDir(config: KumohJson): string {
  const schema = config.schema ?? 'app/db/schema.ts';
  return join(resolve(root, schema, '..'), 'migrations');
}

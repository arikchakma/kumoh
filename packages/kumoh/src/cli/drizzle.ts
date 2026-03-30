import { spawn } from 'node:child_process';
import { access, mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { KumohJson } from './config.js';
import { migrationsDir, root, schemaPath } from './config.js';

export async function localDbPath(): Promise<string | null> {
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

export async function requireLocalDb(): Promise<string> {
  const dbPath = await localDbPath();
  if (!dbPath) {
    console.error(
      'No local D1 database found. Run `vite dev` first to initialize it.'
    );
    process.exit(1);
  }
  return dbPath;
}

export async function writeTempConfig(
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
        schema: schemaPath(config),
        out: migrationsDir(config),
        ...extra,
      },
      null,
      2
    )
  );
  return tempPath;
}

export async function cleanupTempConfig(): Promise<void> {
  const tempPath = resolve(root, '.kumoh', 'drizzle.config.json');
  try {
    await unlink(tempPath);
  } catch {
    // already cleaned up
  }
}

export async function runDrizzleKit(args: string): Promise<void> {
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

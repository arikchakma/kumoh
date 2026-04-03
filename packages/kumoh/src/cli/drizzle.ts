import { spawn } from 'node:child_process';
import { access, mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { root } from './config.ts';
import { wrangler } from './wrangler.ts';

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
  if (dbPath) {
    return dbPath;
  }

  // Miniflare hasn't initialized the D1 directory yet. Bootstrap it
  // by running a no-op SQL statement through wrangler, which creates
  // the persistence structure with the correct hashed filename.
  await ensureLocalDb();
  const newPath = await localDbPath();
  if (!newPath) {
    console.error('[kumoh] Failed to initialize local D1 database.');
    process.exit(1);
  }
  return newPath;
}

export async function ensureLocalDb(): Promise<void> {
  const configPath = resolve(root, '.kumoh', 'wrangler.migrate.json');
  await mkdir(resolve(root, '.kumoh'), { recursive: true });
  await writeFile(
    configPath,
    JSON.stringify({
      name: 'kumoh-migrate',
      d1_databases: [
        { binding: 'DB', database_name: 'local', database_id: 'local' },
      ],
    })
  );

  try {
    await wrangler(
      `d1 execute local --local --persist-to .kumoh --config ${configPath} --command "SELECT 1"`
    );
  } finally {
    try {
      await unlink(configPath);
    } catch {}
  }
}

export async function writeTempConfig(
  extra: Record<string, unknown> = {}
): Promise<string> {
  await mkdir(resolve(root, '.kumoh'), { recursive: true });
  const tempPath = resolve(root, '.kumoh', 'drizzle.config.json');
  // Use paths relative to CWD (project root) since drizzle-kit
  // resolves relative paths against process.cwd(), not the config location.
  await writeFile(
    tempPath,
    JSON.stringify(
      {
        dialect: 'sqlite',
        schema: './app/db/schema.ts',
        out: './app/db/migrations',
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

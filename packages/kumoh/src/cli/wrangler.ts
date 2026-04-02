import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { root } from './config.ts';
import { log } from './log.ts';
import { confirm } from './prompt.ts';

// Wrangler ships as a dependency of kumoh, not the user's project.
// We use createRequire to resolve it from kumoh's node_modules.
function resolveBin(): string {
  const req = createRequire(
    resolve(root, 'node_modules', 'kumoh', 'package.json')
  );
  return req.resolve('wrangler/bin/wrangler.js');
}

// Stderr is intentionally swallowed — we only care about exit code
// and stdout for version checks and whoami
function run(cmd: string): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    let stdout = '';
    const child = spawn(cmd, { cwd: root, shell: true, stdio: 'pipe' });
    child.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on('data', () => {});
    child.on('close', (code) => resolve({ code: code ?? 1, stdout }));
  });
}

async function checkDep(
  name: string,
  checkCmd: string,
  installCmd: string
): Promise<void> {
  const { code } = await run(checkCmd);
  if (code !== 0) {
    log.warn(`${name} is not installed.`);
    const install = await confirm(`Install ${name}?`);
    if (!install) {
      console.error(`${name} is required. Install it with: ${installCmd}`);
      process.exit(1);
    }
    const child = spawn(installCmd, {
      cwd: root,
      shell: true,
      stdio: 'inherit',
    });
    const installCode = await new Promise<number>((r) =>
      child.on('close', (c) => r(c ?? 1))
    );
    if (installCode !== 0) {
      console.error(`Failed to install ${name}.`);
      process.exit(1);
    }
    log.ok(`${name} installed`);
  }
}

export async function checkWrangler(): Promise<void> {
  await checkDep('wrangler', 'npx wrangler --version', 'pnpm add -D wrangler');
}

export async function checkVitePlus(): Promise<void> {
  const { code } = await run('vp --version');
  if (code !== 0) {
    log.warn('vite-plus is not installed.');
    console.error('Install it: https://viteplus.dev/guide/');
    process.exit(1);
  }
}

export async function ensureLoggedIn(): Promise<void> {
  const bin = resolveBin();
  const { code } = await run(`node ${bin} whoami`);
  if (code !== 0) {
    log.warn('Not logged in to Cloudflare.');
    const login = await confirm('Log in now?');
    if (!login) {
      console.error('Login required. Run: npx wrangler login');
      process.exit(1);
    }
    const child = spawn(`node ${bin} login`, {
      cwd: root,
      shell: true,
      stdio: 'inherit',
    });
    const loginCode = await new Promise<number>((r) =>
      child.on('close', (c) => r(c ?? 1))
    );
    if (loginCode !== 0) {
      console.error('Login failed.');
      process.exit(1);
    }
    log.ok('Logged in to Cloudflare');
  }
}

export async function wrangler(args: string): Promise<string> {
  const bin = resolveBin();
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(`node ${bin} ${args}`, {
      cwd: root,
      shell: true,
    });
    child.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || stdout || `wrangler exited with ${code}`));
      }
    });
  });
}

export async function wranglerExec(args: string): Promise<string> {
  const bin = resolveBin();
  return new Promise((resolve, reject) => {
    let stdout = '';
    const child = spawn(`node ${bin} ${args}`, {
      cwd: root,
      stdio: ['inherit', 'pipe', 'inherit'],
      shell: true,
    });
    child.stdout?.on('data', (d: Buffer) => {
      const chunk = d.toString();
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`wrangler exited with ${code}`));
      }
    });
  });
}

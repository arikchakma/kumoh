import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { root } from './config.js';

function resolveBin(): string {
  const req = createRequire(
    resolve(root, 'node_modules', 'kumoh', 'package.json')
  );
  return req.resolve('wrangler/bin/wrangler.js');
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

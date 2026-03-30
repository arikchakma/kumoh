import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: {
      index: 'src/index.ts',
      cli: 'src/cli.ts',
      db: 'src/db.ts',
      cron: 'src/scheduled.ts',
      queue: 'src/queue.ts',
    },
    outDir: 'dist',
    format: 'esm',
    dts: true,
    sourcemap: true,
    deps: {
      neverBundle: ['@cloudflare/vite-plugin', 'vite', 'drizzle-orm'],
    },
  },
});

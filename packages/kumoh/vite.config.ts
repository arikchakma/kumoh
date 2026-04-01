import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: {
      index: 'src/index.ts',
      cli: 'src/cli.ts',
      db: 'src/db.ts',
      cron: 'src/factory/scheduled.ts',
      queue: 'src/factory/queue.ts',
      app: 'src/factory/app.ts',
      route: 'src/factory/route.ts',
      middleware: 'src/factory/middleware.ts',
    },
    outDir: 'dist',
    format: 'esm',
    dts: true,
    sourcemap: true,
    deps: {
      neverBundle: [
        '@cloudflare/vite-plugin',
        'hono',
        'vite',
        'drizzle-orm',
        'oxc-parser',
      ],
    },
  },
});

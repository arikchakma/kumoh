import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: {
      index: 'src/index.ts',
      cli: 'src/cli.ts',
      db: 'src/db.ts',
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

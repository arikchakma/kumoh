import path from 'node:path';

import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite-plus';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'app'),
    },
  },
  plugins: [tailwindcss(), reactRouter() as Plugin[]],
});

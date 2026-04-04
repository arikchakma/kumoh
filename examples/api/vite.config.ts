import path from 'node:path';

import { kumoh } from 'kumoh';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'app'),
    },
  },
  plugins: [kumoh()],
});

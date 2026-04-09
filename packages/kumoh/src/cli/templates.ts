import { today } from '../lib/case.ts';

export const templates = {
  kumohJson: (name: string) =>
    JSON.stringify(
      {
        $schema: './node_modules/kumoh/kumoh.schema.json',
        name,
        compatibilityDate: today(),
      },
      null,
      2
    ) + '\n',

  viteConfig: `import { kumoh } from 'kumoh';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    endOfLine: 'lf',
    singleQuote: true,
    tabWidth: 2,
    trailingComma: 'es5',
    printWidth: 80,
    experimentalSortPackageJson: {
      sortScripts: true,
    },
    sortImports: {},
    ignorePatterns: ['dist/', 'node_modules/'],
  },
  lint: {
    plugins: ['typescript', 'import'],
    rules: {
      'typescript/consistent-type-imports': 'error',
      'import/consistent-type-specifier-style': ['error', 'prefer-top-level'],
      curly: ['error', 'all'],
    },
    options: {
      typeCheck: true,
      typeAware: true,
    },
  },
  plugins: [kumoh()],
});
`,

  tsconfig: `{
  "extends": "kumoh/tsconfig"
}
`,

  server: `import { defineApp } from 'kumoh/app';

export default defineApp((app) => {
  // Add global middleware here
});
`,

  routeIndex: `import { defineHandler } from 'kumoh/app';

export const GET = defineHandler((c) => {
  return c.json({ status: 'ok' });
});
`,

  schema: `import { sqliteTable, text, integer } from 'kumoh/db';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull(),
});
`,

  heartbeat: `import { defineScheduled } from 'kumoh/cron';

export const cron = '0 */6 * * *';

export default defineScheduled(async (controller) => {
  console.log(\`Heartbeat: \${controller.cron} at \${new Date(controller.scheduledTime).toISOString()}\`);
});
`,

  messages: `import { defineQueue } from 'kumoh/queue';

type Message = {
  type: string;
  payload: string;
};

export default defineQueue<Message>(async (batch) => {
  for (const msg of batch.messages) {
    console.log(\`Processing: \${msg.body.type} - \${msg.body.payload}\`);
    msg.ack();
  }
});
`,

  gitignore: `node_modules
dist
.kumoh
*.tsbuildinfo
`,

  packageJson: (name: string, version: string) =>
    JSON.stringify(
      {
        name,
        private: true,
        type: 'module',
        scripts: {
          build: 'vp build',
          check: 'vp check',
          'db:generate': 'kumoh db generate',
          'db:migrate': 'kumoh db migrate',
          'db:studio': 'kumoh db studio',
          dev: 'vp dev',
        },
        dependencies: {
          'drizzle-orm': '^0.45.2',
          hono: '^4.12.9',
          kumoh: `^${version}`,
        },
        devDependencies: {
          '@cloudflare/workers-types': '^4.20260404.1',
          'drizzle-kit': '^0.31.10',
          typescript: '^6.0.2',
          vite: 'npm:@voidzero-dev/vite-plus-core@latest',
          'vite-plus': 'latest',
        },
        packageManager: 'pnpm@10.33.0',
        pnpm: {
          overrides: {
            vite: 'npm:@voidzero-dev/vite-plus-core@latest',
            vitest: 'npm:@voidzero-dev/vite-plus-test@latest',
          },
        },
      },
      null,
      2
    ) + '\n',
};

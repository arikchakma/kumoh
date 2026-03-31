import { access, mkdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { createInterface } from 'node:readline';

import { defineCommand } from 'citty';

import { log } from './log.js';

const root = process.cwd();

async function prompt(question: string, fallback: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} (${fallback}): `, (answer) => {
      rl.close();
      resolve(answer.trim() || fallback);
    });
  });
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const templates = {
  kumohJson: (name: string) =>
    JSON.stringify(
      {
        $schema: './node_modules/kumoh/kumoh.schema.json',
        name,
        routes: 'app/routes/index.ts',
        crons: 'app/crons',
        queues: 'app/queues',
        schema: 'app/db/schema.ts',
      },
      null,
      2
    ) + '\n',

  viteConfig: `import { kumoh } from 'kumoh';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  plugins: [kumoh()],
});
`,

  tsconfig: `{
  "extends": "kumoh/tsconfig"
}
`,

  routes: `import { Hono } from 'hono';
import { db, schema } from 'kumoh/db';

const app = new Hono()
  .get('/', (c) => c.json({ status: 'ok' }));

export default app;
`,

  schema: `import { sqliteTable, text, integer } from 'kumoh/db';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull(),
});
`,

  gitignore: `node_modules
dist
.kumoh
*.tsbuildinfo
`,

  packageJson: (name: string) =>
    JSON.stringify(
      {
        name,
        private: true,
        type: 'module',
        scripts: {
          dev: 'vp dev',
          build: 'vp build',
          'db:generate': 'kumoh db generate',
          'db:migrate': 'kumoh db migrate',
          'db:studio': 'kumoh db studio',
          deploy: 'kumoh deploy',
        },
        dependencies: {
          kumoh: 'latest',
          hono: '^4.7.0',
          'drizzle-orm': '^0.38.0',
        },
        devDependencies: {
          '@cloudflare/workers-types': '^4.20250312.0',
          'drizzle-kit': '^0.30.0',
          typescript: '^5.7.0',
          vite: 'catalog:',
          'vite-plus': 'catalog:',
        },
      },
      null,
      2
    ) + '\n',
};

export const init = defineCommand({
  meta: {
    name: 'init',
    description: 'Create a new Kumoh project',
  },
  async run() {
    const defaultName = basename(root);

    if (await exists(resolve(root, 'kumoh.json'))) {
      console.error('kumoh.json already exists in this directory.');
      process.exit(1);
    }

    const name = await prompt('App name', defaultName);

    log.step('Creating project...');

    await mkdir(resolve(root, 'app/routes'), { recursive: true });
    await mkdir(resolve(root, 'app/db'), { recursive: true });
    await mkdir(resolve(root, 'app/crons'), { recursive: true });
    await mkdir(resolve(root, 'app/queues'), { recursive: true });

    await writeFile(resolve(root, 'kumoh.json'), templates.kumohJson(name));
    log.ok('kumoh.json');

    await writeFile(resolve(root, 'vite.config.ts'), templates.viteConfig);
    log.ok('vite.config.ts');

    await writeFile(resolve(root, 'tsconfig.json'), templates.tsconfig);
    log.ok('tsconfig.json');

    await writeFile(resolve(root, 'app/routes/index.ts'), templates.routes);
    log.ok('app/routes/index.ts');

    await writeFile(resolve(root, 'app/db/schema.ts'), templates.schema);
    log.ok('app/db/schema.ts');

    if (!(await exists(resolve(root, 'package.json')))) {
      await writeFile(
        resolve(root, 'package.json'),
        templates.packageJson(name)
      );
      log.ok('package.json');
    }

    if (!(await exists(resolve(root, '.gitignore')))) {
      await writeFile(resolve(root, '.gitignore'), templates.gitignore);
      log.ok('.gitignore');
    }

    log.done(`Project "${name}" created`);
    console.log('\nNext steps:');
    console.log('  pnpm install');
    console.log('  kumoh db generate');
    console.log('  vp dev');
    console.log('');
  },
});

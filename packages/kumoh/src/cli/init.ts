import { access, mkdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import { defineCommand } from 'citty';

import { slugify } from '../lib/slugger.ts';
import { log } from './log.ts';
import { prompt } from './prompt.ts';
import { checkWrangler } from './wrangler.ts';

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

  server: `import { defineApp } from 'kumoh/app';

export default defineApp((app) => {
  // Add global middleware here
});
`,

  routeIndex: `export const GET = (c) => {
  return c.json({ status: 'ok' });
};
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
          'vite-plus': '^0.1.14',
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
    await checkWrangler();

    const input = await prompt(
      'App name or "." for current directory',
      basename(process.cwd())
    );
    const name = slugify(input === '.' ? basename(process.cwd()) : input);
    const dir = input === '.' ? process.cwd() : resolve(process.cwd(), name);

    if (await exists(resolve(dir, 'kumoh.json'))) {
      console.error('kumoh.json already exists in this directory.');
      process.exit(1);
    }

    log.step(`Creating project "${name}"...`);

    await mkdir(resolve(dir, 'app/routes'), { recursive: true });
    await mkdir(resolve(dir, 'app/db'), { recursive: true });
    await mkdir(resolve(dir, 'app/crons'), { recursive: true });
    await mkdir(resolve(dir, 'app/queues'), { recursive: true });

    await writeFile(resolve(dir, 'kumoh.json'), templates.kumohJson(name));
    log.ok('kumoh.json');

    await writeFile(resolve(dir, 'vite.config.ts'), templates.viteConfig);
    log.ok('vite.config.ts');

    await writeFile(resolve(dir, 'tsconfig.json'), templates.tsconfig);
    log.ok('tsconfig.json');

    await writeFile(resolve(dir, 'app/server.ts'), templates.server);
    log.ok('app/server.ts');

    await writeFile(resolve(dir, 'app/routes/index.ts'), templates.routeIndex);
    log.ok('app/routes/index.ts');

    await writeFile(resolve(dir, 'app/db/schema.ts'), templates.schema);
    log.ok('app/db/schema.ts');

    if (!(await exists(resolve(dir, 'package.json')))) {
      await writeFile(
        resolve(dir, 'package.json'),
        templates.packageJson(name)
      );
      log.ok('package.json');
    }

    if (!(await exists(resolve(dir, '.gitignore')))) {
      await writeFile(resolve(dir, '.gitignore'), templates.gitignore);
      log.ok('.gitignore');
    }

    log.done(`Project "${name}" created`);

    if (input !== '.') {
      console.log(`\n  cd ${name}`);
    }
    console.log('  pnpm install');
    console.log('  kumoh db generate');
    console.log('  vp dev');
    console.log('');
  },
});

import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineCommand } from 'citty';

import { slugify } from '../lib/slugger.ts';
import { log } from './log.ts';
import { confirm, prompt } from './prompt.ts';
import { checkVitePlus, checkWrangler } from './wrangler.ts';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function getVersion(): Promise<string> {
  try {
    const pkgPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      'package.json'
    );
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
    return pkg.version ?? '0.1.0';
  } catch {
    return '0.1.0';
  }
}

function exec(cmd: string, cwd: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, { cwd, shell: true, stdio: 'inherit' });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

function execSilent(cmd: string, cwd: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, { cwd, shell: true, stdio: 'pipe' });
    child.on('close', (code) => resolve(code ?? 1));
  });
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

export const init = defineCommand({
  meta: {
    name: 'init',
    description: 'Create a new Kumoh project',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Project name or "." for current directory',
      required: false,
    },
  },
  async run({ args }) {
    await checkVitePlus();
    await checkWrangler();

    const input =
      (args.name as string | undefined) ??
      (await prompt(
        'App name or "." for current directory',
        basename(process.cwd())
      ));
    const name = slugify(input === '.' ? basename(process.cwd()) : input);
    const dir = input === '.' ? process.cwd() : resolve(process.cwd(), name);

    if (await exists(resolve(dir, 'kumoh.json'))) {
      console.error('kumoh.json already exists in this directory.');
      process.exit(1);
    }

    const version = await getVersion();

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

    await writeFile(
      resolve(dir, 'app/crons/heartbeat.ts'),
      templates.heartbeat
    );
    log.ok('app/crons/heartbeat.ts');

    await writeFile(resolve(dir, 'app/queues/messages.ts'), templates.messages);
    log.ok('app/queues/messages.ts');

    if (!(await exists(resolve(dir, 'package.json')))) {
      await writeFile(
        resolve(dir, 'package.json'),
        templates.packageJson(name, version)
      );
      log.ok('package.json');
    }

    if (!(await exists(resolve(dir, '.gitignore')))) {
      await writeFile(resolve(dir, '.gitignore'), templates.gitignore);
      log.ok('.gitignore');
    }

    // Install dependencies
    const shouldInstall = await confirm('Install dependencies?');
    if (shouldInstall) {
      log.step('Installing dependencies...');
      const code = await exec('pnpm install', dir);
      if (code === 0) {
        log.ok('Dependencies installed');
      } else {
        log.warn('Install failed — run `pnpm install` manually');
      }
    }

    const isGitRepo = await exists(resolve(dir, '.git'));
    if (!isGitRepo) {
      const shouldGit = await confirm('Initialize git repository?');
      if (shouldGit) {
        const gitOk =
          (await execSilent('git init', dir)) === 0 &&
          (await execSilent('git checkout -b main', dir)) === 0 &&
          (await execSilent('git add -A', dir)) === 0 &&
          (await execSilent('git commit -m "initial commit"', dir)) === 0;
        if (gitOk) {
          log.ok('Git repository initialized');
        } else {
          log.warn('Git init failed — initialize manually');
        }
      }
    }

    log.done(`Project "${name}" created`);
    console.log('');

    if (input !== '.') {
      console.log(`  cd ${name}`);
    }
    if (!shouldInstall) {
      console.log('  pnpm install');
    }
    console.log('  kumoh db generate');
    console.log('  vp dev');
    console.log('');
  },
});

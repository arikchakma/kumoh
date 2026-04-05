import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';

import {
  VIRTUAL_DB,
  VIRTUAL_KV,
  VIRTUAL_STORAGE,
  VIRTUAL_QUEUE,
  VIRTUAL_AI,
  VIRTUAL_EMAIL,
  VIRTUAL_APP,
  VIRTUAL_RATE_LIMIT,
  VIRTUAL_OBJECTS,
  VIRTUAL_ENTRY,
} from '../constants.ts';
import type { KumohConfig } from '../index.ts';
import { AUTO_GENERATED_COMMENT } from '../lib/constants.ts';
import { generateAiModule } from '../virtual/ai.ts';
import { generateDbModule } from '../virtual/db.ts';
import { generateEmailModule } from '../virtual/email.ts';
import { generateKvModule } from '../virtual/kv.ts';
import { generateObjectsModule } from '../virtual/objects.ts';
import { generateQueueModule } from '../virtual/queue.ts';
import { generateRateLimitModule } from '../virtual/rate-limit.ts';
import { generateStorageModule } from '../virtual/storage.ts';
import { generateWorkerEntry } from './codegen.ts';
import {
  findServerEntry,
  groupRoutesByDirectory,
  scanCrons,
  scanEmail,
  scanObjects,
  scanQueues,
} from './scanner.ts';

type ModuleGenerator = () => string;

function createGenerators(
  config: KumohConfig,
  root: string
): Record<string, ModuleGenerator> {
  const appName = config.appName ?? 'kumoh-app';
  return {
    [VIRTUAL_DB]: () => generateDbModule(config.schemaPath),
    [VIRTUAL_KV]: generateKvModule,
    [VIRTUAL_STORAGE]: generateStorageModule,
    [VIRTUAL_QUEUE]: () =>
      generateQueueModule(scanQueues(root, config.queuesDir!, appName)),
    [VIRTUAL_AI]: generateAiModule,
    [VIRTUAL_EMAIL]: generateEmailModule,
    [VIRTUAL_APP]: () =>
      [
        "import { createFactory } from 'hono/factory';",
        'export function defineApp(init) { return init; }',
        'export const defineHandler = createFactory().createHandlers;',
        'export function defineMiddleware(handler) { return handler; }',
      ].join('\n'),
    [VIRTUAL_RATE_LIMIT]: () => generateRateLimitModule(config.rateLimiters),
    [VIRTUAL_OBJECTS]: () =>
      generateObjectsModule(scanObjects(root, config.objectsDir!)),
  };
}

function generateTypes(config: KumohConfig, root: string): void {
  const kumohDir = resolve(root, '.kumoh');
  mkdirSync(kumohDir, { recursive: true });

  const sections: string[] = [AUTO_GENERATED_COMMENT];

  if (existsSync(config.schemaPath)) {
    const relative = config.schemaPath.replace(root, '..').replace(/\.ts$/, '');
    sections.push(
      `import type * as s from '${relative}';`,
      '',
      "declare module 'kumoh/db' {",
      '  export const schema: typeof s;',
      '}'
    );
  }

  const appName = config.appName ?? 'kumoh-app';
  const queues = scanQueues(root, config.queuesDir!, appName);

  if (queues.length) {
    const imports = queues
      .map((q) => {
        const relative = q.importPath.replace(root, '..').replace(/\.ts$/, '');
        return `import type handler_${q.camelName} from '${relative}';`;
      })
      .join('\n');

    const props = queues
      .map(
        (q) =>
          `    ${q.camelName}: Queue<ExtractQueueMessage<typeof handler_${q.camelName}>>;`
      )
      .join('\n');

    sections.push(
      imports,
      '',
      'type ExtractQueueMessage<T> = T extends ExportedHandlerQueueHandler<any, infer M> ? M : unknown;',
      '',
      "declare module 'kumoh/queue' {",
      '  interface KumohQueues {',
      props,
      '  }',
      '}'
    );
  }

  const bindings: string[] = [];
  if (existsSync(config.schemaPath)) {
    bindings.push('    DB: D1Database;');
  }
  bindings.push('    KV: KVNamespace;');
  bindings.push('    BUCKET: R2Bucket;');
  bindings.push('    AI: Ai;');
  bindings.push('    SEND_EMAIL: SendEmail;');
  for (const l of config.rateLimiters) {
    bindings.push(`    ${l.binding}: RateLimit;`);
  }
  for (const o of config.durableObjects) {
    bindings.push(`    ${o.binding}: DurableObjectNamespace;`);
  }
  for (const q of queues) {
    bindings.push(
      `    ${q.binding}: Queue<ExtractQueueMessage<typeof handler_${q.camelName}>>;`
    );
  }

  // Augment the global KumohBindings interface declared in virtual.d.ts.
  // defineHandler in virtual.d.ts already references this interface, so all
  // route handlers automatically pick up the project-specific bindings.
  sections.push(
    'declare global {',
    '  interface KumohBindings {',
    ...bindings,
    '  }',
    '}'
  );

  sections.push(
    '',
    "declare module 'kumoh/email' {",
    '  export const email: SendEmail;',
    '  export function defineEmail<Env = unknown>(',
    '    handler: EmailExportedHandler<Env>',
    '  ): EmailExportedHandler<Env>;',
    '}'
  );

  if (config.rateLimiters.length) {
    const props = config.rateLimiters
      .map((l) => `    ${l.camelName}: RateLimit;`)
      .join('\n');

    sections.push(
      '',
      "declare module 'kumoh/rate-limit' {",
      '  interface KumohRateLimiters {',
      props,
      '  }',
      '}'
    );
  }

  if (config.durableObjects.length) {
    const props = config.durableObjects
      .map((o) => `    ${o.camelName}: DurableObjectNamespace;`)
      .join('\n');

    sections.push(
      '',
      "declare module 'kumoh/objects' {",
      '  interface KumohDurableObjects {',
      props,
      '  }',
      '}'
    );
  }

  writeFileSync(resolve(kumohDir, 'kumoh.d.ts'), sections.join('\n') + '\n');

  // Generate RPC type file using Hono's native type chain.
  // We scan each route file with oxc to find which methods are exported,
  // then generate a .get()/.post() chain that Hono types naturally.
  const routeGroups = groupRoutesByDirectory(root, config.routesDir!);
  const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;
  const rpcImports: string[] = [];
  const rpcChains: string[] = [];
  let rpcIdx = 0;

  for (const group of routeGroups) {
    for (const route of group.routes) {
      const relative = route.importPath
        .replace(root, '..')
        .replace(/\.ts$/, '');

      const raw =
        group.mountPath === '/'
          ? route.subPath
          : group.mountPath + route.subPath;
      const fullPath =
        raw.endsWith('/') && raw !== '/' ? raw.slice(0, -1) : raw;

      // We check source text instead of AST because we only need to know
      // which HTTP methods are exported, not parse the full module
      const code = readFileSync(route.importPath, 'utf-8');
      let hasNamedExport = false;

      for (const m of METHODS) {
        if (code.includes(`export const ${m}`)) {
          hasNamedExport = true;
          const alias = `_h${rpcIdx++}`;
          rpcImports.push(`import { ${m} as ${alias} } from '${relative}';`);
          rpcChains.push(`.${m.toLowerCase()}('${fullPath}', ...${alias})`);
        }
      }

      // Falls back to .route() for Hono sub-app exports
      if (!hasNamedExport && code.includes('export default')) {
        const alias = `_h${rpcIdx++}`;
        rpcImports.push(`import ${alias} from '${relative}';`);
        rpcChains.push(`.route('${fullPath}', ${alias})`);
      }
    }
  }

  if (rpcChains.length) {
    const schemaRef = existsSync(config.schemaPath)
      ? config.schemaPath.replace(root, '..').replace(/\.ts$/, '')
      : null;
    const rpcLines = [AUTO_GENERATED_COMMENT, "import { Hono } from 'hono';"];
    if (schemaRef) {
      rpcLines.push(
        `import type * as _kumohSchema from '${schemaRef}';`,
        '// @ts-ignore -- redeclares schema for cross-project type resolution',
        "declare module 'kumoh/db' { export const schema: typeof _kumohSchema; }"
      );
    }
    rpcLines.push(
      ...rpcImports,
      '',
      'const _app = new Hono()',
      ...rpcChains.map((c) => `  ${c}`),
      '',
      'export type AppType = typeof _app;'
    );
    writeFileSync(resolve(kumohDir, 'rpc.ts'), rpcLines.join('\n') + '\n');
  }
}

export function virtualModules(config: KumohConfig): Plugin {
  let root: string;
  let generators: Record<string, ModuleGenerator>;

  return {
    name: 'kumoh:virtual-modules',
    enforce: 'pre',

    configResolved(cfg: ResolvedConfig) {
      root = cfg.root;
      generators = createGenerators(config, root);
      generateTypes(config, root);
    },

    configureServer(server: ViteDevServer) {
      const dirs = [
        config.routesDir,
        config.cronsDir,
        config.queuesDir,
        config.objectsDir,
      ].filter(Boolean) as string[];

      for (const dir of dirs) {
        server.watcher.add(dir);
      }

      // Only care about file adds/removes — content changes are handled by
      // Vite's HMR. When a route/cron/queue file is added or deleted, we
      // regenerate types and force a full reload.
      server.watcher.on('all', (event, filePath) => {
        if (event !== 'add' && event !== 'unlink') {
          return;
        }
        if (!filePath.endsWith('.ts') && !filePath.endsWith('.js')) {
          return;
        }

        const isWatched = dirs.some((dir) => filePath.startsWith(dir));
        if (!isWatched) {
          return;
        }

        generateTypes(config, root);
        generators = createGenerators(config, root);

        const entryMod = server.moduleGraph.getModuleById('\0kumoh/entry');
        if (entryMod) {
          server.moduleGraph.invalidateModule(entryMod);
        }
        const queueMod = server.moduleGraph.getModuleById('\0kumoh/queue');
        if (queueMod) {
          server.moduleGraph.invalidateModule(queueMod);
        }
        const objectsMod = server.moduleGraph.getModuleById('\0kumoh/objects');
        if (objectsMod) {
          server.moduleGraph.invalidateModule(objectsMod);
        }

        server.ws.send({ type: 'full-reload' });
        console.log(`[kumoh] ${event}: ${basename(filePath)}`);
      });
    },

    resolveId(id: string) {
      if (generators[id]) {
        return '\0' + id;
      }
      if (id === VIRTUAL_ENTRY) {
        return '\0' + id;
      }
      return null;
    },

    load(id: string) {
      if (!id.startsWith('\0kumoh/')) {
        return null;
      }

      const moduleId = id.slice(1);

      if (generators[moduleId]) {
        return generators[moduleId]();
      }

      if (moduleId === VIRTUAL_ENTRY) {
        const serverEntry = findServerEntry(root, config.serverEntry);
        if (!serverEntry) {
          throw new Error(
            '[kumoh] No server entry found. Create app/server.ts'
          );
        }
        const routeGroups = groupRoutesByDirectory(root, config.routesDir!);
        const crons = scanCrons(root, config.cronsDir!);
        const queues = scanQueues(
          root,
          config.queuesDir!,
          config.appName ?? 'kumoh-app'
        );
        const emailEntry = scanEmail(root);
        const durableObjects = scanObjects(root, config.objectsDir!);
        return generateWorkerEntry(
          serverEntry,
          routeGroups,
          crons,
          queues,
          emailEntry,
          durableObjects
        );
      }

      return null;
    },
  };
}

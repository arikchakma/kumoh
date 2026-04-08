import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { KumohConfig } from '../index.ts';
import { AUTO_GENERATED_COMMENT } from '../lib/constants.ts';
import { groupRoutesByDirectory, scanQueues } from './scanner.ts';

function generateBindingTypes(config: KumohConfig, root: string): void {
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
    const relative = o.importPath.replace(root, '..').replace(/\.ts$/, '');
    bindings.push(
      `    ${o.binding}: DurableObjectNamespace<import('${relative}').${o.className}>;`
    );
  }
  for (const q of queues) {
    bindings.push(
      `    ${q.binding}: Queue<ExtractQueueMessage<typeof handler_${q.camelName}>>;`
    );
  }

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
      .map((o) => {
        const relative = o.importPath.replace(root, '..').replace(/\.ts$/, '');
        return `    ${o.camelName}: DurableObjectNamespace<import('${relative}').${o.className}>;`;
      })
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
}

function generateRpcTypes(config: KumohConfig, root: string): void {
  const kumohDir = resolve(root, '.kumoh');
  mkdirSync(kumohDir, { recursive: true });

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

  if (!rpcChains.length) {
    return;
  }

  const schemaRef = existsSync(config.schemaPath)
    ? config.schemaPath.replace(root, '..').replace(/\.ts$/, '')
    : null;
  const rpcLines = [
    AUTO_GENERATED_COMMENT,
    '/// <reference path="./kumoh.d.ts" />',
    "import { Hono } from 'hono';",
  ];
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

export function generateTypes(config: KumohConfig, root: string): void {
  generateBindingTypes(config, root);
  generateRpcTypes(config, root);
}

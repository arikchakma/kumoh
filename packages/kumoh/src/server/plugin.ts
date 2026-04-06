import { basename } from 'node:path';

import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite-plus';

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
import { generateAiModule } from '../virtual/ai.ts';
import { generateAppModule } from '../virtual/app.ts';
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
import { generateTypes } from './typegen.ts';

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
    [VIRTUAL_APP]: generateAppModule,
    [VIRTUAL_RATE_LIMIT]: () => generateRateLimitModule(config.rateLimiters),
    [VIRTUAL_OBJECTS]: () =>
      generateObjectsModule(scanObjects(root, config.objectsDir!)),
  };
}

export function outputPlugin(envName: string): Plugin {
  return {
    name: 'kumoh:output',
    config: () => ({
      environments: {
        [envName]: { build: { outDir: 'dist' } },
      },
    }),
  } as Plugin;
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

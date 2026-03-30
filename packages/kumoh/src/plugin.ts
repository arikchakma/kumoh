import path from 'node:path';

import type { Plugin, ResolvedConfig } from 'vite';

import { generateWorkerEntry } from './codegen.js';
import {
  VIRTUAL_DB,
  VIRTUAL_KV,
  VIRTUAL_STORAGE,
  VIRTUAL_QUEUE,
  VIRTUAL_ENTRY,
} from './constants.js';
import { findRoutesEntry, scanCrons, scanQueues } from './scanner.js';
import type { MakeVoidConfig } from './types.js';
import { generateDbModule } from './virtual/db.js';
import { generateKvModule } from './virtual/kv.js';
import { generateQueueModule } from './virtual/queue.js';
import { generateStorageModule } from './virtual/storage.js';

type ModuleGenerator = () => string;

const MODULE_GENERATORS: Record<string, ModuleGenerator> = {
  [VIRTUAL_DB]: generateDbModule,
  [VIRTUAL_KV]: generateKvModule,
  [VIRTUAL_STORAGE]: generateStorageModule,
  [VIRTUAL_QUEUE]: generateQueueModule,
};

export function createVirtualModulesPlugin(config: MakeVoidConfig): Plugin {
  let root: string;

  return {
    name: 'kumoh:virtual-modules',
    enforce: 'pre',

    configResolved(cfg: ResolvedConfig) {
      root = cfg.root;
    },

    resolveId(id: string) {
      if (MODULE_GENERATORS[id]) {
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

      if (MODULE_GENERATORS[moduleId]) {
        return MODULE_GENERATORS[moduleId]();
      }

      if (moduleId === VIRTUAL_ENTRY) {
        const routesEntry = findRoutesEntry(root, config.routesEntry);
        if (!routesEntry) {
          throw new Error(
            '[kumoh] No routes entry found. Create app/routes/index.ts'
          );
        }
        const crons = scanCrons(root, config.cronsDir ?? 'crons');
        const queues = scanQueues(root, config.queuesDir ?? 'queues');
        return generateWorkerEntry(routesEntry, crons, queues);
      }

      return null;
    },
  };
}

export function createAliasPlugin(config: MakeVoidConfig): Plugin {
  return {
    name: 'kumoh:alias',

    config() {
      return {
        resolve: {
          alias: {
            '@schema':
              config.schemaPath ??
              path.resolve(process.cwd(), 'app/db/schema.ts'),
          },
        },
      };
    },
  };
}

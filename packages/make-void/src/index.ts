import type { Plugin } from "vite";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  createVirtualModulesPlugin,
  createDevServerPlugin,
  createScannerPlugin,
  createAliasPlugin,
} from "./plugin.js";
import type { MakeVoidConfig } from "./types.js";

export type { MakeVoidConfig, RouteContext, CronContext, QueueContext } from "./types.js";

function loadVoidJson(root: string): Partial<MakeVoidConfig> {
  const configPath = path.resolve(root, "void.json");
  if (!existsSync(configPath)) return {};

  const raw = JSON.parse(readFileSync(configPath, "utf-8"));
  return {
    routesDir: raw.routes,
    cronsDir: raw.crons,
    queuesDir: raw.queues,
    schemaPath: raw.schema,
    bindings: raw.bindings,
  };
}

export function makeVoid(userConfig?: MakeVoidConfig): Plugin[] {
  const fileConfig = loadVoidJson(process.cwd());
  const config: MakeVoidConfig = { ...fileConfig, ...userConfig };

  return [
    createVirtualModulesPlugin(config),
    createDevServerPlugin(config),
    createScannerPlugin(config),
    createAliasPlugin(config),
  ];
}

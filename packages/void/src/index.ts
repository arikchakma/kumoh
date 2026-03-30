import type { Plugin } from "vite";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { createVirtualModulesPlugin, createAliasPlugin } from "./plugin.js";
import type { MakeVoidConfig } from "./types.js";

export type { MakeVoidConfig, CronContext, QueueContext } from "./types.js";

interface VoidJson {
  name?: string;
  bindings?: {
    d1?: string;
    kv?: string;
    r2?: string;
    queue?: string;
  };
  routes?: string;
  crons?: string;
  queues?: string;
  schema?: string;
}

function loadVoidJson(root: string): VoidJson {
  const configPath = path.resolve(root, "void.json");
  if (!existsSync(configPath)) return {};
  return JSON.parse(readFileSync(configPath, "utf-8"));
}

function voidJsonToConfig(raw: VoidJson, root: string): MakeVoidConfig {
  return {
    routesEntry: raw.routes ? path.resolve(root, raw.routes) : undefined,
    cronsDir: path.resolve(root, raw.crons ?? "app/crons"),
    queuesDir: path.resolve(root, raw.queues ?? "app/queues"),
    schemaPath: path.resolve(root, raw.schema ?? "app/db/schema.ts"),
    bindings: raw.bindings,
  };
}

/**
 * Build the @cloudflare/vite-plugin worker config from void.json.
 * No wrangler.toml needed — void.json is the single source of truth.
 */
function buildWorkerConfig(raw: VoidJson) {
  const workerConfig: Record<string, unknown> = {
    name: raw.name ?? "make-void-app",
    // Virtual module entry — the Cloudflare plugin passes non-extension
    // strings through to Vite's resolver, where our plugin handles it
    main: "void/entry",
    compatibility_date: "2025-03-14",
    compatibility_flags: ["nodejs_compat"],
  };

  const bindings = raw.bindings ?? {};

  if (bindings.d1) {
    workerConfig.d1_databases = [
      {
        binding: bindings.d1,
        database_name: `${raw.name ?? "make-void"}-db`,
        database_id: "local",
      },
    ];
  }

  if (bindings.kv) {
    workerConfig.kv_namespaces = [
      {
        binding: bindings.kv,
        id: "local",
      },
    ];
  }

  if (bindings.r2) {
    workerConfig.r2_buckets = [
      {
        binding: bindings.r2,
        bucket_name: `${raw.name ?? "make-void"}-bucket`,
      },
    ];
  }

  if (bindings.queue) {
    workerConfig.queues = {
      producers: [
        {
          binding: bindings.queue,
          queue: `${raw.name ?? "make-void"}-queue`,
        },
      ],
      consumers: [
        {
          queue: `${raw.name ?? "make-void"}-queue`,
        },
      ],
    };
  }

  return workerConfig;
}

export function makeVoid(userConfig?: MakeVoidConfig): Plugin[] {
  const root = process.cwd();
  const raw = loadVoidJson(root);
  const config: MakeVoidConfig = { ...voidJsonToConfig(raw, root), ...userConfig };
  const workerConfig = buildWorkerConfig(raw);
  const envName = (raw.name ?? "make-void-app").replace(/-/g, "_");

  return [
    createVirtualModulesPlugin(config),
    createAliasPlugin(config),
    ...cloudflare({ config: workerConfig, persistState: { path: ".void" } }),
    // Output directly to dist/ instead of dist/<worker_name>/
    {
      name: "make-void:output",
      config: () => ({
        environments: {
          [envName]: { build: { outDir: "dist" } },
        },
      }),
    } as Plugin,
  ];
}

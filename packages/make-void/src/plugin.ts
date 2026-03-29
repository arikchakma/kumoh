import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";
import path from "node:path";
import {
  VIRTUAL_DB,
  VIRTUAL_KV,
  VIRTUAL_STORAGE,
  VIRTUAL_QUEUE,
  VIRTUAL_ENTRY,
} from "./constants.js";
import { generateDbModule } from "./virtual/db.js";
import { generateKvModule } from "./virtual/kv.js";
import { generateStorageModule } from "./virtual/storage.js";
import { generateQueueModule } from "./virtual/queue.js";
import { findRoutesEntry, scanCrons, scanQueues } from "./scanner.js";
import { generateWorkerEntry } from "./codegen.js";
import type { MakeVoidConfig } from "./types.js";

type ModuleGenerator = (config: MakeVoidConfig, isDev: boolean) => string;

const MODULE_GENERATORS: Record<string, ModuleGenerator> = {
  [VIRTUAL_DB]: generateDbModule,
  [VIRTUAL_KV]: generateKvModule,
  [VIRTUAL_STORAGE]: generateStorageModule,
  [VIRTUAL_QUEUE]: generateQueueModule,
};

export function createVirtualModulesPlugin(config: MakeVoidConfig): Plugin {
  let root: string;
  let isDev = false;

  return {
    name: "make-void:virtual-modules",
    enforce: "pre",

    configResolved(cfg: ResolvedConfig) {
      root = cfg.root;
      isDev = cfg.command === "serve";
    },

    resolveId(id: string) {
      if (MODULE_GENERATORS[id]) return "\0" + id;
      if (id === VIRTUAL_ENTRY) return "\0" + id;
      return null;
    },

    load(id: string) {
      if (!id.startsWith("\0make-void/")) return null;

      const moduleId = id.slice(1);

      if (MODULE_GENERATORS[moduleId]) {
        return MODULE_GENERATORS[moduleId](config, isDev);
      }

      if (moduleId === VIRTUAL_ENTRY) {
        const routesEntry = findRoutesEntry(root, config.routesEntry);
        if (!routesEntry) {
          throw new Error(
            "[make-void] No routes entry found. Create routes.ts or routes/index.ts"
          );
        }
        const crons = scanCrons(root, config.cronsDir ?? "crons");
        const queues = scanQueues(root, config.queuesDir ?? "queues");
        return generateWorkerEntry("./" + routesEntry, crons, queues);
      }

      return null;
    },
  };
}

export function createDevServerPlugin(config: MakeVoidConfig): Plugin {
  let root: string;

  return {
    name: "make-void:dev-server",

    configResolved(cfg: ResolvedConfig) {
      root = cfg.root;
    },

    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const routesEntry = findRoutesEntry(root, config.routesEntry);
        if (!routesEntry) return next();

        try {
          const mod = await server.ssrLoadModule(
            path.resolve(root, routesEntry)
          );
          const app = mod.default;
          if (!app || typeof app.fetch !== "function") return next();

          // Build a Web Request from the Node.js IncomingMessage
          const url = new URL(req.url!, `http://${req.headers.host}`);
          const method = req.method!.toLowerCase();
          const body =
            method !== "get" && method !== "head"
              ? await readBody(req)
              : undefined;

          const webRequest = new Request(url.toString(), {
            method: req.method,
            headers: Object.entries(req.headers).reduce((h, [k, v]) => {
              if (v) h.set(k, Array.isArray(v) ? v.join(", ") : v);
              return h;
            }, new Headers()),
            body,
          });

          // Call the Hono app's fetch handler
          const response: Response = await app.fetch(webRequest);

          // If Hono returned 404, let Vite handle it (for static files, HMR, etc.)
          if (response.status === 404) return next();

          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });
          const responseBody = await response.arrayBuffer();
          res.end(Buffer.from(responseBody));
        } catch (err) {
          console.error("[make-void] Error:", err);
          next();
        }
      });
    },
  };
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export function createScannerPlugin(config: MakeVoidConfig): Plugin {
  let root: string;

  return {
    name: "make-void:scanner",

    configResolved(cfg: ResolvedConfig) {
      root = cfg.root;
    },

    configureServer(server) {
      const dirs = [config.cronsDir ?? "crons", config.queuesDir ?? "queues"]
        .map((d) => path.resolve(root, d))
        .filter((d) => {
          try {
            return require("node:fs").existsSync(d);
          } catch {
            return false;
          }
        });

      for (const dir of dirs) {
        server.watcher.add(dir);
      }

      // Also watch the routes entry
      const routesEntry = findRoutesEntry(root, config.routesEntry);
      if (routesEntry) {
        server.watcher.add(path.resolve(root, routesEntry));
      }
    },
  };
}

export function createAliasPlugin(config: MakeVoidConfig): Plugin {
  return {
    name: "make-void:alias",

    config() {
      return {
        resolve: {
          alias: {
            "@schema": path.resolve(
              process.cwd(),
              config.schemaPath ?? "db/schema.ts"
            ),
          },
        },
      };
    },
  };
}

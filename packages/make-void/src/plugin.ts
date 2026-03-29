import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";
import path from "node:path";
import {
  VIRTUAL_DB,
  VIRTUAL_KV,
  VIRTUAL_STORAGE,
  VIRTUAL_QUEUE,
  VIRTUAL_ENTRY,
  VIRTUAL_ROUTES,
} from "./constants.js";
import { generateDbModule } from "./virtual/db.js";
import { generateKvModule } from "./virtual/kv.js";
import { generateStorageModule } from "./virtual/storage.js";
import { generateQueueModule } from "./virtual/queue.js";
import { scanRoutes, scanCrons, scanQueues } from "./scanner.js";
import { generateWorkerEntry } from "./codegen.js";
import type { MakeVoidConfig, ScannedRoute } from "./types.js";

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
      if (id === VIRTUAL_ENTRY || id === VIRTUAL_ROUTES) return "\0" + id;
      return null;
    },

    load(id: string) {
      if (!id.startsWith("\0make-void/")) return null;

      const moduleId = id.slice(1); // strip \0

      if (MODULE_GENERATORS[moduleId]) {
        return MODULE_GENERATORS[moduleId](config, isDev);
      }

      const routesDir = config.routesDir ?? "routes";
      const cronsDir = config.cronsDir ?? "crons";
      const queuesDir = config.queuesDir ?? "queues";

      if (moduleId === VIRTUAL_ENTRY) {
        const routes = scanRoutes(root, routesDir);
        const crons = scanCrons(root, cronsDir);
        const queues = scanQueues(root, queuesDir);
        return generateWorkerEntry(routes, crons, queues);
      }

      if (moduleId === VIRTUAL_ROUTES) {
        const routes = scanRoutes(root, routesDir);
        return `export default ${JSON.stringify(routes, null, 2)};`;
      }

      return null;
    },
  };
}

function filePathToUrlPattern(route: ScannedRoute): URLPattern {
  return new URLPattern({ pathname: route.urlPattern });
}

export function createDevServerPlugin(config: MakeVoidConfig): Plugin {
  let root: string;

  return {
    name: "make-void:dev-server",

    configResolved(cfg: ResolvedConfig) {
      root = cfg.root;
    },

    configureServer(server: ViteDevServer) {
      const routesDir = config.routesDir ?? "routes";

      // Register middleware BEFORE Vite's built-in middleware
      // so we intercept API routes before Vite's 404 handler
      server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url!, `http://${req.headers.host}`);
          const method = req.method!.toLowerCase();

          // Scan routes on each request in dev (fast enough, enables HMR)
          const routes = scanRoutes(root, routesDir);

          for (const route of routes) {
            const pattern = filePathToUrlPattern(route);
            const match = pattern.exec(url);

            if (match) {
              try {
                // Use Vite's ssrLoadModule to load the route handler
                // This resolves virtual modules (make-void/db etc.) through our plugin
                const mod = await server.ssrLoadModule(route.filePath);
                const handler = mod[method];

                if (!handler) {
                  res.statusCode = 405;
                  res.end("Method Not Allowed");
                  return;
                }

                // Build a Web Request from the Node.js IncomingMessage
                const body = method !== "get" && method !== "head"
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

                const routeCtx = {
                  request: webRequest,
                  params: match.pathname.groups as Record<string, string>,
                  url,
                };

                const response: Response = await handler(routeCtx);

                // Write Web Response back to Node.js response
                res.statusCode = response.status;
                response.headers.forEach((value, key) => {
                  res.setHeader(key, value);
                });
                const responseBody = await response.text();
                res.end(responseBody);
                return;
              } catch (err) {
                console.error("[make-void] Route error:", err);
                res.statusCode = 500;
                res.end("Internal Server Error");
                return;
              }
            }
          }

          next();
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
      const dirs = [
        config.routesDir ?? "routes",
        config.cronsDir ?? "crons",
        config.queuesDir ?? "queues",
      ].map((d) => path.resolve(root, d));

      for (const dir of dirs) {
        server.watcher.add(dir);
      }

      server.watcher.on("all", (_event, filePath) => {
        const isWatched = dirs.some((dir) => filePath.startsWith(dir));
        if (!isWatched) return;

        for (const id of ["\0" + VIRTUAL_ENTRY, "\0" + VIRTUAL_ROUTES]) {
          const mod = server.moduleGraph.getModuleById(id);
          if (mod) server.moduleGraph.invalidateModule(mod);
        }
        server.ws.send({ type: "full-reload" });
      });
    },
  };
}

export function createAliasPlugin(config: MakeVoidConfig): Plugin {
  let root: string;

  return {
    name: "make-void:alias",

    configResolved(cfg: ResolvedConfig) {
      root = cfg.root;
    },

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

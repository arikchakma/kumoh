# How `make-void` Works: A Complete Deep Dive

## The Problem

In Cloudflare Workers, every binding (D1 database, KV store, R2 storage, queues) lives on the `env` object that gets passed to your `fetch` handler:

```ts
export default {
  async fetch(request, env, ctx) {
    // You have to thread `env` through everything
    const result = await env.DB.prepare("SELECT * FROM users").all();
    const cached = await env.KV.get("key");
  }
};
```

This means you must pass `env` through every function call. If you use Hono, it's `c.env.DB`. void.cloud solves this by letting you write:

```ts
import { sql } from "make-void/db";
import { kv } from "make-void/kv";

// Just use them directly — no env threading
const result = await sql`SELECT * FROM users`;
const cached = await kv.get("key");
```

**The question is: how? `"make-void/db"` isn't a real file. How does this import work?**

---

## The Core Trick: Vite Virtual Modules

Vite plugins have two hooks that let you create modules that **don't exist on disk**:

1. **`resolveId(id)`** — Vite calls this when it encounters an import. If your plugin returns a value, Vite uses that as the resolved module ID instead of looking for a file. By convention, virtual modules are prefixed with `\0` (null byte) to tell other plugins "this isn't a real file path."

2. **`load(id)`** — Vite calls this to get the module's source code. Your plugin returns a **string of JavaScript** that Vite treats as if it were reading a file.

So when your code says `import { sql } from "make-void/db"`:

```
User code:  import { sql } from "make-void/db"
                    |
                    v
resolveId("make-void/db")  ->  returns "\0make-void/db"
                    |
                    v
load("\0make-void/db")  ->  returns GENERATED JavaScript string
                    |
                    v
Vite treats the returned string as the module's source code
```

Here's the actual implementation in `packages/make-void/src/plugin.ts`:

```ts
// Map of virtual module IDs -> code generator functions
const MODULE_GENERATORS: Record<string, ModuleGenerator> = {
  "make-void/db":      generateDbModule,
  "make-void/kv":      generateKvModule,
  "make-void/storage": generateStorageModule,
  "make-void/queue":   generateQueueModule,
};

export function createVirtualModulesPlugin(config: MakeVoidConfig): Plugin {
  let root: string;
  let isDev = false;

  return {
    name: "make-void:virtual-modules",
    enforce: "pre",  // Run BEFORE Vite's built-in resolver

    configResolved(cfg: ResolvedConfig) {
      root = cfg.root;
      isDev = cfg.command === "serve";  // true in dev, false in build
    },

    resolveId(id: string) {
      // If someone imports "make-void/db", "make-void/kv", etc.
      if (MODULE_GENERATORS[id]) return "\0" + id;
      if (id === "make-void/entry") return "\0" + id;
      return null;  // Not ours, let other plugins handle it
    },

    load(id: string) {
      if (!id.startsWith("\0make-void/")) return null;

      const moduleId = id.slice(1);  // Strip the \0 prefix

      // Generate the module code string
      if (MODULE_GENERATORS[moduleId]) {
        return MODULE_GENERATORS[moduleId](config, isDev);
      }

      // ... handle make-void/entry ...
    },
  };
}
```

**Critical detail: `enforce: "pre"`**. Without this, Vite's built-in resolver runs first, sees `"make-void/db"`, checks the package.json `exports` map, finds only `"types"` (no `"import"`), and throws `"No known conditions for ./db specifier"`. With `enforce: "pre"`, our `resolveId` intercepts it before Vite ever checks the package.json.

---

## What Gets Generated: Production vs Dev

Each virtual module generator is a function that returns a **string of JavaScript**. The string changes based on whether you're in dev or production.

### Production: `import { env } from "cloudflare:workers"`

Since March 2025, Cloudflare Workers supports importing `env` as a module. The generated code for `make-void/db` in production:

```ts
// This is a STRING returned by the load() hook — not a real file
import { env } from "cloudflare:workers";

export async function sql(strings, ...values) {
  const query = strings.reduce((acc, str, i) =>
    acc + str + (i < values.length ? "?" : ""), "");
  return env.DB.prepare(query).bind(...values).all();
}

export const db = new Proxy({}, {
  get(_, prop) {
    return Reflect.get(env.DB, prop);
  }
});
```

The `db` export is a `Proxy` — when you call `db.prepare(...)`, the Proxy intercepts the `.prepare` property access and forwards it to `env.DB.prepare`. It's a transparent wrapper.

The `sql` export is a tagged template function. When you write:

```ts
await sql`SELECT * FROM users WHERE id = ${userId}`;
```

JavaScript calls `sql(["SELECT * FROM users WHERE id = ", ""], userId)`. The function builds a parameterized query string with `?` placeholders and binds the values.

The binding name (`DB`) comes from your `void.json` config:

```json
{ "bindings": { "d1": "DB" } }
```

The generator reads `config.bindings.d1` and interpolates it into the generated code string. This is the actual generator function:

```ts
export function generateDbModule(config: MakeVoidConfig, isDev: boolean): string {
  const bindingName = config.bindings?.d1 ?? "DB";

  if (isDev) {
    // ... return mock code (see below) ...
  }

  // Production: real cloudflare binding
  return `
import { env } from "cloudflare:workers";

export async function sql(strings, ...values) {
  const query = strings.reduce((acc, str, i) =>
    acc + str + (i < values.length ? "?" : ""), "");
  return env.${bindingName}.prepare(query).bind(...values).all();
}

export const db = new Proxy({}, {
  get(_, prop) {
    return Reflect.get(env.${bindingName}, prop);
  }
});
`;
}
```

Same pattern for KV, R2, and Queue — each wraps `env.BINDING_NAME` with a Proxy:

```ts
// make-void/kv -> wraps env.KV
export const kv = new Proxy({}, {
  get(_, prop) { return Reflect.get(env.KV, prop); }
});

// make-void/storage -> wraps env.BUCKET
export const storage = new Proxy({}, {
  get(_, prop) { return Reflect.get(env.BUCKET, prop); }
});

// make-void/queue -> wraps env.QUEUE
export const queue = new Proxy({}, {
  get(_, prop) { return Reflect.get(env.QUEUE, prop); }
});
```

### Dev: In-Memory Mocks

`cloudflare:workers` doesn't exist in Node.js, so in dev mode the generator returns mock implementations. For the DB module, it generates a mini SQL engine backed by `Map`s:

```ts
const tables = new Map();  // table name -> array of row objects

function getTable(name) {
  if (!tables.has(name)) tables.set(name, []);
  return tables.get(name);
}

function parseQuery(query, bindings) {
  // INSERT INTO users (name, email) VALUES (?, ?)
  // -> pushes { name: bindings[0], email: bindings[1], id: auto } into the Map
  const insertMatch = q.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES/i);
  if (insertMatch) { /* ... */ }

  // SELECT id, name FROM users WHERE id = ?
  // -> filters the Map, projects columns
  const selectMatch = q.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)/i);
  if (selectMatch) { /* ... handles count(*), WHERE, column projection ... */ }

  // DELETE FROM sessions WHERE ...
  // -> clears the Map
}
```

For KV, it's a simple `Map` with the same API:

```ts
const store = new Map();

export const kv = {
  async get(key, opts) { return store.get(key) ?? null; },
  async put(key, value, opts) { store.set(key, value); },
  async delete(key) { store.delete(key); },
  async list(opts) { /* ... */ },
};
```

The `isDev` flag comes from Vite's resolved config:

```ts
configResolved(cfg) {
  isDev = cfg.command === "serve";  // vite dev = true, vite build = false
}
```

---

## The Entry Point: `routes/index.ts` (Hono)

You write a single Hono app that owns all HTTP routing:

```ts
// example/routes/index.ts
import { Hono } from "hono";
import { sql } from "make-void/db";  // <- virtual module!

const app = new Hono();

app.get("/api/hello", async (c) => {
  await sql`INSERT INTO visits (path) VALUES (${"/api/hello"})`;
  const result = await sql`SELECT count(*) as count FROM visits`;
  return c.json({ message: "Hello!", visits: result.results[0].count });
});

app.get("/api/users/:id", async (c) => {
  const { id } = c.req.param();
  const result = await sql`SELECT id, name, email FROM users WHERE id = ${id}`;
  if (!result.results.length) {
    return c.json({ error: `User not found: ${id}` }, 404);
  }
  return c.json(result.results[0]);
});

export default app;
```

When Vite processes this file, it encounters `import { sql } from "make-void/db"`. Our plugin's `resolveId` intercepts it, `load` returns the generated code, and Vite stitches it all together. The user never sees the generated code.

---

## The Dev Server Middleware

In dev mode (`vite dev`), the Vite dev server serves static files. It has no idea what to do with `GET /api/hello`. We need a middleware that intercepts HTTP requests and passes them to the Hono app.

```ts
export function createDevServerPlugin(config: MakeVoidConfig): Plugin {
  return {
    name: "make-void:dev-server",

    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        // 1. Find the routes entry file
        const routesEntry = findRoutesEntry(root, config.routesEntry);
        if (!routesEntry) return next();

        // 2. Load the Hono app through Vite's SSR module loader
        //    This resolves ALL imports (including virtual modules) through our plugin
        const mod = await server.ssrLoadModule(path.resolve(root, routesEntry));
        const app = mod.default;

        // 3. Convert Node.js IncomingMessage -> Web standard Request
        const url = new URL(req.url, `http://${req.headers.host}`);
        const webRequest = new Request(url.toString(), {
          method: req.method,
          headers: /* ... convert Node headers to Headers object ... */,
          body: /* ... read body for POST/PUT ... */,
        });

        // 4. Call Hono's fetch handler
        const response = await app.fetch(webRequest);

        // 5. Distinguish "no route matched" from "handler returned 404"
        //    Hono's default 404 has no content-type header.
        //    A handler returning c.json({error}, 404) has content-type: application/json
        if (response.status === 404 && !response.headers.get("content-type")) {
          return next();  // Let Vite handle it (HMR, static files, etc.)
        }

        // 6. Convert Web Response -> Node.js response
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await response.arrayBuffer()));
      });
    },
  };
}
```

The key step is **`server.ssrLoadModule()`**. This is Vite's built-in SSR module runner. It loads the file through Vite's full transform pipeline, which means:

- TypeScript gets compiled
- `import { sql } from "make-void/db"` hits our `resolveId` -> `load` hooks
- The generated virtual module code is included
- HMR works -- edit the route file, changes apply immediately

---

## The Build Entry: Code Generation for Crons & Queues

Cloudflare Workers need a single entry point that exports `{ fetch, scheduled, queue }`. The `make-void/entry` virtual module generates this by scanning `crons/` and `queues/` directories:

### Scanner (`scanner.ts`)

```ts
export function findRoutesEntry(root, routesEntry?) {
  // Check configured path, then try routes.ts, routes/index.ts, etc.
  const candidates = ["routes.ts", "routes.js", "routes/index.ts", "routes/index.js"];
  for (const candidate of candidates) {
    if (existsSync(path.resolve(root, candidate))) return candidate;
  }
  return null;
}

export function scanCrons(root, cronsDir) {
  // Glob crons/**/*.ts, return { name, importPath } for each
  const files = fg.sync("**/*.{ts,js}", { cwd: absDir });
  return files.map(file => ({
    name: path.basename(file, path.extname(file)),  // "cleanup"
    importPath: "./" + path.posix.join(cronsDir, file),  // "./crons/cleanup.ts"
  }));
}

export function scanQueues(root, queuesDir) {
  // Same pattern as crons
}
```

### Code Generator (`codegen.ts`)

Given `routes/index.ts`, `crons/cleanup.ts`, and `queues/email.ts`, it generates:

```ts
// AUTO-GENERATED BY make-void
import app from "./routes/index.ts";

import * as cron_cleanup from "./crons/cleanup.ts";
import * as queue_email from "./queues/email.ts";

const cronMap = {
  [cron_cleanup.schedule]: cron_cleanup.default,
};

async function handleScheduled(controller, env, ctx) {
  const handler = cronMap[controller.cron];
  if (handler) await handler({ controller });
}

const queueMap = {
  [queue_email.queueName]: queue_email.default,
};

async function handleQueue(batch, env, ctx) {
  const handler = queueMap[batch.queue];
  if (handler) await handler({ batch });
}

export default {
  fetch: app.fetch,            // Hono handles all HTTP
  scheduled: handleScheduled,  // Cron dispatch
  queue: handleQueue,          // Queue dispatch
};
```

Each cron file exports its schedule string and a default handler:

```ts
// crons/cleanup.ts
export const schedule = "0 */6 * * *";
export default async function handler(ctx) {
  await sql`DELETE FROM sessions WHERE expires_at < datetime('now')`;
}
```

Each queue file exports its queue name and a default handler:

```ts
// queues/email.ts
export const queueName = "EMAIL_QUEUE";
export default async function handler(ctx) {
  for (const message of ctx.batch.messages) {
    // process message
    message.ack();
  }
}
```

The `cronMap` and `queueMap` are lookup tables that Cloudflare calls at runtime -- `controller.cron` matches the schedule string, `batch.queue` matches the queue name.

---

## The Config: `void.json`

```json
{
  "name": "example-app",
  "bindings": {
    "d1": "DB",
    "kv": "KV",
    "r2": "BUCKET",
    "queue": "EMAIL_QUEUE"
  },
  "routes": "routes/index.ts",
  "crons": "crons",
  "queues": "queues",
  "schema": "db/schema.ts"
}
```

This is loaded at plugin initialization:

```ts
function loadVoidJson(root) {
  const raw = JSON.parse(readFileSync("void.json", "utf-8"));
  return {
    routesEntry: raw.routes,     // "routes/index.ts"
    bindings: raw.bindings,      // { d1: "DB", kv: "KV", ... }
    cronsDir: raw.crons,         // "crons"
    queuesDir: raw.queues,       // "queues"
    schemaPath: raw.schema,      // "db/schema.ts"
  };
}
```

The binding names are injected into the generated code. If your `wrangler.toml` uses `binding = "MY_DATABASE"`, you'd set `"d1": "MY_DATABASE"` and the generated code becomes `env.MY_DATABASE.prepare(...)`.

---

## Type Safety: `virtual.d.ts`

TypeScript doesn't know what `"make-void/db"` exports since it's a virtual module. We ship ambient type declarations:

```ts
// packages/make-void/virtual.d.ts
declare module "make-void/db" {
  export function sql(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<D1Result<Record<string, unknown>>>;
  export const db: D1Database;
}

declare module "make-void/kv" {
  export const kv: KVNamespace;
}

declare module "make-void/storage" {
  export const storage: R2Bucket;
}

declare module "make-void/queue" {
  export const queue: Queue;
}
```

These reference `D1Database`, `KVNamespace`, `R2Bucket`, `Queue` -- globals from `@cloudflare/workers-types`. The package.json routes types resolution there:

```json
{
  "exports": {
    "./db": { "types": "./virtual.d.ts" },
    "./kv": { "types": "./virtual.d.ts" }
  }
}
```

The `@schema` alias is resolved by both Vite (via `resolve.alias`) and TypeScript (via `tsconfig.json` paths):

```ts
// Plugin injects:
config() {
  return {
    resolve: { alias: { "@schema": path.resolve(root, "db/schema.ts") } }
  };
}
```

```json
// tsconfig.json
{ "compilerOptions": { "paths": { "@schema": ["./db/schema.ts"] } } }
```

---

## The 4 Plugins

`makeVoid()` returns an array of 4 cooperating Vite plugins:

```ts
export function makeVoid(userConfig?: MakeVoidConfig): Plugin[] {
  const fileConfig = loadVoidJson(process.cwd());
  const config = { ...fileConfig, ...userConfig };

  return [
    createVirtualModulesPlugin(config),  // resolveId + load for make-void/*
    createDevServerPlugin(config),       // Dev middleware: Node req -> Hono -> Node res
    createScannerPlugin(config),         // Watches crons/queues dirs for changes
    createAliasPlugin(config),           // @schema -> db/schema.ts
  ];
}
```

| Plugin | Hook | What It Does |
|---|---|---|
| `make-void:virtual-modules` | `resolveId` + `load` | Intercepts `make-void/db` etc., returns generated JS |
| `make-void:dev-server` | `configureServer` | Middleware that pipes requests through Hono in dev |
| `make-void:scanner` | `configureServer` | Watches crons/queues/routes files for HMR |
| `make-void:alias` | `config` | Maps `@schema` to `db/schema.ts` |

---

## The Full Request Flow

### Dev Mode (`vite dev`)

```
Browser: GET /api/users/1
         |
         v
Vite Dev Server (Node.js)
         |
         v
make-void:dev-server middleware
         |
         +-- server.ssrLoadModule("routes/index.ts")
         |    +-- Vite compiles TypeScript
         |    +-- import "make-void/db" -> resolveId -> load -> generated mock code
         |    +-- Returns the Hono app with all virtual modules resolved
         |
         +-- Convert Node IncomingMessage -> Web Request
         |
         +-- app.fetch(webRequest)  <- Hono handles routing
         |
         +-- Handler runs: sql`SELECT ... WHERE id = ${id}`
         |    +-- sql is from the virtual module -> calls mock D1 -> queries in-memory Map
         |
         +-- Hono returns Response (200 JSON / 404 JSON / etc.)
         |
         +-- Convert Web Response -> Node response -> Browser
```

### Production (`vite build` + Cloudflare deploy)

```
Internet: GET /api/users/1
          |
          v
Cloudflare Worker (workerd runtime)
          |
          v
Generated entry module (make-void/entry)
          |
          +-- export default { fetch: app.fetch, scheduled, queue }
          |
          v
app.fetch(request)  <- Hono handles routing
          |
          +-- Handler runs: sql`SELECT ... WHERE id = ${id}`
          |    +-- sql is from virtual module -> import { env } from "cloudflare:workers"
          |       +-- env.DB.prepare("SELECT ... WHERE id = ?").bind(id).all()
          |           +-- Real D1 database query
          |
          +-- Returns Response to client
```

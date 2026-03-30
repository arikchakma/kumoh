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

This means you must pass `env` through every function call. If you use Hono, it's `c.env.DB`. make-void solves this by letting you write:

```ts
import { sql } from "make-void/db";
import { kv } from "make-void/kv";

// Just use them directly -- no env threading
const result = await sql`SELECT * FROM users`;
const cached = await kv.get("key");
```

**The question is: how? `"make-void/db"` isn't a real file. How does this import work?**

---

## The Key Insight: `import { env } from "cloudflare:workers"`

Since March 2025, Cloudflare Workers supports importing `env` directly as a module:

```ts
import { env } from "cloudflare:workers";
const result = await env.DB.prepare("SELECT * FROM users").all();
```

This is a workerd-native feature -- no AsyncLocalStorage, no request context wrapping. It works at module scope. This means you can create a plain file:

```ts
// lib/db.ts
import { env } from "cloudflare:workers";
export const db = env.DB;
```

And import it anywhere. make-void automates this pattern via a Vite plugin that generates these wrapper modules from your config.

---

## The Core Trick: Vite Virtual Modules

Vite plugins have two hooks that let you create modules that **don't exist on disk**:

1. **`resolveId(id)`** -- Vite calls this when it encounters an import. If your plugin returns a value, Vite uses that as the resolved module ID instead of looking for a file. By convention, virtual modules are prefixed with `\0` (null byte) to tell other plugins "this isn't a real file path."

2. **`load(id)`** -- Vite calls this to get the module's source code. Your plugin returns a **string of JavaScript** that Vite treats as if it were reading a file.

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

  return {
    name: "make-void:virtual-modules",
    enforce: "pre",  // Run BEFORE Vite's built-in resolver

    configResolved(cfg: ResolvedConfig) {
      root = cfg.root;
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
        return MODULE_GENERATORS[moduleId](config);
      }

      // ... handle make-void/entry ...
    },
  };
}
```

**Critical detail: `enforce: "pre"`**. Without this, Vite's built-in resolver runs first, sees `"make-void/db"`, checks the package.json `exports` map, finds only `"types"` (no `"import"`), and throws `"No known conditions for ./db specifier"`. With `enforce: "pre"`, our `resolveId` intercepts it before Vite ever checks the package.json.

---

## What Gets Generated

Each virtual module generator is a function that returns a **string of JavaScript**. The same code runs in both dev and production because both environments run inside workerd (the Cloudflare Workers runtime).

### `make-void/db` -- D1 Database

The generated code for `make-void/db`:

```ts
// This is a STRING returned by the load() hook -- not a real file
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

The `db` export is a `Proxy` -- when you call `db.prepare(...)`, the Proxy intercepts the `.prepare` property access and forwards it to `env.DB.prepare`. It's a transparent wrapper.

The `sql` export is a tagged template function. When you write:

```ts
await sql`SELECT * FROM users WHERE id = ${userId}`;
```

JavaScript calls `sql(["SELECT * FROM users WHERE id = ", ""], userId)`. The function builds a parameterized query string with `?` placeholders and binds the values.

The binding name (`DB`) comes from your `void.json` config:

```json
{ "bindings": { "d1": "DB" } }
```

The generator reads `config.bindings.d1` and interpolates it into the generated code string:

```ts
export function generateDbModule(config: MakeVoidConfig): string {
  const bindingName = config.bindings?.d1 ?? "DB";

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

### Other Bindings

Same pattern for KV, R2, and Queue -- each wraps `env.BINDING_NAME` with a Proxy:

```ts
// make-void/kv -> wraps env.KV
import { env } from "cloudflare:workers";
export const kv = new Proxy({}, {
  get(_, prop) { return Reflect.get(env.KV, prop); }
});

// make-void/storage -> wraps env.BUCKET
import { env } from "cloudflare:workers";
export const storage = new Proxy({}, {
  get(_, prop) { return Reflect.get(env.BUCKET, prop); }
});

// make-void/queue -> wraps env.QUEUE
import { env } from "cloudflare:workers";
export const queue = new Proxy({}, {
  get(_, prop) { return Reflect.get(env.QUEUE, prop); }
});
```

---

## No Mocks: Real Bindings in Dev via workerd

There are **no mock implementations**. Both dev and production run inside workerd (the Cloudflare Workers runtime), so `import { env } from "cloudflare:workers"` works natively everywhere.

In dev mode, `@cloudflare/vite-plugin` runs a local workerd instance via Miniflare. This provides real local implementations of D1 (backed by SQLite), KV (local file storage), R2, queues, etc. The data persists in the `.void/` directory.

This is why the virtual module generators have no `isDev` branching -- the same generated code works in both environments.

---

## Code as Infrastructure: `void.json`

There is no `wrangler.toml`. The `void.json` file is the single source of truth for your entire application:

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

The `makeVoid()` plugin reads this file and **generates the Cloudflare worker configuration programmatically**. It translates void.json into the config that `@cloudflare/vite-plugin` expects:

```ts
function buildWorkerConfig(raw: VoidJson) {
  const workerConfig: Record<string, unknown> = {
    name: raw.name ?? "make-void-app",
    main: "make-void/entry",  // virtual module as worker entry
    compatibility_date: "2025-03-14",
    compatibility_flags: ["nodejs_compat"],
  };

  const bindings = raw.bindings ?? {};

  if (bindings.d1) {
    workerConfig.d1_databases = [{
      binding: bindings.d1,
      database_name: `${raw.name ?? "make-void"}-db`,
      database_id: "local",
    }];
  }

  if (bindings.kv) {
    workerConfig.kv_namespaces = [{
      binding: bindings.kv,
      id: "local",
    }];
  }

  if (bindings.r2) {
    workerConfig.r2_buckets = [{
      binding: bindings.r2,
      bucket_name: `${raw.name ?? "make-void"}-bucket`,
    }];
  }

  if (bindings.queue) {
    workerConfig.queues = {
      producers: [{ binding: bindings.queue, queue: `${raw.name}-queue` }],
      consumers: [{ queue: `${raw.name}-queue` }],
    };
  }

  return workerConfig;
}
```

The `@cloudflare/vite-plugin` accepts this config object directly via its `config` option -- no file on disk needed. Local state (D1 databases, KV data, etc.) persists in `.void/` instead of the default `.wrangler/`.

---

## The Entry Point: `routes/index.ts` (Hono)

You write a single Hono app that owns all HTTP routing:

```ts
// routes/index.ts
import { Hono } from "hono";
import { db, sql } from "make-void/db";

const app = new Hono();

app.get("/api/setup", async (c) => {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT);
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT);
  `);
  return c.json({ ok: true });
});

app.get("/api/hello", async (c) => {
  await sql`INSERT INTO visits (path) VALUES (${"/api/hello"})`;
  const result = await sql`SELECT count(*) as count FROM visits`;
  return c.json({
    message: "Hello from make-void!",
    visits: result.results[0].count,
  });
});

app.get("/api/users/:id", async (c) => {
  const { id } = c.req.param();
  const result = await sql`SELECT id, name, email FROM users WHERE id = ${id}`;
  if (!result.results.length) {
    return c.json({ error: `User not found: ${id}` }, 404);
  }
  return c.json(result.results[0]);
});

app.post("/api/users", async (c) => {
  const body = await c.req.json();
  await sql`INSERT INTO users (name, email) VALUES (${body.name}, ${body.email})`;
  return c.json({ created: true }, 201);
});

export default app;
```

When Vite processes this file, it encounters `import { sql } from "make-void/db"`. Our plugin's `resolveId` intercepts it, `load` returns the generated code with `import { env } from "cloudflare:workers"`, and Vite stitches it all together. The user never sees the generated code.

Hono owns all routing, middleware, validation, etc. make-void doesn't touch HTTP handling at all.

---

## The Generated Worker Entry: `make-void/entry`

Cloudflare Workers need a single entry point that exports `{ fetch, scheduled, queue }`. The `make-void/entry` virtual module generates this by scanning `crons/` and `queues/` directories and importing the Hono app.

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

The key detail: `main: "make-void/entry"` is set in the worker config. The Cloudflare Vite plugin passes non-extension strings through to Vite's module resolver, where our `resolveId` hook intercepts it and `load` returns the generated entry code.

### Cron Convention

Each cron file exports its schedule string and a default handler:

```ts
// crons/cleanup.ts
export const schedule = "0 */6 * * *";
export default async function handler(ctx) {
  await sql`DELETE FROM sessions WHERE expires_at < datetime('now')`;
}
```

### Queue Convention

Each queue file exports its queue name and a default handler:

```ts
// queues/email.ts
export const queueName = "EMAIL_QUEUE";
export default async function handler(ctx) {
  for (const message of ctx.batch.messages) {
    message.ack();
  }
}
```

The `cronMap` and `queueMap` are lookup tables that Cloudflare calls at runtime -- `controller.cron` matches the schedule string, `batch.queue` matches the queue name.

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

These reference `D1Database`, `KVNamespace`, `R2Bucket`, `Queue` -- globals from `@cloudflare/workers-types`. The package.json routes type resolution there:

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
// Plugin injects at build time:
config() {
  return {
    resolve: { alias: { "@schema": path.resolve(root, "db/schema.ts") } }
  };
}
```

```json
// tsconfig.json (user adds this for editor support)
{ "compilerOptions": { "paths": { "@schema": ["./db/schema.ts"] } } }
```

---

## The Plugin Assembly

`makeVoid()` returns an array of plugins. It reads `void.json`, generates the worker config, and composes everything:

```ts
export function makeVoid(userConfig?: MakeVoidConfig): Plugin[] {
  const raw = loadVoidJson(process.cwd());
  const config = { ...voidJsonToConfig(raw), ...userConfig };
  const workerConfig = buildWorkerConfig(raw);

  return [
    // Virtual modules (enforce: "pre") -- resolves make-void/* imports
    createVirtualModulesPlugin(config),
    // @schema -> db/schema.ts alias
    createAliasPlugin(config),
    // @cloudflare/vite-plugin -- runs workerd with real local bindings
    ...cloudflare({ config: workerConfig, persistState: { path: ".void" } }),
  ];
}
```

| Plugin | Hook | What It Does |
|---|---|---|
| `make-void:virtual-modules` | `resolveId` + `load` | Intercepts `make-void/db` etc., returns generated JS wrapping `cloudflare:workers` env |
| `make-void:alias` | `config` | Maps `@schema` to `db/schema.ts` |
| `@cloudflare/vite-plugin` (multiple) | Various | Runs workerd/Miniflare with real D1, KV, R2, queues locally |

The user's `vite.config.ts` is just:

```ts
import { defineConfig } from "vite";
import { makeVoid } from "make-void";

export default defineConfig({
  plugins: [makeVoid()],
});
```

---

## The Full Request Flow

### Dev and Production (identical -- both run in workerd)

```
Request: GET /api/users/1
         |
         v
workerd (Cloudflare Workers runtime)
  - In dev: local workerd via @cloudflare/vite-plugin + Miniflare
  - In prod: Cloudflare's edge network
         |
         v
make-void/entry (virtual module, generated at build/dev time)
  - exports { fetch: app.fetch, scheduled, queue }
         |
         v
app.fetch(request)  <- Hono handles routing
         |
         v
Route handler runs
  - import { sql } from "make-void/db"
  - sql is from the virtual module:
      import { env } from "cloudflare:workers"
      env.DB.prepare("SELECT ... WHERE id = ?").bind("1").all()
         |
         v
D1 Database
  - In dev: local SQLite via Miniflare (persisted in .void/)
  - In prod: Cloudflare D1
         |
         v
Response returned to client
```

The same code, the same runtime, the same virtual modules -- dev and production are identical. No mocks, no shimming, no Node.js middleware layer in between.

---

## File Structure

```
my-app/
  void.json              # Single source of truth -- bindings, routes, crons, queues
  vite.config.ts         # Just: plugins: [makeVoid()]
  routes/
    index.ts             # Hono app -- owns all HTTP routing
  db/
    schema.ts            # Drizzle schema or table definitions
    migrations/          # SQL migration files
  crons/
    cleanup.ts           # export const schedule + export default handler
  queues/
    email.ts             # export const queueName + export default handler
  .void/                 # Local dev state (D1, KV, R2) -- gitignored
```

No `wrangler.toml`. No mock files. No middleware glue. void.json declares the intent, make-void generates the infrastructure.

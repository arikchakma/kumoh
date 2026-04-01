# How Kumoh Works: A Complete Deep Dive

## The Problem

In Cloudflare Workers, every binding (D1 database, KV store, R2 storage, queues) lives on the `env` object that gets passed to your `fetch` handler:

```ts
export default {
  async fetch(request, env, ctx) {
    // You have to thread `env` through everything
    const result = await env.DB.prepare('SELECT * FROM users').all();
    const cached = await env.KV.get('key');
  },
};
```

This means you must pass `env` through every function call. If you use Hono, it's `c.env.DB`. Kumoh solves this by letting you write:

```ts
import { db, eq, schema } from 'kumoh/db';

// Type-safe queries -- no env threading
const allUsers = await db.select().from(schema.users);
const user = await db.select().from(schema.users).where(eq(schema.users.id, 1));
```

**The question is: how? `"kumoh/db"` isn't a real file. How does this import work?**

---

## The Key Insight: `import { env } from "cloudflare:workers"`

Since March 2025, Cloudflare Workers supports importing `env` directly as a module:

```ts
import { env } from 'cloudflare:workers';
const result = await env.DB.prepare('SELECT * FROM users').all();
```

This is a workerd-native feature -- no AsyncLocalStorage, no request context wrapping. It works at module scope. Kumoh automates this pattern via a Vite plugin that generates wrapper modules from your config, powered by Drizzle ORM for type-safe database access.

---

## The Core Trick: Vite Virtual Modules

Vite plugins have two hooks that let you create modules that **don't exist on disk**:

1. `**resolveId(id)`\*\* -- Vite calls this when it encounters an import. If your plugin returns a value, Vite uses that as the resolved module ID instead of looking for a file. By convention, virtual modules are prefixed with `\0` (null byte) to tell other plugins "this isn't a real file path."
2. `**load(id)**` -- Vite calls this to get the module's source code. Your plugin returns a **string of JavaScript** that Vite treats as if it were reading a file.

So when your code says `import { db } from "kumoh/db"`:

```
User code:  import { db } from "kumoh/db"
                    |
                    v
resolveId("kumoh/db")  ->  returns "\0kumoh/db"
                    |
                    v
load("\0kumoh/db")  ->  returns GENERATED JavaScript string
                    |
                    v
Vite treats the returned string as the module's source code
```

Here's the actual implementation in `packages/kumoh/src/plugin.ts`:

```ts
const MODULE_GENERATORS: Record<string, ModuleGenerator> = {
  "kumoh/db": generateDbModule,
  "kumoh/kv": generateKvModule,
  "kumoh/storage": generateStorageModule,
  "kumoh/queue": generateQueueModule,
};

export function createVirtualModulesPlugin(config: MakeVoidConfig): Plugin {
  let root: string;

  return {
    name: "kumoh:virtual-modules",
    enforce: "pre", // Run BEFORE Vite's built-in resolver
a
    configResolved(cfg: ResolvedConfig) {
      root = cfg.root;
    },

    resolveId(id: string) {
      if (MODULE_GENERATORS[id]) return "\0" + id;
      if (id === "kumoh/entry") return "\0" + id;
      return null;
    },

    load(id: string) {
      if (!id.startsWith("\0kumoh/")) return null;

      const moduleId = id.slice(1);

      if (MODULE_GENERATORS[moduleId]) {
        return MODULE_GENERATORS[moduleId](config);
      }

      // ... handle kumoh/entry ...
    },
  };
}
```

**Critical detail: `enforce: "pre"`**. Without this, Vite's built-in resolver runs first, sees `"kumoh/db"`, checks the package.json `exports` map, and tries to resolve it as a real file. With `enforce: "pre"`, our `resolveId` intercepts it before Vite ever checks the package.json.

---

## What Gets Generated

Each virtual module generator is a function that returns a **string of JavaScript**. The same code runs in both dev and production because both environments run inside workerd (the Cloudflare Workers runtime).

### `kumoh/db` -- Drizzle ORM + D1 Database

The generated code for `kumoh/db`:

```ts
import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';

// Drizzle ORM instance pre-configured with D1
export const db = drizzle(env.DB);

// Raw D1 binding for escape-hatch operations (exec, batch)
export const d1 = env.DB;

// Re-export query operators
export {
  eq,
  ne,
  gt,
  gte,
  lt,
  lte,
  and,
  or,
  not,
  asc,
  desc,
  isNull,
  isNotNull,
  inArray,
  notInArray,
  between,
  like,
  sql,
  count,
  sum,
  avg,
  min,
  max,
} from 'drizzle-orm';

// Re-export schema builders
export {
  sqliteTable,
  text,
  integer,
  real,
  blob,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';

// Re-export user's schema as a namespace
import * as schema from '/absolute/path/to/app/db/schema.ts';
export { schema };
```

### Circular Import Resolution

The `kumoh/db` virtual module imports the user's schema, and the schema imports `sqliteTable` etc. from `kumoh/db`. This is a circular dependency that works because of how ES module bindings resolve:

1. Vite loads `kumoh/db` and sees `export { sqliteTable } from "drizzle-orm/sqlite-core"` — this re-export binding is established immediately (hoisted)
2. Vite encounters `import * as schema from "app/db/schema.ts"` — starts loading the schema
3. The schema does `import { sqliteTable } from "kumoh/db"` — circular, but `sqliteTable` is already a bound re-export from step 1
4. The schema runs, defines tables, exports them
5. Back in `kumoh/db`, `schema` is now the fully resolved namespace

The key: `sqliteTable`, `text`, `integer` are **re-exports from a third-party module**, not computed values. ES modules provide live bindings — the binding exists before the module finishes executing. If they were computed values (e.g. `const sqliteTable = createBuilder(...)`) the circular import would fail.

- **`db`** — Drizzle ORM instance wrapping the D1 binding: `db.select().from(schema.users)`
- **`d1`** — raw D1 binding for escape-hatch DDL: `d1.exec("CREATE TABLE ...")`
- **`schema`** — namespace containing all user-defined tables from `app/db/schema.ts`
- **Operators** (`eq`, `desc`, `count`, etc.) — re-exported so you import everything from one place
- **Schema builders** (`sqliteTable`, `text`, `integer`, etc.) — re-exported so the schema file also imports from `kumoh/db`

Binding names (`DB`, `KV`, `BUCKET`, `QUEUE`) are hardcoded internally — the user never configures them.

### Dual Resolution: Vite vs Node.js

`kumoh/db` needs to work in two contexts:

1. **Inside Vite** (dev server, build): The virtual module plugin intercepts the import and returns the full generated module with `db`, `d1`, operators, and schema builders.
2. **Outside Vite** (drizzle-kit CLI for migrations): Node.js resolves `kumoh/db` via the package.json `exports` map, which points to a real `dist/db.js` file that re-exports only the schema builders and operators (no `cloudflare:workers` dependency).

This is why the schema file works with both `vite dev` and `kumoh db generate`.

### Other Bindings

Same pattern for KV, R2, and Queue -- each wraps `env.BINDING_NAME` with a Proxy:

```ts
// kumoh/kv -> wraps env.KV
import { env } from 'cloudflare:workers';
export const kv = new Proxy(
  {},
  {
    get(_, prop) {
      return Reflect.get(env.KV, prop);
    },
  }
);

// kumoh/storage -> wraps env.BUCKET
import { env } from 'cloudflare:workers';
export const storage = new Proxy(
  {},
  {
    get(_, prop) {
      return Reflect.get(env.BUCKET, prop);
    },
  }
);

// kumoh/queue -> wraps env.QUEUE
import { env } from 'cloudflare:workers';
export const queue = new Proxy(
  {},
  {
    get(_, prop) {
      return Reflect.get(env.QUEUE, prop);
    },
  }
);
```

---

## No Mocks: Real Bindings in Dev via workerd

There are **no mock implementations**. Both dev and production run inside workerd (the Cloudflare Workers runtime), so `import { env } from "cloudflare:workers"` works natively everywhere.

In dev mode, `@cloudflare/vite-plugin` runs a local workerd instance via Miniflare. This provides real local implementations of D1 (backed by SQLite), KV (local file storage), R2, queues, etc. The data persists in the `.kumoh/` directory.

This is why the virtual module generators have no `isDev` branching -- the same generated code works in both environments.

---

## Code as Infrastructure: `kumoh.json`

There is no `wrangler.toml`. The `kumoh.json` file is the single source of truth for your entire application:

```json
{
  "name": "example-app",
  "routes": "app/entry.ts",
  "crons": "app/crons",
  "queues": "app/queues",
  "schema": "app/db/schema.ts"
}
```

After deploying, kumoh writes resource IDs back to the same file:

```json
{
  "name": "example-app",
  "routes": "app/entry.ts",
  "crons": "app/crons",
  "queues": "app/queues",
  "schema": "app/db/schema.ts",
  "deploy": {
    "d1": "0c6f6fdd-...",
    "kv": "2c17dc6e-...",
    "url": "https://example-app.workers.dev",
    "migrations": ["0000_overjoyed_meltdown"]
  }
}
```

The `kumoh()` plugin reads this file and **generates the Cloudflare worker configuration programmatically**:

```ts
function buildWorkerConfig(raw: VoidJson) {
  const workerConfig = {
    name: raw.name ?? 'kumoh-app',
    main: 'kumoh/entry', // virtual module as worker entry
    compatibility_date: '2025-03-14',
    compatibility_flags: ['nodejs_compat'],
  };

  if (bindings.d1) {
    workerConfig.d1_databases = [
      {
        binding: bindings.d1,
        database_name: `${raw.name}-db`,
        database_id: 'local',
      },
    ];
  }
  // ... same for KV, R2, queues
}
```

The `@cloudflare/vite-plugin` accepts this config object directly -- no file on disk needed. Local state (D1 databases, KV data, etc.) persists in `.kumoh/` instead of the default `.wrangler/`.

---

## Database: Drizzle ORM + D1

### Schema Definition

Your schema lives in `app/db/schema.ts` and imports builders from `kumoh/db`:

```ts
import { sqliteTable, text, integer } from 'kumoh/db';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull(),
});

export const visits = sqliteTable('visits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  path: text('path'),
});
```

The `kumoh/db` virtual module re-exports all tables as `schema`, so you access them via `schema.users`, `schema.visits` — no naming conflicts with local variables.

### Type-Safe Queries

```ts
import { db, eq, schema } from 'kumoh/db';

// Insert
await db
  .insert(schema.users)
  .values({ name: 'Alice', email: 'alice@test.com' });

// Select with filter
const user = await db.select().from(schema.users).where(eq(schema.users.id, 1));

// Aggregation
const count = await db.$count(schema.visits);
```

Schema types are auto-generated into `.kumoh/schema.d.ts` on every `vp dev` and `vp build` start, giving full autocomplete on `schema.users.id`, `schema.users.name`, etc.

### CLI: Database Management

The `void` CLI wraps `drizzle-kit` and auto-configures it from `kumoh.json`. No `drizzle.config.ts` needed.

```sh
kumoh db generate   # Generate SQL migration files from your schema
kumoh db migrate    # Push schema changes to local D1 database
kumoh db push       # Alias for migrate
kumoh db studio     # Open Drizzle Studio to browse your local database
```

Under the hood, each command:

1. Reads `kumoh.json` to find the schema path
2. Writes a temporary drizzle config (`.kumoh/drizzle.config.json`)
3. Shells out to `drizzle-kit` with the generated config
4. Cleans up the temp file

For `migrate`/`studio`, the CLI finds the local D1 SQLite file in `.kumoh/v3/d1/` (where Miniflare persists it) and passes it as `dbCredentials.url` to drizzle-kit.

### Deploy

`kumoh deploy` handles the full deployment in one command:

1. **Build** — runs `vp build` to produce `dist/index.js` + `dist/wrangler.json`
2. **Provision** — creates Cloudflare resources (D1, KV, R2, queues) if they don't exist
3. **Patch** — updates `dist/wrangler.json` with real resource IDs
4. **Migrate** — applies unapplied D1 migrations to the remote database
5. **Deploy** — runs `wrangler deploy`
6. **Save** — writes resource IDs and deployed URL back to `kumoh.json`

Resource IDs are persisted in the `deploy` key of `kumoh.json` so subsequent deploys are idempotent — existing resources are reused, only new migrations are applied.

---

## The Entry Point: `app/entry.ts` (Hono)

You write a single Hono app that owns all HTTP routing:

```ts
import { Hono } from 'hono';
import { db, eq, schema } from 'kumoh/db';

const app = new Hono()
  .get('/api/hello', async (c) => {
    await db.insert(schema.visits).values({ path: '/api/hello' });
    const count = await db.$count(schema.visits);
    return c.json({ message: 'Hello from Kumoh!', visits: count });
  })
  .get('/api/users/:id', async (c) => {
    const { id } = c.req.param();
    const result = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, Number(id)));
    if (!result.length) {
      return c.json({ error: `User not found: ${id}` }, 404);
    }
    return c.json(result[0]);
  })
  .post('/api/users', async (c) => {
    const body = await c.req.json();
    await db
      .insert(schema.users)
      .values({ name: body.name, email: body.email });
    return c.json({ created: true }, 201);
  });

export default app;
```

When Vite processes this file, it encounters `import { db, eq, count, d1 } from "kumoh/db"`. Our plugin's `resolveId` intercepts it, `load` returns the generated Drizzle-powered code, and Vite stitches it all together. The user never sees the generated code.

Hono owns all routing, middleware, validation, etc. Kumoh doesn't touch HTTP handling at all.

---

## The Generated Worker Entry: `kumoh/entry`

Cloudflare Workers need a single entry point that exports `{ fetch, scheduled, queue }`. The `kumoh/entry` virtual module generates this by scanning `crons/` and `queues/` directories and importing the Hono app.

Given `app/entry.ts`, `app/crons/cleanup.ts`, and `app/queues/email.ts`, it generates:

```ts
// AUTO-GENERATED BY kumoh
import app from '/absolute/path/to/app/entry.ts';

import * as cron_cleanup from '/absolute/path/to/app/crons/cleanup.ts';
import * as queue_email from '/absolute/path/to/app/queues/email.ts';

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
  fetch: app.fetch, // Hono handles all HTTP
  scheduled: handleScheduled, // Cron dispatch
  queue: handleQueue, // Queue dispatch
};
```

The key detail: `main: "kumoh/entry"` is set in the worker config. The Cloudflare Vite plugin passes non-extension strings through to Vite's module resolver, where our `resolveId` hook intercepts it and `load` returns the generated entry code. Absolute paths are used so Rollup can resolve imports from a virtual module (which has no location on disk).

### Cron Convention

Each cron file exports a `cron` schedule string and a default handler wrapped in `defineScheduled`. Each schedule must be unique — duplicate schedules are rejected at build time to ensure clean Cloudflare retry semantics (one handler per schedule, no partial failure ambiguity).

```ts
// app/crons/cleanup.ts
import { defineScheduled } from 'kumoh/cron';
import { db, schema, sql, lt } from 'kumoh/db';

export const cron = '0 */6 * * *';

export default defineScheduled(async (controller, env, ctx) => {
  await db
    .delete(schema.sessions)
    .where(lt(schema.sessions.expiresAt, sql`datetime('now')`));
});
```

The schedule string is extracted from the file at build time using the oxc AST parser (not regex) — parsing `export const cron = '...'` from the TypeScript source without executing it.

### Queue Convention

Each queue file exports a default handler wrapped in `defineQueue`. The queue name is derived from the filename (`email.ts` → `"email"`).

```ts
// app/queues/email.ts
import { defineQueue } from 'kumoh/queue';

export default defineQueue<EmailMessage>(async (batch, env, ctx) => {
  for (const message of batch.messages) {
    message.ack();
  }
});
```

---

## Type Safety: `virtual.d.ts`

TypeScript doesn't know what `"kumoh/db"` exports since it's a virtual module. We ship ambient type declarations:

```ts
declare module 'kumoh/db' {
  import type { DrizzleD1Database } from 'drizzle-orm/d1';

  export const db: DrizzleD1Database;
  export const d1: D1Database;

  // Query operators
  export {
    eq,
    ne,
    gt,
    gte,
    lt,
    lte,
    and,
    or,
    not,
    asc,
    desc,
    isNull,
    isNotNull,
    inArray,
    notInArray,
    between,
    like,
    sql,
    count,
    sum,
    avg,
    min,
    max,
  } from 'drizzle-orm';

  // Schema builders
  export {
    sqliteTable,
    text,
    integer,
    real,
    blob,
    primaryKey,
    uniqueIndex,
    index,
  } from 'drizzle-orm/sqlite-core';
}

declare module 'kumoh/kv' {
  export const kv: KVNamespace;
}

declare module 'kumoh/storage' {
  export const storage: R2Bucket;
}

declare module 'kumoh/queue' {
  export const queue: Queue;
}
```

The package.json `exports` map routes type resolution:

```json
{
  "exports": {
    "./db": { "types": "./virtual.d.ts", "default": "./dist/db.mjs" },
    "./kv": { "types": "./virtual.d.ts" },
    "./storage": { "types": "./virtual.d.ts" },
    "./queue": { "types": "./virtual.d.ts", "default": "./dist/queue.mjs" },
    "./cron": { "types": "./dist/cron.d.mts", "default": "./dist/cron.mjs" }
  }
}
```

### Auto-Generated Schema Types

The `virtual.d.ts` declares `schema` as a loose type. For full type safety (autocomplete on `schema.users.id`, etc.), the plugin auto-generates `.kumoh/schema.d.ts` on every `vp dev` and `vp build`:

```ts
// .kumoh/schema.d.ts (auto-generated)
import type * as s from '../app/db/schema';

declare module 'kumoh/db' {
  export const schema: typeof s;
}
```

This module augmentation overrides the loose type with the real schema types. The user's `tsconfig.json` includes it:

```json
{ "include": ["app", "*.ts", ".kumoh/schema.d.ts"] }
```

---

## The Plugin Assembly

`kumoh()` returns an array of plugins. It reads `kumoh.json`, generates the worker config, and composes everything:

```ts
export function kumoh(userConfig?: KumohConfig): Plugin[] {
  const root = process.cwd();
  const raw = readConfig(root);
  const config = { ...resolveConfig(raw, root), ...userConfig };
  const workerConfig = createWorkerConfig(raw, root);

  return [
    virtualModules(config),
    ...cloudflare({ config: workerConfig, persistState: { path: '.kumoh' } }),
    {
      name: 'kumoh:output',
      config: () => ({
        environments: { [envName]: { build: { outDir: 'dist' } } },
      }),
    },
  ];
}
```

| Plugin                    | Hook                 | What It Does                                                                                  |
| ------------------------- | -------------------- | --------------------------------------------------------------------------------------------- |
| `kumoh:virtual-modules`   | `resolveId` + `load` | Intercepts `kumoh/db` etc., returns generated JS with Drizzle + `cloudflare:workers` + schema |
|                           | `configResolved`     | Auto-generates `.kumoh/schema.d.ts` for TypeScript type safety                                |
| `@cloudflare/vite-plugin` | Various              | Runs workerd/Miniflare with real D1, KV, R2, queues locally                                   |
| `kumoh:output`            | `config`             | Flattens build output to `dist/`                                                              |

The user's `vite.config.ts` is just:

```ts
import { kumoh } from 'kumoh';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  plugins: [kumoh()],
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
kumoh/entry (virtual module, generated at build/dev time)
  - exports { fetch: app.fetch, scheduled, queue }
         |
         v
app.fetch(request)  <- Hono handles routing
         |
         v
Route handler runs
  - import { db, eq, schema } from "kumoh/db"
  - db is a Drizzle instance wrapping env.DB:
      db.select().from(schema.users).where(eq(schema.users.id, 1))
         |
         v
D1 Database
  - In dev: local SQLite via Miniflare (persisted in .kumoh/)
  - In prod: Cloudflare D1
         |
         v
Response returned to client
```

The same code, the same runtime, the same virtual modules -- dev and production are identical. No mocks, no shimming, no Node.js middleware layer in between.

---

## Developer Workflow

```sh
vp dev                # Start dev server (real D1 via workerd)
kumoh db generate     # Generate SQL migrations from schema
kumoh db migrate      # Push schema to local D1
kumoh db studio       # Browse local DB in Drizzle Studio
kumoh deploy          # Build, provision, migrate, and deploy to Cloudflare
```

---

## File Structure

```
my-app/
  kumoh.json             # Single source of truth -- routes, crons, queues, schema, deploy state
  vite.config.ts         # Just: plugins: [kumoh()]
  app/
    routes/
      index.ts           # Hono app -- owns all HTTP routing
    db/
      schema.ts          # Drizzle schema (imports builders from kumoh/db)
      migrations/        # Generated SQL migration files
    crons/
      cleanup.ts         # export const cron + defineScheduled handler
    queues/
      email.ts           # defineQueue handler (queue name = filename)
  dist/
    index.js             # Built worker bundle
    wrangler.json        # Auto-generated from kumoh.json
  .kumoh/
    schema.d.ts          # Auto-generated TypeScript types for schema
    v3/d1/...            # Local D1 SQLite (Miniflare state)
```

No `wrangler.toml`. No `drizzle.config.ts`. No mock files. No middleware glue. `kumoh.json` declares the intent, `kumoh deploy` provisions the infrastructure.

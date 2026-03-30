# How Void Works: A Complete Deep Dive

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

This means you must pass `env` through every function call. If you use Hono, it's `c.env.DB`. Void solves this by letting you write:

```ts
import { db, eq } from 'void/db';
import { users } from '@schema';

// Type-safe queries -- no env threading
const allUsers = await db.select().from(users);
const user = await db.select().from(users).where(eq(users.id, 1));
```

**The question is: how? `"void/db"` isn't a real file. How does this import work?**

---

## The Key Insight: `import { env } from "cloudflare:workers"`

Since March 2025, Cloudflare Workers supports importing `env` directly as a module:

```ts
import { env } from 'cloudflare:workers';
const result = await env.DB.prepare('SELECT * FROM users').all();
```

This is a workerd-native feature -- no AsyncLocalStorage, no request context wrapping. It works at module scope. Void automates this pattern via a Vite plugin that generates wrapper modules from your config, powered by Drizzle ORM for type-safe database access.

---

## The Core Trick: Vite Virtual Modules

Vite plugins have two hooks that let you create modules that **don't exist on disk**:

1. `**resolveId(id)`\*\* -- Vite calls this when it encounters an import. If your plugin returns a value, Vite uses that as the resolved module ID instead of looking for a file. By convention, virtual modules are prefixed with `\0` (null byte) to tell other plugins "this isn't a real file path."
2. `**load(id)**` -- Vite calls this to get the module's source code. Your plugin returns a **string of JavaScript** that Vite treats as if it were reading a file.

So when your code says `import { db } from "void/db"`:

```
User code:  import { db } from "void/db"
                    |
                    v
resolveId("void/db")  ->  returns "\0void/db"
                    |
                    v
load("\0void/db")  ->  returns GENERATED JavaScript string
                    |
                    v
Vite treats the returned string as the module's source code
```

Here's the actual implementation in `packages/void/src/plugin.ts`:

```ts
const MODULE_GENERATORS: Record<string, ModuleGenerator> = {
  "void/db": generateDbModule,
  "void/kv": generateKvModule,
  "void/storage": generateStorageModule,
  "void/queue": generateQueueModule,
};

export function createVirtualModulesPlugin(config: MakeVoidConfig): Plugin {
  let root: string;

  return {
    name: "void:virtual-modules",
    enforce: "pre", // Run BEFORE Vite's built-in resolver
a
    configResolved(cfg: ResolvedConfig) {
      root = cfg.root;
    },

    resolveId(id: string) {
      if (MODULE_GENERATORS[id]) return "\0" + id;
      if (id === "void/entry") return "\0" + id;
      return null;
    },

    load(id: string) {
      if (!id.startsWith("\0void/")) return null;

      const moduleId = id.slice(1);

      if (MODULE_GENERATORS[moduleId]) {
        return MODULE_GENERATORS[moduleId](config);
      }

      // ... handle void/entry ...
    },
  };
}
```

**Critical detail: `enforce: "pre"`**. Without this, Vite's built-in resolver runs first, sees `"void/db"`, checks the package.json `exports` map, and tries to resolve it as a real file. With `enforce: "pre"`, our `resolveId` intercepts it before Vite ever checks the package.json.

---

## What Gets Generated

Each virtual module generator is a function that returns a **string of JavaScript**. The same code runs in both dev and production because both environments run inside workerd (the Cloudflare Workers runtime).

### `void/db` -- Drizzle ORM + D1 Database

The generated code for `void/db`:

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
```

- `**db**` is a Drizzle ORM instance wrapping the D1 binding. You use it for type-safe queries: `db.select().from(users).where(eq(users.id, 1))`.
- `**d1**` is the raw D1 binding for escape-hatch operations like `d1.exec("CREATE TABLE ...")`.
- **Operators** (`eq`, `desc`, `count`, etc.) are re-exported so you import everything from one place.
- **Schema builders** (`sqliteTable`, `text`, `integer`, etc.) are re-exported so your schema file also imports from `void/db`.

The binding name (`DB`) comes from your `void.json` config:

```json
{ "bindings": { "d1": "DB" } }
```

The generator reads `config.bindings.d1` and interpolates it into the generated code string.

### Dual Resolution: Vite vs Node.js

`void/db` needs to work in two contexts:

1. **Inside Vite** (dev server, build): The virtual module plugin intercepts the import and returns the full generated module with `db`, `d1`, operators, and schema builders.
2. **Outside Vite** (drizzle-kit CLI for migrations): Node.js resolves `void/db` via the package.json `exports` map, which points to a real `dist/db.js` file that re-exports only the schema builders and operators (no `cloudflare:workers` dependency).

This is why the schema file works with both `vite dev` and `void db generate`.

### Other Bindings

Same pattern for KV, R2, and Queue -- each wraps `env.BINDING_NAME` with a Proxy:

```ts
// void/kv -> wraps env.KV
import { env } from 'cloudflare:workers';
export const kv = new Proxy(
  {},
  {
    get(_, prop) {
      return Reflect.get(env.KV, prop);
    },
  }
);

// void/storage -> wraps env.BUCKET
import { env } from 'cloudflare:workers';
export const storage = new Proxy(
  {},
  {
    get(_, prop) {
      return Reflect.get(env.BUCKET, prop);
    },
  }
);

// void/queue -> wraps env.QUEUE
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
  "routes": "app/routes/index.ts",
  "crons": "app/crons",
  "queues": "app/queues",
  "schema": "app/db/schema.ts"
}
```

The `makeVoid()` plugin reads this file and **generates the Cloudflare worker configuration programmatically**:

```ts
function buildWorkerConfig(raw: VoidJson) {
  const workerConfig = {
    name: raw.name ?? 'void-app',
    main: 'void/entry', // virtual module as worker entry
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

The `@cloudflare/vite-plugin` accepts this config object directly -- no file on disk needed. Local state (D1 databases, KV data, etc.) persists in `.void/` instead of the default `.wrangler/`.

---

## Database: Drizzle ORM + D1

### Schema Definition

Your schema lives in `app/db/schema.ts` and imports everything from `void/db`:

```ts
import { sqliteTable, text, integer } from 'void/db';

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

The `@schema` alias (configured by the plugin via `resolve.alias`) lets you import your tables anywhere:

```ts
import { users, visits } from '@schema';
```

### Type-Safe Queries

```ts
import { db, eq, count, d1 } from 'void/db';
import { users, visits } from '@schema';

// Setup (raw D1 for DDL)
await d1.exec(`CREATE TABLE IF NOT EXISTS users (...)`);

// Insert
await db.insert(users).values({ name: 'Alice', email: 'alice@test.com' });

// Select with filter
const user = await db.select().from(users).where(eq(users.id, 1));

// Aggregation
const result = await db.select({ count: count() }).from(visits);
```

### CLI: Database Management

The `void` CLI wraps `drizzle-kit` and auto-configures it from `void.json`. No `drizzle.config.ts` needed.

```sh
void db generate   # Generate SQL migration files from your schema
void db migrate    # Push schema changes to local D1 database
void db push       # Alias for migrate
void db studio     # Open Drizzle Studio to browse your local database
```

Under the hood, each command:

1. Reads `void.json` to find the schema path
2. Writes a temporary drizzle config (`.void-drizzle.config.json`)
3. Shells out to `drizzle-kit` with the generated config
4. Cleans up the temp file

For `migrate`/`studio`, the CLI finds the local D1 SQLite file in `.void/v3/d1/` (where Miniflare persists it) and passes it as `dbCredentials.url` to drizzle-kit.

```
$ void db --help
USAGE void db generate|migrate|push|studio

COMMANDS
  generate    Generate SQL migration files from your schema
   migrate    Push schema changes to local D1 database
      push    Push schema changes to local D1 database
    studio    Open Drizzle Studio to browse your local database
```

---

## The Entry Point: `app/routes/index.ts` (Hono)

You write a single Hono app that owns all HTTP routing:

```ts
import { Hono } from 'hono';
import { db, eq, count, d1 } from 'void/db';
import { users, visits } from '@schema';

const app = new Hono();

app.get('/api/setup', async (c) => {
  await d1.exec(`
    CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT);
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL);
  `);
  return c.json({ ok: true });
});

app.get('/api/hello', async (c) => {
  await db.insert(visits).values({ path: '/api/hello' });
  const result = await db.select({ count: count() }).from(visits);
  return c.json({
    message: 'Hello from Void!',
    visits: result[0].count,
  });
});

app.get('/api/users/:id', async (c) => {
  const { id } = c.req.param();
  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, Number(id)));
  if (!result.length) {
    return c.json({ error: `User not found: ${id}` }, 404);
  }
  return c.json(result[0]);
});

app.post('/api/users', async (c) => {
  const body = await c.req.json();
  await db.insert(users).values({ name: body.name, email: body.email });
  return c.json({ created: true }, 201);
});

export default app;
```

When Vite processes this file, it encounters `import { db, eq, count, d1 } from "void/db"`. Our plugin's `resolveId` intercepts it, `load` returns the generated Drizzle-powered code, and Vite stitches it all together. The user never sees the generated code.

Hono owns all routing, middleware, validation, etc. Void doesn't touch HTTP handling at all.

---

## The Generated Worker Entry: `void/entry`

Cloudflare Workers need a single entry point that exports `{ fetch, scheduled, queue }`. The `void/entry` virtual module generates this by scanning `crons/` and `queues/` directories and importing the Hono app.

Given `app/routes/index.ts`, `app/crons/cleanup.ts`, and `app/queues/email.ts`, it generates:

```ts
// AUTO-GENERATED BY void
import app from '/absolute/path/to/app/routes/index.ts';

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

The key detail: `main: "void/entry"` is set in the worker config. The Cloudflare Vite plugin passes non-extension strings through to Vite's module resolver, where our `resolveId` hook intercepts it and `load` returns the generated entry code. Absolute paths are used so Rollup can resolve imports from a virtual module (which has no location on disk).

### Cron Convention

Each cron file exports its schedule string and a default handler:

```ts
// app/crons/cleanup.ts
import { db, sql, lt } from 'void/db';
import { sessions } from '@schema';

export const schedule = '0 */6 * * *';

export default async function handler(ctx) {
  await db.delete(sessions).where(lt(sessions.expiresAt, sql`datetime('now')`));
}
```

### Queue Convention

Each queue file exports its queue name and a default handler:

```ts
// app/queues/email.ts
export const queueName = 'EMAIL_QUEUE';

export default async function handler(ctx) {
  for (const message of ctx.batch.messages) {
    message.ack();
  }
}
```

---

## Type Safety: `virtual.d.ts`

TypeScript doesn't know what `"void/db"` exports since it's a virtual module. We ship ambient type declarations:

```ts
declare module 'void/db' {
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

declare module 'void/kv' {
  export const kv: KVNamespace;
}

declare module 'void/storage' {
  export const storage: R2Bucket;
}

declare module 'void/queue' {
  export const queue: Queue;
}
```

The package.json `exports` map routes type resolution:

```json
{
  "exports": {
    "./db": { "types": "./virtual.d.ts", "default": "./dist/db.js" },
    "./kv": { "types": "./virtual.d.ts" },
    "./storage": { "types": "./virtual.d.ts" },
    "./queue": { "types": "./virtual.d.ts" }
  }
}
```

The `@schema` alias is resolved by both Vite (via `resolve.alias`) and TypeScript (via `tsconfig.json` paths):

```json
{ "compilerOptions": { "paths": { "@schema": ["./app/db/schema.ts"] } } }
```

---

## The Plugin Assembly

`makeVoid()` returns an array of plugins. It reads `void.json`, generates the worker config, and composes everything:

```ts
export function makeVoid(userConfig?: MakeVoidConfig): Plugin[] {
  const root = process.cwd();
  const raw = loadVoidJson(root);
  const config = { ...voidJsonToConfig(raw, root), ...userConfig };
  const workerConfig = buildWorkerConfig(raw);

  return [
    createVirtualModulesPlugin(config),
    createAliasPlugin(config),
    ...cloudflare({ config: workerConfig, persistState: { path: '.void' } }),
    // Flatten build output to dist/ instead of dist/<worker_name>/
    {
      name: 'void:output',
      config: () => ({
        environments: { [envName]: { build: { outDir: 'dist' } } },
      }),
    },
  ];
}
```

| Plugin                    | Hook                 | What It Does                                                                        |
| ------------------------- | -------------------- | ----------------------------------------------------------------------------------- |
| `void:virtual-modules`    | `resolveId` + `load` | Intercepts `void/db` etc., returns generated JS with Drizzle + `cloudflare:workers` |
| `void:alias`              | `config`             | Maps `@schema` to `app/db/schema.ts`                                                |
| `@cloudflare/vite-plugin` | Various              | Runs workerd/Miniflare with real D1, KV, R2, queues locally                         |
| `void:output`             | `config`             | Flattens build output to `dist/`                                                    |

The user's `vite.config.ts` is just:

```ts
import { defineConfig } from 'vite';
import { makeVoid } from 'void';

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
void/entry (virtual module, generated at build/dev time)
  - exports { fetch: app.fetch, scheduled, queue }
         |
         v
app.fetch(request)  <- Hono handles routing
         |
         v
Route handler runs
  - import { db, eq } from "void/db"
  - db is a Drizzle instance wrapping env.DB:
      db.select().from(users).where(eq(users.id, 1))
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

## Developer Workflow

```sh
pnpm dev              # Start dev server (real D1 via workerd)
pnpm db:generate      # Generate SQL migrations from schema
pnpm db:migrate       # Push schema to local D1
pnpm db:studio        # Browse local DB in Drizzle Studio
pnpm build            # Build for production
```

---

## File Structure

```
my-app/
  void.json              # Single source of truth -- bindings, routes, crons, queues
  vite.config.ts         # Just: plugins: [makeVoid()]
  app/
    routes/
      index.ts           # Hono app -- owns all HTTP routing
    db/
      schema.ts          # Drizzle schema (imports from void/db)
      migrations/        # Generated SQL migration files
    crons/
      cleanup.ts         # export const schedule + export default handler
    queues/
      email.ts           # export const queueName + export default handler
  dist/
    index.js             # Built worker bundle
    wrangler.json        # Auto-generated from void.json
  .void/                 # Local dev state (D1, KV, R2) -- gitignored
```

No `wrangler.toml`. No `drizzle.config.ts`. No mock files. No middleware glue. `void.json` declares the intent, Void generates the infrastructure.

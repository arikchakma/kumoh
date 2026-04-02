# How Kumoh Works

## Overview

Kumoh is a Cloudflare Workers framework powered by Hono + Drizzle. It provides:

- **Virtual modules** (`kumoh/db`, `kumoh/kv`, `kumoh/storage`, `kumoh/queue`, `kumoh/ai`, `kumoh/email`) that wrap Cloudflare bindings
- **File-based API routing** (`app/routes/`) with file-based conventions
- **Convention-based crons and queues** (`app/crons/`, `app/queues/`)
- **Type-safe handlers** via `defineHandler`, `defineApp`, `defineMiddleware`, `defineScheduled`, `defineQueue`
- **Runtime wiring** via `defineWorker()` — no string codegen for app logic

---

## The Key Insight: `import { env } from "cloudflare:workers"`

Since March 2025, Cloudflare Workers supports importing `env` directly as a module. Kumoh wraps this into clean imports via Vite virtual modules:

```ts
import { db, eq, schema } from 'kumoh/db';
const user = await db.select().from(schema.users).where(eq(schema.users.id, 1));
```

No `env` threading. No request context. The virtual module generates code that uses `cloudflare:workers` under the hood.

---

## File Structure

```
my-app/
  kumoh.json               # Config — name, crons, queues, schema, deploy state
  vite.config.ts            # Just: plugins: [kumoh()]

  app/
    server.ts               # defineApp — global middleware setup
    routes/                  # File-based API routes
      api/
        hello.ts            # GET /api/hello
        users/
          index.ts           # GET/POST /api/users
          $id.ts             # GET /api/users/:id
          _middleware.ts      # Middleware for /api/users/*
    crons/
      heartbeat.ts          # export const cron + defineScheduled
    queues/
      email.ts              # defineQueue handler
    db/
      schema.ts             # Drizzle schema
      migrations/            # Generated SQL migrations

  .kumoh/
    kumoh.d.ts              # Auto-generated types (schema, queue, bindings)
```

---

## File-Based Routing

Routes live in `app/routes/`. Each file becomes an API endpoint based on its path.

### Route File Format

```ts
// app/routes/api/users/$id.ts
import { defineHandler } from 'kumoh/app';
import { db, eq, schema } from 'kumoh/db';

export const GET = defineHandler(async (c) => {
  const { id } = c.req.param();
  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, Number(id)));
  return c.json(user[0]);
});

export const DELETE = defineHandler(async (c) => {
  // ...
});
```

### Path Conversion

| Filename           | Route             |
| ------------------ | ----------------- |
| `index.ts`         | `/`               |
| `hello.ts`         | `/hello`          |
| `users/index.ts`   | `/users`          |
| `users/$id.ts`     | `/users/:id`      |
| `docs/$...slug.ts` | `/docs/:slug{.+}` |

`$param` → `:param` dynamic segment. `$...param` → catch-all. Files starting with `_` are excluded.

### Handler Styles

1. **Named exports** (primary): `export const GET = defineHandler((c) => ...)`
2. **Default function**: `export default (c) => ...` → treated as GET
3. **Default array**: `export default [middleware, handler]` → treated as GET with middleware chain
4. **Default Hono sub-app**: `export default new Hono()...` → mounted at path

### Server Entry (`app/server.ts`)

Global middleware configuration via `defineApp`:

```ts
import { defineApp } from 'kumoh/app';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';

export default defineApp((app) => {
  app.use(logger());
  app.use(cors());
});
```

### Middleware (`_middleware.ts`)

Per-directory middleware with inheritance. If `/api/users/` has no `_middleware.ts`, the nearest ancestor's middleware is applied.

```ts
// app/routes/api/users/_middleware.ts
import { defineMiddleware } from 'kumoh/app';

export default defineMiddleware(async (c, next) => {
  const token = c.req.header('Authorization');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  await next();
});
```

Middleware deduplication via WeakMap/WeakSet prevents double execution when inherited by child directories .

---

## Runtime Wiring: `defineWorker()`

Unlike traditional codegen frameworks that generate entire modules as strings, kumoh uses a **runtime function** that receives pre-imported modules and wires everything up with real, type-safe code.

### What the Virtual Entry Generates

The `kumoh/entry` virtual module generates **minimal code** — just imports and a single function call:

```ts
import { defineWorker } from 'kumoh/server';
import init from '../../app/server.ts';
import * as route_0 from '../../app/routes/api/hello.ts';
import * as route_1 from '../../app/routes/api/users/index.ts';
import * as route_2 from '../../app/routes/api/users/$id.ts';
import cron_heartbeat, {
  cron as cron_heartbeat_schedule,
} from '../../app/crons/heartbeat.ts';
import queue_email from '../../app/queues/email.ts';

export default defineWorker({
  init,
  routes: {
    'api/hello.ts': route_0,
    'api/users/index.ts': route_1,
    'api/users/$id.ts': route_2,
  },
  crons: {
    heartbeat: { handler: cron_heartbeat, schedule: cron_heartbeat_schedule },
  },
  queues: {
    'example-app-email': queue_email,
  },
});
```

### What `defineWorker()` Does at Runtime

`defineWorker()` in `src/server/create-app.ts` does ALL the wiring — no string generation:

1. **Creates a fresh Hono app**: `const app = new Hono()`
2. **Calls the init function**: `init(app)` — user's middleware from `server.ts`
3. **Groups routes by directory**: `{ 'api': { 'hello.ts': mod }, 'api/users': { 'index.ts': mod } }`
4. **Sorts directories shallow→deep**: Parent routes registered before children
5. **For each directory, creates a sub-app**:
   - Applies middleware (with inheritance from parent dirs)
   - Wraps middleware with WeakMap deduplication
   - Registers route handlers (`sub.on(method, path, ...handlers)`)
   - Mounts sub-app on main app (`app.route(mountPath, sub)`)
6. **Wires cron dispatch**: Maps schedule strings to handlers
7. **Wires queue dispatch**: Maps queue names to handlers
8. **Returns `{ fetch, scheduled, queue }`**: The Cloudflare Worker export

Per-directory sub-apps avoid Hono's "matcher already built" error.

---

## Vite Virtual Modules

When your code says `import { db } from "kumoh/db"`, the plugin intercepts it:

```
import { db } from "kumoh/db"
  → resolveId("kumoh/db") → "\0kumoh/db"
  → load("\0kumoh/db") → generated JavaScript
```

`enforce: "pre"` ensures the plugin runs before Vite's resolver checks `package.json` exports.

### Virtual Module List

| Module          | What it provides                                             |
| --------------- | ------------------------------------------------------------ |
| `kumoh/db`      | `db` (Drizzle D1), `d1` (raw), `schema`, operators, builders |
| `kumoh/kv`      | `kv` (KVNamespace proxy)                                     |
| `kumoh/storage` | `storage` (R2Bucket proxy)                                   |
| `kumoh/queue`   | `queue` (per-queue proxies)                                  |
| `kumoh/ai`      | `ai` (Ai binding proxy)                                      |
| `kumoh/email`   | `email` (SendEmail proxy)                                    |
| `kumoh/app`     | `defineApp`, `defineHandler`, `defineMiddleware`             |
| `kumoh/entry`   | Generated worker entry (imports + `defineWorker()` call)     |

---

## Type Safety

### Auto-Generated Types (`.kumoh/kumoh.d.ts`)

The plugin generates TypeScript declarations on every dev start:

```ts
// Schema types
declare module 'kumoh/db' {
  export const schema: typeof import('../app/db/schema');
}

// Queue types (message type extraction)
declare module 'kumoh/queue' {
  export const queue: {
    email: Queue<ExtractQueueMessage<typeof handler_email>>;
  };
}

// Binding types for defineHandler/defineMiddleware/defineApp
declare module 'kumoh/app' {
  type KumohBindings = { DB: D1Database; KV: KVNamespace; BUCKET: R2Bucket; AI: Ai; EMAIL: SendEmail; };
  type KumohEnv = { Bindings: KumohBindings };

  export function defineHandler(
    handler: (c: Context<KumohEnv>) => Response | Promise<Response>
  ): ...;
  export function defineApp(
    init: (app: Hono<KumohEnv>) => void
  ): ...;
}
```

This gives full autocomplete on `c.env.DB`, `c.env.KV`, `c.req.json()`, etc.

---

## Crons and Queues

### Cron Convention

```ts
// app/crons/heartbeat.ts
import { defineScheduled } from 'kumoh/cron';

export const cron = '0 */6 * * *';

export default defineScheduled(async (controller, env, ctx) => {
  console.log(`Cron fired at ${controller.scheduledTime}`);
});
```

Schedule strings are extracted at build time via oxc AST parser. Duplicate schedules are rejected.

### Queue Convention

```ts
// app/queues/email.ts
import { defineQueue } from 'kumoh/queue';

interface EmailMessage {
  to: string;
  subject: string;
}

export default defineQueue<EmailMessage>(async (batch, env, ctx) => {
  for (const msg of batch.messages) {
    console.log(msg.body.to);
    msg.ack();
  }
});
```

Queue name is derived from filename. Each file becomes a separate Cloudflare Queue with typed producer.

---

## Package Structure

```
packages/kumoh/src/
  index.ts                    # Main plugin: kumoh() function
  constants.ts                # Virtual module IDs
  types.ts                    # Shared types

  server/
    create-app.ts             # defineWorker() — runtime wiring
    codegen.ts                # Minimal entry generation (imports + defineWorker call)
    scanner.ts                # File scanning (routes, crons, queues)
    plugin.ts                 # Vite plugin (virtual modules, types, watcher)
    utils/
      file.ts                 # Path conversion, directory grouping, middleware inheritance

  factory/
    index.ts                  # Re-exports all define* functions
    app.ts                    # defineApp + defineHandler + defineMiddleware
    route.ts                  # defineHandler (standalone)
    middleware.ts             # defineMiddleware (standalone)
    scheduled.ts              # defineScheduled
    queue.ts                  # defineQueue

  virtual/                    # Virtual module code generators
    ai.ts, db.ts, email.ts, kv.ts, queue.ts, storage.ts

  cli.ts                      # CLI entry
  cli/                        # CLI commands (init, deploy, destroy, status, db)
  db.ts                       # DB re-export for drizzle-kit
```

---

## Config: `kumoh.json`

```json
{
  "name": "example-app",
  "crons": "app/crons",
  "queues": "app/queues",
  "schema": "app/db/schema.ts",
  "deploy": {
    "d1": "0c6f6fdd-...",
    "kv": "2c17dc6e-...",
    "url": "https://example-app.workers.dev",
    "migrations": ["0000_small_thunderbolts"]
  }
}
```

No `wrangler.toml`. No `drizzle.config.ts`. `kumoh.json` is the single source of truth.

---

## Developer Workflow

```sh
kumoh init                # Scaffold a new project
vp dev                    # Start dev server (real workerd + D1)
kumoh db generate         # Generate SQL migrations from schema
kumoh db migrate          # Push schema to local D1
kumoh db studio           # Browse local DB
kumoh deploy              # Build, provision, migrate, deploy to Cloudflare
kumoh status              # Show deployment info
kumoh destroy             # Tear down all resources
```

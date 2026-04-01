# kumoh

A type-safe Cloudflare Workers framework powered by Hono + Drizzle.

File-based routing, auto-provisioned infrastructure, and end-to-end typed RPC — all from a single config file.

## Quick Start

```sh
kumoh init
pnpm install
kumoh db generate
vp dev
```

## Project Structure

```
app/
  server.ts              # Global middleware (defineApp)
  routes/
    api/
      hello.ts           # GET /api/hello
      users/
        index.ts         # GET/POST /api/users
        $id.ts           # GET /api/users/:id
      _middleware.ts      # Middleware for /api/*
  crons/
    heartbeat.ts         # Scheduled task
  queues/
    email.ts             # Queue consumer
  db/
    schema.ts            # Drizzle schema
    migrations/          # Auto-generated
kumoh.json               # Single config file
```

## Configuration

```json
{
  "$schema": "./node_modules/kumoh/kumoh.schema.json",
  "name": "my-app",
  "schema": "app/db/schema.ts"
}
```

All fields except `name` are optional with sensible defaults:

| Field    | Default            | Description                                         |
| -------- | ------------------ | --------------------------------------------------- |
| `name`   | required           | App name. Used for worker, D1, KV, R2, queue naming |
| `server` | `app/server.ts`    | Server entry (defineApp)                            |
| `routes` | `app/routes`       | File-based routes directory                         |
| `crons`  | `app/crons`        | Cron handlers directory                             |
| `queues` | `app/queues`       | Queue consumers directory                           |
| `schema` | `app/db/schema.ts` | Drizzle schema path. Omit to skip D1                |

The `deploy` key is auto-managed — don't edit it manually.

## Routes

### File-Based Routing

Every file in `app/routes/` becomes an API endpoint:

| File               | Route             |
| ------------------ | ----------------- |
| `index.ts`         | `/`               |
| `hello.ts`         | `/hello`          |
| `users/index.ts`   | `/users`          |
| `users/$id.ts`     | `/users/:id`      |
| `docs/$...slug.ts` | `/docs/:slug{.+}` |

`$param` maps to `:param` (dynamic segment). `$...param` maps to catch-all. Files starting with `_` are excluded from routing.

### Handler Patterns

**Named method exports** (recommended):

```ts
import { defineHandler } from 'kumoh/app';
import { db, schema } from 'kumoh/db';

export const GET = defineHandler(async (c) => {
  const users = await db.select().from(schema.users);
  return c.json(users);
});

export const POST = defineHandler(async (c) => {
  const body = await c.req.json();
  await db.insert(schema.users).values(body);
  return c.json({ created: true }, 201);
});
```

Supported methods: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`.

**Hono sub-app** (for complex routes):

```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';

export default new Hono()
  .get('/', (c) => c.json({ status: 'ok' }))
  .post('/', zValidator('json', schema), (c) => {
    const data = c.req.valid('json');
    return c.json(data, 201);
  });
```

**Default function** (GET shorthand):

```ts
export default (c) => c.json({ hello: 'world' });
```

**Handler array** (GET with middleware chain):

```ts
export default [authMiddleware, (c) => c.json({ data: [] })];
```

### Server Entry

`app/server.ts` configures global middleware:

```ts
import { defineApp } from 'kumoh/app';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';

export default defineApp((app) => {
  app.use(logger());
  app.use(cors());
});
```

### Middleware

Create `_middleware.ts` in any route directory:

```ts
import { defineMiddleware } from 'kumoh/app';

export default defineMiddleware(async (c, next) => {
  const token = c.req.header('Authorization');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  await next();
});
```

Middleware inherits down the directory tree. If `/api/users/` has no `_middleware.ts`, it inherits from `/api/_middleware.ts`. Deduplication prevents double execution.

## Database

### Schema

```ts
// app/db/schema.ts
import { sqliteTable, text, integer } from 'kumoh/db';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull(),
});
```

### Queries

```ts
import { db, schema, eq } from 'kumoh/db';

// Select
const users = await db.select().from(schema.users);
const user = await db.select().from(schema.users).where(eq(schema.users.id, 1));

// Insert
await db
  .insert(schema.users)
  .values({ name: 'Alice', email: 'alice@test.com' });

// Update
await db
  .update(schema.users)
  .set({ name: 'Bob' })
  .where(eq(schema.users.id, 1));

// Delete
await db.delete(schema.users).where(eq(schema.users.id, 1));

// Count
const count = await db.$count(schema.users);
```

Available operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `and`, `or`, `not`, `asc`, `desc`, `isNull`, `isNotNull`, `inArray`, `notInArray`, `between`, `like`, `sql`, `count`, `sum`, `avg`, `min`, `max`.

### Migrations

```sh
kumoh db generate    # Generate SQL from schema changes
kumoh db migrate     # Apply to local D1
kumoh db studio      # Browse local DB in Drizzle Studio
```

## Virtual Modules

Import Cloudflare bindings as clean modules — no `env` threading:

```ts
import { db, schema, eq } from 'kumoh/db'; // D1 + Drizzle ORM
import { kv } from 'kumoh/kv'; // KV Namespace
import { storage } from 'kumoh/storage'; // R2 Bucket
import { queue } from 'kumoh/queue'; // Queue producers
import { ai } from 'kumoh/ai'; // Workers AI
import { email } from 'kumoh/email'; // Email routing
import { defineApp, defineHandler, defineMiddleware } from 'kumoh/app';
```

### KV

```ts
import { kv } from 'kumoh/kv';

await kv.put('key', 'value');
const val = await kv.get('key');
await kv.delete('key');
```

### R2 Storage

```ts
import { storage } from 'kumoh/storage';

await storage.put('file.txt', 'content');
const obj = await storage.get('file.txt');
await storage.delete('file.txt');
```

### AI

```ts
import { ai } from 'kumoh/ai';

const result = await ai.run('@cf/meta/llama-3-8b-instruct', {
  prompt: 'Tell me a joke',
});
```

## Crons

Each file in `app/crons/` is a scheduled handler:

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

- `export const cron` is required — a 5-field cron expression
- Each schedule must have exactly one handler (duplicates rejected at build time)
- Schedule string extracted via AST parser (no runtime evaluation)

## Queues

Each file in `app/queues/` is a queue consumer. The filename determines the queue name:

```ts
// app/queues/email.ts → queue: "my-app-email", binding: QUEUE_EMAIL
import { defineQueue } from 'kumoh/queue';

interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export default defineQueue<EmailMessage>(async (batch, env, ctx) => {
  for (const msg of batch.messages) {
    console.log(`Sending to ${msg.body.to}`);
    msg.ack();
  }
});
```

### Producing Messages

```ts
import { queue } from 'kumoh/queue';

// Type-safe — message type inferred from the consumer
await queue.email.send({
  to: 'user@example.com',
  subject: 'Hello',
  body: 'Welcome!',
});
```

Queue naming from filenames:

- `email.ts` → `queue.email`, binding `QUEUE_EMAIL`
- `email-sending.ts` → `queue.emailSending`, binding `QUEUE_EMAIL_SENDING`

## RPC (Type-Safe API Client)

Kumoh auto-generates typed RPC types from your routes. Use them with Hono's `hc` client for end-to-end type safety.

### Setup

Create a client package:

```ts
// packages/client/src/index.ts
import type { AppType } from 'api/rpc';
import { hc } from 'hono/client';

export type { InferRequestType, InferResponseType } from 'hono/client';

const client = hc<AppType>('');
export type Client = typeof client;

export const hcWithType = (...args: Parameters<typeof hc>): Client =>
  hc<AppType>(...args);
```

The API's `package.json` exports the generated types:

```json
{
  "exports": {
    "./rpc": "./.kumoh/rpc.ts"
  }
}
```

### Frontend Usage

```ts
import { hcWithType } from '@my-app/client';

const client = hcWithType('http://localhost:5173');

// Fully typed — response shape inferred from handler
const res = await client.api.hello.$get();
const data = await res.json();
// data: { message: string; visits: number }

// Dynamic params typed
const userRes = await client.api.users[':id'].$get({
  param: { id: '123' },
});
const user = await userRes.json();
// user: { id: number; name: string; email: string }

// POST with body
const createRes = await client.api.users.$post({
  json: { name: 'Alice', email: 'alice@test.com' },
});
```

### How It Works

The plugin generates `.kumoh/rpc.ts` — a Hono chain that mirrors your file-based routes:

```ts
// .kumoh/rpc.ts (auto-generated)
import { Hono } from 'hono';
import type * as _schema from '../app/db/schema';
declare module 'kumoh/db' {
  export const schema: typeof _schema;
}
import { GET as _h0 } from '../app/routes/api/hello';
import { GET as _h1 } from '../app/routes/api/users/index';
import { POST as _h2 } from '../app/routes/api/users/index';
import { GET as _h3 } from '../app/routes/api/users/$id';

const _app = new Hono()
  .get('/api/hello', _h0)
  .get('/api/users', _h1)
  .post('/api/users', _h2)
  .get('/api/users/:id', _h3);

export type AppType = typeof _app;
```

Hono's type system naturally preserves all response types through the method chain. No manual type annotations needed.

## CLI

```sh
kumoh init              # Scaffold a new project
kumoh db generate       # Generate SQL migrations
kumoh db migrate        # Apply migrations to local D1
kumoh db push           # Alias for migrate
kumoh db studio         # Open Drizzle Studio
kumoh deploy            # Build + provision + migrate + deploy
kumoh status            # Show deployment info
kumoh destroy           # Tear down all resources
```

### Deploy

`kumoh deploy` handles everything in one command:

1. Builds the worker (`vp build`)
2. Provisions Cloudflare resources (D1, KV, R2, queues) — creates if needed, reuses if exists
3. Patches `wrangler.json` with real resource IDs
4. Applies pending D1 migrations to remote
5. Deploys worker to Cloudflare
6. Saves deploy state (URL, IDs) to `kumoh.json`

## Type Generation

Kumoh auto-generates two type files in `.kumoh/` on every dev start and file change:

### `.kumoh/kumoh.d.ts`

- `kumoh/db` schema augmentation — typed `schema` object
- `kumoh/queue` type augmentation — typed queue producers with message inference
- `kumoh/app` augmentation — `defineHandler`/`defineApp`/`defineMiddleware` with `KumohEnv` bindings (DB, KV, BUCKET, AI, EMAIL, QUEUE\_\*)

### `.kumoh/rpc.ts`

- Hono chain mirroring all file-based routes
- `AppType` for RPC client usage
- Self-contained schema augmentation (no external `.d.ts` dependencies)
- Supports both `defineHandler` exports and Hono sub-app exports

Both files regenerate automatically when route/cron/queue files are added or removed.

## Vite Config

```ts
import { kumoh } from 'kumoh';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  plugins: [kumoh()],
});
```

That's it. No wrangler.toml. No drizzle.config.ts. `kumoh.json` is the single source of truth.

## TypeScript Config

```json
{
  "extends": "kumoh/tsconfig"
}
```

Ships with strict ES2023 config, `@cloudflare/workers-types`, and `.kumoh/` generated types included automatically.

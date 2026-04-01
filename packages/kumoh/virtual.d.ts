declare module 'kumoh/db' {
  import type { DrizzleD1Database } from 'drizzle-orm/d1';

  export const db: DrizzleD1Database;
  export const d1: D1Database;

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
  export function defineQueue<Message = unknown, Env = unknown>(
    handler: ExportedHandlerQueueHandler<Env, Message>
  ): ExportedHandlerQueueHandler<Env, Message>;
}

declare module 'kumoh/cron' {
  export function defineScheduled<Env = unknown>(
    handler: ExportedHandlerScheduledHandler<Env>
  ): ExportedHandlerScheduledHandler<Env>;
}

declare module 'kumoh/ai' {
  export const ai: Ai;
}

declare module 'kumoh/email' {
  export const email: SendEmail;
}

declare module 'kumoh/app' {
  import type { Context, Env, Hono, Next } from 'hono';
  export function defineApp<E extends Env = Env>(
    init: (app: Hono<E>) => void
  ): (app: Hono<E>) => void;
  export function defineRoute<E extends Env = Env>(
    handler: (c: Context<E>) => Response | Promise<Response>
  ): (c: Context<E>) => Response | Promise<Response>;
  export function defineMiddleware<E extends Env = Env>(
    handler: (c: Context<E>, next: Next) => Response | Promise<Response | void>
  ): (c: Context<E>, next: Next) => Response | Promise<Response | void>;
}

declare module 'kumoh/route' {
  import type { Context, Env } from 'hono';
  export function defineRoute<E extends Env = Env>(
    handler: (c: Context<E>) => Response | Promise<Response>
  ): (c: Context<E>) => Response | Promise<Response>;
}

declare module 'kumoh/middleware' {
  import type { Context, Env, Next } from 'hono';
  export function defineMiddleware<E extends Env = Env>(
    handler: (c: Context<E>, next: Next) => Response | Promise<Response | void>
  ): (c: Context<E>, next: Next) => Response | Promise<Response | void>;
}

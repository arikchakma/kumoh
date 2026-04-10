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
  interface KumohQueues {
    [key: string]: Queue<any>;
  }
  export const queue: KumohQueues;
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
  export function defineEmail<Env = unknown>(
    handler: EmailExportedHandler<Env>
  ): EmailExportedHandler<Env>;
}

// Global interface augmented per-project by .kumoh/kumoh.d.ts code generation.
// Bindings are added automatically — do not edit manually.
declare global {
  interface KumohBindings {}
}

declare module 'kumoh/app' {
  import type { Context, Hono, Next } from 'hono';
  import type { CreateHandlersInterface } from 'hono/factory';

  type _KumohEnv = { Bindings: KumohBindings };

  export function defineApp(
    init: (app: Hono<_KumohEnv>) => void
  ): (app: Hono<_KumohEnv>) => void;
  export const defineHandler: CreateHandlersInterface<_KumohEnv, any>;
  export function defineMiddleware(
    handler: (
      c: Context<_KumohEnv>,
      next: Next
    ) => Response | Promise<Response | void>
  ): (c: Context<_KumohEnv>, next: Next) => Response | Promise<Response | void>;
}

declare module 'kumoh/rate-limit' {
  interface KumohRateLimiters {}
  export const rateLimit: KumohRateLimiters;
}

declare module 'kumoh/objects' {
  type WrappedNamespace<
    T extends Rpc.DurableObjectBranded | undefined = undefined,
  > = {
    getByName(
      name: string,
      options?: DurableObjectNamespaceGetDurableObjectOptions
    ): DurableObjectStub<T>;
    getById(
      id: DurableObjectId,
      options?: DurableObjectNamespaceGetDurableObjectOptions
    ): DurableObjectStub<T>;
    idFromName(name: string): DurableObjectId;
    idFromString(id: string): DurableObjectId;
    newUniqueId(
      options?: DurableObjectNamespaceNewUniqueIdOptions
    ): DurableObjectId;
  };

  interface KumohDurableObjects {}
  export const objects: KumohDurableObjects;
}

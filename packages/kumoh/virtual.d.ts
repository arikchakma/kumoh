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
  export const queue: Queue;

  export function defineQueue<Message = unknown, Env = unknown>(
    handler: ExportedHandlerQueueHandler<Env, Message>
  ): ExportedHandlerQueueHandler<Env, Message>;
}

declare module 'kumoh/cron' {
  export function defineScheduled<Env = unknown>(
    handler: ExportedHandlerScheduledHandler<Env>
  ): ExportedHandlerScheduledHandler<Env>;
}

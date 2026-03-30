declare module 'kumoh/db' {
  import type { DrizzleD1Database } from 'drizzle-orm/d1';

  /** Drizzle ORM instance pre-configured with the D1 binding */
  export const db: DrizzleD1Database;

  /** Raw D1Database binding for escape-hatch operations (exec, batch) */
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
  /** Proxy to the raw KVNamespace binding */
  export const kv: KVNamespace;
}

declare module 'kumoh/storage' {
  /** Proxy to the raw R2Bucket binding */
  export const storage: R2Bucket;
}

declare module 'kumoh/queue' {
  /** Proxy to the raw Queue binding */
  export const queue: Queue;

  export interface QueueMessage<T = unknown> {
    readonly id: string;
    readonly timestamp: Date;
    readonly body: T;
    ack(): void;
    retry(): void;
  }

  export interface QueueBatch<T = unknown> {
    readonly queue: string;
    readonly messages: ReadonlyArray<QueueMessage<T>>;
    ackAll(): void;
    retryAll(): void;
  }

  export interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
  }

  export function defineQueue<T = unknown, Env = unknown>(
    handler: (
      batch: QueueBatch<T>,
      env: Env,
      ctx: ExecutionContext
    ) => void | Promise<void>
  ): (
    batch: QueueBatch<T>,
    env: Env,
    ctx: ExecutionContext
  ) => void | Promise<void>;
}

declare module 'kumoh/cron' {
  export interface ScheduledController {
    cron: string;
    scheduledTime: number;
    noRetry(): void;
  }

  export interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
  }

  export function defineScheduled<Env = unknown>(
    handler: (
      controller: ScheduledController,
      env: Env,
      ctx: ExecutionContext
    ) => void | Promise<void>
  ): (
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ) => void | Promise<void>;
}

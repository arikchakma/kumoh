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
}

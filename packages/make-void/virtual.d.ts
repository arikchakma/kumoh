declare module "make-void/db" {
  /** Tagged template for SQL queries against the D1 binding */
  export function sql(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<D1Result<Record<string, unknown>>>;

  /** Proxy to the raw D1Database binding */
  export const db: D1Database;
}

declare module "make-void/kv" {
  /** Proxy to the raw KVNamespace binding */
  export const kv: KVNamespace;
}

declare module "make-void/storage" {
  /** Proxy to the raw R2Bucket binding */
  export const storage: R2Bucket;
}

declare module "make-void/queue" {
  /** Proxy to the raw Queue binding */
  export const queue: Queue;
}

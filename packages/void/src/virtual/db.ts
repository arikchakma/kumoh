import type { MakeVoidConfig } from "../types.js";

export function generateDbModule(config: MakeVoidConfig): string {
  const bindingName = config.bindings?.d1 ?? "DB";

  return `
import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";

export const db = drizzle(env.${bindingName});

export const d1 = env.${bindingName};

export { eq, ne, gt, gte, lt, lte, and, or, not, asc, desc, isNull, isNotNull, inArray, notInArray, between, like, sql, count, sum, avg, min, max } from "drizzle-orm";

export { sqliteTable, text, integer, real, blob, primaryKey, uniqueIndex, index } from "drizzle-orm/sqlite-core";
`;
}

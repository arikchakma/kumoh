export function generateDbModule(schemaPath?: string): string {
  const schemaImport = schemaPath
    ? `\nimport * as schema from "${schemaPath}";\nexport { schema };\n`
    : '';

  return /* js */ `
import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";

export const db = drizzle(env.DB);

export const d1 = env.DB;

export { eq, ne, gt, gte, lt, lte, and, or, not, asc, desc, isNull, isNotNull, inArray, notInArray, between, like, sql, count, sum, avg, min, max } from "drizzle-orm";

export { sqliteTable, text, integer, real, blob, primaryKey, uniqueIndex, index } from "drizzle-orm/sqlite-core";
${schemaImport}`;
}

// This file is the real module export for "kumoh/db" when resolved OUTSIDE of Vite
// (e.g., by drizzle-kit for schema reading). It only exports schema builders.
// Inside Vite, the virtual module plugin intercepts "kumoh/db" and provides
// the full module (db instance, operators, schema builders).

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

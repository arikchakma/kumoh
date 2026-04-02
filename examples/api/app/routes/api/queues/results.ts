import { defineHandler } from 'kumoh/app';
import { db, desc, schema } from 'kumoh/db';

export const GET = defineHandler(async (c) => {
  const results = await db
    .select()
    .from(schema.queueResults)
    .orderBy(desc(schema.queueResults.id))
    .limit(50);
  return c.json(results);
});

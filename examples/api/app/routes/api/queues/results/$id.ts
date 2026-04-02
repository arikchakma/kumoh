import { defineHandler } from 'kumoh/app';
import { db, eq, schema } from 'kumoh/db';

export const DELETE = defineHandler(async (c) => {
  const { id } = c.req.param();
  await db
    .delete(schema.queueResults)
    .where(eq(schema.queueResults.id, Number(id)));
  return c.json({ deleted: true });
});

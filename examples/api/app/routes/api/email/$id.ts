import { defineHandler } from 'kumoh/app';
import { db, eq, schema } from 'kumoh/db';

export const DELETE = defineHandler(async (c) => {
  const id = Number(c.req.param('id'));
  await db.delete(schema.emails).where(eq(schema.emails.id, id));
  return c.json({ deleted: true });
});

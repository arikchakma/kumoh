import { defineHandler } from 'kumoh/app';
import { db, eq, schema } from 'kumoh/db';

export const GET = defineHandler(async (c) => {
  const { id } = c.req.param();
  const result = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, Number(id)));

  if (!result.length) {
    return c.json({ error: `User not found: ${id}` }, 404);
  }
  return c.json(result[0]);
});

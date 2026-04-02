import { defineHandler } from 'kumoh/app';
import { db, eq, schema } from 'kumoh/db';
import { storage } from 'kumoh/storage';

export const DELETE = defineHandler(async (c) => {
  const id = Number(c.req.param('id'));
  const [row] = await db
    .select({ key: schema.objects.key })
    .from(schema.objects)
    .where(eq(schema.objects.id, id));

  if (!row) {
    return c.json({ error: 'Object not found' }, 404);
  }

  await storage.delete(row.key);
  await db.delete(schema.objects).where(eq(schema.objects.id, id));

  return c.json({ deleted: true });
});

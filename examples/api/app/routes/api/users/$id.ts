import { zValidator } from '@hono/zod-validator';
import { defineHandler } from 'kumoh/app';
import { db, eq, schema } from 'kumoh/db';
import { z } from 'zod';

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

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
});

export const PATCH = defineHandler(
  zValidator('json', updateUserSchema),
  async (c) => {
    const { id } = c.req.param();
    const body = c.req.valid('json');

    const result = await db
      .update(schema.users)
      .set(body)
      .where(eq(schema.users.id, Number(id)))
      .returning();

    if (!result.length) {
      return c.json({ error: `User not found: ${id}` }, 404);
    }

    return c.json(result[0]);
  }
);

export const DELETE = defineHandler(async (c) => {
  const { id } = c.req.param();
  const result = await db
    .delete(schema.users)
    .where(eq(schema.users.id, Number(id)))
    .returning();

  if (!result.length) {
    return c.json({ error: `User not found: ${id}` }, 404);
  }

  return c.json({ deleted: true });
});

import { zValidator } from '@hono/zod-validator';
import { defineHandler } from 'kumoh/app';
import { db, schema } from 'kumoh/db';
import { z } from 'zod';

export const GET = defineHandler(async (c) => {
  const allUsers = await db.select().from(schema.users);
  return c.json(allUsers);
});

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

export const POST = defineHandler(
  zValidator('json', createUserSchema),
  async (c) => {
    const body = c.req.valid('json');
    await db.insert(schema.users).values(body);
    return c.json({ created: true }, 201);
  }
);

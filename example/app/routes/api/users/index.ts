import { defineRoute } from 'kumoh/app';
import { db, schema } from 'kumoh/db';

export const GET = defineRoute(async (c) => {
  const allUsers = await db.select().from(schema.users);
  return c.json(allUsers);
});

export const POST = defineRoute(async (c) => {
  const body = await c.req.json();
  await db.insert(schema.users).values({ name: body.name, email: body.email });
  return c.json({ created: true }, 201);
});

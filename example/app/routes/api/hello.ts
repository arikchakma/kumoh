import { defineHandler } from 'kumoh/app';
import { db, schema } from 'kumoh/db';

export const GET = defineHandler(async (c) => {
  await db.insert(schema.visits).values({ path: '/api/hello' });

  const count = await db.$count(schema.visits);
  return c.json({
    message: 'Hello from Kumoh!',
    visits: count,
  });
});

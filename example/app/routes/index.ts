import { Hono } from 'hono';
import { db, eq, schema } from 'kumoh/db';

const app = new Hono()
  .get('/api/hello', async (c) => {
    await db.insert(schema.visits).values({ path: '/api/hello' });

    const count = await db.$count(schema.visits);
    return c.json({
      message: 'Hello from Kumoh!',
      visits: count,
    });
  })
  .get('/api/users', async (c) => {
    const allUsers = await db.select().from(schema.users);
    return c.json(allUsers);
  })
  .get('/api/users/:id', async (c) => {
    const { id } = c.req.param();
    const result = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, Number(id)));

    if (!result.length) {
      return c.json({ error: `User not found: ${id}` }, 404);
    }
    return c.json(result[0]);
  })
  .post('/api/users', async (c) => {
    const body = await c.req.json();
    await db
      .insert(schema.users)
      .values({ name: body.name, email: body.email });
    return c.json({ created: true }, 201);
  });

export default app;

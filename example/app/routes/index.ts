import { users, visits } from '@schema';
import { Hono } from 'hono';
import { db, eq, count, d1 } from 'void/db';

const app = new Hono();

app.get('/api/setup', async (c) => {
  await d1.exec(`
    CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT);
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, expires_at TEXT);
  `);
  return c.json({ ok: true });
});

app.get('/api/hello', async (c) => {
  await db.insert(visits).values({ path: '/api/hello' });
  const result = await db.select({ count: count() }).from(visits);
  return c.json({
    message: 'Hello from make-void!',
    visits: result[0].count,
  });
});

app.get('/api/users', async (c) => {
  const allUsers = await db.select().from(users);
  return c.json(allUsers);
});

app.get('/api/users/:id', async (c) => {
  const { id } = c.req.param();
  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, Number(id)));

  if (!result.length) {
    return c.json({ error: `User not found: ${id}` }, 404);
  }
  return c.json(result[0]);
});

app.post('/api/users', async (c) => {
  const body = await c.req.json();
  await db.insert(users).values({ name: body.name, email: body.email });
  return c.json({ created: true }, 201);
});

export default app;

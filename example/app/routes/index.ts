import { Hono } from "hono";
import { db, sql } from "void/db";

const app = new Hono();

app.get("/api/setup", async (c) => {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT);
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT);
  `);
  return c.json({ ok: true });
});

app.get("/api/hello", async (c) => {
  await sql`INSERT INTO visits (path) VALUES (${"/api/hello"})`;
  const result = await sql`SELECT count(*) as count FROM visits`;
  return c.json({
    message: "Hello from make-void!",
    visits: result.results[0].count,
  });
});

app.get("/api/users", async (c) => {
  const result = await sql`SELECT id, name, email FROM users`;
  return c.json(result.results);
});

app.get("/api/users/:id", async (c) => {
  const { id } = c.req.param();
  const result = await sql`SELECT id, name, email FROM users WHERE id = ${id}`;
  if (!result.results.length) {
    return c.json({ error: `User not found: ${id}` }, 404);
  }
  return c.json(result.results[0]);
});

app.post("/api/users", async (c) => {
  const body = await c.req.json();
  await sql`INSERT INTO users (name, email) VALUES (${body.name}, ${body.email})`;
  return c.json({ created: true }, 201);
});

export default app;

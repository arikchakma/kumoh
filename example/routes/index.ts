import { Hono } from "hono";
import { sql } from "make-void/db";
import { kv } from "make-void/kv";

const app = new Hono();

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
    return c.json({ error: "User not found" }, 404);
  }
  return c.json(result.results[0]);
});

app.post("/api/users", async (c) => {
  const body = await c.req.json();
  await sql`INSERT INTO users (name, email) VALUES (${body.name}, ${body.email})`;
  return c.json({ created: true }, 201);
});

app.post("/api/hello", async (c) => {
  const body = await c.req.json();
  return c.json({ echo: body });
});

export default app;

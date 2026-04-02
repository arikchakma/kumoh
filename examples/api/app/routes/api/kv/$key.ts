import { defineHandler } from 'kumoh/app';
import { kv } from 'kumoh/kv';

export const GET = defineHandler(async (c) => {
  const { key } = c.req.param();
  const value = await kv.get(key);

  if (value === null) {
    return c.json({ error: `Key not found: ${key}` }, 404);
  }

  return c.json({ key, value });
});

export const DELETE = defineHandler(async (c) => {
  const { key } = c.req.param();
  await kv.delete(key);
  return c.json({ deleted: true });
});

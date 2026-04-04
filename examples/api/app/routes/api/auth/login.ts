import { defineHandler } from 'kumoh/app';

export const POST = defineHandler((c) => {
  return c.json({ ok: true });
});

import { zValidator } from '@hono/zod-validator';
import { defineHandler } from 'kumoh/app';
import { kv } from 'kumoh/kv';
import { z } from 'zod';

export const GET = defineHandler(async (c) => {
  const list = await kv.list();
  return c.json({
    keys: list.keys.map((k) => ({
      name: k.name,
      expiration: k.expiration ?? null,
    })),
  });
});

const putSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  expirationTtl: z.number().positive().optional(),
});

export const POST = defineHandler(zValidator('json', putSchema), async (c) => {
  const { key, value, expirationTtl } = c.req.valid('json');
  await kv.put(key, value, expirationTtl ? { expirationTtl } : undefined);
  return c.json({ ok: true });
});

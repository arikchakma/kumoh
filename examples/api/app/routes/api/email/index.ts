import { zValidator } from '@hono/zod-validator';
import { defineHandler } from 'kumoh/app';
import { db, desc, schema } from 'kumoh/db';
import { email } from 'kumoh/email';
import { z } from 'zod';

const PREDEFINED_ADDRESSES = [
  'contact@kumo.ooo',
  'hello@kumo.ooo',
  'support@kumo.ooo',
] as const;

export const GET = defineHandler(async (c) => {
  const rows = await db
    .select()
    .from(schema.emails)
    .orderBy(desc(schema.emails.id))
    .limit(50);
  return c.json(rows);
});

const sendSchema = z.object({
  to: z.enum(PREDEFINED_ADDRESSES),
  subject: z.string().min(1),
  body: z.string().min(1),
  replyTo: z.string().email().optional(),
});

export const POST = defineHandler(zValidator('json', sendSchema), async (c) => {
  const { to, subject, body, replyTo } = c.req.valid('json');

  await email.send({
    from: 'noreply@kumo.ooo',
    to,
    subject,
    text: body,
    ...(replyTo ? { replyTo } : {}),
  });

  return c.json({ ok: true });
});

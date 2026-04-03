import { zValidator } from '@hono/zod-validator';
import { defineHandler } from 'kumoh/app';
import { queue } from 'kumoh/queue';
import { z } from 'zod';

const sendSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
});

export const POST = defineHandler(zValidator('json', sendSchema), async (c) => {
  const { to, subject, body } = c.req.valid('json');
  await queue.emails.send({ to, subject, body });
  return c.json({ queued: true });
});

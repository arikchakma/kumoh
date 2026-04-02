import { zValidator } from '@hono/zod-validator';
import { defineHandler } from 'kumoh/app';
import { queue } from 'kumoh/queue';
import { z } from 'zod';

const sendSchema = z.object({
  queue: z.enum(['notifications', 'email']),
  message: z.string().min(1),
});

export const POST = defineHandler(zValidator('json', sendSchema), async (c) => {
  const { queue: queueName, message } = c.req.valid('json');
  await queue[queueName].send({ message });
  return c.json({ sent: true });
});

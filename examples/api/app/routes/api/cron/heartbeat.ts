import { defineHandler } from 'kumoh/app';
import { kv } from 'kumoh/kv';

export const GET = defineHandler(async (c) => {
  const lastHeartbeat = await kv.get('cron:last-heartbeat');
  return c.json({ lastHeartbeat });
});

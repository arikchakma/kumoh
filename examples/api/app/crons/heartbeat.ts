import { defineScheduled } from 'kumoh/cron';
import { kv } from 'kumoh/kv';

export const cron = '0 */6 * * *';

export default defineScheduled(async () => {
  await kv.put('cron:last-heartbeat', new Date().toISOString());
});

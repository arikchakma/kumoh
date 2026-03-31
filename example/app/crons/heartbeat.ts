import { defineScheduled } from 'kumoh/cron';
import { db, schema, sql, lt } from 'kumoh/db';
import { queue } from 'kumoh/queue';

export const cron = '0 */6 * * *';

export default defineScheduled(async () => {
  await queue.notifications.send({
    to: 'test@example.com',
    subject: 'Test Notification',
    body: 'This is a test notification',
  });

  await db
    .delete(schema.sessions)
    .where(lt(schema.sessions.expiresAt, sql`datetime('now')`));
  console.log('Expired sessions cleaned up');
});

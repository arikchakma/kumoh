import { sessions } from '@schema';
import { defineScheduled } from 'kumoh/cron';
import { db, sql, lt } from 'kumoh/db';

export const cron = '0 */6 * * *';

export default defineScheduled(async () => {
  await db.delete(sessions).where(lt(sessions.expiresAt, sql`datetime('now')`));
  console.log('Expired sessions cleaned up');
});

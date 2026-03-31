import { defineScheduled } from 'kumoh/cron';
import { db, schema, sql, lt } from 'kumoh/db';

export const cron = '0 */6 * * *';

export default defineScheduled(async () => {
  await db
    .delete(schema.sessions)
    .where(lt(schema.sessions.expiresAt, sql`datetime('now')`));
  console.log('Expired sessions cleaned up');
});

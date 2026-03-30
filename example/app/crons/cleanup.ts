import { sessions } from '@schema';
import type { CronContext } from 'void';
import { db, sql, lt } from 'void/db';

export const schedule = '0 */6 * * *';

export default async function handler(_ctx: CronContext) {
  await db.delete(sessions).where(lt(sessions.expiresAt, sql`datetime('now')`));
  console.log('Expired sessions cleaned up');
}

import type { CronContext } from "void";
import { db, sql, lt } from "void/db";
import { sessions } from "@schema";

export const schedule = "0 */6 * * *";

export default async function handler(ctx: CronContext) {
  await db.delete(sessions).where(lt(sessions.expiresAt, sql`datetime('now')`));
  console.log("Expired sessions cleaned up");
}

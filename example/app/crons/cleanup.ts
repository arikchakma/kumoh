import type { CronContext } from "void";
import { sql } from "void/db";

export const schedule = "0 */6 * * *";

export default async function handler(ctx: CronContext) {
  await sql`DELETE FROM sessions WHERE expires_at < datetime('now')`;
  console.log("Expired sessions cleaned up");
}

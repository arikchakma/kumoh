import type { RouteContext } from "make-void";
import { sql } from "make-void/db";

export async function get(ctx: RouteContext) {
  const result = await sql`SELECT id, name, email FROM users`;
  return Response.json(result.results);
}

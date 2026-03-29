import type { RouteContext } from "make-void";
import { sql } from "make-void/db";

export async function get(ctx: RouteContext) {
  const { id } = ctx.params;
  const result = await sql`SELECT id, name, email FROM users WHERE id = ${id}`;

  if (!result.results.length) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  return Response.json(result.results[0]);
}

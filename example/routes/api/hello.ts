import type { RouteContext } from "make-void";
import { sql } from "make-void/db";

export async function get(ctx: RouteContext) {
  // Record a visit
  await sql`INSERT INTO visits (path) VALUES (${"/"})`;

  // Count total visits
  const result = await sql`SELECT count(*) as count FROM visits`;
  return Response.json({
    message: "Hello from make-void!",
    visits: result.results[0].count,
  });
}

export async function post(ctx: RouteContext) {
  const body = await ctx.request.json();
  return Response.json({ echo: body });
}

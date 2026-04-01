import type { Context, Env } from 'hono';

/**
 * Typed wrapper for route handlers. Provides type-safe access to
 * `c.env` bindings (DB, KV, BUCKET, AI, etc.) and `c.req` methods.
 *
 * The exact bindings type is generated in `.kumoh/kumoh.d.ts` based
 * on your `kumoh.json` configuration.
 *
 * ```ts
 * import { defineRoute } from 'kumoh';
 *
 * export const GET = defineRoute((c) => {
 *   c.env.DB  // typed as D1Database
 *   c.env.KV  // typed as KVNamespace
 *   return c.json({ status: 'ok' });
 * });
 *
 * export const POST = defineRoute(async (c) => {
 *   const body = await c.req.json();
 *   return c.json({ created: true }, 201);
 * });
 * ```
 */
export function defineRoute<E extends Env = Env>(
  handler: (c: Context<E>) => Response | Promise<Response>
): (c: Context<E>) => Response | Promise<Response> {
  return handler;
}

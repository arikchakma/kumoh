import type { Context, Env, Next } from 'hono';

/**
 * Typed wrapper for route middleware. Provides type-safe access to
 * `c.env` bindings and `c.req` methods inside `_middleware.ts` files.
 *
 * ```ts
 * import { defineMiddleware } from 'kumoh';
 *
 * export default defineMiddleware(async (c, next) => {
 *   const token = c.req.header('Authorization');
 *   if (!token) return c.json({ error: 'Unauthorized' }, 401);
 *   await next();
 * });
 * ```
 */
export function defineMiddleware<E extends Env = Env>(
  handler: (c: Context<E>, next: Next) => Response | Promise<Response | void>
): (c: Context<E>, next: Next) => Response | Promise<Response | void> {
  return handler;
}

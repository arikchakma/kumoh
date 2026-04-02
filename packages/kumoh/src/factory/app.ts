import type { Context, Env, Hono, Next } from 'hono';
import { createFactory } from 'hono/factory';

export function defineApp<E extends Env = Env>(
  init: (app: Hono<E>) => void
): (app: Hono<E>) => void {
  return init;
}

/**
 * Type-safe route handler with optional middleware chain.
 * Supports variadic middleware arguments before the handler,
 * just like Hono's native `.get(path, mw1, mw2, handler)`.
 *
 * ```ts
 * // Simple handler
 * export const GET = defineHandler((c) => c.json({ ok: true }));
 *
 * // With middleware
 * export const POST = defineHandler(
 *   authenticateUser,
 *   zValidator('json', schema),
 *   (c) => c.json(c.req.valid('json'), 201)
 * );
 * ```
 */
export const defineHandler = createFactory().createHandlers;

export function defineMiddleware<E extends Env = Env>(
  handler: (c: Context<E>, next: Next) => Response | Promise<Response | void>
): (c: Context<E>, next: Next) => Response | Promise<Response | void> {
  return handler;
}

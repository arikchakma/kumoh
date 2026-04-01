import type { Context, Env, Hono, Next } from 'hono';

export function defineApp<E extends Env = Env>(
  init: (app: Hono<E>) => void
): (app: Hono<E>) => void {
  return init;
}

export function defineHandler<E extends Env = Env>(
  handler: (c: Context<E>) => Response | Promise<Response>
): (c: Context<E>) => Response | Promise<Response> {
  return handler;
}

export function defineMiddleware<E extends Env = Env>(
  handler: (c: Context<E>, next: Next) => Response | Promise<Response | void>
): (c: Context<E>, next: Next) => Response | Promise<Response | void> {
  return handler;
}

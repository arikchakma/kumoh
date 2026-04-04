import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { rateLimit } from 'kumoh/rate-limit';

function getIp(c: Context): string {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')?.[0] ||
    'unknown'
  );
}

export const globalRateLimiter = createMiddleware(async (c, next) => {
  if (c.req.method.toUpperCase() === 'OPTIONS') {
    return next();
  }

  const key = getIp(c);
  const { success } = await rateLimit.global.limit({ key });
  if (!success) {
    return c.json({ error: 'Too many requests' }, 429);
  }

  await next();
});

export const authenticationRateLimiter = createMiddleware(async (c, next) => {
  if (c.req.method.toUpperCase() === 'OPTIONS') {
    return next();
  }

  const key = getIp(c);
  const { success } = await rateLimit.authentication.limit({ key });
  if (!success) {
    return c.json({ error: 'Too many requests' }, 429);
  }
  await next();
});

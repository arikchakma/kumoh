import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { defineApp } from 'kumoh/app';

export default defineApp((app) => {
  app.use(logger());
  app.use(
    cors({
      origin: ['https://kumoh.dev', 'https://sandbox.kumoh.dev'],
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: true,
      maxAge: 3600,
    })
  );
});

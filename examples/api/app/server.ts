import { logger } from 'hono/logger';
import { defineApp } from 'kumoh/app';

export default defineApp((app) => {
  app.use(logger());
});

export type KumohConfig = {
  /** App name from kumoh.json. Used for resource naming. */
  appName?: string;
  /** Path to the base Hono app file. Default: "app/server.ts" */
  serverEntry?: string;
  /** Directory containing route files. Default: "app/routes" */
  routesDir?: string;
  /** Directory containing cron handlers. Default: "app/crons" */
  cronsDir?: string;
  /** Directory containing queue handlers. Default: "app/queues" */
  queuesDir?: string;
  /** Path to DB schema file. Default: "app/db/schema.ts" */
  schemaPath?: string;
};

export type ScannedRouteFile = {
  importPath: string;
  /** Relative path within this directory for sub.on(), e.g. "/hello" or "/:id" or "/" */
  subPath: string;
};

export type ScannedRouteGroup = {
  /** Hono mount path, e.g. "/" or "/api" or "/api/users" */
  mountPath: string;
  /** Middleware import path for this directory (if any) */
  middlewarePath?: string;
  /** Route files in this directory */
  routes: ScannedRouteFile[];
};

export type ScannedCron = {
  filePath: string;
  name: string;
  importPath: string;
  schedule: string;
};

export type ScannedQueue = {
  filePath: string;
  /** Raw filename without extension, e.g. "email-sending" */
  name: string;
  /** camelCase for JS export, e.g. "emailSending" */
  camelName: string;
  /** UPPER_SNAKE for env binding, e.g. "QUEUE_EMAIL_SENDING" */
  binding: string;
  /** Full queue name for Cloudflare, e.g. "my-app-email-sending" */
  queueName: string;
  importPath: string;
};

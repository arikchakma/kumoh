export type KumohConfig = {
  appName: string;
  serverEntry: string;
  routesDir: string;
  cronsDir: string;
  queuesDir: string;
  schemaPath: string;
};

export type ScannedRouteFile = {
  importPath: string;
  /** Relative path from routes dir, e.g. "api/hello.ts" */
  relativePath: string;
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
  name: string;
  camelName: string;
  binding: string;
  queueName: string;
  importPath: string;
};

export interface KumohConfig {
  /** Path to the Hono app entry. Default: "app/routes/index.ts" */
  routesEntry?: string;
  /** Directory containing cron handlers. Default: "app/crons" */
  cronsDir?: string;
  /** Directory containing queue handlers. Default: "app/queues" */
  queuesDir?: string;
  /** Path to DB schema file. Default: "app/db/schema.ts" */
  schemaPath?: string;
}

export interface ScannedCron {
  filePath: string;
  name: string;
  importPath: string;
  schedule: string;
}

export interface ScannedQueue {
  filePath: string;
  name: string;
  importPath: string;
}

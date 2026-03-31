export type KumohConfig = {
  /** App name from kumoh.json. Used for resource naming. */
  appName?: string;
  /** Path to the Hono app entry. Default: "app/routes/index.ts" */
  routesEntry?: string;
  /** Directory containing cron handlers. Default: "app/crons" */
  cronsDir?: string;
  /** Directory containing queue handlers. Default: "app/queues" */
  queuesDir?: string;
  /** Path to DB schema file. Default: "app/db/schema.ts" */
  schemaPath?: string;
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

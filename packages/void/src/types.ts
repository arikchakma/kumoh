export interface MakeVoidConfig {
  /** Path to the Hono app entry. Default: "routes.ts" or "routes/index.ts" */
  routesEntry?: string;
  /** Directory containing cron handlers. Default: "crons" */
  cronsDir?: string;
  /** Directory containing queue handlers. Default: "queues" */
  queuesDir?: string;
  /** Path to DB schema file. Default: "db/schema.ts" */
  schemaPath?: string;
}

export interface CronContext {
  controller: { cron: string; scheduledTime: number; noRetry(): void };
}

export interface QueueContext<T = unknown> {
  batch: {
    readonly queue: string;
    readonly messages: ReadonlyArray<{
      readonly id: string;
      readonly timestamp: Date;
      readonly body: T;
      ack(): void;
      retry(): void;
    }>;
    ackAll(): void;
    retryAll(): void;
  };
}

export interface ScannedCron {
  filePath: string;
  name: string;
  importPath: string;
}

export interface ScannedQueue {
  filePath: string;
  name: string;
  importPath: string;
}

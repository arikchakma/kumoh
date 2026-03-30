export interface ScheduledController {
  cron: string;
  scheduledTime: number;
  noRetry(): void;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export type ScheduledHandler<Env = unknown> = (
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext
) => void | Promise<void>;

export function defineScheduled<Env = unknown>(
  handler: ScheduledHandler<Env>
): ScheduledHandler<Env> {
  return handler;
}

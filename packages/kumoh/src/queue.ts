export interface QueueMessage<T = unknown> {
  readonly id: string;
  readonly timestamp: Date;
  readonly body: T;
  ack(): void;
  retry(): void;
}

export interface QueueBatch<T = unknown> {
  readonly queue: string;
  readonly messages: ReadonlyArray<QueueMessage<T>>;
  ackAll(): void;
  retryAll(): void;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export type QueueHandler<T = unknown, Env = unknown> = (
  batch: QueueBatch<T>,
  env: Env,
  ctx: ExecutionContext
) => void | Promise<void>;

export function defineQueue<T = unknown, Env = unknown>(
  handler: QueueHandler<T, Env>
): QueueHandler<T, Env> {
  return handler;
}

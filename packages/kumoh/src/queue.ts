/**
 * Typed wrapper for queue consumer handlers. The signature matches
 * Cloudflare's `ExportedHandlerQueueHandler` — `batch`, `env`, and `ctx`
 * are passed through from the worker runtime.
 *
 * ```ts
 * export default defineQueue<EmailMessage>(async (batch, env, ctx) => {
 *   for (const msg of batch.messages) {
 *     console.log(msg.body);
 *     msg.ack();
 *   }
 * });
 * ```
 */
export function defineQueue<Message = unknown, Env = unknown>(
  handler: ExportedHandlerQueueHandler<Env, Message>
): ExportedHandlerQueueHandler<Env, Message> {
  return handler;
}

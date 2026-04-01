/**
 * Typed wrapper for cron handlers. The signature matches Cloudflare's
 * `ExportedHandlerScheduledHandler` — `controller`, `env`, and `ctx`
 * are passed through from the worker runtime.
 *
 * ```ts
 * export default defineScheduled(async (controller, env, ctx) => {
 *   console.log(`Cron ${controller.cron} fired at ${controller.scheduledTime}`);
 * });
 * ```
 */
export function defineScheduled<Env = unknown>(
  handler: ExportedHandlerScheduledHandler<Env>
): ExportedHandlerScheduledHandler<Env> {
  return handler;
}

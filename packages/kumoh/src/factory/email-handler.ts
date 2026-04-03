/**
 * Typed wrapper for email handlers. The signature matches Cloudflare's
 * `EmailExportedHandler` — `message`, `env`, and `ctx` are passed
 * through from the worker runtime.
 *
 * ```ts
 * // app/email.ts
 * import { defineEmail } from 'kumoh/email';
 *
 * export default defineEmail(async (message, env, ctx) => {
 *   if (message.from === 'blocked@example.com') {
 *     message.setReject('Blocked');
 *     return;
 *   }
 *   await message.forward('admin@example.com');
 * });
 * ```
 */
export function defineEmail<Env = unknown>(
  handler: EmailExportedHandler<Env>
): EmailExportedHandler<Env> {
  return handler;
}

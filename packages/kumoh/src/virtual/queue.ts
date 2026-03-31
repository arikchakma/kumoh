import type { ScannedQueue } from '../types.js';

/**
 * Generates the `kumoh/queue` virtual module.
 *
 * Each queue file becomes a property on the `queue` export:
 * - `email.ts` → `queue.email` (proxies `env.QUEUE_EMAIL`)
 * - `email-sending.ts` → `queue.emailSending` (proxies `env.QUEUE_EMAIL_SENDING`)
 */
export function generateQueueModule(queues: ScannedQueue[]): string {
  if (!queues.length) {
    return /* js */ `
export const queue = {};
export function defineQueue(handler) { return handler; }
`;
  }

  const properties = queues
    .map(
      (q) =>
        `  ${q.camelName}: new Proxy({}, { get(_, prop) { return Reflect.get(env.${q.binding}, prop); } })`
    )
    .join(',\n');

  return /* js */ `
import { env } from "cloudflare:workers";

export const queue = {
${properties}
};

export function defineQueue(handler) { return handler; }
`;
}

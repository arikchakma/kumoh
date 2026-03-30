export function generateQueueModule(): string {
  return `
import { env } from "cloudflare:workers";

export const queue = new Proxy({}, {
  get(_, prop) {
    return Reflect.get(env.QUEUE, prop);
  }
});

export function defineQueue(handler) {
  return handler;
}
`;
}

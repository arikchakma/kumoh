import type { MakeVoidConfig } from "../types.js";

export function generateQueueModule(config: MakeVoidConfig, isDev: boolean): string {
  const bindingName = config.bindings?.queue ?? "QUEUE";

  if (isDev) {
    return `
const pending = [];

export const queue = {
  async send(body, opts) {
    console.log("[make-void/queue] send:", body);
    pending.push({ body, ...opts });
  },
  async sendBatch(messages, opts) {
    console.log("[make-void/queue] sendBatch:", messages.length, "messages");
    for (const msg of messages) {
      pending.push(msg);
    }
  },
};
`;
  }

  return `
import { env } from "cloudflare:workers";

export const queue = new Proxy({}, {
  get(_, prop) {
    return Reflect.get(env.${bindingName}, prop);
  }
});
`;
}

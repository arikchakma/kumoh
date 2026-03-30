import type { MakeVoidConfig } from "../types.js";

export function generateQueueModule(config: MakeVoidConfig): string {
  const bindingName = config.bindings?.queue ?? "QUEUE";

  return `
import { env } from "cloudflare:workers";

export const queue = new Proxy({}, {
  get(_, prop) {
    return Reflect.get(env.${bindingName}, prop);
  }
});
`;
}

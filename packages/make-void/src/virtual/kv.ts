import type { MakeVoidConfig } from "../types.js";

export function generateKvModule(config: MakeVoidConfig): string {
  const bindingName = config.bindings?.kv ?? "KV";

  return `
import { env } from "cloudflare:workers";

export const kv = new Proxy({}, {
  get(_, prop) {
    return Reflect.get(env.${bindingName}, prop);
  }
});
`;
}

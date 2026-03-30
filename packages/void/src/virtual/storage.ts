import type { MakeVoidConfig } from "../types.js";

export function generateStorageModule(config: MakeVoidConfig): string {
  const bindingName = config.bindings?.r2 ?? "BUCKET";

  return `
import { env } from "cloudflare:workers";

export const storage = new Proxy({}, {
  get(_, prop) {
    return Reflect.get(env.${bindingName}, prop);
  }
});
`;
}

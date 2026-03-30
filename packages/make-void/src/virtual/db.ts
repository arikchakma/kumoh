import type { MakeVoidConfig } from "../types.js";

export function generateDbModule(config: MakeVoidConfig): string {
  const bindingName = config.bindings?.d1 ?? "DB";

  return `
import { env } from "cloudflare:workers";

export async function sql(strings, ...values) {
  const query = strings.reduce((acc, str, i) => acc + str + (i < values.length ? "?" : ""), "");
  return env.${bindingName}.prepare(query).bind(...values).all();
}

export const db = new Proxy({}, {
  get(_, prop) {
    return Reflect.get(env.${bindingName}, prop);
  }
});
`;
}

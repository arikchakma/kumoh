export function generateKvModule(): string {
  return `
import { env } from "cloudflare:workers";

export const kv = new Proxy({}, {
  get(_, prop) {
    return Reflect.get(env.KV, prop);
  }
});
`;
}

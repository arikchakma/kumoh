export function generateKvModule(): string {
  return `
import { env } from "cloudflare:workers";

export const kv = new Proxy({}, {
  get(_, prop) {
    const value = Reflect.get(env.KV, prop);
    return typeof value === 'function' ? value.bind(env.KV) : value;
  }
});
`;
}

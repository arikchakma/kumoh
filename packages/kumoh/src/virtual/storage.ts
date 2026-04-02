export function generateStorageModule(): string {
  return `
import { env } from "cloudflare:workers";

export const storage = new Proxy({}, {
  get(_, prop) {
    const value = Reflect.get(env.BUCKET, prop);
    return typeof value === 'function' ? value.bind(env.BUCKET) : value;
  }
});
`;
}

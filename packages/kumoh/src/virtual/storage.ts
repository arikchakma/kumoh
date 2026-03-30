export function generateStorageModule(): string {
  return `
import { env } from "cloudflare:workers";

export const storage = new Proxy({}, {
  get(_, prop) {
    return Reflect.get(env.BUCKET, prop);
  }
});
`;
}

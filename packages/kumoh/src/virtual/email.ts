export function generateEmailModule(): string {
  return /* js */ `
import { env } from "cloudflare:workers";

export const email = new Proxy({}, {
  get(_, prop) {
    return Reflect.get(env.EMAIL, prop);
  }
});
`;
}

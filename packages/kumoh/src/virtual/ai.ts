export function generateAiModule(): string {
  return /* js */ `
import { env } from "cloudflare:workers";

export const ai = new Proxy({}, {
  get(_, prop) {
    return Reflect.get(env.AI, prop);
  }
});
`;
}

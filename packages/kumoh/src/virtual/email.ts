export function generateEmailModule(): string {
  return /* js */ `
import { env } from "cloudflare:workers";

export const email = env.EMAIL;
`;
}

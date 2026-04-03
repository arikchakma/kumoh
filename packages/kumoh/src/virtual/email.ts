export function generateEmailModule(): string {
  return /* js */ `
import { env } from "cloudflare:workers";

export const email = env.SEND_EMAIL;

export function defineEmail(handler) { return handler; }
`;
}

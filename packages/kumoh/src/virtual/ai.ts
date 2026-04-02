export function generateAiModule(): string {
  return /* js */ `
import { env } from "cloudflare:workers";

export const ai = env.AI;
`;
}

export function generateStorageModule(): string {
  return /* js */ `
import { env } from "cloudflare:workers";

export const storage = env.BUCKET;
`;
}

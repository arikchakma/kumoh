export function generateKvModule(): string {
  return /* js */ `
import { env } from "cloudflare:workers";

export const kv = env.KV;
`;
}

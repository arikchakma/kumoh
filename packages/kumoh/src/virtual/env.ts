export function generateEnvModule(): string {
  return /* js */ `
import { env } from "cloudflare:workers";
export { env };
`;
}

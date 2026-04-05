import type { ScannedDurableObject } from '../server/scanner.ts';

export function generateObjectsModule(objects: ScannedDurableObject[]): string {
  if (!objects.length) {
    return /* js */ `
export const objects = {};
`;
  }

  const exports = objects
    .map((o) => `export const ${o.camelName} = env.${o.binding};`)
    .join('\n');

  return /* js */ `
import { env } from "cloudflare:workers";

${exports}
`;
}

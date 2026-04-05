import type { ScannedDurableObject } from '../server/scanner.ts';

export function generateObjectsModule(objects: ScannedDurableObject[]): string {
  if (!objects.length) {
    return /* js */ `
export const objects = {};
`;
  }

  const props = objects
    .map((o) => `  ${o.camelName}: env.${o.binding}`)
    .join(',\n');

  return /* js */ `
import { env } from "cloudflare:workers";

export const objects = {
${props},
};
`;
}

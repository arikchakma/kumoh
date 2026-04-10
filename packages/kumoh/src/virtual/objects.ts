import type { KumohDurableObject } from '../index.ts';

export function generateObjectsModule(
  objects: KumohDurableObject[],
  runtimePath: string
): string {
  if (!objects.length) {
    return /* js */ `
export const objects = {};
`;
  }

  const props = objects
    .map((o) => `  ${o.camelName}: wrapNamespace(env.${o.binding})`)
    .join(',\n');

  return /* js */ `
import { env } from "cloudflare:workers";
import { wrapNamespace } from "${runtimePath}";

export const objects = {
${props},
};
`;
}

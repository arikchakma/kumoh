import type { KumohRateLimiter } from '../index.ts';

export function generateRateLimitModule(limiters: KumohRateLimiter[]): string {
  if (!limiters.length) {
    return /* js */ `
export const rateLimit = {};
`;
  }

  const properties = limiters
    .map((l) => `  ${l.camelName}: env.${l.binding}`)
    .join(',\n');

  return /* js */ `
import { env } from "cloudflare:workers";

export const rateLimit = {
${properties}
};
`;
}

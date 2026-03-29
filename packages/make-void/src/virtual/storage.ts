import type { MakeVoidConfig } from "../types.js";

export function generateStorageModule(config: MakeVoidConfig, isDev: boolean): string {
  const bindingName = config.bindings?.r2 ?? "BUCKET";

  if (isDev) {
    return `
const store = new Map();

export const storage = {
  async get(key) {
    console.log("[make-void/storage] get:", key);
    return store.get(key) || null;
  },
  async put(key, value, opts) {
    console.log("[make-void/storage] put:", key);
    store.set(key, { body: value, ...opts });
    return { key };
  },
  async delete(key) {
    console.log("[make-void/storage] delete:", key);
    store.delete(key);
  },
  async list(opts) {
    console.log("[make-void/storage] list");
    const objects = [...store.keys()].map(key => ({ key }));
    return { objects, truncated: false };
  },
};
`;
  }

  return `
import { env } from "cloudflare:workers";

export const storage = new Proxy({}, {
  get(_, prop) {
    return Reflect.get(env.${bindingName}, prop);
  }
});
`;
}

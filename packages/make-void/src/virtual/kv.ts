import type { MakeVoidConfig } from "../types.js";

export function generateKvModule(config: MakeVoidConfig, isDev: boolean): string {
  const bindingName = config.bindings?.kv ?? "KV";

  if (isDev) {
    return `
const store = new Map();

export const kv = {
  async get(key, opts) {
    console.log("[make-void/kv] get:", key);
    const val = store.get(key);
    return val !== undefined ? val : null;
  },
  async put(key, value, opts) {
    console.log("[make-void/kv] put:", key);
    store.set(key, value);
  },
  async delete(key) {
    console.log("[make-void/kv] delete:", key);
    store.delete(key);
  },
  async list(opts) {
    console.log("[make-void/kv] list");
    const keys = [...store.keys()].map(name => ({ name }));
    return { keys, list_complete: true, cacheStatus: null };
  },
};
`;
  }

  return `
import { env } from "cloudflare:workers";

export const kv = new Proxy({}, {
  get(_, prop) {
    return Reflect.get(env.${bindingName}, prop);
  }
});
`;
}

import type { Env, MiddlewareHandler } from 'hono';
import { Hono } from 'hono';

import { fileToSubPath } from './utils/file.ts';

const METHODS = [
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'OPTIONS',
  'HEAD',
] as const;

type RouteModule = Record<string, unknown>;
type MiddlewareModule = { default?: MiddlewareHandler | MiddlewareHandler[] };
type CronEntry = {
  handler: ExportedHandlerScheduledHandler;
  schedule: string;
};

export type DefineWorkerOptions<E extends Env = Env> = {
  init?: (app: Hono<E>) => void;
  routes?: Record<string, RouteModule>;
  middleware?: Record<string, MiddlewareModule>;
  crons?: Record<string, CronEntry>;
  queues?: Record<string, ExportedHandlerQueueHandler>;
};

/**
 * Groups route file paths by their parent directory.
 * Matches HonoX's `groupByDirectory()`.
 *
 * Input:  `{ 'api/hello.ts': mod, 'api/users/index.ts': mod2 }`
 * Output: `{ 'api': { 'hello.ts': mod }, 'api/users': { 'index.ts': mod2 } }`
 */
function groupByDirectory(
  files: Record<string, RouteModule>
): Record<string, Record<string, RouteModule>> {
  const grouped: Record<string, Record<string, RouteModule>> = {};

  for (const [path, mod] of Object.entries(files)) {
    const parts = path.split('/');
    const filename = parts.pop()!;
    const dir = parts.join('/');

    if (!grouped[dir]) {
      grouped[dir] = {};
    }
    grouped[dir][filename] = mod;
  }

  // Sort files within each directory: static before dynamic ($)
  for (const [dir, files] of Object.entries(grouped)) {
    const sorted = Object.entries(files).sort(([a], [b]) => {
      if (a.startsWith('$') && !b.startsWith('$')) {
        return 1;
      }
      if (!a.startsWith('$') && b.startsWith('$')) {
        return -1;
      }
      return a.localeCompare(b);
    });
    grouped[dir] = Object.fromEntries(sorted);
  }

  return grouped;
}

/**
 * Sorts directory keys shallow→deep.
 * Matches HonoX's `sortDirectoriesByDepth()`.
 */
function sortDirectories(dirs: string[]): string[] {
  return dirs.sort((a, b) => {
    const depthA = a ? a.split('/').length : 0;
    const depthB = b ? b.split('/').length : 0;
    return depthA - depthB || a.localeCompare(b);
  });
}

/**
 * Converts a directory-relative path to a Hono mount path.
 */
function dirToMountPath(dir: string): string {
  if (!dir) {
    return '/';
  }
  let path = `/${dir}`;
  path = path.replace(/\$\.\.\.([^/]+)/g, ':$1{.+}');
  path = path.replace(/\$([^/]+)/g, ':$1');
  return path;
}

/**
 * Finds middleware for a directory, walking up parent dirs if needed.
 * Matches HonoX's middleware inheritance (lines 229-252).
 */
function findMiddlewareForDir(
  dir: string,
  middlewareDirs: Map<string, MiddlewareModule>,
  appliedDirs: Set<string>
): MiddlewareModule | undefined {
  // Check exact directory
  const exactKey = dir ? `${dir}/_middleware.ts` : '_middleware.ts';
  for (const [key, mod] of middlewareDirs) {
    if (key === exactKey || key === exactKey.replace('.ts', '.js')) {
      return mod;
    }
  }

  // Walk up parent directories
  const parts = dir.split('/');
  for (let i = parts.length - 1; i >= 0; i--) {
    const parentDir = parts.slice(0, i).join('/');
    const parentKey = parentDir
      ? `${parentDir}/_middleware.ts`
      : '_middleware.ts';

    for (const [key, mod] of middlewareDirs) {
      if (key === parentKey || key === parentKey.replace('.ts', '.js')) {
        // Skip if already applied to an ancestor
        if (appliedDirs.has(key)) {
          return undefined;
        }
        return mod;
      }
    }
  }

  return undefined;
}

/**
 * Wraps middleware handlers with WeakMap deduplication to prevent
 * double execution when middleware is inherited by child directories.
 * Matches HonoX lines 265-278.
 */
function wrapMiddleware(
  handlers: MiddlewareHandler[],
  processedMap: WeakMap<MiddlewareHandler, WeakSet<Request>>
): MiddlewareHandler[] {
  return handlers.map((mw) => {
    if (!processedMap.has(mw)) {
      processedMap.set(mw, new WeakSet());
    }
    const seen = processedMap.get(mw)!;

    return async (c, next) => {
      if (!seen.has(c.req.raw)) {
        seen.add(c.req.raw);
        return mw(c, next);
      }
      return next();
    };
  });
}

/**
 * Registers a route module on a Hono sub-app.
 * Matches HonoX route registration (lines 308-340).
 *
 * Supports:
 * 1. `export default new Hono()` — Hono sub-app
 * 2. `export const GET/POST/...` — named method handlers
 * 3. `export default [handler1, handler2]` — array handlers (GET)
 * 4. `export default (c) => ...` — function handler (GET)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function registerRoute(sub: any, path: string, mod: RouteModule): void {
  const defaultExport = mod.default;

  // 1. Hono sub-app instance
  if (
    defaultExport &&
    typeof defaultExport === 'object' &&
    'fetch' in defaultExport
  ) {
    sub.route(path, defaultExport as Hono);
    return;
  }

  // 2. Named method exports: export const GET = ...
  for (const m of METHODS) {
    const handler = mod[m];
    if (handler) {
      const h = Array.isArray(handler)
        ? (handler as MiddlewareHandler[])
        : [handler as MiddlewareHandler];
      sub.on(m, path, ...h);
    }
  }

  // 3. Array default export: export default [handler1, handler2]
  if (Array.isArray(defaultExport)) {
    sub.get(path, ...(defaultExport as MiddlewareHandler[]));
  }
  // 4. Function default export (GET shorthand)
  else if (typeof defaultExport === 'function' && !mod.GET) {
    sub.get(path, defaultExport as MiddlewareHandler);
  }
}

/**
 * Creates a fully configured Cloudflare Worker from pre-imported modules.
 * Matches HonoX's `createApp()` pattern — all wiring at runtime.
 */
export function defineWorker<E extends Env = Env>(
  options: DefineWorkerOptions<E>
): ExportedHandler {
  const app = new Hono();
  if (options.init) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (options.init as any)(app);
  }

  // --- Routes + Middleware ---
  if (options.routes) {
    const routesByDir = groupByDirectory(options.routes);
    const middlewareDirs = new Map(Object.entries(options.middleware ?? {}));
    const processedMiddleware = new WeakMap<
      MiddlewareHandler,
      WeakSet<Request>
    >();
    const appliedMiddlewarePaths = new Set<string>();
    const allDirs = new Set<string>();

    // Collect all directories (from routes + middleware)
    for (const dir of Object.keys(routesByDir)) {
      allDirs.add(dir);
    }
    for (const key of middlewareDirs.keys()) {
      const dir = key.replace(/\/?_middleware\.(ts|js)$/, '');
      allDirs.add(dir);
    }

    // Process directories shallow→deep (HonoX pattern)
    for (const dir of sortDirectories([...allDirs])) {
      const sub = new Hono();

      // Apply middleware (with inheritance from parent dirs)
      const mwMod = findMiddlewareForDir(
        dir,
        middlewareDirs,
        appliedMiddlewarePaths
      );
      if (mwMod?.default) {
        const handlers = Array.isArray(mwMod.default)
          ? mwMod.default
          : [mwMod.default];
        const wrapped = wrapMiddleware(
          handlers as MiddlewareHandler[],
          processedMiddleware
        );
        sub.use('*', ...wrapped);

        // Track applied middleware path
        for (const [key, mod] of middlewareDirs) {
          if (mod === mwMod) {
            appliedMiddlewarePaths.add(key);
            break;
          }
        }
      }

      // Register routes in this directory
      const dirRoutes = routesByDir[dir];
      if (dirRoutes) {
        for (const [filename, mod] of Object.entries(dirRoutes)) {
          const subPath = fileToSubPath(filename);
          registerRoute(sub, subPath, mod);
        }
      }

      // Mount sub-app on main app
      app.route(dirToMountPath(dir), sub);
    }
  }

  // --- Build worker export ---
  const worker: ExportedHandler = {
    fetch: app.fetch,
  };

  // Cron dispatch
  if (options.crons && Object.keys(options.crons).length) {
    const cronMap = new Map<string, ExportedHandlerScheduledHandler>();
    for (const entry of Object.values(options.crons)) {
      cronMap.set(entry.schedule, entry.handler);
    }
    worker.scheduled = async (controller, env, ctx) => {
      const handler = cronMap.get(controller.cron);
      if (handler) {
        await handler(controller, env, ctx);
      }
    };
  }

  // Queue dispatch
  if (options.queues && Object.keys(options.queues).length) {
    const queueMap = new Map(Object.entries(options.queues));
    worker.queue = async (batch, env, ctx) => {
      const handler = queueMap.get(batch.queue);
      if (handler) {
        await handler(batch, env, ctx);
      }
    };
  }

  return worker;
}

import type { Env, MiddlewareHandler } from 'hono';
import { Hono } from 'hono';

import { fileToSubPath } from '../lib/file.ts';

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
 *
 * Supports:
 * 1. `export const GET/POST/... = defineHandler(...)` — named method handlers
 * 2. `export default new Hono()` — Hono sub-app
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function registerRoute(sub: any, path: string, mod: RouteModule): void {
  const defaultExport = mod.default;

  // Hono sub-app instance
  if (
    defaultExport &&
    typeof defaultExport === 'object' &&
    'fetch' in defaultExport
  ) {
    sub.route(path, defaultExport as Hono);
    return;
  }

  // Named method exports: export const GET = defineHandler(...)
  for (const m of METHODS) {
    const handler = mod[m];
    if (handler) {
      const h = Array.isArray(handler) ? handler : [handler];
      sub.on(m, path, ...(h as MiddlewareHandler[]));
    }
  }
}

export function defineWorker<E extends Env = Env>(
  options: DefineWorkerOptions<E>
): ExportedHandler {
  const app = new Hono();
  if (options.init) {
    // @ts-expect-error - we don't know the type of the env
    // before the init function is called
    options.init(app);
  }

  // Routes registration and middleware inheritance
  // we group the routes by directory and apply the middleware
  // it's group until we find a _middleware.ts file
  // Example:
  //
  //     app/routes/
  //      _middleware.ts           ← applies to ALL routes (logging, cors, etc.)
  //      v1/
  //        _middleware.ts          ← applies to /v1/* (auth)
  //        howdy.ts                ← only the /v1/_middleware.ts is applied
  //        $slug/
  //          _middleware.ts
  //          index.ts              ← only the /v1/$slug/_middleware.ts is applied
  //
  // we then mount the sub-app on the main app at the appropriate path
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

    // Sort directories shallow → deep and process them
    // we process the directories in order of depth
    // so that the middleware is applied in the correct order
    // and the routes are registered in the correct order
    // Example:
    //     /
    //     /v1
    //     /v1/users
    //     /v1/users/$id
    //     /v1/users/$id/index.ts
    //     /v1/users/$id/index.ts
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

      const dirRoutes = routesByDir[dir];
      if (dirRoutes) {
        for (const [filename, mod] of Object.entries(dirRoutes)) {
          const subPath = fileToSubPath(filename);
          registerRoute(sub, subPath, mod);
        }
      }

      app.route(dirToMountPath(dir), sub);
    }
  }

  // The final worker export for Cloudflare Workers
  // with the fetch method and the scheduled and queue methods
  const worker: ExportedHandler = {
    fetch: app.fetch,
  };

  // Handle the CRON jobs
  // it will be called by the Cloudflare Workers runtime
  // it's a map of scheduler functions by schedule string
  // we automatically dispatch the cron job to the appropriate function
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

  // Handle the QUEUE jobs
  // it's a map of queue functions by queue name
  // we automatically dispatch the queue job to the appropriate function
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

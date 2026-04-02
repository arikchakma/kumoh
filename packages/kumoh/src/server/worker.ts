import type { Env, MiddlewareHandler } from 'hono';
import { Hono } from 'hono';

import { dirToMountPath, fileToSubPath, sortDirectories } from '../lib/file.ts';

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
 * Takes a flat map of route paths to modules and groups them by
 * parent directory. Within each directory, static files sort before
 * dynamic ones so Hono matches exact paths first.
 *
 * { 'api/hello.ts': mod, 'api/users/$id.ts': mod2 }
 * -> { 'api': { 'hello.ts': mod }, 'api/users': { '$id.ts': mod2 } }
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

  // Static before dynamic -- hello.ts registers before $id.ts
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
 * Walks up the directory tree to find middleware for a directory.
 * Middleware replaces, not stacks -- if /v1/users/ has its own
 * _middleware.ts, it won't also get /v1/'s middleware.
 */
function findMiddlewareForDir(
  dir: string,
  middlewareDirs: Map<string, MiddlewareModule>,
  appliedDirs: Set<string>
): MiddlewareModule | undefined {
  const exactKey = dir ? `${dir}/_middleware.ts` : '_middleware.ts';
  for (const [key, mod] of middlewareDirs) {
    if (key === exactKey || key === exactKey.replace('.ts', '.js')) {
      return mod;
    }
  }

  // No own middleware -- walk up parents
  const parts = dir.split('/');
  for (let i = parts.length - 1; i >= 0; i--) {
    const parentDir = parts.slice(0, i).join('/');
    const parentKey = parentDir
      ? `${parentDir}/_middleware.ts`
      : '_middleware.ts';

    for (const [key, mod] of middlewareDirs) {
      if (key === parentKey || key === parentKey.replace('.ts', '.js')) {
        // Already applied to an ancestor, skip to avoid double execution
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
 * Wraps middleware with per-request deduplication. Without this,
 * inherited middleware would run multiple times when a request
 * passes through parent and child sub-apps that share it.
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
 * Registers a route file's exports onto a Hono sub-app.
 * Named method exports (defineHandler) get spread since createHandlers
 * returns an array. Default Hono sub-apps get mounted via .route().
 */
function registerRoute(sub: any, path: string, mod: RouteModule): void {
  const defaultExport = mod.default;

  if (
    defaultExport &&
    typeof defaultExport === 'object' &&
    'fetch' in defaultExport
  ) {
    sub.route(path, defaultExport as Hono);
    return;
  }

  for (const m of METHODS) {
    const handler = mod[m];
    if (handler) {
      const h = Array.isArray(handler) ? handler : [handler];
      sub.on(m, path, ...(h as MiddlewareHandler[]));
    }
  }
}

/**
 * Assembles a Cloudflare Worker from pre-imported route, middleware,
 * cron, and queue modules. Each directory gets its own Hono sub-app
 * to avoid the "matcher already built" error that happens when you
 * add routes to an app that has already handled a request.
 */
export function defineWorker<E extends Env = Env>(
  options: DefineWorkerOptions<E>
): ExportedHandler {
  const app = new Hono();
  if (options.init) {
    // @ts-expect-error - Env generic mismatch: we create Hono<BlankEnv>
    // but init expects Hono<KumohEnv>. Works at runtime, just not typed.
    options.init(app);
  }

  if (options.routes) {
    const routesByDir = groupByDirectory(options.routes);
    const middlewareDirs = new Map(Object.entries(options.middleware ?? {}));
    const processedMiddleware = new WeakMap<
      MiddlewareHandler,
      WeakSet<Request>
    >();
    const appliedMiddlewarePaths = new Set<string>();

    const allDirs = new Set<string>();
    for (const dir of Object.keys(routesByDir)) {
      allDirs.add(dir);
    }
    for (const key of middlewareDirs.keys()) {
      const dir = key.replace(/\/?_middleware\.(ts|js)$/, '');
      allDirs.add(dir);
    }

    for (const dir of sortDirectories([...allDirs])) {
      const sub = new Hono();

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

        // Mark as applied so children don't re-inherit it
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

  const worker: ExportedHandler = {
    fetch: app.fetch,
  };

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

import fg from "fast-glob";
import path from "node:path";
import { existsSync } from "node:fs";
import type { ScannedCron, ScannedQueue } from "./types.js";

/**
 * Find the Hono app entry: routes.ts, routes/index.ts, or configured path.
 */
export function findRoutesEntry(root: string, routesEntry?: string): string | null {
  if (routesEntry) {
    const abs = path.resolve(root, routesEntry);
    return existsSync(abs) ? routesEntry : null;
  }

  const candidates = [
    "routes.ts",
    "routes.js",
    "routes/index.ts",
    "routes/index.js",
  ];

  for (const candidate of candidates) {
    if (existsSync(path.resolve(root, candidate))) {
      return candidate;
    }
  }

  return null;
}

export function scanCrons(root: string, cronsDir: string): ScannedCron[] {
  const absDir = path.resolve(root, cronsDir);
  if (!existsSync(absDir)) return [];
  const files = fg.sync("**/*.{ts,js}", { cwd: absDir });

  return files
    .filter((f) => !path.basename(f).startsWith("_"))
    .map((file) => ({
      filePath: path.resolve(absDir, file),
      name: path.basename(file, path.extname(file)),
      importPath: "./" + path.posix.join(cronsDir, file),
    }));
}

export function scanQueues(root: string, queuesDir: string): ScannedQueue[] {
  const absDir = path.resolve(root, queuesDir);
  if (!existsSync(absDir)) return [];
  const files = fg.sync("**/*.{ts,js}", { cwd: absDir });

  return files
    .filter((f) => !path.basename(f).startsWith("_"))
    .map((file) => ({
      filePath: path.resolve(absDir, file),
      name: path.basename(file, path.extname(file)),
      importPath: "./" + path.posix.join(queuesDir, file),
    }));
}

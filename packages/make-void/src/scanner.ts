import fg from "fast-glob";
import path from "node:path";
import { existsSync } from "node:fs";
import type { ScannedCron, ScannedQueue } from "./types.js";

/**
 * Find the Hono app entry. If routesEntry is provided (absolute or relative),
 * check it exists. Otherwise search for common defaults relative to root.
 */
export function findRoutesEntry(root: string, routesEntry?: string): string | null {
  if (routesEntry) {
    const abs = path.isAbsolute(routesEntry) ? routesEntry : path.resolve(root, routesEntry);
    return existsSync(abs) ? abs : null;
  }

  const candidates = [
    "routes.ts",
    "routes.js",
    "routes/index.ts",
    "routes/index.js",
  ];

  for (const candidate of candidates) {
    const abs = path.resolve(root, candidate);
    if (existsSync(abs)) return abs;
  }

  return null;
}

export function scanCrons(root: string, cronsDir: string): ScannedCron[] {
  const absDir = path.isAbsolute(cronsDir) ? cronsDir : path.resolve(root, cronsDir);
  if (!existsSync(absDir)) return [];
  const files = fg.sync("**/*.{ts,js}", { cwd: absDir });

  return files
    .filter((f) => !path.basename(f).startsWith("_"))
    .map((file) => ({
      filePath: path.resolve(absDir, file),
      name: path.basename(file, path.extname(file)),
      importPath: path.resolve(absDir, file),
    }));
}

export function scanQueues(root: string, queuesDir: string): ScannedQueue[] {
  const absDir = path.isAbsolute(queuesDir) ? queuesDir : path.resolve(root, queuesDir);
  if (!existsSync(absDir)) return [];
  const files = fg.sync("**/*.{ts,js}", { cwd: absDir });

  return files
    .filter((f) => !path.basename(f).startsWith("_"))
    .map((file) => ({
      filePath: path.resolve(absDir, file),
      name: path.basename(file, path.extname(file)),
      importPath: path.resolve(absDir, file),
    }));
}

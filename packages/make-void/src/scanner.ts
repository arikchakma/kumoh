import fg from "fast-glob";
import path from "node:path";
import type { ScannedRoute, ScannedCron, ScannedQueue } from "./types.js";

export function scanRoutes(root: string, routesDir: string): ScannedRoute[] {
  const absDir = path.resolve(root, routesDir);
  const files = fg.sync("**/*.{ts,js}", { cwd: absDir });

  return files
    .filter((f) => !path.basename(f).startsWith("_"))
    .map((file) => {
      const relativePath = file
        .replace(/\.(ts|js)$/, "")
        .replace(/\/index$/, "")
        .replace(/^index$/, "");

      const urlPath = relativePath
        .replace(/\[\.\.\.(\w+)\]/g, "*")
        .replace(/\[(\w+)\]/g, ":$1");

      const urlPattern = "/" + urlPath;
      const params = [...urlPath.matchAll(/:(\w+)/g)].map((m) => m[1]);

      return {
        filePath: path.resolve(absDir, file),
        urlPattern: urlPattern === "/" ? "/" : urlPattern,
        importPath: "./" + path.posix.join(routesDir, file),
        isDynamic: params.length > 0 || urlPath.includes("*"),
        params,
      };
    })
    .sort((a, b) => {
      if (a.isDynamic !== b.isDynamic) return a.isDynamic ? 1 : -1;
      return a.urlPattern.localeCompare(b.urlPattern);
    });
}

export function scanCrons(root: string, cronsDir: string): ScannedCron[] {
  const absDir = path.resolve(root, cronsDir);
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
  const files = fg.sync("**/*.{ts,js}", { cwd: absDir });

  return files
    .filter((f) => !path.basename(f).startsWith("_"))
    .map((file) => ({
      filePath: path.resolve(absDir, file),
      name: path.basename(file, path.extname(file)),
      importPath: "./" + path.posix.join(queuesDir, file),
    }));
}

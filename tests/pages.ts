import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const DIST_DIR = "dist/client";

/** Lists every built page as a URL path, e.g. "/" or "/about/". */
export function listBuiltPages(dir = DIST_DIR): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) =>
      toUrlPath(relative(dir, join(entry.parentPath, entry.name))),
    )
    .sort();
}

function toUrlPath(file: string): string {
  const path = file.split(sep).join("/");
  if (path === "index.html") return "/";
  if (path.endsWith("/index.html"))
    return `/${path.slice(0, -"index.html".length)}`;
  return `/${path.replace(/\.html$/, "")}`;
}

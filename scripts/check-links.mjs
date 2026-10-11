// @ts-check
// Checks internal links and in-page anchors in the built HTML with lychee.
// External links are not checked, so the result never depends on the network.
// Usage: node scripts/check-links.mjs [dir]   (default: dist/client)
import { spawnSync } from "node:child_process";
import { globSync } from "node:fs";
import { resolve } from "node:path";

const INSTALL_HINT =
  "lychee is not installed. Install it (e.g. `brew install lychee`); see https://lychee.cli.rs/installation/";

const root = resolve(process.argv[2] ?? "dist/client");

// lychee succeeds when no input matches, which would hide a missing build.
if (globSync("**/*.html", { cwd: root }).length === 0) {
  throw new Error(`No HTML files found in ${root}. Run \`pnpm build\` first.`);
}

const result = spawnSync(
  "lychee",
  [
    "--offline",
    "--no-progress",
    "--include-fragments",
    // Root-relative links such as /privacy/ resolve against the site root.
    "--root-dir",
    root,
    // A link to a directory is valid only when it has an index.html.
    "--index-files",
    "index.html",
    "--",
    `${root}/**/*.html`,
  ],
  { stdio: "inherit" },
);
if (result.error) {
  const { code } = /** @type {NodeJS.ErrnoException} */ (result.error);
  throw code === "ENOENT" ? new Error(INSTALL_HINT) : result.error;
}
if (result.signal) throw new Error(`lychee was killed by ${result.signal}`);
process.exitCode = result.status ?? 1;

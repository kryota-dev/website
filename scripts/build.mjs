// @ts-check
// Two-pass build: collect the characters in use, subset the Japanese font,
// then build again with the subset (scripts/subset-fonts.mjs). Finally,
// generate the OGP image (scripts/og-image.mjs) and the Content-Security-Policy
// (scripts/csp.mjs).
// Usage: pnpm build [astro build options]
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));

/** Options that move the output away from dist/client, where subsetting reads. */
const UNSUPPORTED_OPTIONS = ["--outDir", "--root"];

const forwarded = process.argv.slice(2);
const unsupported = forwarded.find((arg) =>
  UNSUPPORTED_OPTIONS.some(
    (option) => arg === option || arg.startsWith(`${option}=`),
  ),
);
if (unsupported) {
  throw new Error(`${unsupported} is not supported by the two-pass build`);
}

// The CLI is not in the package exports; locate it from the package entry
// (astro/dist/index.js) so the local astro runs, not one found on PATH.
const astroCli = join(
  dirname(createRequire(import.meta.url).resolve("astro")),
  "..",
  "bin",
  "astro.mjs",
);

/**
 * Runs a Node script with the current Node binary and fails loudly.
 * @param {string[]} args
 * @param {Record<string, string>} env
 */
function runNode(args, env) {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.error) throw result.error;
  if (result.signal)
    throw new Error(`${args.join(" ")} was killed by ${result.signal}`);
  if (result.status !== 0) {
    throw new Error(`${args.join(" ")} exited with ${result.status}`);
  }
}

runNode([astroCli, "build", ...forwarded], { FONT_PASS: "collect" });
runNode(["scripts/subset-fonts.mjs"], {});
runNode([astroCli, "build", ...forwarded], { FONT_PASS: "final" });
runNode(["scripts/og-image.mjs"], {});
runNode(["scripts/csp.mjs"], {});

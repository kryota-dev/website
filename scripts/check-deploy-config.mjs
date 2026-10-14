// @ts-check
// Checks the Wrangler config that comes with the build artifact before a job
// that holds a Cloudflare token deploys it. The artifact is made by the
// quality gates, where dependency code runs; a config that tells Wrangler to
// run a command (build.command runs on `wrangler deploy`, containers run
// `docker build`) would run that command next to the token (Issue #33).
// Usage: node scripts/check-deploy-config.mjs   (from the repository root)
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REDIRECT_FILE = ".wrangler/deploy/config.json";

/** Where @astrojs/cloudflare points Wrangler for this static site. */
export const EXPECTED_CONFIG_PATH = "../../dist/client/wrangler.json";

/** The keys the build writes into the redirect; anything else is refused. */
const REDIRECT_KEYS = new Set([
  "configPath",
  "auxiliaryWorkers",
  "prerenderWorkerConfigPath",
]);

/**
 * Keys that make Wrangler run something on the deploying machine, plus
 * `main`: the site deploys as an assets-only Worker with no script.
 */
const REFUSED_KEYS = ["build", "containers", "main"];

/**
 * @param {Record<string, unknown>} redirect contents of the redirect file
 * @returns {string[]} problems; empty when the redirect is as expected
 */
export function redirectProblems(redirect) {
  const problems = [];
  for (const key of Object.keys(redirect)) {
    if (!REDIRECT_KEYS.has(key)) problems.push(`unexpected key "${key}"`);
  }
  if (redirect.configPath !== EXPECTED_CONFIG_PATH) {
    problems.push(
      `configPath is ${JSON.stringify(redirect.configPath)}, expected "${EXPECTED_CONFIG_PATH}"`,
    );
  }
  const auxiliary = redirect.auxiliaryWorkers ?? [];
  if (!Array.isArray(auxiliary) || auxiliary.length > 0) {
    problems.push("auxiliaryWorkers must be empty");
  }
  return problems;
}

/**
 * Wrangler reads these keys at the top level and in each `env.<name>`.
 * @param {Record<string, unknown>} config a Wrangler config
 * @returns {string[]} problems; empty when no refused key is set
 */
export function configProblems(config) {
  const env = /** @type {Record<string, Record<string, unknown>>} */ (
    config.env ?? {}
  );
  const scopes = [
    { path: "", values: config },
    ...Object.entries(env).map(([name, values]) => ({
      path: `env.${name}.`,
      values,
    })),
  ];
  return scopes.flatMap(({ path, values }) =>
    REFUSED_KEYS.filter((key) => values[key] != null).map(
      (key) => `${path}${key} is set`,
    ),
  );
}

/** @param {string} path */
function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const redirect = readJson(REDIRECT_FILE);
  const problems = redirectProblems(redirect).map(
    (problem) => `${REDIRECT_FILE}: ${problem}`,
  );
  // Paths in the redirect are relative to the redirect file.
  const base = dirname(REDIRECT_FILE);
  const configs = [redirect.configPath, redirect.prerenderWorkerConfigPath]
    .filter((path) => typeof path === "string")
    .map((path) => resolve(base, path))
    .filter(
      (path) =>
        path === resolve(base, EXPECTED_CONFIG_PATH) || existsSync(path),
    );
  for (const path of configs) {
    problems.push(
      ...configProblems(readJson(path)).map((problem) => `${path}: ${problem}`),
    );
  }
  if (problems.length > 0) {
    console.error(`Refusing to deploy:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`Deploy config OK (${configs.length} checked)`);
}

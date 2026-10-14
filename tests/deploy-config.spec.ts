import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * The deploy jobs use this config instead of the one in the build artifact,
 * which comes from the quality gates where dependency code runs (Issue #33).
 */
const DEPLOY_CONFIG = "wrangler.deploy.json";
/** The config the developer edits; the deploy config must follow it. */
const USER_CONFIG = "wrangler.jsonc";
/** The config @astrojs/cloudflare generates next to the built assets. */
const GENERATED_CONFIG = "dist/client/wrangler.json";

/** Keys that differ on purpose: the deploy config serves the built assets only. */
const DEPLOY_ONLY = ["main", "assets"];

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

/** wrangler.jsonc has whole-line comments and trailing commas only. */
function readJsonc(path: string) {
  const text = readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(text);
}

const without = (config: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(
    Object.entries(config).filter(([key]) => !keys.includes(key)),
  );

test.describe("配信用の Wrangler の設定", () => {
  test("wrangler.jsonc と、main と assets 以外が同じ", () => {
    expect(without(readJson(DEPLOY_CONFIG), DEPLOY_ONLY)).toEqual(
      without(readJsonc(USER_CONFIG), DEPLOY_ONLY),
    );
  });

  test("ビルドしたアセットだけを配信し、Worker のコードを持たない", () => {
    const config = readJson(DEPLOY_CONFIG);
    expect(config.assets).toEqual({ directory: "./dist/client" });
    expect(config).not.toHaveProperty("main");
    expect(config).not.toHaveProperty("site");
  });

  // If the adapter starts emitting a script, the deploy config would drop it.
  test("ビルドが生成する設定も、Worker のコードを持たない", () => {
    const generated = readJson(GENERATED_CONFIG);
    expect(generated.main).toBeUndefined();
    expect(generated.site).toBeUndefined();
  });
});

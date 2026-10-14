import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { experimental_readRawConfig } from "wrangler";

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

/** Read with Wrangler's own parser, so comments and trailing commas match. */
const readConfig = (path: string): Record<string, unknown> =>
  experimental_readRawConfig({ config: path }).rawConfig;

const without = (config: object | undefined, keys: string[]) =>
  Object.fromEntries(
    Object.entries(config ?? {}).filter(([key]) => !keys.includes(key)),
  );

const assetsOf = (config: Record<string, unknown>) =>
  config.assets as { directory: string } & Record<string, unknown>;

test.describe("配信用の Wrangler の設定", () => {
  test("wrangler.jsonc の設定を、main と assets のほかはすべて持つ", () => {
    const deploy = readConfig(DEPLOY_CONFIG);
    for (const [key, value] of Object.entries(
      without(readConfig(USER_CONFIG), DEPLOY_ONLY),
    )) {
      expect(deploy[key], key).toEqual(value);
    }
  });

  // The adapter adds settings of its own, such as the previews block that
  // `wrangler preview` requires.
  test("ビルドが生成する設定と、assets のほかは同じ値を持つ", () => {
    const generated = readConfig(GENERATED_CONFIG);
    for (const [key, value] of Object.entries(
      without(readConfig(DEPLOY_CONFIG), ["$schema", "assets"]),
    )) {
      expect(generated[key], key).toEqual(value);
    }
  });

  // binding only matters to a Worker script, which the deploy config drops.
  test("assets の設定は、ディレクトリと binding のほかは同じ", () => {
    const deploy = without(assetsOf(readConfig(DEPLOY_CONFIG)), ["directory"]);
    expect(deploy).toEqual(
      without(assetsOf(readConfig(USER_CONFIG)), ["directory", "binding"]),
    );
    expect(deploy).toEqual(
      without(assetsOf(readConfig(GENERATED_CONFIG)), ["directory"]),
    );
  });

  test("ビルドが生成する設定と同じディレクトリを配信する", () => {
    const directoryOf = (path: string) =>
      resolve(dirname(path), assetsOf(readConfig(path)).directory);
    expect(directoryOf(DEPLOY_CONFIG)).toBe(directoryOf(GENERATED_CONFIG));
  });

  test("Worker のコードを持たない", () => {
    const config = readConfig(DEPLOY_CONFIG);
    expect(config).not.toHaveProperty("main");
    expect(config).not.toHaveProperty("site");
  });

  // If the adapter starts emitting a script, the deploy config would drop it.
  test("ビルドが生成する設定も、Worker のコードを持たない", () => {
    const generated = readConfig(GENERATED_CONFIG);
    expect(generated.main).toBeUndefined();
    expect(generated.site).toBeUndefined();
  });
});

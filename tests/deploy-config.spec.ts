import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  configProblems,
  redirectProblems,
} from "../scripts/check-deploy-config.mjs";

/** The redirect that @astrojs/cloudflare writes for this static site. */
const REDIRECT = {
  configPath: "../../dist/client/wrangler.json",
  auxiliaryWorkers: [],
  prerenderWorkerConfigPath: "../../dist/server/.prerender/wrangler.json",
};

/** A generated config of an assets-only Worker, trimmed to a few keys. */
const CONFIG = {
  name: "kryota-dev-website",
  compatibility_date: "2026-10-06",
  assets: { directory: "." },
  build: null,
  containers: null,
  routes: [{ pattern: "kryota.dev", custom_domain: true }],
};

const SCRIPT = resolve("scripts/check-deploy-config.mjs");

const created: string[] = [];
test.afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Runs the script in a copy of the artifact's layout (path → JSON). */
function checkArtifact(files: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), "deploy-config-"));
  created.push(dir);
  for (const [path, value] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), JSON.stringify(value));
  }
  return spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: "utf8" });
}

test.describe("デプロイの設定の検査", () => {
  test("ビルドが書く形の redirect は通る", () => {
    expect(redirectProblems(REDIRECT)).toEqual([]);
  });

  test("redirect が別の設定を指すと失敗する", () => {
    const problems = redirectProblems({
      ...REDIRECT,
      configPath: "../../dist/client/evil.json",
    });
    expect(problems.join("\n")).toContain("configPath");
  });

  test("redirect に auxiliaryWorkers があると失敗する", () => {
    const problems = redirectProblems({
      ...REDIRECT,
      auxiliaryWorkers: [{ configPath: "../../dist/client/aux.json" }],
    });
    expect(problems.join("\n")).toContain("auxiliaryWorkers");
  });

  test("redirect に知らないキーがあると失敗する", () => {
    const problems = redirectProblems({ ...REDIRECT, extra: "x" });
    expect(problems.join("\n")).toContain("extra");
  });

  test("build と containers が null の設定は通る", () => {
    expect(configProblems(CONFIG)).toEqual([]);
  });

  for (const key of ["build", "containers", "main"]) {
    test(`トップレベルに ${key} があると失敗する`, () => {
      const problems = configProblems({ ...CONFIG, [key]: { x: 1 } });
      expect(problems.join("\n")).toContain(key);
    });

    test(`env の中に ${key} があると失敗する`, () => {
      const problems = configProblems({
        ...CONFIG,
        env: { staging: { [key]: { x: 1 } } },
      });
      expect(problems.join("\n")).toContain(`env.staging.${key}`);
    });
  }

  test("vars の中の同じ名前のキーは通る", () => {
    expect(
      configProblems({ ...CONFIG, vars: { build: "1", main: "x" } }),
    ).toEqual([]);
  });

  test("artifact の設定に build.command を足すとデプロイを拒む", () => {
    const result = checkArtifact({
      ".wrangler/deploy/config.json": REDIRECT,
      "dist/client/wrangler.json": {
        ...CONFIG,
        build: { command: "echo marker" },
      },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("build is set");
  });

  test("prerender の設定が artifact にあれば、それも検査する", () => {
    const result = checkArtifact({
      ".wrangler/deploy/config.json": REDIRECT,
      "dist/client/wrangler.json": CONFIG,
      "dist/server/.prerender/wrangler.json": {
        build: { command: "echo marker" },
      },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(".prerender");
  });

  test("指す先の設定が無ければ失敗する", () => {
    const result = checkArtifact({ ".wrangler/deploy/config.json": REDIRECT });
    expect(result.status).not.toBe(0);
  });

  test("ビルドした設定は通る", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/check-deploy-config.mjs"],
      { encoding: "utf8" },
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });
});

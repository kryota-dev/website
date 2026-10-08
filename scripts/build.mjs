// Two-pass build: collect the characters in use, subset the Japanese font,
// then build again with the subset. See scripts/subset-fonts.mjs.
import { spawnSync } from "node:child_process";

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited with ${result.status}`,
    );
  }
}

run("astro", ["build"], { FONT_PASS: "collect" });
run("node", ["scripts/subset-fonts.mjs"]);
run("astro", ["build"]);

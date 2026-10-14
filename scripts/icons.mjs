// @ts-check
// Generates the favicon and the apple-touch-icon from the avatar: the avatar
// (or a crop of it) on a light circle. Runs in scripts/build.mjs after the
// final build.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { AVATAR_BG, AVATAR_SOURCE, ICONS } from "./icon-settings.mjs";

/** Width and height of AVATAR_SOURCE; the crops in ICONS are in these pixels. */
export const AVATAR_SOURCE_SIZE = 400;

/**
 * Renders one icon as PNG.
 * @param {Buffer} avatar The avatar PNG (transparent background).
 * @param {{ size: number; shape: "circle" | "square"; crop: { x: number; y: number; size: number } }} icon
 * @returns {Buffer}
 */
export function renderIcon(avatar, { size, shape, crop }) {
  const { x, y, size: side } = crop;
  if (
    x < 0 ||
    y < 0 ||
    x + side > AVATAR_SOURCE_SIZE ||
    y + side > AVATAR_SOURCE_SIZE
  ) {
    throw new Error(`Icon crop ${JSON.stringify(crop)} is outside the avatar`);
  }
  const r = side / 2;
  const href = `data:image/png;base64,${avatar.toString("base64")}`;
  // The viewBox selects the crop; the clip path makes it a circle.
  const clip = shape === "circle" ? ` clip-path="url(#c)"` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${x} ${y} ${side} ${side}">
  <defs><clipPath id="c"><circle cx="${x + r}" cy="${y + r}" r="${r}"/></clipPath></defs>
  <g${clip}>
    <rect x="${x}" y="${y}" width="${side}" height="${side}" fill="${AVATAR_BG}"/>
    <image href="${href}" width="${AVATAR_SOURCE_SIZE}" height="${AVATAR_SOURCE_SIZE}"/>
  </g>
</svg>`;
  return new Resvg(svg, { fitTo: { mode: "width", value: size } })
    .render()
    .asPng();
}

async function main() {
  process.chdir(fileURLToPath(new URL("..", import.meta.url)));
  const avatar = await readFile(AVATAR_SOURCE);
  for (const icon of Object.values(ICONS)) {
    const png = renderIcon(avatar, icon);
    await mkdir(dirname(icon.output), { recursive: true });
    await writeFile(icon.output, png);
    console.log(`Icon: ${icon.output} (${icon.size}×${icon.size})`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

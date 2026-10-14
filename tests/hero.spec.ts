import { expect, test, type Page } from "@playwright/test";
import { AVATAR_BG } from "../scripts/icon-settings.mjs";
import { personRole } from "../scripts/person.mjs";
import { readBody, readFrontmatter, site } from "./content";

/** Fixed by the requirements (AC-050: the name, 24–40px, weight 400), not read from the code. */
const HEADING_WEIGHT = 400;
const MIN_FONT_SIZE = 24;
const MAX_FONT_SIZE = 40;
/** Frames recorded after the pointer has left the hero. */
const FRAMES_AFTER = 10;
/** Narrower viewports clamp to the minimum size, wider ones to the maximum. */
const WIDE_VIEWPORT = 1024;

const heading = (page: Page) => page.locator("#hero-heading");

/** Moves the pointer inside the hero; ratio 0 = left edge, 1 = right edge. */
async function moveAcrossHero(page: Page, ratio: number) {
  const box = await page.locator("[data-hero]").boundingBox();
  if (!box) throw new Error("Hero is not rendered");
  await page.mouse.move(box.x + box.width * ratio, box.y + box.height / 2);
}

test("見出しは太さ 400 で静止し、ポインターを動かしても出入りしても変わらない", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  // Record the weight on every frame until a few frames after the pointer
  // has moved in, across, and out.
  type Probe = { weights: string[]; done: boolean; after: number };
  await heading(page).evaluate((el, frames) => {
    const probe: Probe = { weights: [], done: false, after: 0 };
    (window as unknown as { heroProbe: Probe }).heroProbe = probe;
    const tick = () => {
      probe.weights.push(getComputedStyle(el).fontWeight);
      if (probe.done) probe.after += 1;
      if (probe.after < frames) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, FRAMES_AFTER);
  for (const ratio of [0.1, 0.9, 0.5]) await moveAcrossHero(page, ratio);
  await page.mouse.move(1, 1);
  await page.evaluate(() => {
    (window as unknown as { heroProbe: Probe }).heroProbe.done = true;
  });
  await page.waitForFunction(
    (frames) =>
      (window as unknown as { heroProbe: Probe }).heroProbe.after >= frames,
    FRAMES_AFTER,
  );
  const weights = await page.evaluate(
    () => (window as unknown as { heroProbe: Probe }).heroProbe.weights,
  );
  expect(new Set(weights)).toEqual(new Set([String(HEADING_WEIGHT)]));
});

test("見出しの文字の大きさは、狭い画面で 24px、広い画面で 40px になる", async ({
  page,
}) => {
  await page.goto("/");
  const size = await heading(page).evaluate((el) =>
    parseFloat(getComputedStyle(el).fontSize),
  );
  // The viewports in playwright.config.ts sit beyond both ends of the clamp.
  const width = page.viewportSize()?.width ?? 0;
  expect(size).toBe(width < WIDE_VIEWPORT ? MIN_FONT_SIZE : MAX_FONT_SIZE);
});

test("Hero は名前・肩書き・標語・リード文とアバターだけで、問い合わせへのリンクもボタンも無い", async ({
  page,
}) => {
  const { person } = site().seo;
  const { tagline } = readFrontmatter<{ tagline: string }>("hero/index.md");
  await page.goto("/");
  const hero = page.locator("[data-hero]");
  await expect(hero.getByRole("button")).toHaveCount(0);
  await expect(hero.locator('a[href*="#contact"]')).toHaveCount(0);
  await expect(heading(page)).toHaveText(person.name);
  await expect(hero.locator(".role")).toHaveText(personRole(person));
  await expect(hero.locator(".tagline")).toHaveText(tagline);
  await expect(hero.locator(".lead")).toHaveText(readBody("hero/index.md"));
  await expect(hero.locator("img")).toHaveCount(1);
});

test("アバターは装飾として alt を空にし、大きさを持って読み込まれる", async ({
  page,
}) => {
  await page.goto("/");
  const image = page.locator("[data-hero] .avatar img");
  await expect(image).toHaveAttribute("alt", "");
  await expect(image).toHaveAttribute("width", /^\d+$/);
  await expect(image).toHaveAttribute("height", /^\d+$/);
  const loaded = await image.evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    return img.naturalWidth > 0;
  });
  expect(loaded).toBe(true);
});

test("アバターの円は、テーマに関わらず同じ明るい色", async ({ page }) => {
  await page.goto("/");
  const avatar = page.locator("[data-hero] .avatar");
  const expected = await page.evaluate((hex) => {
    const probe = document.createElement("div");
    probe.style.color = hex;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, AVATAR_BG);
  await expect(avatar).toHaveCSS("background-color", expected);
  await expect(avatar).toHaveCSS("border-radius", "50%");
});

test("アバターは広い画面で見出しの右に、狭い画面で見出しの上に置く", async ({
  page,
}) => {
  await page.goto("/");
  const avatar = await page.locator("[data-hero] .avatar").boundingBox();
  const h1 = await heading(page).boundingBox();
  if (!avatar || !h1) throw new Error("Hero is not rendered");
  const width = page.viewportSize()?.width ?? 0;
  if (width < WIDE_VIEWPORT) {
    expect(avatar.y + avatar.height).toBeLessThanOrEqual(h1.y);
  } else {
    expect(avatar.x).toBeGreaterThanOrEqual(h1.x + h1.width);
  }
});

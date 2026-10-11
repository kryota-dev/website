import { expect, test, type Page } from "@playwright/test";
import { readFrontmatter } from "./content";

/** Fixed by the requirements (AC-050), not read from the code. */
const HEADING_WEIGHT = 500;
const MIN_FONT_SIZE = 28;
const MAX_FONT_SIZE = 56;
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

test("見出しは太さ 500 で静止し、ポインターを動かしても出入りしても変わらない", async ({
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

test("見出しの文字の大きさは、狭い画面で 28px、広い画面で 56px になる", async ({
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

test("見出しの文字の大きさは 28〜56px に収まる", async ({ page }) => {
  await page.goto("/");
  const size = await heading(page).evaluate((el) =>
    parseFloat(getComputedStyle(el).fontSize),
  );
  expect(size).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
  expect(size).toBeLessThanOrEqual(MAX_FONT_SIZE);
});

test("Hero は添え書き・見出し・リード文だけで、問い合わせへのリンクもボタンも無い", async ({
  page,
}) => {
  await page.goto("/");
  const hero = page.locator("[data-hero]");
  await expect(hero.getByRole("button")).toHaveCount(0);
  await expect(hero.locator('a[href*="#contact"]')).toHaveCount(0);
  await expect(hero.locator(":scope > *")).toHaveCount(3);
});

test("見出しの改行は hero/index.md のとおりに <br> で入る", async ({
  page,
}) => {
  const { heading } = readFrontmatter<{ heading: string }>("hero/index.md");
  const lines = heading.split("\n");
  // The current copy breaks the heading, so the <br> path is exercised.
  expect(lines.length).toBeGreaterThan(1);
  await page.goto("/");
  const h1 = page.locator("#hero-heading");
  await expect(h1.locator("br")).toHaveCount(lines.length - 1);
  expect((await h1.innerText()).split("\n")).toEqual(lines);
});

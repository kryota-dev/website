import { expect, test, type Page } from "@playwright/test";
import { availability } from "./content";

const MIN_WEIGHT = 200;
const MAX_WEIGHT = 900;
const REST_WEIGHT = 700;
const EDGE_TOLERANCE = 10;

const heading = (page: Page) => page.locator("#hero-heading");

const heroWeight = async (page: Page) =>
  Number(
    await heading(page).evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--hero-wght").trim(),
    ),
  );

const renderedWeight = async (page: Page) =>
  Number(await heading(page).evaluate((el) => getComputedStyle(el).fontWeight));

/** Moves the pointer inside the hero; ratio 0 = left edge, 1 = right edge. */
async function moveAcrossHero(page: Page, ratio: number) {
  const box = await page.locator("[data-hero]").boundingBox();
  if (!box) throw new Error("Hero is not rendered");
  await page.mouse.move(box.x + box.width * ratio, box.y + box.height / 2);
}

test("ポインターの横位置で wght が 200〜900 に変わり、見出しの太さに反映される", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");

  await moveAcrossHero(page, 0.001);
  await expect.poll(() => heroWeight(page)).toBeGreaterThanOrEqual(MIN_WEIGHT);
  expect(await heroWeight(page)).toBeLessThanOrEqual(
    MIN_WEIGHT + EDGE_TOLERANCE,
  );

  await moveAcrossHero(page, 0.5);
  await expect.poll(() => heroWeight(page)).toBe((MIN_WEIGHT + MAX_WEIGHT) / 2);
  await expect
    .poll(() => renderedWeight(page))
    .toBe((MIN_WEIGHT + MAX_WEIGHT) / 2);

  await moveAcrossHero(page, 0.999);
  await expect
    .poll(() => heroWeight(page))
    .toBeGreaterThanOrEqual(MAX_WEIGHT - EDGE_TOLERANCE);
  expect(await heroWeight(page)).toBeLessThanOrEqual(MAX_WEIGHT);

  await page.mouse.move(1, 1);
  await expect.poll(() => heroWeight(page)).toBe(REST_WEIGHT);
});

test("reduced motion では wght が 700 のまま変わらない", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  for (const ratio of [0.1, 0.9]) {
    await moveAcrossHero(page, ratio);
    expect(await heroWeight(page)).toBe(REST_WEIGHT);
    expect(await renderedWeight(page)).toBe(REST_WEIGHT);
  }
});

test("空き状況は availability/index.md の値が Hero と契約条件の両方に出る", async ({
  page,
}) => {
  const { status, statusLabel } = availability();
  await page.goto("/");
  await expect(page.locator("[data-hero] .status")).toHaveText(status);
  const term = page
    .locator("#services dl > div")
    .filter({ has: page.locator("dt", { hasText: statusLabel }) });
  await expect(term.locator("dd")).toHaveText(status);
});

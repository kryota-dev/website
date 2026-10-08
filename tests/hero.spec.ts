import { expect, test, type Page } from "@playwright/test";

const heroWeight = (page: Page) =>
  page
    .locator("#hero-heading")
    .evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--hero-wght").trim(),
    );

/** Moves the pointer inside the hero; ratio 0 = left edge, 1 = right edge. */
async function moveAcrossHero(page: Page, ratio: number) {
  const box = await page.locator("[data-hero]").boundingBox();
  if (!box) throw new Error("Hero is not rendered");
  await page.mouse.move(box.x + box.width * ratio, box.y + box.height / 2);
}

test("ポインターの横位置で wght が 200〜900 に変わり、離れると 700 に戻る", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await moveAcrossHero(page, 0);
  await expect
    .poll(async () => Number(await heroWeight(page)))
    .toBeLessThanOrEqual(210);
  await moveAcrossHero(page, 0.999);
  await expect
    .poll(async () => Number(await heroWeight(page)))
    .toBeGreaterThanOrEqual(890);
  await page.mouse.move(1, 1);
  await expect.poll(() => heroWeight(page)).toBe("700");
});

test("reduced motion では wght が 700 のまま変わらない", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await moveAcrossHero(page, 0);
  await moveAcrossHero(page, 1);
  expect(await heroWeight(page)).toBe("700");
});

test("空き状況は 1 か所の値が Hero と契約条件の両方に出る", async ({
  page,
}) => {
  await page.goto("/");
  const heroStatus = (
    await page.locator("[data-hero] .status").innerText()
  ).trim();
  const terms = page.locator("#services dl > div");
  const statusTerm = terms.filter({
    has: page.locator("dt", { hasText: "空き状況" }),
  });
  await expect(statusTerm.locator("dd")).toHaveText(heroStatus);
});

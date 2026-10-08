import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { listBuiltPages } from "./pages";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const pages = listBuiltPages();

test("ビルド結果にページが 1 つ以上ある", () => {
  expect(pages.length).toBeGreaterThan(0);
});

for (const path of pages) {
  test(`${path} に WCAG 2.2 AA の違反がない`, async ({ page }) => {
    await page.goto(path);
    const { violations } = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze();
    expect(violations).toEqual([]);
  });
}

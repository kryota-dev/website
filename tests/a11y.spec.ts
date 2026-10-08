import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { listBuiltPages } from "./pages";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const pages = listBuiltPages();

async function open(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.ok(), `${path} の HTTP ステータス`).toBe(true);
}

async function expectNoViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .analyze();
  expect(violations).toEqual([]);
}

test("ビルド結果にページが 1 つ以上ある", () => {
  expect(pages.length).toBeGreaterThan(0);
});

for (const path of pages) {
  test(`${path} は lang="ja" で、WCAG 2.2 AA の違反がない`, async ({
    page,
  }) => {
    await open(page, path);
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expectNoViolations(page);
  });

  test(`${path} は OS と逆のテーマを明示しても違反がない`, async ({
    page,
  }, info) => {
    const opposite = info.project.use.colorScheme === "dark" ? "light" : "dark";
    await open(page, path);
    await page.evaluate(async (theme) => {
      document.documentElement.dataset.theme = theme;
      // Let color transitions settle so axe measures the final colors.
      // Only transitions: decorative animations may loop forever.
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation instanceof CSSTransition)
          .map((animation) => animation.finished),
      );
    }, opposite);
    await expectNoViolations(page);
  });
}

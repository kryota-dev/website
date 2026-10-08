import { expect, test } from "@playwright/test";

const LIGHT_BG = "rgb(246, 243, 234)";
const DARK_BG = "rgb(22, 21, 17)";

const bodyBackground = (page: import("@playwright/test").Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test("data-theme が無いときは OS の配色設定に従う", async ({ page }, info) => {
  await page.goto("/");
  const expected = info.project.use.colorScheme === "dark" ? DARK_BG : LIGHT_BG;
  expect(await bodyBackground(page)).toBe(expected);
});

for (const [theme, expected] of [
  ["light", LIGHT_BG],
  ["dark", DARK_BG],
] as const) {
  test(`data-theme="${theme}" は OS の配色設定より優先される`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    expect(await bodyBackground(page)).toBe(expected);
  });
}

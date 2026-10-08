import { expect, test, type Page } from "@playwright/test";

const THEMES = {
  light: { bg: "rgb(246, 243, 234)", text: "rgb(31, 29, 25)" },
  dark: { bg: "rgb(22, 21, 17)", text: "rgb(236, 232, 221)" },
} as const;

type Theme = keyof typeof THEMES;

async function resolvedTheme(page: Page) {
  return page.evaluate(() => {
    const body = getComputedStyle(document.body);
    return {
      bg: body.backgroundColor,
      text: body.color,
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
    };
  });
}

function expected(theme: Theme) {
  return { ...THEMES[theme], colorScheme: theme };
}

test("data-theme が無いときは OS の配色設定に従う", async ({ page }, info) => {
  await page.goto("/");
  const os: Theme = info.project.use.colorScheme === "dark" ? "dark" : "light";
  expect(await resolvedTheme(page)).toEqual(expected(os));
});

for (const theme of ["light", "dark"] as const) {
  test(`data-theme="${theme}" は OS の配色設定より優先される`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    expect(await resolvedTheme(page)).toEqual(expected(theme));
  });
}

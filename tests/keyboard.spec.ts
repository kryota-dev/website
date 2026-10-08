import { expect, test } from "@playwright/test";

test("最初の Tab でスキップリンクが見え、Enter で本文に移る", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "本文へ移動" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});

test("ヘッダーは ロゴ → ナビ → テーマ切替 → 相談ボタン の順にフォーカスする", async ({
  page,
}) => {
  await page.goto("/");
  const order = [
    page.getByRole("link", { name: "kryota.dev" }),
    ...(await page
      .getByRole("navigation", { name: "メイン" })
      .getByRole("link")
      .all()),
    page.getByRole("radio", { name: "システム" }),
    page.getByRole("banner").getByRole("link", { name: "相談する" }),
  ];
  await page.keyboard.press("Tab"); // skip link
  for (const target of order) {
    await page.keyboard.press("Tab");
    await expect(target).toBeFocused();
  }
});

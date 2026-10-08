import { expect, test } from "@playwright/test";
import { contact } from "./content";

const content = contact();

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("必須の項目は、コンテンツの指定どおり required になる", async ({
  page,
}) => {
  for (const field of content.fields) {
    const control = page.locator(`#contact-${field.id}`);
    await expect(control).toHaveAccessibleName(new RegExp(`^${field.label}`));
    if (field.required) {
      await expect(control).toHaveAttribute("required", "");
    } else {
      await expect(control).not.toHaveAttribute("required");
    }
  }
});

test("送信ボタンは無効で、準備中の案内がフォームとボタンに結び付く", async ({
  page,
}) => {
  const form = page.getByRole("form");
  await expect(form).toHaveAccessibleDescription(content.unavailable);
  const submit = page.getByRole("button", { name: content.submit });
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveAccessibleDescription(content.unavailable);
});

test("入力欄はシステムフォントで表示する", async ({ page }) => {
  for (const field of content.fields) {
    const family = await page
      .locator(`#contact-${field.id}`)
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(family.split(",")[0].trim()).toBe("system-ui");
  }
});

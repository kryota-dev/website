import { expect, test } from "@playwright/test";

/**
 * axe treats text whose color equals its background as intentionally hidden,
 * so a broken cascade (e.g. layer order) that paints text in the background
 * color passes axe. Check the components that sit on accent fills directly.
 */
test("アクセント色の上の文字が背景と区別できる（コントラスト比 4.5 以上）", async ({
  page,
}) => {
  await page.goto("/");
  const ratios = await page.locator("a.cta").evaluateAll((links) => {
    const channel = (value: number) => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (rgb: string) => {
      const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) ?? []).map(Number);
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    return links.map((link) => {
      const style = getComputedStyle(link);
      const [light, dark] = [
        luminance(style.color),
        luminance(style.backgroundColor),
      ].sort((a, b) => b - a);
      return {
        text: link.textContent?.trim(),
        ratio: (light + 0.05) / (dark + 0.05),
      };
    });
  });
  expect(ratios.length).toBeGreaterThan(0);
  for (const { text, ratio } of ratios) {
    expect(ratio, `「${text}」のコントラスト比`).toBeGreaterThanOrEqual(4.5);
  }
});

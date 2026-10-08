import { expect, test } from "@playwright/test";
import { listBuiltPages } from "./pages";

const NARROWEST_WIDTH = 320;

for (const path of listBuiltPages()) {
  test(`${path} は幅 ${NARROWEST_WIDTH}px でも横にはみ出さない`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: NARROWEST_WIDTH, height: 640 });
    await page.goto(path);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

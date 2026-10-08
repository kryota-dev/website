import { expect, test, type Page } from "@playwright/test";

const PROBE_STYLE = `
  #motion-probe {
    transition: opacity 600ms ease 200ms;
    animation: motion-probe 600ms ease 200ms infinite;
  }
  @keyframes motion-probe { to { opacity: 0.5; } }
`;

async function probeTiming(page: Page) {
  await page.goto("/");
  await page.addStyleTag({ content: PROBE_STYLE });
  await page.evaluate(() => {
    const el = document.createElement("div");
    el.id = "motion-probe";
    document.body.append(el);
  });
  return page.locator("#motion-probe").evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      transitionDuration: style.transitionDuration,
      transitionDelay: style.transitionDelay,
      animationDuration: style.animationDuration,
      animationDelay: style.animationDelay,
      animationIterationCount: style.animationIterationCount,
    };
  });
}

test("通常時はトランジションとアニメーションが動く", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect(await probeTiming(page)).toEqual({
    transitionDuration: "0.6s",
    transitionDelay: "0.2s",
    animationDuration: "0.6s",
    animationDelay: "0.2s",
    animationIterationCount: "infinite",
  });
});

test("prefers-reduced-motion: reduce では動きと遅延が止まる", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await probeTiming(page)).toEqual({
    transitionDuration: "1e-05s",
    transitionDelay: "0s",
    animationDuration: "1e-05s",
    animationDelay: "0s",
    animationIterationCount: "1",
  });
});

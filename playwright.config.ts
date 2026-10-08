import { defineConfig, devices } from "@playwright/test";

const PORT = 4321;

const viewports = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
} as const;

const colorSchemes = ["light", "dark"] as const;

export default defineConfig({
  testDir: "./tests",
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  projects: colorSchemes.flatMap((colorScheme) =>
    Object.entries(viewports).map(([name, viewport]) => ({
      name: `${name}-${colorScheme}`,
      use: { ...devices["Desktop Chrome"], viewport, colorScheme },
    })),
  ),
  webServer: {
    command: `pnpm exec sirv dist/client --port ${PORT} --quiet`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});

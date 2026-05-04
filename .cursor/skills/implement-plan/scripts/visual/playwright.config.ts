import { defineConfig, devices } from "@playwright/test";

const HUGO_PORT = Number(process.env.HUGO_PORT ?? 8001);
const ASTRO_PORT = Number(process.env.ASTRO_PORT ?? 8002);

export default defineConfig({
  testDir: ".",
  outputDir: "test-results",
  snapshotPathTemplate: "{snapshotDir}/baselines/{testFilePath}/{arg}__{projectName}{ext}",
  fullyParallel: false,
  reporter: [["list"], ["json", { outputFile: "test-results/report.json" }]],
  expect: {
    toHaveScreenshot: {
      threshold: 0.05,
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
      caret: "hide",
    },
  },
  projects: [
    {
      name: "astro-desktop",
      use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${ASTRO_PORT}` },
    },
    {
      name: "astro-mobile",
      use: { ...devices["iPhone SE"], baseURL: `http://127.0.0.1:${ASTRO_PORT}` },
    },
    {
      name: "hugo-desktop",
      use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${HUGO_PORT}` },
    },
  ],
  webServer: [
    {
      // The visual subproject lives 5 directories deep
      // (.cursor/skills/implement-plan/scripts/visual/), so we need 5 `..`
      // segments to reach the repo root where Hugo's `public/` and Astro's
      // `dist/` are written.
      command: `python3 -m http.server ${HUGO_PORT} --bind 127.0.0.1 --directory ../../../../../public`,
      port: HUGO_PORT,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: `python3 -m http.server ${ASTRO_PORT} --bind 127.0.0.1 --directory ../../../../../dist`,
      port: ASTRO_PORT,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});

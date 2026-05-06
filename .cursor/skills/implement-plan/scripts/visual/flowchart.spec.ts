/**
 * Phase 16 — flowchart validation slice smoke.
 *
 * Cheap insurance against (a) the canvas failing to hydrate (e.g. SSR'd
 * `window` reference slips in), (b) regression in the textual `sr-only`
 * fallback that carries SEO/a11y for the JS-only canvas, (c) review id
 * renames silently breaking the data file, and (d) console errors
 * during hydration.
 *
 * Runs only against the Astro project (`astro-desktop`) — there is no
 * Hugo equivalent of this page to compare against.
 */
import { test, expect } from "@playwright/test";

test.describe("flowchart page", () => {
  test("renders both cards, the decision, and the fallback", async ({ page }, info) => {
    // Astro-only — there is no Hugo equivalent of /reviews/flowchart/.
    if (info.project.name === "hugo-desktop") {
      test.skip();
      return;
    }

    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
    });

    await page.goto("/reviews/flowchart/");

    // SR-only fallback present in the prerendered HTML so search engines
    // and screen readers see crawlable content even though the canvas is
    // `client:only`.
    const fallback = page.locator('[aria-label="Flowchart as a list"]');
    await expect(fallback).toContainText("Cradle");
    await expect(fallback).toContainText("Defiance of the Fall");

    // Canvas hydrates and renders both book nodes plus the decision.
    await expect(page.locator(".svelte-flow__node-book")).toHaveCount(2);
    await expect(page.locator(".svelte-flow__node-decision")).toHaveCount(1);

    // Both cards link to the right review page. The book node `<a>` may be
    // off-viewport at the default zoom; assert presence in the DOM rather
    // than visibility so the test is not flaky on small screens.
    await expect(
      page.locator('.book-node a[href="/reviews/cradle/"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('.book-node a[href="/reviews/defiance_of_the_fall/"]'),
    ).toHaveCount(1);

    expect(errors, errors.join("\n")).toEqual([]);
  });
});

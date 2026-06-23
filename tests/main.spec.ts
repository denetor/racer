import { test, expect } from '@playwright/test';

test('main page looks correct', async ({ page }) => {
  await page.goto('http://localhost:4173/');
  // The engine auto-starts: `suppressPlayButton: true` removes the old `#excalibur-play` gate,
  // so we wait for the rendering canvas and let the loader, fade-in transition and first scene
  // renders settle instead of clicking a play button.
  await page.waitForSelector('canvas', { timeout: 60000 });
  await page.waitForTimeout(3000);
  // The vehicle's smoke emitters animate random particles every frame, so an exact pixel match is
  // impossible; a small per-pixel-ratio tolerance keeps the screenshot test stable while still
  // catching gross layout/scene regressions.
  await expect(page).toHaveScreenshot({ maxDiffPixelRatio: 0.05 });
});

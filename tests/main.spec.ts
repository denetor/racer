import { test, expect } from '@playwright/test';

// Baseline note (Step 6 switch): the start scene is now the force-based 'physics' scene, so the
// baseline was regenerated to screenshot it (the debug HUD included). Only the `*-chromium-linux.png`
// snapshot is regenerated here (the dev container is linux); the `*-chromium-win32.png` snapshot stays
// stale until a Windows/CI environment re-runs `npm run test:integration-update`.
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

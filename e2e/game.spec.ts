import { expect, test, type Page } from '@playwright/test';

interface DrawnEgg {
  x: number;
  y: number;
  width: number;
  height: number;
}

declare global {
  interface Window {
    drawnEggs: DrawnEgg[];
  }
}

// Watches the canvas API so the test sees an egg drawn, not just one in the
// world's state: drawEgg in prototype/ui.js is the only 17x23 ellipse drawn.
function recordEggs(): void {
  window.drawnEggs = [];
  const ellipse = CanvasRenderingContext2D.prototype.ellipse;
  CanvasRenderingContext2D.prototype.ellipse = function (
    x,
    y,
    rx,
    ry,
    ...rest
  ) {
    if (this.canvas.id === 'world' && rx === 17 && ry === 23) {
      const at = this.getTransform().transformPoint({ x, y });
      window.drawnEggs.push({
        x: at.x,
        y: at.y,
        width: this.canvas.width,
        height: this.canvas.height,
      });
    }
    return ellipse.call(this, x, y, rx, ry, ...rest);
  };
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

const viewports = [
  { name: 'phone', width: 375, height: 812, touch: true },
  { name: 'desktop', width: 1280, height: 800, touch: false },
];

for (const viewport of viewports) {
  test.describe(`at ${viewport.name} width`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.touch,
      isMobile: viewport.touch,
    });

    test('starts a world and draws an egg', async ({ page }) => {
      await page.addInitScript(recordEggs);
      await page.goto('/');

      const intro = page.locator('#intro');
      await expect(intro).toBeVisible();
      await expectNoHorizontalScroll(page);
      expect(await page.evaluate(() => window.drawnEggs.length)).toBe(0);

      await page.locator('#pname').fill('Alex');
      const placeEgg = intro.getByRole('button', { name: 'Place the egg' });
      if (viewport.touch) await placeEgg.tap();
      else await placeEgg.click();
      await expect(intro).toBeHidden();

      await expect
        .poll(() =>
          page.evaluate(() =>
            window.drawnEggs.some(
              (egg) =>
                egg.x >= 0 &&
                egg.x < egg.width &&
                egg.y >= 0 &&
                egg.y < egg.height,
            ),
          ),
        )
        .toBe(true);
      await expect(page.locator('#world')).toBeInViewport();
      await expect(page.locator('#msg')).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Care' })).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  });
}

test('keeps the new client at /next/', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (response) => {
    if (!response.ok()) failed.push(response.url());
  });
  await page.goto('/next/');
  await page.waitForLoadState('networkidle');
  expect(failed).toEqual([]);
  await expect(page.locator('canvas#world')).toBeAttached();
  await expect(page.locator('#intro')).toHaveCount(0);
});

import { expect, test, type Locator, type Page } from '@playwright/test';
import { clientMountPath } from '../packages/server/src/client-mount.js';

interface DrawnEgg {
  x: number;
  y: number;
  width: number;
  height: number;
}

// The prototype's classic scripts declare these at the top level, so the
// page's global scope shares them with page.evaluate.
declare global {
  var drawEgg: (egg: { x: number }, t: number) => void;
  const g: CanvasRenderingContext2D;
  const GROUND: number;
  interface Window {
    drawnEggs: DrawnEgg[];
  }
}

// Wraps the game's own drawEgg so the test sees an egg drawn, not just one in
// the world's state, at the canvas pixel drawEgg is about to anchor it to.
function recordEggs(): void {
  window.drawnEggs = [];
  const original = drawEgg;
  drawEgg = (egg, t) => {
    const at = g.getTransform().transformPoint({ x: egg.x, y: GROUND });
    window.drawnEggs.push({
      x: at.x,
      y: at.y,
      width: g.canvas.width,
      height: g.canvas.height,
    });
    original(egg, t);
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
      const press = (target: Locator) =>
        viewport.touch ? target.tap() : target.click();
      await page.goto('/');

      const intro = page.locator('#intro');
      await expect(intro).toBeVisible();
      await page.evaluate(recordEggs);
      await expectNoHorizontalScroll(page);
      expect(await page.evaluate(() => window.drawnEggs.length)).toBe(0);

      await page.locator('#pname').fill('Alex');
      await press(intro.getByRole('button', { name: 'Place the egg' }));
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

      const shop = page.getByRole('tab', { name: 'Shop' });
      await press(shop);
      await expect(shop).toHaveAttribute('aria-selected', 'true');

      // An egg can't hear yet, so a sent message only empties the box.
      const msg = page.locator('#msg');
      await press(msg);
      await expect(msg).toBeFocused();
      await msg.fill('hello');
      await press(page.locator('#talk').getByRole('button', { name: 'Say' }));
      await expect(msg).toHaveValue('');
      await expectNoHorizontalScroll(page);
    });
  });
}

test('keeps the new client at its mount', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (response) => {
    if (!response.ok()) failed.push(response.url());
  });
  await page.goto(`${clientMountPath}/`);
  await page.waitForLoadState('networkidle');
  expect(failed).toEqual([]);
  await expect(page.locator('canvas#world')).toBeAttached();
  await expect(page.locator('#intro')).toHaveCount(0);
});

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
  const SHOP: { egg: { price: number } };
  const world: {
    simTime: number;
    coins: number;
    creature: { dies: number };
  };
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

const day = 24 * 60 * 60 * 1000;

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

    const press = (target: Locator) =>
      viewport.touch ? target.tap() : target.click();

    // The fake Google (e2e/fake-google.ts) approves the sign-in at once.
    async function signIn(page: Page): Promise<void> {
      await page.goto('/');
      await press(page.getByRole('button', { name: 'Sign in with Google' }));
      await expect(page.locator('#intro')).toBeVisible();
    }

    test('signs in with Google, stays signed in and signs out', async ({
      page,
      context,
    }) => {
      await page.goto('/');
      const welcome = page.locator('#welcome');
      await expect(
        welcome.getByRole('heading', { name: 'Welcome to Kith' }),
      ).toBeVisible();
      await expect(page.locator('#world')).toHaveCount(0);
      await expectNoHorizontalScroll(page);

      await press(welcome.getByRole('button', { name: 'Sign in with Google' }));
      await expect(page.locator('#intro')).toBeVisible();
      await expect(page).toHaveURL('/');
      const session = (await context.cookies()).find(
        (cookie) => cookie.name === 'kith_session',
      );
      expect(session).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      });
      expect(session!.expires * 1000 - Date.now()).toBeGreaterThan(89 * day);

      await page.reload();
      await expect(page.locator('#intro')).toBeVisible();
      await page.locator('#pname').fill('Alex');
      await press(page.getByRole('button', { name: 'Place the egg' }));
      await expect(page.locator('#intro')).toBeHidden();

      await press(page.getByRole('button', { name: 'Sign out' }));
      await expect(welcome).toBeVisible();
      await expect(page.locator('#world')).toHaveCount(0);
      expect(
        (await context.cookies()).some(
          (cookie) => cookie.name === 'kith_session',
        ),
      ).toBe(false);
    });

    test('starts a world and draws an egg', async ({ page }) => {
      await signIn(page);

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

    test('opens and closes every overlay', async ({ page }) => {
      await signIn(page);
      await page.locator('#pname').fill('Alex');
      await press(page.getByRole('button', { name: 'Place the egg' }));
      await expect(page.locator('#intro')).toBeHidden();

      // Skipping time counts as being away, so the game welcomes you back.
      await press(page.getByRole('tab', { name: 'Time' }));
      await press(page.getByRole('button', { name: 'Skip 1 hour' }));
      const away = page.locator('#away');
      await expect(away).toBeVisible();
      await expectNoHorizontalScroll(page);
      await press(away.getByRole('button'));
      await expect(away).toBeHidden();

      // A new world can't afford an egg yet, and earning one takes days.
      await page.evaluate(() => {
        world.coins = SHOP.egg.price;
      });
      await press(page.getByRole('tab', { name: 'Shop' }));
      await press(
        page.locator('.sku', { hasText: 'Adopt an egg' }).getByRole('button'),
      );
      const eggname = page.locator('#eggname');
      await expect(eggname).toBeVisible();
      await expectNoHorizontalScroll(page);
      await press(page.locator('#eggnm'));
      await page.locator('#eggnm').fill('Nova');
      await press(eggname.getByRole('button', { name: 'Name it' }));
      await expect(eggname).toBeHidden();
      await expect(page.locator('#roster')).toContainText('Nova');

      // Old age would otherwise take about two weeks of game time.
      await page.evaluate(() => {
        world.creature.dies = world.simTime;
      });
      const death = page.locator('#death');
      await expect(death).toBeVisible();
      await expectNoHorizontalScroll(page);
      await press(death.getByRole('button', { name: 'Go back to the others' }));
      await expect(death).toBeHidden();
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

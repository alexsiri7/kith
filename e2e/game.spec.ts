import { expect, test, type Locator, type Page } from '@playwright/test';
import { clientMountPath } from '../packages/server/src/client-mount.js';
import { appFiles } from '../packages/server/src/index.js';

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
  var camX: number;
  var speed: number;
  const g: CanvasRenderingContext2D;
  const GROUND: number;
  const H: number;
  const VIEW: number;
  const TREE_X: number;
  const SHOP: { egg: { price: number } };
  const world: {
    simTime: number;
    coins: number;
    lastKick?: number;
    log: { type: string }[];
    items: {
      type: string;
      x: number;
      h?: number;
      vx?: number;
      held?: boolean;
      byHand?: number;
    }[];
    creature: {
      x: number;
      stage: string;
      hatchAt: number;
      dies: number;
      lex: Record<string, { m: string }>;
    };
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

interface Point {
  x: number;
  y: number;
}

// Where a point of the garden is on the page, with the camera where it is now.
function onScreen(page: Page, at: Point): Promise<Point> {
  return page.evaluate(({ x, y }) => {
    const r = document.querySelector('#world')!.getBoundingClientRect();
    return {
      x: r.left + ((x - camX) * r.width) / VIEW,
      y: r.top + (y * r.height) / H,
    };
  }, at);
}

async function startWorld(page: Page): Promise<void> {
  await page.locator('#pname').fill('Alex');
  await page.locator('#cnamein').fill('Pip');
  await page.getByRole('button', { name: 'Place the egg' }).click();
  await expect(page.locator('#intro')).toBeHidden();
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

    const press = (target: Locator) =>
      viewport.touch ? target.tap() : target.click();

    async function tapGarden(page: Page, at: Point): Promise<void> {
      const { x, y } = await onScreen(page, at);
      await (viewport.touch
        ? page.touchscreen.tap(x, y)
        : page.mouse.click(x, y));
    }

    async function dragGarden(
      page: Page,
      from: Point,
      to: Point,
    ): Promise<void> {
      const [a, b] = [await onScreen(page, from), await onScreen(page, to)];
      const steps = 8;
      const along = (i: number) => ({
        x: a.x + ((b.x - a.x) * i) / steps,
        y: a.y + ((b.y - a.y) * i) / steps,
      });
      if (!viewport.touch) {
        await page.mouse.move(a.x, a.y);
        await page.mouse.down();
        await page.mouse.move(b.x, b.y, { steps });
        await page.mouse.up();
        return;
      }
      // Playwright taps with a finger but can't drag one, so this asks
      // Chromium for the touches directly.
      const cdp = await page.context().newCDPSession(page);
      const touch = (
        type: 'touchStart' | 'touchMove' | 'touchEnd',
        points: Point[],
      ) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
      await touch('touchStart', [a]);
      for (let i = 1; i <= steps; i++) await touch('touchMove', [along(i)]);
      await touch('touchEnd', []);
      await cdp.detach();
    }

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

    test('tickles, feeds, kicks, points and names, and pans the garden', async ({
      page,
    }) => {
      await signIn(page);
      await startWorld(page);
      await page.evaluate(() => {
        world.creature.hatchAt = world.simTime;
      });
      await expect
        .poll(() => page.evaluate(() => world.creature.stage))
        .not.toBe('egg');
      // Stopping the clock keeps everything where the test taps. A tap finds
      // the newest thing under it, so the creature stands clear of the ball,
      // and mushrooms that sprang up at random are cleared away.
      await page.evaluate(() => {
        speed = 0;
        world.creature.x = 200;
        world.items.splice(
          0,
          world.items.length,
          world.items.find((i) => i.type === 'ball')!,
        );
      });
      const item = (type: string) =>
        page.evaluate(
          (type) => world.items.find((i) => i.type === type)!,
          type,
        );

      await tapGarden(page, { x: 200, y: 340 });
      expect(
        await page.evaluate(() =>
          world.log.some((e) => e.type === 'tickle' || e.type === 'comfort'),
        ),
      ).toBe(true);

      // Bought food lands where you last touched the garden.
      await press(page.getByRole('tab', { name: 'Shop' }));
      await press(
        page.locator('.sku', { hasText: 'Seed cake' }).getByRole('button'),
      );
      const cake = await item('cake');
      await dragGarden(
        page,
        { x: cake.x, y: 352 },
        { x: cake.x + 200, y: 352 },
      );
      expect(await item('cake')).toMatchObject({
        held: false,
        byHand: expect.any(Number),
      });
      expect((await item('cake')).x).toBeCloseTo(cake.x + 200, -1);

      const ball = await item('ball');
      await tapGarden(page, { x: ball.x, y: 349 - (ball.h ?? 0) });
      expect(await page.evaluate(() => world.lastKick)).toEqual(
        expect.any(Number),
      );
      expect((await item('ball')).vx).not.toBe(0);

      const msg = page.locator('#msg');
      await tapGarden(page, {
        x: await page.evaluate(() => TREE_X),
        y: 180,
      });
      await expect(msg).toHaveAttribute(
        'placeholder',
        'Name what you’re pointing at',
      );
      await press(msg);
      await msg.fill('tree');
      await press(page.locator('#talk').getByRole('button', { name: 'Say' }));
      await expect(page.locator('#toast')).toContainText('“tree”');
      expect(await page.evaluate(() => world.creature.lex.tree?.m)).toBe(
        'tree',
      );

      const cam = await page.evaluate(() => camX);
      await dragGarden(
        page,
        { x: cam + 600, y: 400 },
        { x: cam + 200, y: 400 },
      );
      expect(await page.evaluate(() => camX)).toBeCloseTo(cam + 400, -1);
      await expectNoHorizontalScroll(page);
    });
  });
}

interface Manifest {
  name: string;
  icons: { src: string; sizes: string; purpose?: string }[];
}

// What Lighthouse's installability audit asked of a page: a manifest Chrome
// parses cleanly, that opens standalone, with PNG icons of 192 and 512 pixels.
async function expectInstallable(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const { url, errors, data } = await cdp.send('Page.getAppManifest');
  await cdp.detach();
  expect(new URL(url).pathname).toBe('/manifest.webmanifest');
  expect(errors).toEqual([]);
  const manifest = JSON.parse(data!) as Manifest;
  expect(manifest).toMatchObject({
    name: 'Kith',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
  });

  const decoded = (srcs: string[]) =>
    page.evaluate(
      (srcs) =>
        Promise.all(
          srcs.map(async (src) => {
            const image = new Image();
            image.src = src;
            await image.decode();
            return `${image.naturalWidth}x${image.naturalHeight}`;
          }),
        ),
      srcs,
    );
  const icons = manifest.icons.map((icon) => icon.sizes + (icon.purpose ?? ''));
  expect(await decoded(manifest.icons.map((icon) => icon.src))).toEqual(
    manifest.icons.map((icon) => icon.sizes),
  );
  expect(icons).toEqual(
    expect.arrayContaining(['192x192', '512x512', '512x512maskable']),
  );
  const touchIcon = await page
    .locator('link[rel="apple-touch-icon"]')
    .getAttribute('href');
  expect(await decoded([touchIcon!])).toEqual(['180x180']);
}

test('can be installed as an app from the welcome page and the game', async ({
  page,
  request,
}) => {
  for (const file of appFiles) {
    expect((await request.get(`/${file}`)).ok(), file).toBe(true);
  }
  await page.goto('/');
  await expect(page.locator('#welcome')).toBeVisible();
  await expectInstallable(page);

  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  await expect(page.locator('#intro')).toBeVisible();
  await expectInstallable(page);
});

test('opens offline with the world saved in the browser', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  await startWorld(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  // The service worker controls pages loaded after it starts.
  await page.reload();
  await expect(page.locator('#intro')).toBeHidden();

  // No /api/ route answers yet; a successful one is what a cache would keep.
  await context.route('/api/world', (route) => route.fulfill({ json: {} }));
  await page.evaluate(() => fetch('/api/world'));
  const cached = await page.evaluate(async () => {
    const keys = await (await caches.open('kith-shell')).keys();
    return keys.map((key) => new URL(key.url).pathname);
  });
  expect(cached).toEqual(['/']);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#intro')).toBeHidden();
  await expect(page.locator('#roster')).toContainText('Pip');
});

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

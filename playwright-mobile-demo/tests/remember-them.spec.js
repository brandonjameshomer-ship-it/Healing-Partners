// @ts-check
import { test, expect } from '@playwright/test';
import { watchErrors, expectNoHorizontalScroll, targetSizes, smallInputs, shot, isMobile } from './helpers.js';

/* Every Remember Them surface a family or a funeral home can reach. */
const PAGES = [
  { name: 'interview',      url: '/remember-them/',              ready: 'h1' },
  { name: 'designer',       url: '/remember-them/designer.html', ready: '#stage' },
  { name: 'intake',         url: '/remember-them/intake.html',   ready: '#next' },
  { name: 'life-interview', url: '/apps/life-interview/',        ready: '#m-ask' },
];

for (const p of PAGES) {
  test.describe(`remember them · ${p.name}`, () => {
    test('loads clean with no overflow', async ({ page }, testInfo) => {
      const errors = watchErrors(page);
      await page.goto(p.url);
      await expect(page.locator(p.ready).first()).toBeVisible();
      await expectNoHorizontalScroll(page, p.name);
      await shot(page, testInfo, p.name);
      expect(errors, 'console / page errors').toEqual([]);
    });

    test('text inputs are at least 16px (no iOS focus zoom)', async ({ page }, testInfo) => {
      await page.goto(p.url);
      await expect(page.locator(p.ready).first()).toBeVisible();
      const small = await smallInputs(page);
      if (!isMobile(testInfo)) {
        if (small.length) testInfo.annotations.push({ type: 'advisory', description: JSON.stringify(small) });
        return;
      }
      expect(small, 'inputs under 16px').toEqual([]);
    });

    test('buttons and links meet the 24px minimum target size', async ({ page }, testInfo) => {
      await page.goto(p.url);
      await expect(page.locator(p.ready).first()).toBeVisible();
      // Buttons and button-styled links are hard requirements (WCAG 2.5.8 AA, 24px).
      // Plain text links are exempt there, but on a phone the two entry links on the
      // interview page are the primary path, so they are reported at 44px as advisory.
      const controls = await targetSizes(page, 'button, a.btn, .btn, [role=button]');
      const links = await targetSizes(page, 'a.skip');
      const under = controls.filter((s) => Math.min(s.w, s.h) < 24);
      const advisory = [...controls, ...links].filter((s) => Math.min(s.w, s.h) < 44).map((s) => `${s.label} ${s.w}x${s.h}`);
      if (advisory.length) testInfo.annotations.push({ type: 'below 44px (advisory)', description: advisory.join('; ') });
      expect(under, 'controls under 24px').toEqual([]);
    });
  });
}

test.describe('remember them · flows', () => {
  test('interview page links resolve', async ({ page }) => {
    await page.goto('/remember-them/');
    for (const href of await page.locator('a.skip').evaluateAll((as) => as.map((a) => a.getAttribute('href')))) {
      const r = await page.request.get(new URL(href ?? '', page.url()).toString());
      expect(r.status(), href ?? '').toBe(200);
    }
  });

  test('designer keeps a design on this device across reload', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/remember-them/designer.html');
    await page.locator('#f-name').fill('Ellen Ruth Mercer');
    await page.locator('#saveBtn').click();
    await page.reload();
    await expect(page.locator('#savedList')).toContainText('Mercer');
    expect(errors).toEqual([]);
  });

  test('designer trial gate: trial bar, expiry wall, reset', async ({ page }, testInfo) => {
    await page.goto('/remember-them/designer.html?plan=pro');
    await expect(page.locator('#trialbar')).toHaveClass(/\bon\b/);
    await expect(page.locator('#trialText')).toContainText(/days left|last day/);

    await page.goto('/remember-them/designer.html?trial=expired');
    await expect(page.locator('#paywall')).toHaveClass(/\bon\b/);
    await expect(page.locator('body')).toHaveClass(/\blocked\b/);
    await expect(page.locator('#pwSubscribe')).toBeFocused();
    await expectNoHorizontalScroll(page, 'paywall');
    await shot(page, testInfo, 'designer-paywall');

    await page.goto('/remember-them/designer.html?trial=reset');
    await expect(page.locator('#paywall')).not.toHaveClass(/\bon\b/);
    await expect(page.locator('#trialbar')).not.toHaveClass(/\bon\b/);
  });

  test('intake moves from the first screen to the next', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/remember-them/intake.html');
    await page.locator('#f-first').fill('Ellen');
    await page.locator('#next').click();
    await expect(page.locator('#back')).toBeVisible();
    await expectNoHorizontalScroll(page, 'intake step 2');
    expect(errors).toEqual([]);
  });

  test('life interview: write mode shows the editor', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/apps/life-interview/');
    await page.locator('#m-write').click();
    await expect(page.locator('#whole')).toBeVisible();
    await expect(page.locator('#m-write')).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
  });
});

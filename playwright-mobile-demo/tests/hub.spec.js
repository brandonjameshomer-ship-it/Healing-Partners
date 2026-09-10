// @ts-check
import { test, expect } from '@playwright/test';
import {
  watchErrors, expectNoHorizontalScroll, targetSizes, contrastOf, shot,
  isReducedMotion, isDark,
} from './helpers.js';

/* index.html — the hub page and its "Test drive what's coming" section:
   one <select id="aheadPick"> switching four panels [data-mode=design|vr|voice|plot]. */

const MODES = ['design', 'vr', 'voice', 'plot'];

test.describe('hub page', () => {
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = watchErrors(page);
    await page.goto('/index.html');
    await expect(page.locator('.ahead.js')).toBeAttached();   // script ran
  });
  test.afterEach(() => {
    expect(errors, 'console / page errors').toEqual([]);
  });

  test('loads with no overflow at this viewport', async ({ page }, testInfo) => {
    await expectNoHorizontalScroll(page, 'on load');
    if (isDark(testInfo)) {
      // WebKit reports the body itself as transparent once its background has
      // propagated to the viewport, so resolve the token through a probe element.
      const bg = await page.evaluate(() => {
        const t = document.createElement('div'); t.style.background = 'var(--ground)';
        document.body.appendChild(t); const c = getComputedStyle(t).backgroundColor; t.remove(); return c;
      });
      expect(bg, 'dark --ground token').toBe('rgb(16, 20, 38)');
    }
    await shot(page, testInfo, 'hub');
  });

  test('picker switches panels, updates the hash, never overflows', async ({ page }, testInfo) => {
    const pick = page.locator('#aheadPick');
    await expect(pick).toBeVisible();
    for (const mode of MODES) {
      await pick.selectOption(mode);
      for (const m of MODES) {
        const panel = page.locator(`.panel[data-mode="${m}"]`);
        if (m === mode) await expect(panel).toBeVisible();
        else await expect(panel).toBeHidden();
      }
      expect(new URL(page.url()).hash).toBe(`#${mode}`);
      await expectNoHorizontalScroll(page, `in panel ${mode}`);
      await shot(page, testInfo, `panel-${mode}`);
    }
  });

  test('unbuilt panels are labelled in the picker and in the panel', async ({ page }) => {
    for (const mode of ['vr', 'voice', 'plot']) {
      const opt = page.locator(`#aheadPick option[value="${mode}"]`);
      await expect(opt).toHaveText(/in development/i);
      await page.locator('#aheadPick').selectOption(mode);
      const panel = page.locator(`.panel[data-mode="${mode}"]`);
      await expect(panel.locator('.stage-tag')).toHaveText(/in development/i);
      await expect(panel.locator('.caveat')).toBeVisible();
    }
    await page.locator('#aheadPick').selectOption('design');
    await expect(page.locator('.panel[data-mode="design"] .stage-tag')).toHaveText(/available now/i);
  });

  test('"In development" tag and caveat text meet 4.5:1 contrast', async ({ page }, testInfo) => {
    await page.locator('#aheadPick').selectOption('plot');
    const tag = await contrastOf(page, '.panel[data-mode="plot"] .stage-tag');
    const cav = await contrastOf(page, '.panel[data-mode="plot"] .caveat');
    testInfo.annotations.push({ type: 'contrast', description: `stage-tag ${tag.ratio}:1 (${tag.fg} on ${tag.bg}, ${tag.fontPx}px); caveat ${cav.ratio}:1 (${cav.fg} on ${cav.bg}, ${cav.fontPx}px)` });
    expect(tag.ratio, 'stage-tag contrast').toBeGreaterThanOrEqual(4.5);
    expect(cav.ratio, 'caveat contrast').toBeGreaterThanOrEqual(4.5);
  });

  test('design panel: chips are exclusive and rerender the stone', async ({ page }) => {
    const panel = page.locator('.panel[data-mode="design"]');
    await panel.locator('[data-granite="mesabi-black"]').click();
    await expect(panel.locator('[data-granite][aria-pressed="true"]')).toHaveCount(1);
    await expect(panel.locator('[data-granite="mesabi-black"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(panel.locator('#designRead')).toContainText('Mesabi Black');
    await panel.locator('[data-shape="oval"]').click();
    await expect(panel.locator('[data-shape][aria-pressed="true"]')).toHaveCount(1);
    await expect(panel.locator('#designRead')).toContainText('oval top');
    await expect(panel.locator('#designScene svg')).toHaveCount(1);
    await expect(panel.locator('#designRead')).not.toContainText('$');   // never a price
  });

  test('VR panel: slider, keyboard and pointer drag all turn the stone', async ({ page }) => {
    await page.locator('#aheadPick').selectOption('vr');
    const slider = page.locator('#vrAngle');
    const scene = page.locator('#vrScene');

    await slider.fill('40');
    await expect(page.locator('#vrDeg')).toHaveText('40°');
    await expect(page.locator('#vrRead')).toContainText('from the right');

    await scene.focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(slider).toHaveValue('30');

    const box = await scene.boundingBox();
    if (!box) throw new Error('vrScene has no box');
    const before = Number(await slider.inputValue());
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    const after = Number(await slider.inputValue());
    expect(after, 'drag right increases the angle').toBeGreaterThan(before);
    await expect(page.locator('#vrScene svg')).toHaveCount(1);
  });

  test('plot panel: 40 plots, exclusive selection, non-open plots explain themselves', async ({ page }) => {
    await page.locator('#aheadPick').selectOption('plot');
    const plots = page.locator('#plotMap .plot');
    await expect(plots).toHaveCount(40);
    await plots.locator('nth=0').click({ force: true });       // plot 1 is occupied; aria-disabled, still tappable
    await expect(page.locator('#plotRead')).toContainText(/occupied/i);
    await expect(page.locator('#plotMap .plot[aria-pressed="true"]')).toHaveCount(0);
    const open = page.locator('#plotMap .plot[data-state="open"]');
    await open.locator('nth=0').click();
    await expect(page.locator('#plotMap .plot[aria-pressed="true"]')).toHaveCount(1);
    await expect(page.locator('#plotRead')).toContainText('Section G');
    await open.locator('nth=1').click();
    await expect(page.locator('#plotMap .plot[aria-pressed="true"]')).toHaveCount(1);
    await expect(page.locator('#plotRead')).not.toContainText('$');
  });

  test('plot buttons meet the 24px minimum target size', async ({ page }, testInfo) => {
    await page.locator('#aheadPick').selectOption('plot');
    const sizes = await targetSizes(page, '#plotMap .plot');
    const smallest = sizes.reduce((a, b) => (Math.min(b.w, b.h) < Math.min(a.w, a.h) ? b : a));
    testInfo.annotations.push({ type: 'plot size', description: `smallest plot ${smallest.w}x${smallest.h}px (WCAG 2.5.8 AA 24px; Apple HIG 44pt)` });
    expect(Math.min(smallest.w, smallest.h), `plot "${smallest.label}" is ${smallest.w}x${smallest.h}`).toBeGreaterThanOrEqual(24);
  });

  test('chips, picker and slider meet the 24px minimum target size', async ({ page }, testInfo) => {
    const controls = await targetSizes(page, '.chip, #aheadPick, #vrAngle, #voicePlay');
    const links = await targetSizes(page, '.panel-go');
    const under = controls.filter((s) => Math.min(s.w, s.h) < 24);
    const advisory = [...controls, ...links].filter((s) => Math.min(s.w, s.h) < 44).map((s) => `${s.label} ${s.w}x${s.h}`);
    if (advisory.length) testInfo.annotations.push({ type: 'below 44px (advisory)', description: advisory.join('; ') });
    expect(under, 'controls under 24px').toEqual([]);
  });

  test('voice transcript narrows to 3 and respects reduced motion', async ({ page }, testInfo) => {
    await page.locator('#aheadPick').selectOption('voice');
    const turns = page.locator('#voiceTurns li');
    const first = Number(await turns.first().getAttribute('data-left'));
    const last  = Number(await turns.last().getAttribute('data-left'));
    const opening = first.toLocaleString('en-US'), closing = last.toLocaleString('en-US');
    expect(last, 'the conversation must narrow').toBeLessThan(first);
    await expect(page.locator('#voiceN')).toHaveText(opening);
    await page.locator('#voicePlay').click();
    if (isReducedMotion(testInfo)) {
      await expect(page.locator('#voiceN')).toHaveText(closing, { timeout: 500 });
      await expect(page.locator('#voicePlay')).toHaveText('Play again', { timeout: 500 });
    } else {
      await expect(page.locator('#voicePlay')).toHaveText('Playing…');
      await expect(page.locator('#voiceN')).toHaveText(closing, { timeout: 15_000 });
      await expect(page.locator('#voicePlay')).toHaveText('Play again');
    }
    await expect(page.locator('#voiceTurns li.pending')).toHaveCount(0);
    // Switching away must reset, so timers never leak into another panel.
    await page.locator('#aheadPick').selectOption('design');
    await page.locator('#aheadPick').selectOption('voice');
    await expect(page.locator('#voiceN')).toHaveText(opening);
  });
});

test.describe('hub deep links', () => {
  test('#plot preselects the plot panel', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/index.html#plot');
    await expect(page.locator('#aheadPick')).toHaveValue('plot');
    await expect(page.locator('.panel[data-mode="plot"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('#vr scrolls the panel into view', async ({ page }, testInfo) => {
    await page.goto('/index.html#vr');
    await page.waitForTimeout(300);
    const box = await page.locator('.panel[data-mode="vr"]').boundingBox();
    const vh = testInfo.project.use.viewport?.height ?? 800;
    expect(box && box.y >= 0 && box.y < vh, `panel top at ${box?.y}px, viewport ${vh}px`).toBe(true);
  });

  test('an unknown hash falls back to the design panel with a valid picker', async ({ page }) => {
    await page.goto('/index.html#constructor');
    await expect(page.locator('.panel[data-mode="design"]')).toBeVisible();
    // Object.prototype keys must not leave the <select> blank.
    await expect(page.locator('#aheadPick')).toHaveValue('design');
  });
});

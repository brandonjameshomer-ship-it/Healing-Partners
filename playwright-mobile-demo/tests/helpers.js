// @ts-check
import { expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/* Shared checks. Each returns data rather than asserting where a caller may
   want to annotate instead of fail. */

/** Attach console + page error collectors. Call before page.goto. */
export function watchErrors(page) {
  const errors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const t = m.text();
    if (/favicon/i.test(t)) return;                      // http.server has none; not a page bug
    errors.push(`[console.${m.type()}] ${t}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => {
    if (/favicon/i.test(r.url())) return;
    errors.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText ?? ''}`);
  });
  return errors;
}

/** Document must never be wider than the viewport. Returns {scrollWidth, clientWidth}. */
export async function overflow(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}
export async function expectNoHorizontalScroll(page, where = '') {
  const o = await overflow(page);
  expect(o.scrollWidth, `horizontal overflow ${where}: ${o.scrollWidth} > ${o.clientWidth}`)
    .toBeLessThanOrEqual(o.clientWidth + 1);
}

/** Bounding boxes of every visible element matching selector, with its label. */
export async function targetSizes(page, selector) {
  return page.$$eval(selector, (els) => els
    .filter((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    })
    .map((el) => {
      const r = el.getBoundingClientRect();
      const label = (el.getAttribute('aria-label') || el.textContent || el.id || el.className || '').trim().slice(0, 40);
      return { label, w: Math.round(r.width), h: Math.round(r.height) };
    }));
}

/** Input font sizes — below 16px makes iOS Safari zoom the page on focus. */
export async function smallInputs(page) {
  return page.$$eval('input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea, select',
    (els) => els.map((el) => ({
      id: el.id || el.getAttribute('aria-label') || el.tagName.toLowerCase(),
      px: parseFloat(getComputedStyle(el).fontSize),
    })).filter((x) => x.px < 16));
}

/** WCAG contrast ratio of an element's text against its own background. */
export async function contrastOf(page, selector) {
  return page.$eval(selector, (el) => {
    const parse = (s) => {
      const m = s.match(/[\d.]+/g) || [];
      return { r: +m[0] || 0, g: +m[1] || 0, b: +m[2] || 0, a: m.length > 3 ? +m[3] : 1 };
    };
    const lum = ({ r, g, b }) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    // Walk up to the first opaque background.
    let bg = null, node = el;
    while (node && node !== document.documentElement) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c.a > 0) { bg = c; break; }
      node = node.parentElement;
    }
    if (!bg) bg = parse(getComputedStyle(document.body).backgroundColor);
    const fg = parse(getComputedStyle(el).color);
    const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    const ratio = (hi + 0.05) / (lo + 0.05);
    return { ratio: Math.round(ratio * 100) / 100, fg: getComputedStyle(el).color, bg: `rgb(${bg.r},${bg.g},${bg.b})`,
             fontPx: parseFloat(getComputedStyle(el).fontSize) };
  });
}

/** Full-page screenshot into shots/<project>/<name>.png, for humans. */
export async function shot(page, testInfo, name) {
  const dir = path.join(path.dirname(testInfo.config.configFile ?? testInfo.config.rootDir), 'shots', testInfo.project.name.replace(/[^\w]+/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
}

export const isMobile = (testInfo) => !!testInfo.project.use.isMobile;
export const isReducedMotion = (testInfo) => testInfo.project.use.reducedMotion === 'reduce';
export const isDark = (testInfo) => testInfo.project.use.colorScheme === 'dark';

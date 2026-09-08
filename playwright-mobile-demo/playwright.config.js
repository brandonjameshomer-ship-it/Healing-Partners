// @ts-check
import { defineConfig, devices } from '@playwright/test';

/*
 * Device and browser matrix for the Healing Partners hub page and Remember Them.
 *
 * Engines: Chromium (Chrome, Edge, Android Chrome), WebKit (Safari, every iOS
 * browser) and Gecko (Firefox). Phones span the smallest current Safari
 * viewport (iPhone SE, 320 css px) to the largest (iPhone 16 Pro Max, 440),
 * plus two Android sizes and two iPads. Three variants force dark mode and
 * prefers-reduced-motion, which the pages style for.
 *
 * Playwright's WebKit is the Safari engine, not Safari itself. Anything that
 * only fails under WebKit should be re-checked in the iOS Simulator.
 */

const phone = (name, extra = {}) => ({ name, use: { ...devices[name], ...extra } });

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 45_000,

  use: {
    baseURL: 'http://localhost:8788',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  /* Serve the repo root, one level up, with the dependency-free server in
     tests/serve.cjs (macOS python3 is an Xcode shim and stops working whenever
     the Xcode license is pending). reuseExistingServer lets you keep your own
     server on 8788 running while iterating. */
  webServer: {
    command: 'node tests/serve.cjs .. 8788',
    url: 'http://localhost:8788/index.html',
    reuseExistingServer: true,
    timeout: 15_000,
  },

  projects: [
    /* ---- desktop, three engines ---- */
    { name: 'Desktop Chrome',  use: { ...devices['Desktop Chrome'] } },
    { name: 'Desktop Firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'Desktop Safari',  use: { ...devices['Desktop Safari'] } },

    /* ---- phones, smallest to largest ---- */
    phone('iPhone SE'),            // 320 x 568, WebKit  — the smallest current Safari
    phone('Galaxy S9+'),           // 320 x 658, Chromium
    phone('Galaxy S24'),           // 360 x 780, Chromium
    phone('iPhone 15'),            // 393 x 659, WebKit
    phone('Pixel 8'),              // 412 x 839, Chromium
    phone('iPhone 16 Pro Max'),    // 440 x 763, WebKit

    /* ---- tablets (the arrangement-room device) ---- */
    phone('iPad (gen 7)'),         // 810 x 1080, WebKit
    phone('iPad Pro 11 landscape'),// 1194 x 834, WebKit

    /* ---- theme and motion variants ---- */
    { name: 'iPhone 15 · dark · reduced motion',
      use: { ...devices['iPhone 15'], colorScheme: 'dark', reducedMotion: 'reduce' } },
    { name: 'Pixel 8 · dark',
      use: { ...devices['Pixel 8'], colorScheme: 'dark' } },
    { name: 'Desktop Chrome · reduced motion',
      use: { ...devices['Desktop Chrome'], reducedMotion: 'reduce' } },
  ],
});

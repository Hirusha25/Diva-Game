/**
 * Drives the game in headless Chromium on a phone viewport and saves screenshots.
 *   node scripts/screenshot.mjs [baseUrl] [outDir]
 */
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const base = process.argv[2] || 'http://localhost:8080';
const out = process.argv[3] || 'docs/screenshots';
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('console', (m) => { if (m.type() === 'error') console.log('browser error:', m.text()); });
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto(base + '/', { waitUntil: 'load' });
await page.waitForFunction('window.__gameReady', null, { timeout: 180000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/01-lobby.png` });

await page.evaluate('window.__game.startRun()');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/02-running.png` });
await page.evaluate('window.__game.player.moveLane(-1)');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/03-running-left-lane.png` });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}/04-running-later.png` });
console.log('saved to', out);
await browser.close();

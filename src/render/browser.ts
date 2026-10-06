import { chromium, type Browser } from 'playwright';
import { BASE_CSS, PLANE } from './theme.js';

let browser: Browser | null = null;
let launching: Promise<Browser> | null = null;

// One browser for the process lifetime (cold start ~1s), so each chart stays inside Discord's 3s ack window.
async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
  launching ??= chromium.launch({
    args: [
      '--font-render-hinting=none',
      // /dev/shm is half of RAM, too small for Chromium's shared memory on a 1 GB host.
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  }).then((b) => {
    browser = b;
    launching = null;
    return b;
  });
  return launching;
}

export async function closeBrowser(): Promise<void> {
  await browser?.close();
  browser = null;
}

/** Renders a chart body (inner HTML of .viz-root) to a 2x PNG; width is in CSS pixels. */
export async function renderToPng(body: string, width = 900): Promise<Buffer> {
  const page = await (await getBrowser()).newPage({
    viewport: { width, height: 600 },
    deviceScaleFactor: 2,
  });

  try {
    await page.setContent(
      `<!doctype html><meta charset="utf-8">
       <style>html,body{background:${PLANE};}${BASE_CSS}</style>
       <div class="viz-root">${body}</div>`,
      { waitUntil: 'load' },
    );
    // Screenshot the root rather than the viewport so height follows content.
    const root = page.locator('.viz-root');
    return await root.screenshot({ type: 'png' });
  } finally {
    await page.close();
  }
}

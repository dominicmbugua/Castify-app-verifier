import { logger } from './logger.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Shared, pre-warmed Playwright context for JS-rendered pages.
let contextPromise = null;

function getContext() {
  if (!contextPromise) {
    contextPromise = (async () => {
      const t0 = performance.now();
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      const ctx = await browser.newContext({
        userAgent: UA,
        locale: 'en-US',
        viewport: { width: 1366, height: 768 },
      });
      // Skip heavy resources we don't need
      await ctx.route('**/*', (route) =>
        ['image', 'media', 'font', 'stylesheet'].includes(route.request().resourceType())
          ? route.abort()
          : route.continue()
      );
      logger.info(`[timing] browser launched in ${Math.round(performance.now() - t0)} ms`);
      return ctx;
    })();
  }
  return contextPromise;
}

export const warmUp = () => getContext().catch(() => {});

async function attempt(url, selector, blockScripts, waitFor, waitUntil) {
  const ctx = await getContext();
  const page = await ctx.newPage();
  try {
    if (blockScripts) {
      await page.route('**/*', (route) =>
        route.request().resourceType() === 'script' ? route.abort() : route.fallback()
      );
    }
    const t0 = performance.now();
    const res = await page.goto(url, { waitUntil, timeout: 10000 });
    const t1 = performance.now();
    await page
      .waitForFunction(
        ({ sel, waitFor }) => {
          const text = document.title + ' ' + (document.body ? document.body.innerText.slice(0, 20000) : '');
          // waitFor: stop as soon as this text shows up on the page
          if (waitFor) return new RegExp(waitFor, 'i').test(text);
          return (
            document.querySelector(sel) ||
            /not found|looking for something|robot check|captcha|no longer available/i.test(text.slice(0, 2000))
          );
        },
        { sel: selector, waitFor },
        { timeout: 3000 }
      )
      .catch(() => {});
    const t2 = performance.now();
    logger.info(
      `[timing] ${waitUntil === 'commit' ? 'first response' : 'page load'} ${Math.round(t1 - t0)} ms, ` +
        `wait for content ${Math.round(t2 - t1)} ms` +
        (blockScripts ? ' (scripts blocked)' : '')
    );
    return { status: res ? res.status() : 0, body: await page.content(), finalUrl: page.url() };
  } finally {
    await page.close();
  }
}

// selector: the element that means "the page has loaded its content".
// waitFor: alternatively, text (regex) that means the content has loaded. It wins over selector.
// blockScripts: skip the page's JavaScript (only if the data is in the static HTML).
// waitUntil: 'domcontentloaded' (default) waits for the whole page; 'commit' continues as soon as the
//            store starts answering, and the wait-for-content step then waits for what we need.
// Retries once if the connection is dropped (net::ERR_...).
export async function renderPage(
  url,
  { selector = 'h1', blockScripts = false, waitFor = null, waitUntil = 'domcontentloaded' } = {}
) {
  try {
    return await attempt(url, selector, blockScripts, waitFor, waitUntil);
  } catch (e) {
    if (!/net::ERR_/.test(e.message)) throw e;
    logger.warn(`Connection error (${e.message.split('\n')[0]}), retrying once`);
    await new Promise((r) => setTimeout(r, 500));
    return attempt(url, selector, blockScripts, waitFor, waitUntil);
  }
}

export async function closeBrowser() {
  if (contextPromise) {
    const ctx = await contextPromise;
    await ctx.browser().close();
    contextPromise = null;
  }
}
import * as cheerio from 'cheerio';
import { fetchPageUntil } from './http.js';
import { renderPage } from './browser.js';
import { logger } from './logger.js';
import { Status } from '../models/result.js';

const BLOCKED = /(access denied|robot check|captcha|unusual traffic|automated access)/i;
const LABELS = /^(version|update|updated|size|seller|age|category|ratings?|language|description)$/i;
const SECTION_HEADINGS = /^(app info|app details?|details|information|more info|browse more apps|screenshots|privacy policy:?)$/i;

// Turn a page into clean lines of text, one per block element
function toLines(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  $('br').replaceWith('\n');
  $('h1,h2,h3,h4,h5,h6,p,div,li,tr,th,td,section,article,dt,dd').each((_, el) => {
    $(el).prepend('\n').append('\n');
  });
  return $('body')
    .text()
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

// Find "Label value" on one line, or "Label" on one line and the value on the next
function findLabel(lines, label, valueRe) {
  const inline = new RegExp(`^[-•\\s]*${label}\\s*:?\\s*(${valueRe})$`, 'i');
  const alone = new RegExp(`^[-•\\s]*${label}\\s*:?$`, 'i');
  const value = new RegExp(`^(${valueRe})$`, 'i');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(inline);
    if (m) return { value: m[1].trim(), index: i };
    if (alone.test(lines[i]) && lines[i + 1]) {
      const n = lines[i + 1].match(value);
      if (n) return { value: n[1].trim(), index: i };
    }
  }
  return null;
}

// nameSelector: CSS selector of the element that holds the app name, when the store's page structure is known
export function extractAppInfo(html, { nameSelector = null } = {}) {
  const lines = toLines(html);
  const version = findLabel(lines, 'Version', '\\d[\\w.\\-]*');
  const seller = findLabel(lines, 'Seller', '.+');
  const updated = findLabel(lines, 'Update[d]?', '\\d[\\d/.\\-]*');

  // 1. The exact element, if we know it
  let name = null;
  if (nameSelector) {
    const $ = cheerio.load(html);
    name = $(nameSelector).first().text().replace(/\s+/g, ' ').trim() || null;
  }

  // 2. Otherwise the nearest sensible line above the "Version" line
  if (!name && version) {
    for (let i = version.index - 1; i >= Math.max(0, version.index - 8); i--) {
      const l = lines[i];
      const bad =
        l.length > 80 ||
        LABELS.test(l) ||
        SECTION_HEADINGS.test(l) ||
        l.startsWith('|') ||
        /^\d[\w.\-/]*$/.test(l) ||
        /https?:\/\//i.test(l) ||
        l.endsWith(':');
      if (!bad) {
        name = l.replace(/\s+Internet$/i, '').trim();
        break;
      }
    }
  }

  const hasInfo = Boolean(version || seller);
  const blocked = !hasInfo && BLOCKED.test(lines.slice(0, 80).join(' '));
  return {
    name,
    version: version?.value || null,
    developer: seller?.value || null,
    updated: updated?.value || null,
    hasInfo,
    blocked,
  };
}

// Shared check for store pages that show "Version / Seller / Update" details.
// Options:
//   browserFallback: 'always'      -> use the browser whenever the plain page shows no app details
//                    'unreachable' -> only if the plain request failed or was blocked
//   skipPlain:       go straight to the browser (use when the plain page is known to lack the details)
//   waitFor:         text that means the browser page has finished loading its details
//   nameSelector:    CSS selector of the app name element
//   isDone:          function(htmlSoFar) -> true once the plain download has the details, so it can stop early
//   retryPlain:      how many extra times to repeat the plain request when the page arrives without
//                    app details, before trusting that the app is really missing
export async function checkDetailPage(
  target,
  store,
  { browserFallback = 'always', skipPlain = false, waitFor = null, nameSelector = null, isDone = null, retryPlain = 0 } = {}
) {
  let info = null;
  let via = 'plain request';
  let plainFailed = false;

  if (!skipPlain) {
    for (let attempt = 0; attempt <= retryPlain; attempt++) {
      info = null;
      plainFailed = false;
      try {
        const res = await fetchPageUntil(target, isDone);
        logger.info(
          `[${store}] plain request: HTTP ${res.status}, first byte ${res.ttfbMs} ms, total ${res.totalMs} ms, ` +
            `${Math.round(res.body.length / 1024)} KB${res.stoppedEarly ? ' (stopped early)' : ''}`
        );
        if (res.status === 404) return { status: Status.BROKEN, notes: `${store} returned 404 for this app page` };
        if (res.status >= 400) {
          plainFailed = true;
        } else {
          info = extractAppInfo(res.body, { nameSelector });
          if (!info.hasInfo) {
            const title = ((res.body.match(/<title[^>]*>([^<]*)/i) || [])[1] || '').trim().slice(0, 80);
            logger.warn(
              `[${store}] page arrived without app details (HTTP ${res.status}, ${Math.round(res.body.length / 1024)} KB, ` +
                `title: ${title})${attempt < retryPlain ? ', trying again' : ''}`
            );
          }
        }
      } catch (e) {
        plainFailed = true;
        logger.warn(`[${store}] plain request failed: ${e.message}`);
      }
      if (info && info.hasInfo) break;
      if (attempt < retryPlain) await new Promise((r) => setTimeout(r, 500));
    }
  }

  const needBrowser =
    skipPlain ||
    (!(info && info.hasInfo) && (browserFallback === 'always' || plainFailed || Boolean(info && info.blocked)));

  if (needBrowser) {
    via = 'browser';
    try {
      const page = await renderPage(target, { selector: 'h2', waitFor });
      if (page.status === 404) return { status: Status.BROKEN, notes: `${store} returned 404 for this app page` };
      info = extractAppInfo(page.body, { nameSelector });
    } catch (e) {
      return { status: Status.REVIEW, notes: `Browser check failed: ${e.message.split('\n')[0]}` };
    }
  }

  if (!info) return { status: Status.REVIEW, notes: `${store} page could not be read` };

  logger.info(
    `[${store}] via ${via}: name=${info.name} version=${info.version} seller=${info.developer} updated=${info.updated}`
  );

  if (info.blocked) {
    return { status: Status.REVIEW, notes: `${store} blocked the check (bot protection). Verify manually` };
  }
  if (!info.hasInfo) {
    return {
      status: Status.BROKEN,
      notes: `No app details found on the ${store} page (app removed, or wrong ID or country store)`,
    };
  }
  return {
    status: Status.VERIFIED,
    appName: info.name,
    developer: info.developer,
    version: info.version,
    notes: [info.updated ? `Updated ${info.updated}` : null, `via ${via}`].filter(Boolean).join('; '),
  };
}
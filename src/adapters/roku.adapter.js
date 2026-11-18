import * as cheerio from 'cheerio';
import { BaseAdapter } from './base.adapter.js';
import { renderPage } from '../utils/browser.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { Status } from '../models/result.js';

const API = 'https://channelstore.roku.com/api/v6/channels/detailsunion';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Titles that belong to Roku's site in general, not to a specific app (browser fallback only)
const GENERIC = /^(roku)?\s*[|\-–]?\s*(channel ?store|streaming store)?$/i;
const NOT_FOUND = /(page not found|couldn.t find|no longer available)/i;

// URLs like /en-gb/details/... carry the store's language and country
function localeFrom(url) {
  const seg = new URL(url).pathname.split('/')[1] || '';
  const m = seg.match(/^([a-z]{2})-([a-z]{2})$/i);
  return m ? { language: m[1].toLowerCase(), country: m[2].toUpperCase() } : { language: 'en', country: 'US' };
}

// Breadth-first search for the first non-empty string stored under any of the given keys
function findString(root, keys) {
  for (const key of keys) {
    const queue = [root];
    while (queue.length) {
      const cur = queue.shift();
      if (!cur || typeof cur !== 'object') continue;
      for (const [k, v] of Object.entries(cur)) {
        if (k.toLowerCase() === key && typeof v === 'string' && v.trim()) return v.trim();
      }
      for (const v of Object.values(cur)) if (v && typeof v === 'object') queue.push(v);
    }
  }
  return null;
}

// Fast path: Roku's own JSON endpoint (no browser)
async function viaApi(url, appId) {
  const { language, country } = localeFrom(url);
  const res = await fetch(`${API}/${appId}?country=${country}&language=${language}`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (res.status === 404 || res.status === 400) return { gone: true };
  if (!res.ok) throw new Error(`API HTTP ${res.status}`);
  return { data: await res.json() };
}

// Slow fallback: render the page in a browser and read it
function inspect(html) {
  const $ = cheerio.load(html);
  const candidates = [
    $('h1').first().text(),
    $('meta[property="og:title"]').attr('content'),
    $('title').text(),
  ].map((s) => (s || '').replace(/\s*\|.*$/, '').trim());
  const name = candidates.find((c) => c && !GENERIC.test(c)) || null;
  $('script, style').remove();
  return { name, notFound: NOT_FOUND.test($('body').text()) };
}

async function viaBrowser(url) {
  try {
    const page = await renderPage(url);
    if (page.status === 404) return { status: Status.BROKEN, notes: 'Channel page returned 404' };
    const found = inspect(page.body);
    if (found.notFound) return { status: Status.BROKEN, notes: 'Roku shows a "not found" page for this channel' };
    if (!found.name) return { status: Status.REVIEW, notes: 'Loaded, but no app name could be read' };
    return { status: Status.VERIFIED, appName: found.name, notes: 'Checked via browser fallback' };
  } catch (e) {
    return { status: Status.REVIEW, notes: `Browser check failed: ${e.message}` };
  }
}

export class RokuAdapter extends BaseAdapter {
  get platform() {
    return 'roku';
  }

  async verify(url, info) {
    if (!info.appId) {
      return { status: Status.BROKEN, notes: 'No channel ID found in URL (/details/<id>)' };
    }

    try {
      const out = await viaApi(url, info.appId);
      if (out.gone) return { status: Status.BROKEN, notes: 'Roku has no channel with this ID' };

      const appName = findString(out.data, ['name', 'title']);
      if (!appName) {
        return { status: Status.REVIEW, notes: 'Roku API answered, but no app name was found in the response' };
      }
      const developer = findString(out.data, ['developer', 'developername', 'publisher', 'publishername', 'vendor']);
      return { status: Status.VERIFIED, appName, developer };
    } catch (e) {
      logger.warn('Roku API failed, falling back to browser:', e.message);
      return viaBrowser(url);
    }
  }
}
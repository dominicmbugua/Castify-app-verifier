import * as cheerio from 'cheerio';
import { BaseAdapter } from './base.adapter.js';
import { renderPage } from '../utils/browser.js';
import { Status } from '../models/result.js';

const BLOCKED = /(robot check|enter the characters you see|api-services-support@amazon\.com|automated access)/i;
const DEAD_TITLE = /(page not found|looking for something)/i;
const APP_TITLE = /app on amazon appstore|amazon appstore/i;

// Keep only the store and the app ID; drop Amazon's long tracking parameters
function cleanUrl(url, asin) {
  const u = new URL(url);
  return `${u.protocol}//${u.hostname}/dp/${asin}`;
}

function inspect(html) {
  if (BLOCKED.test(html)) return { blocked: true };
  const $ = cheerio.load(html);
  const title = $('title').text().trim();
  if (DEAD_TITLE.test(title)) return { dead: true };

  const raw =
    $('#productTitle').text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    title;
  const name =
    (raw || '')
      .replace(/^Amazon\.com\s*:\s*/i, '')
      .replace(/\s*[-:|]\s*(App on Amazon Appstore|Appstore for Android).*$/i, '')
      .trim() || null;

  const developer =
    $('#bylineInfo').first().text().replace(/^\s*(Visit the|Brand:|by)\s*/i, '').replace(/\s*Store\s*$/i, '').trim() ||
    null;

  // Is this an Amazon Appstore app, or some other kind of product?
  const isApp = APP_TITLE.test(title) || APP_TITLE.test(raw || '');

  return { name, developer, isApp };
}

export class AmazonAdapter extends BaseAdapter {
  get platform() {
    return 'amazon';
  }

  async verify(url, info) {
    if (!info.appId) {
      return { status: Status.BROKEN, notes: 'No app ID (/dp/<10 characters>) found in URL' };
    }

    // Amazon blocks plain requests, so go straight to the browser.
    // The name is in the page title, so we skip Amazon's scripts, continue as soon as Amazon starts
    // answering (waitUntil: 'commit'), and wait only until the title has arrived.
    let found;
    try {
      const page = await renderPage(cleanUrl(url, info.appId), {
        blockScripts: true,
        waitUntil: 'commit',
        waitFor: 'Amazon|not found|looking for something|robot check|captcha',
      });
      if (page.status === 404) return { status: Status.BROKEN, notes: 'Amazon returned 404 for this listing' };
      found = inspect(page.body);
    } catch (e) {
      const firstLine = e.message.split('\n')[0];
      const note = /ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED/.test(firstLine)
        ? 'Amazon closed the connection (bot protection or network). Retry, or verify manually'
        : `Browser check failed: ${firstLine}`;
      return { status: Status.REVIEW, notes: note };
    }

    if (found.blocked) return { status: Status.REVIEW, notes: 'Amazon bot protection blocked the check. Verify manually' };
    if (found.dead) return { status: Status.BROKEN, notes: 'Amazon shows a "page not found" for this listing' };
    if (!found.name) return { status: Status.REVIEW, notes: 'Page loaded, but no app name could be read' };
    if (!found.isApp) {
      return {
        status: Status.MISMATCH,
        appName: found.name,
        developer: found.developer,
        notes: 'This is an Amazon product page, not an Appstore app listing',
      };
    }
    return { status: Status.VERIFIED, appName: found.name, developer: found.developer };
  }
}
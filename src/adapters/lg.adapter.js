import { BaseAdapter } from './base.adapter.js';
import { checkDetailPage } from '../utils/appinfo.js';
import { fetchKeepAlive } from '../utils/http.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { Status } from '../models/result.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Breadth-first search for the first non-empty string or number stored under any of the given keys
function findValue(root, keys) {
  for (const key of keys) {
    const queue = [root];
    while (queue.length) {
      const cur = queue.shift();
      if (!cur || typeof cur !== 'object') continue;
      for (const [k, v] of Object.entries(cur)) {
        if (k.toLowerCase() === key && (typeof v === 'string' || typeof v === 'number') && String(v).trim()) {
          return String(v).trim();
        }
      }
      for (const v of Object.values(cur)) if (v && typeof v === 'object') queue.push(v);
    }
  }
  return null;
}

// Finds the object that holds a given key (so we can log which fields LG sends)
function findObjectWith(root, key) {
  const queue = [root];
  while (queue.length) {
    const cur = queue.shift();
    if (!cur || typeof cur !== 'object') continue;
    if (Object.keys(cur).some((k) => k.toLowerCase() === key)) return cur;
    for (const v of Object.values(cur)) if (v && typeof v === 'object') queue.push(v);
  }
  return null;
}

// LG's own page loads these details with this request, so we make the same call without a browser.
// It reuses an open connection when one is available.
async function viaApi(origin, appId, pageUrl) {
  const t0 = performance.now();
  const res = await fetchKeepAlive(`${origin}/api/tvapp/retrieveAppInfo.ajax`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      Origin: origin,
      Referer: pageUrl,
      'User-Agent': UA,
    },
    body: `appId=${appId}&searchCntryCode=`,
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  const text = await res.text();
  logger.info(`[LG] API: HTTP ${res.status}, ${text.length} bytes in ${Math.round(performance.now() - t0)} ms`);
  if (!res.ok) throw new Error(`API HTTP ${res.status}`);
  return JSON.parse(text);
}

export class LGAdapter extends BaseAdapter {
  get platform() {
    return 'lg';
  }

  async verify(url, info) {
    if (!info.appId) {
      return {
        status: Status.BROKEN,
        notes: 'Not an LG app page link (expected .../main/tvapp/detail?appId=<number>)',
      };
    }

    // Keep the country store from the URL, drop everything else
    const u = new URL(url);
    const pageUrl = `${u.origin}/main/tvapp/detail?appId=${info.appId}`;

    try {
      const data = await viaApi(u.origin, info.appId, pageUrl);

      const seller = findValue(data, ['sellrusrname', 'sellername', 'sellerusrname']);
      const appName = findValue(data, ['appname', 'appnm', 'apptitle', 'appnameeng', 'title', 'name']);
      const version = findValue(data, ['appversion', 'appver', 'version', 'appverno', 'verno']);
      const updated = findValue(data, ['updatedate', 'lastupdatedate', 'appupdatedate', 'updtdate', 'appregdate', 'regdate']);

      const holder = findObjectWith(data, 'sellrusrname');
      logger.info(
        `[LG] API fields: ${holder ? Object.keys(holder).join(', ') : 'no app object found'} | ` +
          `name=${appName} version=${version} seller=${seller} updated=${updated}`
      );

      // No seller and no name means LG has no app with this ID
      if (!seller && !appName) {
        return { status: Status.BROKEN, notes: 'LG has no app with this ID in this country store' };
      }
      if (!appName) {
        return {
          status: Status.REVIEW,
          developer: seller,
          version,
          notes: 'LG answered, but the app name field was not found. Check the [LG] API fields line in the terminal',
        };
      }
      return {
        status: Status.VERIFIED,
        appName,
        developer: seller,
        version,
        notes: [updated ? `Updated ${updated}` : null, 'via LG data request'].filter(Boolean).join('; '),
      };
    } catch (e) {
      // Fall back to the slow browser check
      logger.warn(`[LG] data request failed (${e.message}), falling back to browser`);
      return checkDetailPage(pageUrl, 'LG', { skipPlain: true, waitFor: 'Seller' });
    }
  }
}
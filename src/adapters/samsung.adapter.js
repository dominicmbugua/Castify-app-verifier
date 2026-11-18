import { BaseAdapter } from './base.adapter.js';
import { checkDetailPage } from '../utils/appinfo.js';
import { Status } from '../models/result.js';

// True once the download has reached the app details (the title element, then the "Seller" line after it)
function hasAppDetails(html) {
  const i = html.indexOf('personalize-apps__detail-title');
  if (i === -1) return false;
  const j = html.indexOf('Seller', i);
  return j !== -1 && html.length > j + 400;
}

export class SamsungAdapter extends BaseAdapter {
  get platform() {
    return 'samsung';
  }

  async verify(url, info) {
    if (!info.appId) {
      return {
        status: Status.BROKEN,
        notes: 'Not a Samsung TV app page link (expected .../samsung-tv-apps-detail/?appId=<number>)',
      };
    }
    // Keep the regional page from the URL, drop everything else.
    // Samsung's plain page already contains the details, so skip the slow browser unless the request fails,
    // and stop downloading as soon as the details have arrived.
    const u = new URL(url);
    return checkDetailPage(`${u.origin}${u.pathname}?appId=${info.appId}`, 'Samsung', {
      browserFallback: 'unreachable',
      nameSelector: '.personalize-apps__detail-title',
      isDone: hasAppDetails,
    });
  }
}
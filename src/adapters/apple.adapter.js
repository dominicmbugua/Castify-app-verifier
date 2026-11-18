import { BaseAdapter } from './base.adapter.js';
import { fetchJson } from '../utils/http.js';
import { Status } from '../models/result.js';

export class AppleAdapter extends BaseAdapter {
  get platform() {
    return 'apple';
  }

  async verify(url, info) {
    if (!info.appId) {
      return { status: Status.BROKEN, notes: 'No app ID (id123456789) found in URL' };
    }
    const api = `https://itunes.apple.com/lookup?id=${info.appId}&country=${info.country || 'us'}`;
    const data = await fetchJson(api);
    if (!data.resultCount) {
      return { status: Status.BROKEN, notes: 'App not found in App Store (removed or wrong country)' };
    }
    const a = data.results[0];
    return {
      status: Status.VERIFIED,
      appName: a.trackName,
      developer: a.artistName,
      version: a.version,
      notes: `Devices: ${(a.supportedDevices || []).slice(0, 3).join(', ')}`,
    };
  }
}

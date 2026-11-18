// Decides which store a URL belongs to and extracts the app ID.
export function detect(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return { platform: 'invalid', appId: null };
  }
  const host = u.hostname.toLowerCase();
  const path = u.pathname;
  const numericId = (v) => (v && /^\d+$/.test(v) ? v : null);

  if (host === 'apps.apple.com' || host === 'itunes.apple.com') {
    const m = path.match(/\/id(\d+)/);
    const seg = path.split('/')[1] || '';
    const country = seg.length === 2 ? seg : 'us';
    return { platform: 'apple', appId: m ? m[1] : null, country };
  }

  if (host.endsWith('roku.com')) {
    const m = path.match(/\/details\/([a-f0-9:]+)/i);
    return { platform: 'roku', appId: m ? m[1] : null };
  }

  if (/(^|\.)amazon\.[a-z.]+$/.test(host) || host === 'amzn.to') {
    const m = path.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    return { platform: 'amazon', appId: m ? m[1].toUpperCase() : null };
  }

  if (host.endsWith('samsung.com')) {
    const isTvAppPage = path.includes('samsung-tv-apps-detail');
    return { platform: 'samsung', appId: isTvAppPage ? numericId(u.searchParams.get('appId')) : null };
  }

  if (host.endsWith('lgappstv.com')) {
    return { platform: 'lg', appId: numericId(u.searchParams.get('appId')) };
  }

  return { platform: 'unsupported', appId: null };
}
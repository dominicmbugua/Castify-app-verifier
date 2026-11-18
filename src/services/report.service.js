const COLS = ['url', 'platform', 'appId', 'status', 'appName', 'developer', 'version', 'durationMs', 'notes', 'checkedAt'];

const esc = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(results) {
  const rows = results.map((r) => COLS.map((c) => esc(r[c])).join(','));
  return [COLS.join(','), ...rows].join('\n');
}
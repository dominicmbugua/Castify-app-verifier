const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// True when no expectation is given, or the values match (exact or contained).
export function matches(actual, expected) {
  if (!expected) return true;
  const a = norm(actual);
  const e = norm(expected);
  if (!a) return false;
  return a === e || a.includes(e) || e.includes(a);
}

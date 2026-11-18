const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slug = (s) => String(s).toLowerCase().replace(/\s+/g, '-');

const PLATFORMS = {
  apple: 'Apple',
  roku: 'Roku',
  amazon: 'Amazon',
  samsung: 'Samsung',
  lg: 'LG',
  invalid: 'Not a link',
  unsupported: 'Unsupported',
};

function timeCell(ms) {
  if (ms == null) return '';
  const secs = (ms / 1000).toFixed(2) + ' s';
  return ms > 2000 ? `<span class="slow">${secs}</span>` : secs;
}

let lastRows = [];

function render(rows) {
  lastRows = rows;
  $('results').innerHTML = rows
    .map(
      (r) => `<tr>
      <td><span class="state ${slug(r.status)}"><span class="dot" aria-hidden="true"></span>${esc(r.status)}</span></td>
      <td>${esc(PLATFORMS[r.platform] || r.platform)}</td>
      <td class="app">${esc(r.appName)}</td>
      <td>${esc(r.developer)}</td>
      <td class="version">${esc(r.version)}</td>
      <td class="time">${timeCell(r.durationMs)}</td>
      <td class="notes">${esc(r.notes)}</td>
      <td><a href="${esc(r.url)}" target="_blank" rel="noopener">Open</a></td>
    </tr>`
    )
    .join('');
  const has = rows.length > 0;
  $('tableWrap').hidden = !has;
  $('exportBtn').hidden = !has;
  $('empty').hidden = has;
}

function say(text, isError = false) {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('error', isError);
}

let timer = null;

// Scroll the loader into view if it is off screen, so a check never looks like "nothing happened"
function ensureVisible(el) {
  const r = el.getBoundingClientRect();
  if (r.top < 0 || r.bottom > window.innerHeight) {
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' });
  }
}

function setBusy(btn, on) {
  btn.classList.toggle('busy', on);
  btn.querySelector('.label').textContent = on ? 'Checking...' : btn.dataset.label;
}

function setLoading(on, what = 'Checking', btn = null) {
  clearInterval(timer);
  $('loading').hidden = !on;
  $('verifyBtn').disabled = on;
  $('batchBtn').disabled = on;
  if (btn) setBusy(btn, on);
  else { setBusy($('verifyBtn'), false); setBusy($('batchBtn'), false); }
  // Hide the previous results while a new check runs, and bring them back if it fails
  $('tableWrap').hidden = on || lastRows.length === 0;
  $('exportBtn').hidden = on || lastRows.length === 0;
  $('empty').hidden = on || lastRows.length > 0;
  if (on) {
    $('loadingText').textContent = what;
    $('elapsed').textContent = '0.0 s';
    const t0 = performance.now();
    timer = setInterval(() => {
      $('elapsed').textContent = ((performance.now() - t0) / 1000).toFixed(1) + ' s';
    }, 100);
    requestAnimationFrame(() => ensureVisible($('loading')));
  }
}

async function post(path, body, what, btn) {
  say('');
  setLoading(true, what, btn);
  const t0 = performance.now();
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'The check could not run.');
    return { data, secs: (performance.now() - t0) / 1000 };
  } catch (e) {
    say(`The check could not run: ${e.message}`, true);
    return null;
  } finally {
    setLoading(false);
  }
}

function summarize(rows) {
  const count = (s) => rows.filter((r) => r.status === s).length;
  const parts = [
    [count('Verified'), 'verified'],
    [count('Mismatch'), 'mismatch'],
    [count('Broken'), 'broken'],
    [count('Needs Review'), 'need review'],
  ]
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`);
  return parts.join(', ');
}

async function verifyOne() {
  const url = $('url').value.trim();
  if (!url) {
    say('Paste an app store link first.', true);
    $('url').focus();
    return;
  }
  const out = await post(
    '/api/verify',
    { url, expectedName: $('expName').value.trim(), expectedDeveloper: $('expDev').value.trim() },
    'Checking link',
    $('verifyBtn')
  );
  if (!out) return;
  render([out.data]);
  say(`Done in ${out.secs.toFixed(2)} s, including network time.`);
}

async function verifyList() {
  const file = $('csvFile').files[0];
  if (!file) {
    say('Choose a CSV file first.', true);
    return;
  }
  const out = await post('/api/verify/batch', { csv: await file.text() }, 'Checking your list', $('batchBtn'));
  if (!out) return;
  render(out.data);
  say(`Checked ${out.data.length} links in ${out.secs.toFixed(1)} s: ${summarize(out.data)}.`);
}

$('verifyBtn').addEventListener('click', verifyOne);
$('batchBtn').addEventListener('click', verifyList);
$('url').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') verifyOne();
});
$('csvFile').addEventListener('change', () => {
  $('fileName').textContent = $('csvFile').files[0]?.name || 'No file chosen';
});

// Light / dark switch (remembered between visits, light by default)
const root = document.documentElement;
function syncTheme() {
  $('themeLabel').textContent = root.dataset.theme === 'dark' ? 'Light mode' : 'Dark mode';
}
$('themeBtn').addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try { localStorage.setItem('castify-theme', next); } catch (e) {}
  syncTheme();
});
syncTheme();
import { chromium } from 'playwright';

const URL = process.argv[2];
const NEEDLE = process.argv[3];
if (!URL || !NEEDLE) {
  console.log('Usage: node scripts/find-api.js "<page url>" "<text that appears on the page>"');
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const t0 = Date.now();

page.on('response', async (res) => {
  const req = res.request();
  const type = req.resourceType();
  if (!['document', 'xhr', 'fetch'].includes(type)) return;
  let text = '';
  try {
    text = await res.text();
  } catch {}
  const i = text.indexOf(NEEDLE);
  const hit = i !== -1;
  const post = req.method() === 'POST' ? ` body=${(req.postData() || '').slice(0, 300)}` : '';
  console.log(
    `${String(Date.now() - t0).padStart(5)} ms  ${type}  ${req.method()} ${res.status()}  ${text.length}b  ${hit ? '*** HAS TEXT ***  ' : ''}${req.url()}${post}`
  );
  if (hit) console.log('      context: ' + text.slice(Math.max(0, i - 200), i + 200).replace(/\s+/g, ' '));
});

await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => console.log('goto:', e.message));
await browser.close();
import { chromium } from 'playwright';

const URL =
  process.argv[2] ||
  'https://channelstore.roku.com/details/584b0027d3ec8af7e9cd8879433eaa0e:a0dddf10144e792f1731c2c3ec16c8dc/the-roku-channel';
const NEEDLE = process.argv[3] || 'Roku Channel';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const t0 = Date.now();

page.on('response', async (res) => {
  const req = res.request();
  if (!['xhr', 'fetch'].includes(req.resourceType())) return;
  let size = 0;
  let hit = false;
  try {
    const text = await res.text();
    size = text.length;
    hit = text.includes(NEEDLE);
  } catch {}
  const body = req.method() === 'POST' ? ` body=${(req.postData() || '').slice(0, 300)}` : '';
  console.log(
    `${String(Date.now() - t0).padStart(5)} ms  ${req.method()} ${res.status()}  ${size}b  ${hit ? '*** HAS APP NAME ***  ' : ''}${req.url()}${body}`
  );
});

await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => console.log('goto:', e.message));
await browser.close();
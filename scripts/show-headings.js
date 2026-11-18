import * as cheerio from 'cheerio';

const url = process.argv[2];
const needle = process.argv[3];
if (!url) {
  console.log('Usage: node scripts/show-headings.js "<page url>" "<app name to look for>"');
  process.exit(1);
}

const res = await fetch(url, {
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
});
const html = await res.text();
const $ = cheerio.load(html);

console.log('HTTP', res.status, '| size', Math.round(html.length / 1024), 'KB');
console.log('title:', $('title').text().trim());
for (const sel of ['meta[property="og:title"]', 'meta[name="title"]', 'meta[name="twitter:title"]']) {
  console.log(sel, '=>', $(sel).attr('content'));
}
console.log('--- headings ---');
$('h1,h2,h3,h4').each((i, el) => {
  if (i < 30) console.log(el.tagName, ':', $(el).text().replace(/\s+/g, ' ').trim().slice(0, 100));
});

if (needle) {
  console.log(`--- first places "${needle}" appears ---`);
  let from = 0;
  for (let n = 0; n < 5; n++) {
    const i = html.indexOf(needle, from);
    if (i === -1) break;
    console.log(`#${n + 1}:`, html.slice(Math.max(0, i - 150), i + needle.length + 80).replace(/\s+/g, ' '));
    from = i + needle.length;
  }
}
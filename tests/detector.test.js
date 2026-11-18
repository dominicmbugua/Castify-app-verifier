import test from 'node:test';
import assert from 'node:assert/strict';
import { detect } from '../src/services/detector.service.js';

test('detects Apple and extracts id + country', () => {
  const r = detect('https://apps.apple.com/gb/app/netflix/id363590051');
  assert.equal(r.platform, 'apple');
  assert.equal(r.appId, '363590051');
  assert.equal(r.country, 'gb');
});

test('detects Roku channel id', () => {
  const r = detect('https://channelstore.roku.com/details/12/netflix');
  assert.equal(r.platform, 'roku');
  assert.equal(r.appId, '12');
});

test('detects Amazon ASIN', () => {
  const r = detect('https://www.amazon.com/dp/B00ZE5MQXM');
  assert.equal(r.platform, 'amazon');
  assert.equal(r.appId, 'B00ZE5MQXM');
});

test('detects LG app id', () => {
  const r = detect('https://us.lgappstv.com/main/tvapp/detail?appId=70318&curPage=1');
  assert.equal(r.platform, 'lg');
  assert.equal(r.appId, '70318');
});

test('LG link without an app id has no id', () => {
  assert.equal(detect('https://us.lgappstv.com/main').appId, null);
});

test('detects Samsung TV app id', () => {
  const r = detect('https://www.samsung.com/us/tvs/smart-tv/samsung-tv-apps-detail/?appId=3202201026376');
  assert.equal(r.platform, 'samsung');
  assert.equal(r.appId, '3202201026376');
});

test('flags invalid and unsupported', () => {
  assert.equal(detect('not a url').platform, 'invalid');
  assert.equal(detect('https://example.com/x').platform, 'unsupported');
});
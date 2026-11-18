import { Agent, fetch as undiciFetch } from 'undici';
import { config } from '../config.js';
import { logger } from './logger.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// A shared pool that keeps connections to each store open between checks,
// so a new check does not pay for the slow connection setup again.
const keepAliveAgent = new Agent({
  keepAliveTimeout: 5 * 60 * 1000,
  keepAliveMaxTimeout: 10 * 60 * 1000,
  connections: 10,
});

export function fetchKeepAlive(url, options = {}) {
  return undiciFetch(url, { ...options, dispatcher: keepAliveAgent });
}

// Opens a connection ahead of time so the first real check skips the handshake
export async function preconnect(origin, { quiet = false } = {}) {
  const t0 = performance.now();
  try {
    const res = await fetchKeepAlive(origin + '/', { method: 'HEAD', signal: AbortSignal.timeout(10000) });
    if (!quiet) {
      logger.info(`[warm] ${origin} connection ready (HTTP ${res.status}) in ${Math.round(performance.now() - t0)} ms`);
    }
  } catch (e) {
    if (!quiet) logger.warn(`[warm] could not pre-open ${origin}: ${e.message}`);
  }
}

export async function fetchPage(url, { retries = 1 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
        redirect: 'follow',
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      const body = await res.text();
      return { status: res.status, finalUrl: res.url, body };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// Downloads a page but stops as soon as isDone(htmlSoFar) says we have what we need.
// Also reports how long the first byte took (server time) and the total time.
export async function fetchPageUntil(url, isDone) {
  const t0 = performance.now();
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  const ttfbMs = Math.round(performance.now() - t0);

  if (!res.body) {
    const body = await res.text();
    return { status: res.status, finalUrl: res.url, body, ttfbMs, totalMs: ttfbMs, stoppedEarly: false };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let body = '';
  let stoppedEarly = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      body += decoder.decode(value, { stream: true });
      if (isDone && isDone(body)) {
        stoppedEarly = true;
        break;
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return {
    status: res.status,
    finalUrl: res.url,
    body,
    ttfbMs,
    totalMs: Math.round(performance.now() - t0),
    stoppedEarly,
  };
}

export async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(config.timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
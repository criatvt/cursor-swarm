'use strict';

function sameHost(origin, host) {
  if (origin === undefined) return true;
  if (typeof origin !== 'string' || typeof host !== 'string') return false;
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === origin && url.host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

function createLimiter(now = () => Date.now()) {
  const limits = { move: [60, 90], click: [20, 30], code: [1, 3], demo: [0.2, 1], active: [4, 8] };
  const buckets = new Map();
  return event => {
    if (!limits[event]) return false;
    const [rate, capacity] = limits[event];
    const at = now();
    const bucket = buckets.get(event) || { at, tokens: capacity };
    bucket.tokens = Math.min(capacity, bucket.tokens + Math.max(0, at - bucket.at) / 1000 * rate);
    bucket.at = at;
    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens--;
    buckets.set(event, bucket);
    return allowed;
  };
}

module.exports = { sameHost, createLimiter };

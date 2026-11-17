// 同一台 Netlify 機器上記得最近的寫入次數。換機器或冷啟動會重算，只擋連續亂送。
const buckets = new Map();

export function clientIp(req, context) {
  const fromContext = context && context.ip;
  if (fromContext) return String(fromContext);
  const nf = req.headers.get('x-nf-client-connection-ip');
  if (nf) return nf.trim();
  return 'unknown';
}

export function allowRequest(key, { limit, windowMs }) {
  const now = Date.now();
  const recent = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 5000) {
    for (const [name, times] of buckets) {
      if (!times.some((t) => now - t < windowMs)) buckets.delete(name);
    }
  }
  return true;
}

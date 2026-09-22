const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const MAX_KEYS = 5000;

const buckets = new Map();

function prune(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

// 登入嘗試節流：以 IP + 帳號為 key，避免密碼暴力破解。
export function loginRateLimit(req, res, next) {
  const now = Date.now();
  if (buckets.size > MAX_KEYS) prune(now);

  const username = String(req.body?.username || '').trim().toLowerCase();
  const key = `${req.ip}|${username}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }

  bucket.count += 1;
  if (bucket.count > MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: 'too_many_attempts',
      message: `登入嘗試次數過多，請於 ${Math.ceil(retryAfter / 60)} 分鐘後再試。`,
    });
  }
  next();
}

export function resetLoginRateLimit(req) {
  const username = String(req.body?.username || '').trim().toLowerCase();
  buckets.delete(`${req.ip}|${username}`);
}

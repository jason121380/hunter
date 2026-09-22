const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

export function securityHeaders(_req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// CSRF 防禦第二層（第一層是 SameSite=Lax Cookie）：
// 對所有會改變狀態的請求，要求 Origin 與本站相同。
export function requireSameOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get('origin');
  if (!origin) return next(); // 非瀏覽器用戶端不會帶 Origin

  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return res.status(403).json({ error: 'forbidden', message: '來源不合法。' });
  }

  if (originHost !== req.get('host')) {
    return res.status(403).json({ error: 'forbidden', message: '跨站請求已被阻擋。' });
  }
  next();
}

import crypto from 'node:crypto';

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function requireAdmin(req, res, next) {
  const configured = process.env.ADMIN_KEY || '';
  if (!configured) {
    return res.status(503).json({ error: 'admin_disabled', message: '管理功能尚未啟用。' });
  }
  const provided = req.get('x-admin-key') || '';
  if (!safeEqual(provided, configured)) {
    return res.status(401).json({ error: 'unauthorized', message: '未授權。' });
  }
  next();
}

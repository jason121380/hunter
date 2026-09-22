export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'forbidden', message: '需要管理員權限。' });
  }
  next();
}

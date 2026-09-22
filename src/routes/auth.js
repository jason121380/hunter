import { Router } from 'express';
import {
  authenticate,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  getSessionUser,
} from '../services/auth.js';
import { loginRateLimit, resetLoginRateLimit } from '../middleware/rate-limit.js';
import { query } from '../db.js';

export const authRouter = Router();

authRouter.post('/login', loginRateLimit, async (req, res, next) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');

    if (!username || !password || username.length > 200 || password.length > 512) {
      return res.status(401).json({ error: 'invalid_credentials', message: '帳號或密碼錯誤。' });
    }

    const user = await authenticate(username, password);
    if (!user) {
      return res.status(401).json({
        error: 'invalid_credentials',
        message: '帳號或密碼錯誤。',
      });
    }

    resetLoginRateLimit(req);
    setSessionCookie(req, res, createSessionToken(user));
    res.json({ ok: true, user });
  } catch (error) {
    next(error);
  }
});

// 這個端點在 requireLogin 之前，因此自行以資料庫為準取回目前的角色與狀態，
// 避免前端依 token 裡過期的角色顯示不該出現的入口。
authRouter.get('/me', async (req, res, next) => {
  try {
    const payload = getSessionUser(req);
    if (!payload) return res.status(401).json({ error: 'unauthorized', message: '請先登入。' });

    const result = await query(
      `SELECT id, username, display_name, role, active,
              (password_hash IS NOT NULL) AS has_password
       FROM users WHERE id=$1 LIMIT 1`,
      [payload.uid]
    );

    const row = result.rows[0];
    if (!row || !row.active || !row.has_password) {
      clearSessionCookie(req, res);
      return res.status(401).json({ error: 'unauthorized', message: '請先登入。' });
    }

    res.json({
      user: {
        id: String(row.id),
        username: row.username || '',
        displayName: row.display_name || '',
        role: row.role,
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout', (req, res) => {
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

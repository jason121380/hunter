import { Router } from 'express';
import {
  authenticate,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  getSessionUser,
} from '../services/auth.js';
import { loginRateLimit, resetLoginRateLimit } from '../middleware/rate-limit.js';

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

authRouter.get('/me', (req, res, next) => {
  try {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized', message: '請先登入。' });
    res.json({
      user: {
        id: user.uid,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
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

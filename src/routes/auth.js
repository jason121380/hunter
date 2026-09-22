import { Router } from 'express';
import {
  authenticate,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  getSessionUser,
} from '../services/auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res, next) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');

    const user = await authenticate(username, password);
    if (!user) {
      return res.status(401).json({
        error: 'invalid_credentials',
        message: '帳號或密碼錯誤。',
      });
    }

    setSessionCookie(res, createSessionToken(user));
    res.json({ ok: true, user });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'unauthorized', message: '請先登入。' });
  res.json({ user });
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

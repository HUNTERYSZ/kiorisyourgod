import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'kior_admin_session';

function sessionValue() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  return createHmac('sha256', secret).update('kior-admin-session-v1').digest('hex');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ''));
  const right = Buffer.from(String(b ?? ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isAuthorized(request) {
  const expected = sessionValue();
  if (!expected) return false;
  const raw = request.headers.get('cookie') || '';
  const cookie = raw.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return false;
  return safeEqual(decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1)), expected);
}

export function verifyPassword(candidate) {
  const configured = process.env.ADMIN_PASSWORD;
  if (!configured || !candidate) return false;
  return safeEqual(candidate, configured);
}

export function createSessionCookie() {
  const value = sessionValue();
  if (!value) throw new Error('SESSION_SECRET must be at least 32 characters long.');
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secure}`;
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

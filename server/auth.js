import crypto from 'node:crypto';

const PIN = process.env.WATCHLIST_PIN || '';
const SECRET = process.env.AUTH_SECRET || '';
const COOKIE = process.env.NODE_ENV === 'production' ? '__Host-watchlist_session' : 'watchlist_session';
const SESSION_TTL = 30 * 24 * 60 * 60;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const attempts = new Map();

setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS - LOCK_MS;
  for (const [ip, item] of attempts) if (item.startedAt < cutoff && item.lockedUntil < Date.now()) attempts.delete(ip);
}, WINDOW_MS).unref();

if (!/^\d{6}$/.test(PIN)) throw new Error('WATCHLIST_PIN must be exactly 6 digits');
if (SECRET.length < 32) throw new Error('AUTH_SECRET must be at least 32 characters');

const pinHash = crypto.scryptSync(PIN, 'watchlist-pin-v1', 32);

function b64(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
}

function validPin(candidate) {
  if (!/^\d{6}$/.test(candidate || '')) return false;
  return crypto.timingSafeEqual(pinHash, crypto.scryptSync(candidate, 'watchlist-pin-v1', 32));
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((part) => {
    const [key, ...value] = part.trim().split('=');
    return [key, value.join('=')];
  }));
}

function isAuthenticated(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = sign(payload);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return session.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function clientIp(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function getAttempt(ip) {
  const now = Date.now();
  let item = attempts.get(ip);
  if (!item || now - item.startedAt > WINDOW_MS) item = { failures: 0, startedAt: now, lockedUntil: 0 };
  attempts.set(ip, item);
  return item;
}

export function authHeaders(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Frame-Options', 'DENY');
  next();
}

export function authRoutes(app) {
  app.get('/api/auth/status', (req, res) => res.json({ authenticated: isAuthenticated(req) }));

  app.post('/api/auth/login', (req, res) => {
    const ip = clientIp(req);
    const item = getAttempt(ip);
    const now = Date.now();
    if (item.lockedUntil > now) {
      const retryAfter = Math.ceil((item.lockedUntil - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many attempts. Try again later.', retryAfter });
    }
    if (!validPin(String(req.body?.pin || ''))) {
      item.failures += 1;
      if (item.failures >= MAX_FAILURES) item.lockedUntil = now + LOCK_MS;
      return res.status(401).json({ error: 'Incorrect PIN', attemptsLeft: Math.max(0, MAX_FAILURES - item.failures) });
    }
    attempts.delete(ip);
    const payload = b64(JSON.stringify({ exp: Math.floor(now / 1000) + SESSION_TTL, nonce: crypto.randomBytes(12).toString('hex') }));
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.set('Set-Cookie', `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL}${secure}`);
    res.json({ authenticated: true });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.set('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    res.json({ authenticated: false });
  });
}

export function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  res.status(401).json({ error: 'Authentication required' });
}

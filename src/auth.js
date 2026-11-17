// Passwords, sessions, CSRF and flash messages. No external dependencies.
const crypto = require('crypto');
const { get, run } = require('./db');

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const secure = process.env.NODE_ENV === 'production';
const cookieBase = { httpOnly: true, sameSite: 'lax', secure, path: '/' };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return salt.toString('hex') + ':' + hash.toString('hex');
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* ignore malformed cookie */
    }
  }
  return out;
}

function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  // Only a hash of the token is stored, so a leaked database cannot be used to log in.
  run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), userId, Date.now() + SESSION_MS);
  res.cookie('sid', token, { ...cookieBase, maxAge: SESSION_MS });
}

function endSession(req, res) {
  if (req.cookies.sid) run('DELETE FROM sessions WHERE token_hash = ?', sha256(req.cookies.sid));
  res.clearCookie('sid', cookieBase);
}

/** Loads cookies, the logged-in user, the CSRF token and any flash message. */
function attach(req, res, next) {
  req.cookies = parseCookies(req.headers.cookie);

  // CSRF: random token in an httpOnly cookie that every form must echo back.
  let csrf = req.cookies.csrf;
  if (!/^[a-f0-9]{48}$/.test(csrf || '')) {
    csrf = crypto.randomBytes(24).toString('hex');
    res.cookie('csrf', csrf, { ...cookieBase, maxAge: 365 * 24 * 60 * 60 * 1000 });
    req.csrfIsNew = true;
  }
  req.csrf = csrf;
  res.locals.csrfField = `<input type="hidden" name="_csrf" value="${csrf}">`;

  // Session
  req.user = null;
  if (req.cookies.sid) {
    const row = get(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
      sha256(req.cookies.sid), Date.now()
    );
    if (row) req.user = row;
    else res.clearCookie('sid', cookieBase);
  }
  res.locals.user = req.user;

  // Flash: one-time message carried across a redirect.
  res.locals.flash = null;
  if (req.cookies.flash && req.method === 'GET') {
    try {
      const f = JSON.parse(req.cookies.flash);
      if (f && typeof f.msg === 'string') res.locals.flash = { type: f.type === 'error' ? 'error' : 'ok', msg: f.msg.slice(0, 300) };
    } catch {
      /* ignore */
    }
    res.clearCookie('flash', cookieBase);
  }
  req.flash = (type, msg) => res.cookie('flash', JSON.stringify({ type, msg }), { ...cookieBase, maxAge: 60000 });

  next();
}

function csrfProtect(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = Buffer.from(String((req.body && req.body._csrf) || ''));
  const expected = Buffer.from(req.csrf);
  if (!req.csrfIsNew && sent.length === expected.length && crypto.timingSafeEqual(sent, expected)) return next();
  res.status(403).render('error', { title: 'Form expired', message: 'That form expired. Go back, refresh the page and try again.' });
}

function requireLogin(req, res, next) {
  if (req.user) return next();
  req.flash('error', 'Log in to do that.');
  const nextUrl = req.method === 'GET' ? '?next=' + encodeURIComponent(req.originalUrl) : '';
  res.redirect('/login' + nextUrl);
}

// Very small in-memory limiter for login attempts (per IP).
const attempts = new Map();
function loginAllowed(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now - rec.start > 15 * 60 * 1000) {
    attempts.set(ip, { start: now, count: 1 });
    return true;
  }
  rec.count += 1;
  return rec.count <= 10;
}
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [ip, rec] of attempts) if (rec.start < cutoff) attempts.delete(ip);
}, 5 * 60 * 1000).unref();

module.exports = { hashPassword, verifyPassword, startSession, endSession, attach, csrfProtect, requireLogin, loginAllowed };

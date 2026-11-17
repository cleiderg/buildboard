// Small helpers shared by routes and views.

/** Trim a form value to a plain string with a maximum length. */
function clean(value, max) {
  if (Array.isArray(value)) value = value[0];
  return String(value == null ? '' : value).replace(/\r\n/g, '\n').trim().slice(0, max);
}

/** Return value if it is one of the allowed options, otherwise the fallback. */
function pick(value, options, fallback) {
  value = clean(value, 200);
  return options.includes(value) ? value : fallback;
}

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** "Python, React ,python" -> "python,react" (lowercase, de-duplicated, max 12). */
function tags(value) {
  const seen = new Set();
  for (const raw of clean(value, 600).split(',')) {
    const t = raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 30);
    if (t) seen.add(t);
    if (seen.size >= 12) break;
  }
  return [...seen].join(',');
}

const tagList = (value) => (value ? String(value).split(',').filter(Boolean) : []);

/** Escape % and _ for a LIKE ... ESCAPE '\' pattern. */
const escLike = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);

function timeAgo(ms) {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Current local time as 'YYYY-MM-DDTHH:MM' (same shape as <input type="datetime-local">). */
function nowLocal(offsetMs = 0) {
  const d = new Date(Date.now() + offsetMs);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** '2026-11-20T18:00' -> 'Fri, Nov 20 · 6:00 PM' */
function fmtWhen(local) {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return local;
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

/** Build a query string from an object, skipping empty values. */
function qs(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== '' && v != null && v !== false) p.set(k, v === true ? '1' : v);
  const s = p.toString();
  return s ? '?' + s : '';
}

/** Only allow http(s) links on profiles. */
function safeLink(value) {
  const v = clean(value, 200);
  if (!v) return '';
  const url = /^https?:\/\//i.test(v) ? v : 'https://' + v;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

/** True when two free-text locations are the same place (ignoring case and spacing). */
const normArea = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const sameArea = (a, b) => !!normArea(a) && normArea(a) === normArea(b);

module.exports = { sameArea, clean, pick, clampInt, tags, tagList, escLike, timeAgo, nowLocal, fmtWhen, initials, qs, safeLink };

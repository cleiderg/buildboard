// Home, sign up / log in, dashboard, notifications and editing your own profile.
const express = require('express');
const { get, all, run } = require('../db');
const auth = require('../auth');
const C = require('../constants');
const { clean, pick, tags, tagList, safeLink } = require('../helpers');
const { PROJECT_CARD, upcomingCutoff, withRsvps } = require('../queries');

const router = express.Router();
const EMAIL_RE = new RegExp(`^[a-z0-9._%+-]+@${C.EMAIL_DOMAIN.replace('.', '\\.')}$`);

const safeNext = (v) => (typeof v === 'string' && /^\/(?![/\\])/.test(v) ? v : '/dashboard');

router.get('/', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  const recent = all(`${PROJECT_CARD} WHERE p.status = 'open' ORDER BY p.created_at DESC LIMIT 6`);
  const stats = {
    projects: get("SELECT COUNT(*) AS n FROM projects WHERE status = 'open'").n,
    students: get('SELECT COUNT(*) AS n FROM users').n,
  };
  res.render('home', { title: 'Find your project team', recent, stats });
});

// ---------- Sign up / log in ----------

router.get('/signup', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('signup', { title: 'Sign up', error: null, form: {} });
});

router.post('/signup', (req, res) => {
  const form = {
    name: clean(req.body.name, 60),
    email: clean(req.body.email, 120).toLowerCase(),
    major: clean(req.body.major, 80),
    year: pick(req.body.year, C.YEARS, ''),
    location: pick(req.body.location, C.AREAS, ''),
  };
  const password = String(req.body.password || '');
  let error = null;
  if (form.name.length < 2) error = 'Please enter your name.';
  else if (!EMAIL_RE.test(form.email)) error = `Use your @${C.EMAIL_DOMAIN} email address.`;
  else if (password.length < 8 || password.length > 200) error = 'Your password needs at least 8 characters.';
  else if (get('SELECT 1 AS x FROM users WHERE email = ?', form.email)) error = 'An account with that email already exists. Try logging in.';
  if (error) return res.status(400).render('signup', { title: 'Sign up', error, form });

  const info = run(
    'INSERT INTO users (email, password_hash, name, major, year, location, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    form.email, auth.hashPassword(password), form.name, form.major, form.year, form.location, Date.now()
  );
  auth.startSession(res, Number(info.lastInsertRowid));
  req.flash('ok', 'Welcome! Add your skills and interests so teams can find you.');
  res.redirect('/profile/edit');
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('login', { title: 'Log in', error: null, email: '', next: safeNext(req.query.next) });
});

router.post('/login', (req, res) => {
  const email = clean(req.body.email, 120).toLowerCase();
  const next = safeNext(req.body.next);
  const fail = (status, error) => res.status(status).render('login', { title: 'Log in', error, email, next });
  if (!auth.loginAllowed(req.ip)) return fail(429, 'Too many attempts. Wait a few minutes and try again.');
  const user = get('SELECT id, password_hash FROM users WHERE email = ?', email);
  if (!user || !auth.verifyPassword(String(req.body.password || ''), user.password_hash)) {
    return fail(401, 'That email and password do not match.');
  }
  auth.startSession(res, user.id);
  res.redirect(next);
});

router.post('/logout', (req, res) => {
  auth.endSession(req, res);
  res.redirect('/');
});

// ---------- Dashboard ----------

router.get('/dashboard', auth.requireLogin, (req, res) => {
  const me = req.user;
  const reviewQueue = all(
    `SELECT r.id, r.message, r.created_at, r.project_id, p.title, u.id AS user_id, u.name, u.major, u.year, u.skills
     FROM join_requests r JOIN projects p ON p.id = r.project_id JOIN users u ON u.id = r.user_id
     WHERE p.owner_id = ? AND r.status = 'pending' ORDER BY r.created_at`,
    me.id
  );
  const myProjects = all(
    `${PROJECT_CARD} JOIN memberships mine ON mine.project_id = p.id AND mine.user_id = ? ORDER BY p.updated_at DESC`,
    me.id
  );
  const myRequests = all(
    `SELECT r.id, r.created_at, p.id AS project_id, p.title FROM join_requests r JOIN projects p ON p.id = r.project_id
     WHERE r.user_id = ? AND r.status = 'pending' ORDER BY r.created_at DESC`,
    me.id
  );
  const meetups = withRsvps(
    all(
      `SELECT mt.*, p.title AS project_title FROM meetups mt JOIN projects p ON p.id = mt.project_id
       WHERE mt.starts_at >= ?
         AND (EXISTS (SELECT 1 FROM memberships m WHERE m.project_id = mt.project_id AND m.user_id = ?)
           OR EXISTS (SELECT 1 FROM rsvps r WHERE r.meetup_id = mt.id AND r.user_id = ? AND r.status IN ('going', 'maybe')))
       ORDER BY mt.starts_at LIMIT 5`,
      upcomingCutoff(), me.id, me.id
    ),
    me.id
  );
  const saved = all(
    `${PROJECT_CARD} JOIN bookmarks b ON b.project_id = p.id AND b.user_id = ? ORDER BY b.created_at DESC`,
    me.id
  );
  const nearby = me.location
    ? all('SELECT id, name, major, year, skills, location FROM users WHERE location = ? AND id != ? ORDER BY created_at DESC LIMIT 6', me.location, me.id)
    : [];

  // Suggest open projects that need skills this student has.
  const mySkills = new Set(tagList(me.skills));
  let suggested = [];
  if (mySkills.size) {
    suggested = all(
      `${PROJECT_CARD} WHERE p.status = 'open' AND p.owner_id != ?
         AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.project_id = p.id AND m.user_id = ?)
       ORDER BY p.created_at DESC LIMIT 200`,
      me.id, me.id
    )
      .map((p) => ({ p, score: tagList(p.skills_needed).filter((s) => mySkills.has(s)).length }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((x) => x.p);
  }

  res.render('dashboard', { title: 'Dashboard', reviewQueue, myProjects, myRequests, meetups, saved, nearby, suggested });
});

// ---------- Notifications ----------

router.get('/notifications', auth.requireLogin, (req, res) => {
  const notes = all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 60', req.user.id);
  run('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', req.user.id);
  res.locals.unreadNotes = 0;
  res.render('notifications', { title: 'Notifications', notes });
});

// ---------- Your profile ----------

router.get('/profile/edit', auth.requireLogin, (req, res) => {
  res.render('profile-edit', { title: 'Edit profile', error: null, form: req.user });
});

router.post('/profile', auth.requireLogin, (req, res) => {
  const form = {
    name: clean(req.body.name, 60),
    major: clean(req.body.major, 80),
    year: pick(req.body.year, C.YEARS, ''),
    location: pick(req.body.location, C.AREAS, ''),
    bio: clean(req.body.bio, 1000),
    skills: tags(req.body.skills),
    interests: tags(req.body.interests),
    availability: clean(req.body.availability, 120),
    link: safeLink(req.body.link),
  };
  if (form.name.length < 2) {
    return res.status(400).render('profile-edit', { title: 'Edit profile', error: 'Please enter your name.', form });
  }
  run(
    `UPDATE users SET name = ?, major = ?, year = ?, location = ?, bio = ?, skills = ?, interests = ?, availability = ?, link = ? WHERE id = ?`,
    form.name, form.major, form.year, form.location, form.bio, form.skills, form.interests, form.availability, form.link, req.user.id
  );
  req.flash('ok', 'Profile saved.');
  res.redirect('/people/' + req.user.id);
});

router.post('/profile/password', auth.requireLogin, (req, res) => {
  const current = String(req.body.current || '');
  const next = String(req.body.password || '');
  if (!auth.verifyPassword(current, req.user.password_hash)) req.flash('error', 'Your current password is not right.');
  else if (next.length < 8 || next.length > 200) req.flash('error', 'Your new password needs at least 8 characters.');
  else {
    run('UPDATE users SET password_hash = ? WHERE id = ?', auth.hashPassword(next), req.user.id);
    req.flash('ok', 'Password changed.');
  }
  res.redirect('/profile/edit');
});

module.exports = router;

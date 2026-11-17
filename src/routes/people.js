// Member directory and profiles (logged-in members only).
const express = require('express');
const { get, all } = require('../db');
const { requireLogin } = require('../auth');
const C = require('../constants');
const { clean, pick, clampInt, escLike } = require('../helpers');
const { PROJECT_CARD } = require('../queries');

const router = express.Router();
const PAGE_SIZE = 18;

router.get('/people', requireLogin, (req, res) => {
  const f = {
    q: clean(req.query.q, 80),
    skill: clean(req.query.skill, 30).toLowerCase(),
    location: clean(req.query.location, 60),
    level: pick(req.query.level, C.LEVELS, ''),
    near: req.query.near === '1' && !!req.user.location,
  };
  const where = ['u.id != ?'];
  const params = [req.user.id];
  if (f.q) {
    const like = '%' + escLike(f.q.toLowerCase()) + '%';
    where.push(`(lower(u.name) LIKE ? ESCAPE '\\' OR lower(u.headline) LIKE ? ESCAPE '\\' OR lower(u.bio) LIKE ? ESCAPE '\\'
      OR u.skills LIKE ? ESCAPE '\\' OR u.interests LIKE ? ESCAPE '\\')`);
    params.push(like, like, like, like, like);
  }
  if (f.skill) { where.push(`(',' || u.skills || ',') LIKE ? ESCAPE '\\'`); params.push('%,' + escLike(f.skill) + ',%'); }
  if (f.near) { where.push('lower(u.location) = lower(?)'); params.push(req.user.location); }
  else if (f.location) { where.push("lower(u.location) LIKE ? ESCAPE '\\'"); params.push('%' + escLike(f.location.toLowerCase()) + '%'); }
  if (f.level) { where.push('u.level = ?'); params.push(f.level); }

  const whereSql = 'WHERE ' + where.join(' AND ');
  const total = get(`SELECT COUNT(*) AS n FROM users u ${whereSql}`, ...params).n;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = clampInt(req.query.page, 1, pages, 1);
  // People in your own area are listed first.
  const people = all(
    `SELECT u.id, u.name, u.headline, u.level, u.location, u.skills, u.bio, u.availability FROM users u ${whereSql}
     ORDER BY (u.location != '' AND lower(u.location) = lower(?)) DESC, u.created_at DESC LIMIT ? OFFSET ?`,
    ...params, req.user.location, PAGE_SIZE, (page - 1) * PAGE_SIZE
  );
  res.render('people', { title: 'People', people, f, total, page, pages });
});

router.get('/people/:id', requireLogin, (req, res) => {
  const person = get(
    'SELECT id, name, headline, level, location, bio, skills, interests, availability, link, created_at FROM users WHERE id = ?',
    Number(req.params.id) || 0
  );
  if (!person) return res.status(404).render('error', { title: 'Not found', message: 'That profile does not exist.' });
  const projects = all(
    `${PROJECT_CARD} JOIN memberships mine ON mine.project_id = p.id AND mine.user_id = ? ORDER BY p.updated_at DESC`,
    person.id
  );
  res.render('person', { title: person.name, person, projects });
});

module.exports = router;

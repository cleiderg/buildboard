// In-person (or online) meetups for a project, with RSVPs.
const express = require('express');
const { get, all, run, notify } = require('../db');
const { requireLogin } = require('../auth');
const { clean, nowLocal, fmtWhen } = require('../helpers');
const { isMember, upcomingCutoff, withRsvps } = require('../queries');

const router = express.Router();

// Upcoming meetups: yours first, then ones anyone can drop in on.
router.get('/meetups', requireLogin, (req, res) => {
  const me = req.user;
  const rows = withRsvps(
    all(
      `SELECT mt.*, p.title AS project_title,
              EXISTS (SELECT 1 FROM memberships m WHERE m.project_id = mt.project_id AND m.user_id = ?) AS is_member
       FROM meetups mt JOIN projects p ON p.id = mt.project_id
       WHERE mt.starts_at >= ?
         AND (mt.open_to_all = 1 OR EXISTS (SELECT 1 FROM memberships m WHERE m.project_id = mt.project_id AND m.user_id = ?))
       ORDER BY mt.starts_at LIMIT 100`,
      me.id, upcomingCutoff(), me.id
    ),
    me.id
  );
  const mine = rows.filter((m) => m.is_member || m.my_rsvp === 'going' || m.my_rsvp === 'maybe');
  const open = rows.filter((m) => !mine.includes(m));
  res.render('meetups', { title: 'Meetups', mine, open });
});

router.post('/projects/:id/meetups', requireLogin, (req, res) => {
  const project = get('SELECT * FROM projects WHERE id = ?', Number(req.params.id) || 0);
  if (!project) return res.status(404).render('error', { title: 'Not found', message: 'That project does not exist.' });
  const back = '/projects/' + project.id + '#meetups';
  if (!isMember(project.id, req.user.id)) {
    req.flash('error', 'Only team members can schedule meetups.');
    return res.redirect(back);
  }
  const title = clean(req.body.title, 100);
  const place = clean(req.body.place, 120);
  const startsAt = clean(req.body.starts_at, 16);
  const notes = clean(req.body.notes, 500);
  const open = req.body.open_to_all === '1' ? 1 : 0;

  if (!title || !place) req.flash('error', 'A meetup needs a title and a place.');
  else if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startsAt) || Number.isNaN(new Date(startsAt).getTime())) req.flash('error', 'Pick a date and time for the meetup.');
  else if (startsAt < nowLocal(-24 * 60 * 60 * 1000)) req.flash('error', 'That time is in the past.');
  else {
    const info = run(
      'INSERT INTO meetups (project_id, creator_id, title, place, starts_at, notes, open_to_all, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      project.id, req.user.id, title, place, startsAt, notes, open, Date.now()
    );
    run("INSERT INTO rsvps (meetup_id, user_id, status) VALUES (?, ?, 'going')", Number(info.lastInsertRowid), req.user.id);
    const others = all('SELECT user_id FROM memberships WHERE project_id = ? AND user_id != ?', project.id, req.user.id);
    for (const o of others) notify(o.user_id, `New meetup for "${project.title}": ${title}, ${fmtWhen(startsAt)} at ${place}.`, back);
    req.flash('ok', 'Meetup scheduled.');
  }
  res.redirect(back);
});

function loadMeetup(req) {
  return get(
    `SELECT mt.*, p.owner_id, p.title AS project_title FROM meetups mt JOIN projects p ON p.id = mt.project_id WHERE mt.id = ?`,
    Number(req.params.mid) || 0
  );
}

router.post('/meetups/:mid/rsvp', requireLogin, (req, res) => {
  const m = loadMeetup(req);
  if (!m) return res.redirect('/meetups');
  const back = req.body.from === 'meetups' ? '/meetups' : '/projects/' + m.project_id + '#meetups';
  const status = ['going', 'maybe', 'no'].includes(req.body.status) ? req.body.status : null;
  if (!status || !(m.open_to_all || isMember(m.project_id, req.user.id))) {
    req.flash('error', 'You cannot RSVP to that meetup.');
    return res.redirect(back);
  }
  const before = get('SELECT status FROM rsvps WHERE meetup_id = ? AND user_id = ?', m.id, req.user.id);
  run(
    'INSERT INTO rsvps (meetup_id, user_id, status) VALUES (?, ?, ?) ON CONFLICT (meetup_id, user_id) DO UPDATE SET status = excluded.status',
    m.id, req.user.id, status
  );
  if (status === 'going' && (!before || before.status !== 'going') && m.creator_id !== req.user.id) {
    notify(m.creator_id, `${req.user.name} is coming to "${m.title}".`, '/projects/' + m.project_id + '#meetups');
  }
  res.redirect(back);
});

router.post('/meetups/:mid/delete', requireLogin, (req, res) => {
  const m = loadMeetup(req);
  if (!m) return res.redirect('/meetups');
  if (m.creator_id === req.user.id || m.owner_id === req.user.id) {
    const going = all("SELECT user_id FROM rsvps WHERE meetup_id = ? AND status IN ('going', 'maybe') AND user_id != ?", m.id, req.user.id);
    run('DELETE FROM meetups WHERE id = ?', m.id);
    for (const g of going) notify(g.user_id, `Meetup cancelled: "${m.title}" (${m.project_title}).`, '/projects/' + m.project_id);
    req.flash('ok', 'Meetup cancelled.');
  }
  res.redirect('/projects/' + m.project_id + '#meetups');
});

module.exports = router;

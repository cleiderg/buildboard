// Browsing, posting and running projects: join requests, team, discussion, bookmarks.
const express = require('express');
const { get, all, run, notify } = require('../db');
const { requireLogin } = require('../auth');
const C = require('../constants');
const { clean, pick, clampInt, tags, escLike } = require('../helpers');
const { PROJECT_CARD, isMember, upcomingCutoff, withRsvps } = require('../queries');

const router = express.Router();
const PAGE_SIZE = 12;

function projectInput(body) {
  return {
    title: clean(body.title, 100),
    summary: clean(body.summary, 200),
    description: clean(body.description, 5000),
    category: pick(body.category, C.CATEGORIES, 'Other'),
    stage: pick(body.stage, C.STAGES, C.STAGES[0]),
    work_mode: pick(body.work_mode, C.WORK_MODES, C.WORK_MODES[0]),
    location: clean(body.location, 60).replace(/\s+/g, ' '),
    skills_needed: tags(body.skills_needed),
    roles_needed: clean(body.roles_needed, 300),
    commitment: pick(body.commitment, C.COMMITMENTS, ''),
    team_size: clampInt(body.team_size, 2, 50, 4),
  };
}

function validate(p) {
  if (p.title.length < 4) return 'Give your project a title (at least 4 characters).';
  if (p.summary.length < 10) return 'Add a one-line summary (at least 10 characters).';
  if (p.description.length < 30) return 'Describe the project in a bit more detail (at least 30 characters).';
  return null;
}

/** Loads the project in :id or sends a 404. */
function loadProject(req, res) {
  const id = Number(req.params.id);
  const project = Number.isInteger(id) ? get(`${PROJECT_CARD} WHERE p.id = ?`, id) : null;
  if (!project) res.status(404).render('error', { title: 'Not found', message: 'That project does not exist (it may have been deleted).' });
  return project;
}

/** Loads the project and checks the logged-in user owns it. */
function loadOwned(req, res) {
  const project = loadProject(req, res);
  if (!project) return null;
  if (project.owner_id !== req.user.id) {
    res.status(403).render('error', { title: 'Not allowed', message: 'Only the project owner can do that.' });
    return null;
  }
  return project;
}

// ---------- Browse ----------

router.get('/projects', (req, res) => {
  const f = {
    q: clean(req.query.q, 80),
    category: pick(req.query.category, C.CATEGORIES, ''),
    skill: clean(req.query.skill, 30).toLowerCase(),
    location: clean(req.query.location, 60),
    mode: pick(req.query.mode, C.WORK_MODES, ''),
    stage: pick(req.query.stage, C.STAGES, ''),
    status: req.query.status === 'all' ? 'all' : '',
    near: req.query.near === '1' && !!(req.user && req.user.location),
    sort: req.query.sort === 'active' ? 'active' : '',
  };
  const where = [];
  const params = [];
  if (f.q) {
    const like = '%' + escLike(f.q.toLowerCase()) + '%';
    where.push(`(lower(p.title) LIKE ? ESCAPE '\\' OR lower(p.summary) LIKE ? ESCAPE '\\' OR lower(p.description) LIKE ? ESCAPE '\\'
      OR p.skills_needed LIKE ? ESCAPE '\\' OR lower(p.roles_needed) LIKE ? ESCAPE '\\')`);
    params.push(like, like, like, like, like);
  }
  if (f.category) { where.push('p.category = ?'); params.push(f.category); }
  if (f.skill) { where.push(`(',' || p.skills_needed || ',') LIKE ? ESCAPE '\\'`); params.push('%,' + escLike(f.skill) + ',%'); }
  if (f.location) { where.push("lower(p.location) LIKE ? ESCAPE '\\'"); params.push('%' + escLike(f.location.toLowerCase()) + '%'); }
  if (f.mode) { where.push('p.work_mode = ?'); params.push(f.mode); }
  if (f.stage) { where.push('p.stage = ?'); params.push(f.stage); }
  if (f.status !== 'all') where.push("p.status = 'open'");
  if (f.near) { where.push('(lower(p.location) = lower(?) OR lower(u.location) = lower(?))'); params.push(req.user.location, req.user.location); }

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = get(`SELECT COUNT(*) AS n FROM projects p JOIN users u ON u.id = p.owner_id ${whereSql}`, ...params).n;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = clampInt(req.query.page, 1, pages, 1);
  const order = f.sort === 'active' ? 'p.updated_at DESC' : 'p.created_at DESC';
  const projects = all(`${PROJECT_CARD} ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, PAGE_SIZE, (page - 1) * PAGE_SIZE);

  res.render('projects', { title: 'Projects', projects, f, total, page, pages });
});

// ---------- Create / edit ----------

router.get('/projects/new', requireLogin, (req, res) => {
  res.render('project-form', { title: 'Post a project', error: null, form: { team_size: 4, location: req.user.location }, editing: null });
});

router.post('/projects', requireLogin, (req, res) => {
  const form = projectInput(req.body);
  const error = validate(form);
  if (error) return res.status(400).render('project-form', { title: 'Post a project', error, form, editing: null });
  const now = Date.now();
  const info = run(
    `INSERT INTO projects (owner_id, title, summary, description, category, stage, work_mode, location, skills_needed, roles_needed, commitment, team_size, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    req.user.id, form.title, form.summary, form.description, form.category, form.stage, form.work_mode, form.location,
    form.skills_needed, form.roles_needed, form.commitment, form.team_size, now, now
  );
  const id = Number(info.lastInsertRowid);
  run("INSERT INTO memberships (project_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)", id, req.user.id, now);
  req.flash('ok', 'Your project is live. Share the link and watch for join requests.');
  res.redirect('/projects/' + id);
});

router.get('/projects/:id/edit', requireLogin, (req, res) => {
  const project = loadOwned(req, res);
  if (!project) return;
  res.render('project-form', { title: 'Edit project', error: null, form: project, editing: project });
});

router.post('/projects/:id/edit', requireLogin, (req, res) => {
  const project = loadOwned(req, res);
  if (!project) return;
  const form = projectInput(req.body);
  form.team_size = Math.max(form.team_size, project.member_count);
  const error = validate(form);
  if (error) return res.status(400).render('project-form', { title: 'Edit project', error, form, editing: project });
  run(
    `UPDATE projects SET title = ?, summary = ?, description = ?, category = ?, stage = ?, work_mode = ?, location = ?,
       skills_needed = ?, roles_needed = ?, commitment = ?, team_size = ?, updated_at = ? WHERE id = ?`,
    form.title, form.summary, form.description, form.category, form.stage, form.work_mode, form.location,
    form.skills_needed, form.roles_needed, form.commitment, form.team_size, Date.now(), project.id
  );
  req.flash('ok', 'Project updated.');
  res.redirect('/projects/' + project.id);
});

router.post('/projects/:id/status', requireLogin, (req, res) => {
  const project = loadOwned(req, res);
  if (!project) return;
  const status = project.status === 'open' ? 'closed' : 'open';
  run('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?', status, Date.now(), project.id);
  req.flash('ok', status === 'open' ? 'Project reopened - people can ask to join again.' : 'Project closed to new members.');
  res.redirect('/projects/' + project.id);
});

router.post('/projects/:id/delete', requireLogin, (req, res) => {
  const project = loadOwned(req, res);
  if (!project) return;
  const members = all('SELECT user_id FROM memberships WHERE project_id = ? AND user_id != ?', project.id, req.user.id);
  run('DELETE FROM projects WHERE id = ?', project.id);
  for (const m of members) notify(m.user_id, `"${project.title}" was deleted by its owner.`, '/projects');
  req.flash('ok', 'Project deleted.');
  res.redirect('/dashboard');
});

// ---------- Project page ----------

router.get('/projects/:id', (req, res) => {
  const project = loadProject(req, res);
  if (!project) return;
  const me = req.user;
  const member = isMember(project.id, me && me.id);
  const owner = !!me && project.owner_id === me.id;

  const members = all(
    `SELECT u.id, u.name, u.headline, u.level, m.role FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.project_id = ? ORDER BY m.role = 'owner' DESC, m.joined_at`,
    project.id
  );
  const myRequest = me ? get('SELECT * FROM join_requests WHERE project_id = ? AND user_id = ?', project.id, me.id) : null;
  const requests = owner
    ? all(
        `SELECT r.*, u.name, u.headline, u.level, u.skills, u.location FROM join_requests r JOIN users u ON u.id = r.user_id
         WHERE r.project_id = ? AND r.status = 'pending' ORDER BY r.created_at`,
        project.id
      )
    : [];
  const comments = all(
    `SELECT c.*, u.name FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.project_id = ? AND (c.team_only = 0 OR ?) ORDER BY c.created_at`,
    project.id, member ? 1 : 0
  );
  const meetups = withRsvps(
    all(
      `SELECT * FROM meetups WHERE project_id = ? AND starts_at >= ? AND (open_to_all = 1 OR ?) ORDER BY starts_at`,
      project.id, upcomingCutoff(), member ? 1 : 0
    ),
    me ? me.id : 0
  );
  const bookmarked = !!me && !!get('SELECT 1 AS x FROM bookmarks WHERE user_id = ? AND project_id = ?', me.id, project.id);

  res.render('project', {
    title: project.title,
    project, members, member, owner, myRequest, requests, bookmarked, meetups,
    discussion: comments.filter((c) => !c.team_only),
    teamChat: comments.filter((c) => c.team_only),
  });
});

// ---------- Joining ----------

router.post('/projects/:id/join', requireLogin, (req, res) => {
  const project = loadProject(req, res);
  if (!project) return;
  const back = '/projects/' + project.id;
  if (isMember(project.id, req.user.id)) req.flash('error', 'You are already on this team.');
  else if (project.status !== 'open') req.flash('error', 'This project is not taking new members right now.');
  else {
    const existing = get('SELECT * FROM join_requests WHERE project_id = ? AND user_id = ?', project.id, req.user.id);
    if (existing && existing.status === 'pending') req.flash('error', 'You already asked to join. The owner will get back to you.');
    else {
      if (existing) run('DELETE FROM join_requests WHERE id = ?', existing.id);
      run('INSERT INTO join_requests (project_id, user_id, message, created_at) VALUES (?, ?, ?, ?)',
        project.id, req.user.id, clean(req.body.message, 600), Date.now());
      notify(project.owner_id, `${req.user.name} wants to join "${project.title}".`, back + '#requests');
      req.flash('ok', 'Request sent. You will get a notification when the owner answers.');
    }
  }
  res.redirect(back);
});

router.post('/projects/:id/withdraw', requireLogin, (req, res) => {
  const project = loadProject(req, res);
  if (!project) return;
  run("DELETE FROM join_requests WHERE project_id = ? AND user_id = ? AND status = 'pending'", project.id, req.user.id);
  req.flash('ok', 'Request withdrawn.');
  res.redirect('/projects/' + project.id);
});

router.post('/projects/:id/requests/:rid', requireLogin, (req, res) => {
  const project = loadOwned(req, res);
  if (!project) return;
  const back = '/projects/' + project.id;
  const request = get("SELECT * FROM join_requests WHERE id = ? AND project_id = ? AND status = 'pending'", Number(req.params.rid) || 0, project.id);
  if (!request) {
    req.flash('error', 'That request is no longer pending.');
  } else if (req.body.action === 'accept') {
    if (project.member_count >= project.team_size) {
      req.flash('error', 'Your team is full. Raise the team size (Edit project) before accepting more people.');
    } else {
      run("INSERT OR IGNORE INTO memberships (project_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)", project.id, request.user_id, Date.now());
      run("UPDATE join_requests SET status = 'accepted' WHERE id = ?", request.id);
      run('UPDATE projects SET updated_at = ? WHERE id = ?', Date.now(), project.id);
      notify(request.user_id, `You're in! You were accepted to "${project.title}".`, back);
      req.flash('ok', 'Added to the team.');
    }
  } else {
    run("UPDATE join_requests SET status = 'declined' WHERE id = ?", request.id);
    notify(request.user_id, `Your request to join "${project.title}" was not accepted this time.`, back);
    req.flash('ok', 'Request declined.');
  }
  res.redirect(back);
});

router.post('/projects/:id/leave', requireLogin, (req, res) => {
  const project = loadProject(req, res);
  if (!project) return;
  if (project.owner_id === req.user.id) {
    req.flash('error', 'Owners cannot leave their own project. You can close or delete it instead.');
  } else if (isMember(project.id, req.user.id)) {
    run('DELETE FROM memberships WHERE project_id = ? AND user_id = ?', project.id, req.user.id);
    run('DELETE FROM join_requests WHERE project_id = ? AND user_id = ?', project.id, req.user.id);
    notify(project.owner_id, `${req.user.name} left "${project.title}".`, '/projects/' + project.id);
    req.flash('ok', 'You left the team.');
  }
  res.redirect('/projects/' + project.id);
});

router.post('/projects/:id/members/:uid/remove', requireLogin, (req, res) => {
  const project = loadOwned(req, res);
  if (!project) return;
  const uid = Number(req.params.uid) || 0;
  if (uid !== project.owner_id && isMember(project.id, uid)) {
    run('DELETE FROM memberships WHERE project_id = ? AND user_id = ?', project.id, uid);
    run('DELETE FROM join_requests WHERE project_id = ? AND user_id = ?', project.id, uid);
    notify(uid, `You were removed from "${project.title}".`, '/projects/' + project.id);
    req.flash('ok', 'Member removed.');
  }
  res.redirect('/projects/' + project.id);
});

// ---------- Discussion & team chat ----------

router.post('/projects/:id/comments', requireLogin, (req, res) => {
  const project = loadProject(req, res);
  if (!project) return;
  const back = '/projects/' + project.id;
  const body = clean(req.body.body, 2000);
  const teamOnly = req.body.team_only === '1';
  if (!body) {
    req.flash('error', 'Write something first.');
    return res.redirect(back);
  }
  if (teamOnly && !isMember(project.id, req.user.id)) {
    req.flash('error', 'Only team members can post in the team chat.');
    return res.redirect(back);
  }
  run('INSERT INTO comments (project_id, user_id, body, team_only, created_at) VALUES (?, ?, ?, ?, ?)',
    project.id, req.user.id, body, teamOnly ? 1 : 0, Date.now());
  if (teamOnly) {
    const others = all('SELECT user_id FROM memberships WHERE project_id = ? AND user_id != ?', project.id, req.user.id);
    for (const o of others) notify(o.user_id, `${req.user.name} posted in the "${project.title}" team chat.`, back + '#team');
  } else if (project.owner_id !== req.user.id) {
    notify(project.owner_id, `${req.user.name} commented on "${project.title}".`, back + '#discussion');
  }
  res.redirect(back + (teamOnly ? '#team' : '#discussion'));
});

router.post('/comments/:cid/delete', requireLogin, (req, res) => {
  const c = get(
    'SELECT c.*, p.owner_id FROM comments c JOIN projects p ON p.id = c.project_id WHERE c.id = ?',
    Number(req.params.cid) || 0
  );
  if (!c) return res.redirect('/projects');
  if (c.user_id === req.user.id || c.owner_id === req.user.id) run('DELETE FROM comments WHERE id = ?', c.id);
  res.redirect('/projects/' + c.project_id + (c.team_only ? '#team' : '#discussion'));
});

// ---------- Bookmarks ----------

router.post('/projects/:id/bookmark', requireLogin, (req, res) => {
  const project = loadProject(req, res);
  if (!project) return;
  const has = get('SELECT 1 AS x FROM bookmarks WHERE user_id = ? AND project_id = ?', req.user.id, project.id);
  if (has) run('DELETE FROM bookmarks WHERE user_id = ? AND project_id = ?', req.user.id, project.id);
  else run('INSERT INTO bookmarks (user_id, project_id, created_at) VALUES (?, ?, ?)', req.user.id, project.id, Date.now());
  res.redirect('/projects/' + project.id);
});

module.exports = router;

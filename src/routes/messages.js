// Private one-to-one messages between students.
const express = require('express');
const { get, all, run } = require('../db');
const { requireLogin } = require('../auth');
const { clean } = require('../helpers');

const router = express.Router();

function conversations(meId) {
  return all(
    `SELECT u.id, u.name, m.body, m.created_at, m.sender_id,
            (SELECT COUNT(*) FROM messages x WHERE x.sender_id = u.id AND x.recipient_id = ? AND x.read_at IS NULL) AS unread
     FROM messages m
     JOIN users u ON u.id = CASE WHEN m.sender_id = ? THEN m.recipient_id ELSE m.sender_id END
     WHERE m.id IN (
       SELECT MAX(id) FROM messages WHERE sender_id = ? OR recipient_id = ?
       GROUP BY CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END)
     ORDER BY m.id DESC`,
    meId, meId, meId, meId, meId
  );
}

router.get('/messages', requireLogin, (req, res) => {
  res.render('messages', { title: 'Messages', convos: conversations(req.user.id), other: null, thread: [] });
});

router.get('/messages/:uid', requireLogin, (req, res) => {
  const me = req.user;
  const other = get('SELECT id, name, major, year FROM users WHERE id = ?', Number(req.params.uid) || 0);
  if (!other || other.id === me.id) return res.redirect('/messages');
  const marked = run('UPDATE messages SET read_at = ? WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL', Date.now(), other.id, me.id);
  res.locals.unreadMessages = Math.max(0, res.locals.unreadMessages - Number(marked.changes));
  const thread = all(
    `SELECT * FROM (
       SELECT * FROM messages WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
       ORDER BY id DESC LIMIT 200) ORDER BY id`,
    me.id, other.id, other.id, me.id
  );
  res.render('messages', { title: 'Chat with ' + other.name, convos: conversations(me.id), other, thread });
});

router.post('/messages/:uid', requireLogin, (req, res) => {
  const other = get('SELECT id FROM users WHERE id = ?', Number(req.params.uid) || 0);
  if (!other || other.id === req.user.id) return res.redirect('/messages');
  const body = clean(req.body.body, 2000);
  if (body) run('INSERT INTO messages (sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?)', req.user.id, other.id, body, Date.now());
  res.redirect('/messages/' + other.id + '#end');
});

module.exports = router;

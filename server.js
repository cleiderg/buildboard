// BuildBoard - a message board for finding people to build technical projects with.

const express = require('express');
const path = require('path');
const auth = require('./src/auth');
const helpers = require('./src/helpers');
const constants = require('./src/constants');
const { get, run } = require('./src/db');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', 1);

// Defaults so every view (including error pages) can always render.
Object.assign(app.locals, { C: constants, h: helpers, path: '', user: null, flash: null, csrfField: '', unreadNotes: 0, unreadMessages: 0 });

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'",
  });
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(auth.attach);

// Values every view can use.
app.use((req, res, next) => {
  res.locals.path = req.path;
  res.locals.unreadNotes = 0;
  res.locals.unreadMessages = 0;
  if (req.user) {
    res.locals.unreadNotes = get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', req.user.id).n;
    res.locals.unreadMessages = get('SELECT COUNT(*) AS n FROM messages WHERE recipient_id = ? AND read_at IS NULL', req.user.id).n;
  }
  next();
});
app.use(auth.csrfProtect);

app.use(require('./src/routes/account'));
app.use(require('./src/routes/projects'));
app.use(require('./src/routes/meetups'));
app.use(require('./src/routes/people'));
app.use(require('./src/routes/messages'));

app.use((req, res) => {
  res.status(404).render('error', { title: 'Not found', message: "We couldn't find that page." });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Something went wrong', message: 'Something broke on our side. Please try again.' });
});

// Clear out expired sessions once a day.
setInterval(() => run('DELETE FROM sessions WHERE expires_at < ?', Date.now()), 24 * 60 * 60 * 1000).unref();

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`${constants.SITE_NAME} running at http://localhost:${port}`));

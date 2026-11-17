# ZotBoard

A project message board for UCI students. Post a project idea, find people to build it with, or browse projects that inspire you and join one. Then schedule a meetup with teammates nearby and actually work on it together.

> Student-built. Not affiliated with or endorsed by the University of California, Irvine.

## What you can do

**Post and find projects**
- Post a project with a description, category, stage, the skills and roles you need, time commitment, team size, and where the team will meet.
- Browse and search projects by keyword, category, skill, stage, in-person/hybrid/remote, and campus area. A "Near me" filter shows projects based in your area.
- Save projects for later.

**Build a team**
- Ask to join a project with a short note. The owner gets a notification and accepts or declines.
- Owners can remove members, close the project to new members, reopen it, edit it, or delete it. Members can leave.
- Every project has a public discussion thread and a private team chat that only members can see.

**Meet up**
- Team members schedule meetups (what, when, where on campus) and everyone RSVPs Going / Maybe / Can't go.
- A meetup can be marked "open to anyone" so interested students can drop in. Open meetups are listed on the Meetups page.

**Find people**
- Each student has a profile: major, year, skills, interests, where they are based, and when they are free.
- The People directory is searchable by name, skill, year and area, and lists students in your area first.
- Send private messages to any student.

**Stay on top of things**
- A dashboard shows your projects, join requests waiting on you, upcoming meetups, projects that need your skills, students near you, and saved projects.
- Notifications for join requests, decisions, comments, team chat and meetups.

Sign-up is limited to `@uci.edu` email addresses.

## Run it locally

You need [Node.js](https://nodejs.org) 22.13 or newer (it uses Node's built-in SQLite, so there is nothing else to install).

```bash
npm install
npm run seed
npm start
```

Then open http://localhost:3000.

`npm run seed` is optional. It fills an empty database with demo students, projects and meetups so the site is not blank. Every demo account uses the password `anteater123`, for example `maya.demo@uci.edu`.

Use `npm run dev` to restart the server automatically when files change.

To start over with an empty database, stop the server and delete the `data/` folder.

## Settings

All optional, set as environment variables:

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3000` | Port the server listens on |
| `DB_PATH` | `data/board.db` | Where the SQLite database file lives |
| `NODE_ENV` | | Set to `production` to mark cookies as HTTPS-only |
| `TRUST_PROXY` | | Set to `1` when running behind a reverse proxy (Render, Fly, nginx) |
| `TZ` | `America/Los_Angeles` | Time zone used for meetup times |

## How it is built

- **Server:** Node.js + Express, pages rendered on the server with EJS. No front-end framework or build step.
- **Database:** SQLite through Node's built-in `node:sqlite`. Tables are created automatically on first start.
- **Dependencies:** only `express` and `ejs`.

```
server.js            App setup and middleware
src/
  db.js              Database schema and query helpers
  auth.js            Password hashing, sessions, CSRF protection, login rate limit
  constants.js       Categories, campus areas, and other option lists
  helpers.js         Input cleaning and formatting helpers
  queries.js         Shared SQL
  routes/
    account.js       Home, sign up, log in, dashboard, notifications, your profile
    projects.js      Browse, post, edit, join requests, team, discussion, bookmarks
    meetups.js       Scheduling and RSVPs
    people.js        Student directory and profiles
    messages.js      Private messages
views/               EJS page templates
public/              Stylesheet and a small script
scripts/seed.js      Demo data
```

To change the list of categories, campus areas or suggested meetup spots, edit `src/constants.js`.

### Security

- Passwords are hashed with scrypt and a per-user salt.
- Sessions use a random token in an HTTP-only cookie; only a hash of the token is stored.
- Every form is protected against CSRF, all output is HTML-escaped, and all SQL uses bound parameters.
- A strict Content-Security-Policy blocks inline scripts and third-party content.
- Login attempts are rate limited per IP address.

## Known limits

- **Emails are not verified.** Sign-up checks that the address ends in `@uci.edu` but does not send a confirmation email, so someone could sign up with a UCI address they do not own. Before opening this to real students, add email verification (or UCI single sign-on).
- No password reset by email yet, for the same reason.
- No reporting or moderation tools, and no image uploads.
- Messages and notifications appear when you load a page; nothing updates live.
- SQLite keeps everything in one file on one server. That is plenty for a campus, but the host needs a persistent disk.

## Putting it online

Any host that runs Node and keeps a disk between restarts works (for example Render, Railway or Fly.io with a volume). Set `NODE_ENV=production`, `TRUST_PROXY=1`, and point `DB_PATH` at the persistent disk. Start command: `npm start`.

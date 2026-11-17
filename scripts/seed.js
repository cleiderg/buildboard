// Fills an empty database with demo members, projects and meetups.
//   npm run seed
// Every demo account uses the password "buildboard123".
const { get, run } = require('../src/db');
const { hashPassword } = require('../src/auth');
const { nowLocal } = require('../src/helpers');

if (get('SELECT COUNT(*) AS n FROM users').n > 0) {
  console.log('Database already has data - nothing to seed. Delete the data/ folder to start over.');
  process.exit(0);
}

const DAY = 24 * 60 * 60 * 1000;
const hash = hashPassword('buildboard123');
const now = Date.now();

const users = [
  ['maya', 'Maya Chen', 'Full-stack developer', 'Advanced', 'Austin, TX', 'python,react,sql', 'ai,climate,hackathons', 'I like building small tools people actually use.', 'Weekday evenings'],
  ['diego', 'Diego Ramirez', 'Mechanical engineer', 'Professional', 'Austin, TX', 'cad,3d printing,arduino', 'robotics,drones', 'Makerspace regular. Happy to prototype anything.', 'Tue/Thu afternoons'],
  ['aisha', 'Aisha Patel', 'Product designer', 'Intermediate', 'Austin, TX', 'figma,ux research,html', 'design,accessibility,health', 'Designer who codes a little.', 'Weekends'],
  ['jordan', 'Jordan Lee', 'Founder, non-technical', 'Beginner', 'Seattle, WA', 'marketing,pitching,product', 'startups,fintech', 'Looking for technical co-founders.', 'Mon/Wed after 4'],
  ['sofia', 'Sofia Nguyen', 'Mobile developer', 'Advanced', 'Seattle, WA', 'swift,kotlin,flutter', 'mobile,maps', 'Shipping a side project this quarter.', 'Fridays'],
  ['ethan', 'Ethan Park', 'Data scientist', 'Professional', 'Chicago, IL', 'python,pytorch,statistics', 'ml,sports analytics', 'Happiest with a messy dataset.', 'Evenings'],
  ['lena', 'Lena Morales', 'CS student', 'Beginner', 'Chicago, IL', 'python,javascript,writing', 'open source,security', 'Learning by building. Looking for a first real project.', 'Weekend mornings'],
  ['noah', 'Noah Kim', 'Game developer', 'Intermediate', 'Austin, TX', 'unity,c#,pixel art', 'games,game jams', 'I make tiny games.', 'Any evening'],
];
const id = {};
users.forEach(([handle, name, headline, level, location, skills, interests, bio, availability], i) => {
  const info = run(
    `INSERT INTO users (email, password_hash, name, headline, level, location, skills, interests, bio, availability, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    `${handle}@demo.example`, hash, name, headline, level, location, skills, interests, bio, availability, now - (20 - i) * DAY
  );
  id[handle] = Number(info.lastInsertRowid);
});

const projects = [
  ['maya', 'LeftoverMap: surplus food finder', 'A web app where cafes post end-of-day surplus so less food gets thrown out.',
    'Cafes and bakeries throw away a lot of food at closing. I want a simple web app where staff post what is left and people nearby get notified.\n\nI have a rough prototype of the backend. I need help with the front end and with onboarding the first few shops.',
    'Web / Apps', 'Planning', 'Hybrid', 'Austin, TX', 'react,figma,python', '1 front-end developer, 1 designer', '5-10 hours a week', 4, 9, ['aisha']],
  ['diego', 'Autonomous sidewalk delivery rover', 'A small rover that can carry a backpack-sized load a few blocks on its own.',
    'Building a low-cost rover with a Raspberry Pi, a lidar and 3D-printed parts. The chassis is done. Next up: navigation and obstacle avoidance.\n\nWe meet in person - this is a hands-on build.',
    'Hardware / Robotics', 'In progress', 'In person', 'Austin, TX', 'python,ros,arduino,computer vision', '2 software people for navigation', '10+ hours a week', 5, 7, ['ethan']],
  ['jordan', 'SubSplit: split shared subscriptions', 'Track and split recurring subscriptions with roommates and friends.',
    'Everyone I know shares streaming and software subscriptions and nobody knows who owes what. I have done user interviews and have a clickable mockup. Need builders.',
    'Startup', 'Just an idea', 'Hybrid', 'Seattle, WA', 'react,node,postgres,figma', 'Technical co-founder, designer', 'A few hours a week', 4, 5, []],
  ['sofia', 'Offline-first trail map app', 'A mobile app for hiking trails that works with no signal.',
    'Downloadable vector maps, GPS tracking and trail notes that sync when you are back online. iOS prototype exists. Looking for Android help and someone who knows map tiles.',
    'Mobile', 'In progress', 'In person', 'Seattle, WA', 'kotlin,swift,mapbox,sqlite', 'Android developer, maps/GIS person', 'A few hours a week', 4, 4, []],
  ['ethan', 'Predicting basketball game outcomes', 'A model that predicts game results from play-by-play data, with a public dashboard.',
    'I scraped three seasons of play-by-play data. Want to build a model and a small public dashboard before the season ends.',
    'AI / Machine Learning', 'In progress', 'Remote', '', 'python,statistics,sql,data viz', 'Someone for the dashboard', 'A few hours a week', 3, 3, []],
  ['noah', 'Tiny Dungeon: a roguelike for a game jam', 'A pixel-art roguelike we can actually finish in a month.',
    'Small, silly, finishable. I have movement and combat working in Unity. Need art, music and level ideas.',
    'Games', 'In progress', 'In person', 'Austin, TX', 'pixel art,music,unity,c#', 'Artist, composer', 'A few hours a week', 4, 2, ['lena']],
];
const pid = {};
for (const [owner, title, summary, description, category, stage, mode, location, skills, roles, commitment, size, daysAgo, members] of projects) {
  const t = now - daysAgo * DAY;
  const info = run(
    `INSERT INTO projects (owner_id, title, summary, description, category, stage, work_mode, location, skills_needed, roles_needed, commitment, team_size, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id[owner], title, summary, description, category, stage, mode, location, skills, roles, commitment, size, t, t
  );
  const p = Number(info.lastInsertRowid);
  pid[owner] = p;
  run("INSERT INTO memberships (project_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)", p, id[owner], t);
  for (const m of members) {
    run("INSERT INTO memberships (project_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)", p, id[m], t + DAY);
    run("INSERT INTO join_requests (project_id, user_id, message, status, created_at) VALUES (?, ?, 'Would love to help!', 'accepted', ?)", p, id[m], t);
  }
}

// A pending request, some discussion, and meetups.
run("INSERT INTO join_requests (project_id, user_id, message, created_at) VALUES (?, ?, ?, ?)",
  pid.maya, id.ethan, 'I can help with the notification logic. Free most evenings.', now - DAY);
run('INSERT INTO comments (project_id, user_id, body, team_only, created_at) VALUES (?, ?, ?, 0, ?)',
  pid.maya, id.jordan, 'Have you talked to any cafe owners yet? I know someone who runs two bakeries.', now - 2 * DAY);
run('INSERT INTO comments (project_id, user_id, body, team_only, created_at) VALUES (?, ?, ?, 0, ?)',
  pid.maya, id.maya, 'Not yet - an intro would be amazing!', now - 2 * DAY + 3600000);
run('INSERT INTO comments (project_id, user_id, body, team_only, created_at) VALUES (?, ?, ?, 1, ?)',
  pid.maya, id.aisha, 'First wireframes are in our Figma. Feedback welcome before Thursday.', now - DAY);

function meetup(owner, title, place, daysAhead, hour, open, notes) {
  const starts = nowLocal(daysAhead * DAY).slice(0, 11) + String(hour).padStart(2, '0') + ':00';
  const info = run(
    'INSERT INTO meetups (project_id, creator_id, title, place, starts_at, notes, open_to_all, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    pid[owner], id[owner], title, place, starts, notes, open, now
  );
  run("INSERT INTO rsvps (meetup_id, user_id, status) VALUES (?, ?, 'going')", Number(info.lastInsertRowid), id[owner]);
}
meetup('maya', 'Wireframe review', 'Public library', 2, 18, 0, 'Study room on the 2nd floor.');
meetup('diego', 'Open build night', 'Makerspace', 3, 17, 1, 'Come see the rover and help with wiring. No experience needed.');
meetup('noah', 'Game jam brainstorm', 'Coffee shop', 5, 19, 1, 'Bring ideas for levels.');
meetup('jordan', 'Interest meeting', 'Video call', 4, 16, 1, 'Quick 30-minute chat about the idea.');

console.log(`Seeded ${users.length} members and ${projects.length} projects.`);
console.log('Log in with maya@demo.example / buildboard123 (any demo account uses the same password).');

// Fills an empty database with demo students, projects and meetups.
//   npm run seed
// Every demo account uses the password "anteater123".
process.env.TZ = process.env.TZ || 'America/Los_Angeles';
const { get, run } = require('../src/db');
const { hashPassword } = require('../src/auth');
const { nowLocal } = require('../src/helpers');

if (get('SELECT COUNT(*) AS n FROM users').n > 0) {
  console.log('Database already has data - nothing to seed. Delete the data/ folder to start over.');
  process.exit(0);
}

const DAY = 24 * 60 * 60 * 1000;
const hash = hashPassword('anteater123');
const now = Date.now();

const users = [
  ['maya', 'Maya Chen', 'Computer Science', 'Junior', 'Middle Earth', 'python,react,sql', 'ai,sustainability,hackathons', 'I like building small tools people actually use.', 'Weekday evenings'],
  ['diego', 'Diego Ramirez', 'Mechanical Engineering', 'Senior', 'Vista del Campo / VDC Norte', 'cad,3d printing,arduino', 'robotics,drones', 'Maker-space regular. Happy to prototype anything.', 'Tue/Thu afternoons'],
  ['aisha', 'Aisha Patel', 'Informatics', 'Sophomore', 'Middle Earth', 'figma,ux research,html', 'design,accessibility,health', 'Designer who codes a little.', 'Weekends'],
  ['jordan', 'Jordan Lee', 'Business Administration', 'Junior', 'University Town Center (UTC)', 'marketing,pitching,excel', 'startups,fintech', 'Looking for technical co-founders.', 'Mon/Wed after 4'],
  ['sofia', 'Sofia Nguyen', 'Film and Media Studies', 'Senior', 'Off campus - Irvine', 'video editing,cinematography,premiere', 'documentary,music videos', 'Shooting a short this quarter.', 'Fridays'],
  ['ethan', 'Ethan Park', 'Data Science', 'Grad student', 'Verano Place', 'python,pytorch,statistics', 'ml,sports analytics', 'First-year MS student.', 'Evenings'],
  ['lena', 'Lena Morales', 'Biological Sciences', 'Sophomore', 'Mesa Court', 'lab work,r,writing', 'public health,research', 'Pre-med, curious about data.', 'Weekend mornings'],
  ['noah', 'Noah Kim', 'Computer Game Science', 'Freshman', 'Mesa Court', 'unity,c#,pixel art', 'games,game jams', 'I make tiny games.', 'Any evening'],
];
const id = {};
users.forEach(([handle, name, major, year, location, skills, interests, bio, availability], i) => {
  const info = run(
    `INSERT INTO users (email, password_hash, name, major, year, location, skills, interests, bio, availability, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    `${handle}.demo@uci.edu`, hash, name, major, year, location, skills, interests, bio, availability, now - (20 - i) * DAY
  );
  id[handle] = Number(info.lastInsertRowid);
});

const projects = [
  ['maya', 'ZotBites: dining hall food-waste tracker', 'An app that shows what is left at Brandywine and the Anteatery so less food gets thrown out.',
    'Dining halls throw away a lot of food at closing. I want to build a simple web app where staff post what is left and students get notified.\n\nI have a rough prototype of the backend. I need help with the front end and with talking to dining staff.',
    'Software / Apps', 'Planning', 'Hybrid', 'Middle Earth', 'react,figma,python', '1 front-end developer, 1 designer', '5-10 hours a week', 4, 9, ['aisha']],
  ['diego', 'Autonomous delivery rover for Ring Road', 'A small sidewalk rover that can carry a backpack-sized load around Ring Road.',
    'Building a low-cost rover with a Raspberry Pi, a lidar and 3D-printed parts. The chassis is done. Next up: navigation and obstacle avoidance.\n\nWe meet in person - this is a hands-on build.',
    'Hardware / Robotics', 'In progress', 'In person', 'Vista del Campo / VDC Norte', 'python,ros,arduino,computer vision', '2 software people for navigation', '10+ hours a week', 5, 7, ['ethan']],
  ['jordan', 'Anteater Thrift: campus resale marketplace', 'Buy and sell furniture, textbooks and bikes with other UCI students - no shipping.',
    'Every June, students throw out perfectly good furniture. Every September, new students buy the same things. Let us fix that.\n\nI have done customer interviews and have a pitch deck. Need builders.',
    'Startup / Business', 'Just an idea', 'Hybrid', 'University Town Center (UTC)', 'react,node,marketing,figma', 'Technical co-founder, designer', 'A few hours a week', 4, 5, []],
  ['sofia', 'Short documentary: late nights at Langson', 'A 10-minute doc about the students who study at the library until closing.',
    'Shooting over three weekends. I have a camera and a script outline. Looking for someone on sound, a second camera, and an editor.',
    'Film / Media', 'Planning', 'In person', 'Off campus - Irvine', 'video editing,sound design,cinematography', 'Sound recordist, second camera, editor', 'Weekend sprint / hackathon', 5, 4, []],
  ['ethan', 'Predicting Big West basketball outcomes', 'A model that predicts UCI game results from play-by-play data.',
    'I scraped three seasons of play-by-play data. Want to build a model and a small public dashboard before the season ends.',
    'AI / Data', 'In progress', 'Remote', '', 'python,statistics,sql,data viz', 'Someone for the dashboard', 'A few hours a week', 3, 3, []],
  ['noah', 'Petr Run: an endless runner game', 'A pixel-art endless runner set on campus, for the next game jam.',
    'Small, silly, finishable. I have the movement working in Unity. Need art, music and level ideas.',
    'Games', 'In progress', 'In person', 'Mesa Court', 'pixel art,music,unity,c#', 'Artist, composer', 'A few hours a week', 4, 2, ['lena']],
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
  pid.maya, id.jordan, 'Have you talked to UCI Dining yet? I know someone on the sustainability team.', now - 2 * DAY);
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
meetup('maya', 'Wireframe review', 'Langson Library', 2, 18, 0, 'Study room on the 2nd floor.');
meetup('diego', 'Open build night', 'Engineering Gateway', 3, 17, 1, 'Come see the rover and help with wiring. No experience needed.');
meetup('noah', 'Game jam brainstorm', 'Student Center', 5, 19, 1, 'Bring ideas for levels.');
meetup('jordan', 'Interest meeting', 'Starbucks at Student Center', 4, 16, 1, 'Quick 30-minute chat about the idea.');

console.log(`Seeded ${users.length} students and ${projects.length} projects.`);
console.log('Log in with maya.demo@uci.edu / anteater123 (any demo account uses the same password).');

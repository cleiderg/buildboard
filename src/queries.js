// Shared SQL fragments and lookups.
const { get, all } = require('./db');
const { nowLocal } = require('./helpers');

// Everything a project card needs.
const PROJECT_CARD = `
  SELECT p.*, u.name AS owner_name, u.location AS owner_location,
         (SELECT COUNT(*) FROM memberships m WHERE m.project_id = p.id) AS member_count
  FROM projects p JOIN users u ON u.id = p.owner_id`;

const isMember = (projectId, userId) =>
  !!userId && !!get('SELECT 1 AS x FROM memberships WHERE project_id = ? AND user_id = ?', projectId, userId);

// Meetups stay listed until two hours after they start.
const upcomingCutoff = () => nowLocal(-2 * 60 * 60 * 1000);

/** Adds RSVP counts, the going list and the viewer's own RSVP to each meetup row. */
function withRsvps(meetups, viewerId) {
  for (const m of meetups) {
    const rows = all(
      `SELECT r.status, u.id, u.name FROM rsvps r JOIN users u ON u.id = r.user_id WHERE r.meetup_id = ? ORDER BY u.name`,
      m.id
    );
    m.going = rows.filter((r) => r.status === 'going');
    m.maybe = rows.filter((r) => r.status === 'maybe');
    const mine = rows.find((r) => r.id === viewerId);
    m.my_rsvp = mine ? mine.status : '';
  }
  return meetups;
}

module.exports = { PROJECT_CARD, isMember, upcomingCutoff, withRsvps };

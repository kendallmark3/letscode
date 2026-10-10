// Team-formation rules for one event. Pure: every action takes a state and
// returns a new one, or throws a DomainError with a message safe to show.

export const TEAM_SIZE = 4;
export const INVITE_TTL_MS = 48 * 60 * 60 * 1000;
export const MAX_SKILLS = 5;

export class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new DomainError(code, message);
};

export function createEmptyState() {
  return { version: 3, challenges: [], participants: [], accounts: [], teams: [], invitations: [], notifications: [], seq: 1 };
}

// Sample content for tests and the local demo: one live challenge and fictional participants.
export function createInitialState(demo) {
  return {
    ...createEmptyState(),
    challenges: [{ ...demo.challenge, date: '', status: 'live', enrollmentOpen: true }],
    participants: demo.participants.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      email: p.email,
      avatar: p.avatar,
      skills: [...p.skills],
      openFor: p.eventStatus === 'open_to_invitations' ? demo.challenge.id : null,
      shareEmailWithTeam: false,
    })),
  };
}

// ---------- queries ----------

export const liveChallenge = (state) => state.challenges.find((c) => c.status === 'live') ?? null;

const liveId = (state) => liveChallenge(state)?.id ?? null;

// The organizer's cutoff: once closed, no team can form, grow or enroll.
export const enrollmentOpen = (state) => !!liveChallenge(state)?.enrollmentOpen;

export const teamStatus = (team) =>
  team.enrolledAt ? 'ENROLLED' : team.memberIds.length === TEAM_SIZE ? 'READY' : 'FORMING';

export const findPerson = (state, id) => state.participants.find((p) => p.id === id) ?? null;

// Teams, invitations and availability are always looked up within the live challenge.
export const teamOf = (state, personId) => {
  const id = liveId(state);
  return state.teams.find((t) => t.challengeId === id && t.memberIds.includes(personId)) ?? null;
};

export const isOpen = (state, personId) => {
  const id = liveId(state);
  return !!id && findPerson(state, personId)?.openFor === id;
};

// A creator alone in a draft is not yet committed; two or more members are.
export const isCommitted = (state, personId) => {
  const team = teamOf(state, personId);
  return !!team && team.memberIds.length > 1;
};

export const isDiscoverable = (state, personId) => {
  return isOpen(state, personId) && !isCommitted(state, personId);
};

export const pendingIncoming = (state, personId) => {
  const id = liveId(state);
  return state.invitations.find((i) => i.challengeId === id && i.toId === personId && i.status === 'pending') ?? null;
};

const publicProfile = (p) => ({
  id: p.id,
  displayName: p.displayName,
  avatar: p.avatar,
  skills: [...p.skills],
});

const publicChallenge = (c) =>
  c && {
    id: c.id,
    title: c.title,
    preview: c.preview,
    date: c.date,
    dateLabel: c.dateLabel,
    durationHours: c.durationHours,
    teamSize: c.teamSize,
    illustrativePrizeUSD: c.illustrativePrizeUSD,
    enrollmentOpen: !!c.enrollmentOpen,
  };

// Why `fromId` cannot invite `toId` right now, as [code, message], or null.
export function inviteBlock(state, fromId, toId) {
  const team = teamOf(state, fromId);
  if (!team) return ['no_team', 'Create a team before inviting anyone.'];
  if (!enrollmentOpen(state)) return ['enrollment_closed', CLOSED];
  if (fromId === toId) return ['self', 'You are already on your own team.'];
  if (team.memberIds.includes(toId)) return ['already_member', 'Already on your team.'];
  if (team.memberIds.length >= TEAM_SIZE) return ['team_full', 'Your team is full.'];
  if (!isDiscoverable(state, toId)) {
    return ['not_discoverable', 'This person is not open to invitations for this event.'];
  }
  const declined = state.invitations.some(
    (i) => i.teamId === team.id && i.toId === toId && i.status === 'declined',
  );
  if (declined) {
    return ['declined_before', 'They declined your team, so the invitation cannot be sent again for this event.'];
  }
  const active = pendingIncoming(state, toId);
  if (active) {
    return active.teamId === team.id
      ? ['already_invited', 'Your team has already invited them.']
      : ['slot_taken', 'They are considering another invitation. Each person receives one at a time, so try again later.'];
  }
  return null;
}

// Only what discovery may reveal: name, picture, skills, availability.
export function discover(state, viewerId, query = '') {
  const q = query.trim().toLowerCase();
  const myTeam = viewerId ? teamOf(state, viewerId) : null;
  return state.participants
    .filter((p) => p.id !== viewerId && isDiscoverable(state, p.id))
    .filter((p) => !myTeam || !myTeam.memberIds.includes(p.id))
    .filter((p) => !q || p.skills.some((s) => s.toLowerCase().includes(q)))
    .map((p) => ({
      ...publicProfile(p),
      availability: 'open_to_invitations',
      inviteBlock: viewerId ? inviteBlock(state, viewerId, p.id) : ['no_identity', 'Join the challenge to invite people.'],
    }));
}

const teamSkills = (members) => [...new Set(members.flatMap((m) => m.skills))];

export function teamView(state, teamId, viewerId) {
  const team = state.teams.find((t) => t.id === teamId);
  if (!team) return null;
  const isMember = team.memberIds.includes(viewerId);
  const members = team.memberIds.map((id) => {
    const p = findPerson(state, id);
    const m = { ...publicProfile(p), isCreator: id === team.creatorId };
    // Email leaves a profile only by its owner's choice, and only to teammates.
    if (isMember && p.shareEmailWithTeam) m.email = p.email;
    return m;
  });
  return {
    id: team.id,
    name: team.name,
    isMember,
    members,
    seats: Array.from({ length: TEAM_SIZE }, (_, i) => members[i] ?? null),
    openSeats: TEAM_SIZE - members.length,
    isFull: members.length === TEAM_SIZE,
    status: teamStatus(team),
    creatorName: findPerson(state, team.creatorId).displayName,
    canEnroll: viewerId === team.creatorId && teamStatus(team) === 'READY' && enrollmentOpen(state),
    skills: teamSkills(members),
    invitations: isMember
      ? state.invitations
          .filter((i) => i.teamId === team.id)
          .map((i) => ({
            id: i.id,
            status: i.status,
            mine: i.fromId === viewerId,
            expiresAt: i.expiresAt,
            to: publicProfile(findPerson(state, i.toId)),
          }))
      : [],
  };
}

// What a recipient sees before deciding.
export function invitationView(state, invitationId, viewerId) {
  const inv = state.invitations.find((i) => i.id === invitationId);
  if (!inv || inv.toId !== viewerId) return null;
  const team = state.teams.find((t) => t.id === inv.teamId);
  const members = team ? team.memberIds.map((id) => publicProfile(findPerson(state, id))) : [];
  return {
    id: inv.id,
    status: inv.status,
    expiresAt: inv.expiresAt,
    challenge: publicChallenge(state.challenges.find((c) => c.id === inv.challengeId)),
    teamName: inv.teamName,
    members,
    skills: teamSkills(members),
    openSeats: team ? TEAM_SIZE - members.length : 0,
  };
}

// ---------- actions ----------

const close = (inv, status, now) => {
  inv.status = status;
  inv.resolvedAt = now;
};

function expire(state, now) {
  let changed = false;
  for (const inv of state.invitations) {
    if (inv.status === 'pending' && inv.expiresAt <= now) {
      close(inv, 'expired', now);
      changed = true;
    }
  }
  return changed;
}

// Returns the same object when nothing expired, so callers can skip a save.
export function sweep(state, now) {
  const s = structuredClone(state);
  return expire(s, now) ? s : state;
}

const begin = (state, now) => {
  const s = structuredClone(state);
  expire(s, now);
  return s;
};

const NO_LIVE = 'No challenge is open right now.';
const CLOSED = 'Enrollment for this competition is closed.';

const mustFind = (s, id) => findPerson(s, id) ?? fail('unknown_person', 'That participant does not exist.');

function removeDraft(s, team, now) {
  for (const inv of s.invitations) {
    if (inv.teamId === team.id && inv.status === 'pending') close(inv, 'closed', now);
  }
  s.teams = s.teams.filter((t) => t.id !== team.id);
}

export function addParticipant(state, { email, displayName, avatar, skills }) {
  const s = structuredClone(state);
  const name = String(displayName ?? '').trim();
  const mail = String(email ?? '').trim();
  const tags = [...new Set((skills ?? []).map((t) => String(t).trim()).filter(Boolean))];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) fail('bad_email', 'Enter a valid email address.');
  if (!name || name.length > 40) fail('bad_name', 'Enter a display name of up to 40 characters.');
  if (tags.length < 1 || tags.length > MAX_SKILLS) fail('bad_skills', `Add between 1 and ${MAX_SKILLS} skills.`);
  const id = `you-${s.seq++}`;
  s.participants.push({
    id,
    displayName: name,
    email: mail,
    avatar: avatar ?? { type: 'initials', value: initialsOf(name) },
    skills: tags,
    openFor: null, // unavailable until the person chooses otherwise
    shareEmailWithTeam: false,
  });
  return s;
}

export const initialsOf = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

export function createTeam(state, creatorId, name, now) {
  const s = begin(state, now);
  const creator = mustFind(s, creatorId);
  const challenge = liveChallenge(s) ?? fail('no_live_challenge', NO_LIVE);
  if (!challenge.enrollmentOpen) fail('enrollment_closed', CLOSED);
  if (teamOf(s, creatorId)) fail('already_on_team', 'You already have a team for this event.');
  const teamName = String(name ?? '').trim().slice(0, 40) || `${creator.displayName}'s team`;
  s.teams.push({ id: `team-${s.seq++}`, challengeId: challenge.id, name: teamName, creatorId, memberIds: [creatorId] });
  return s;
}

export function abandonDraft(state, personId, now) {
  const s = begin(state, now);
  const team = teamOf(s, personId);
  if (!team) fail('no_team', 'You have no draft team to abandon.');
  if (team.memberIds.length > 1) fail('not_empty', 'Only a draft with no other members can be abandoned.');
  removeDraft(s, team, now);
  return s;
}

export function invite(state, fromId, toId, now) {
  const s = begin(state, now);
  mustFind(s, fromId);
  mustFind(s, toId);
  const block = inviteBlock(s, fromId, toId);
  if (block) fail(block[0], block[1]);
  const team = teamOf(s, fromId);
  s.invitations.push({
    id: `inv-${s.seq++}`,
    challengeId: team.challengeId,
    teamId: team.id,
    teamName: team.name,
    fromId,
    toId,
    status: 'pending',
    createdAt: now,
    expiresAt: now + INVITE_TTL_MS,
  });
  return s;
}

const pendingFor = (s, invitationId, personId, role) => {
  const inv = s.invitations.find((i) => i.id === invitationId);
  if (!inv || inv[role] !== personId) fail('not_yours', 'That invitation is not yours to act on.');
  if (inv.status !== 'pending') fail('invitation_unavailable', 'This invitation is no longer available.');
  return inv;
};

export function withdraw(state, invitationId, senderId, now) {
  const s = begin(state, now);
  close(pendingFor(s, invitationId, senderId, 'fromId'), 'withdrawn', now);
  return s;
}

export function decline(state, invitationId, recipientId, now) {
  const s = begin(state, now);
  close(pendingFor(s, invitationId, recipientId, 'toId'), 'declined', now);
  return s;
}

export function accept(state, invitationId, recipientId, now, { abandonDraft: abandon = false } = {}) {
  const s = begin(state, now);
  const inv = pendingFor(s, invitationId, recipientId, 'toId');
  if (!enrollmentOpen(s)) fail('enrollment_closed', CLOSED);
  const team = s.teams.find((t) => t.id === inv.teamId);
  if (!team || team.memberIds.length >= TEAM_SIZE) {
    fail('invitation_unavailable', 'This invitation is no longer available.');
  }
  const own = teamOf(s, recipientId);
  if (own) {
    if (own.memberIds.length > 1) fail('already_committed', 'You are already committed to a team for this event.');
    if (!abandon) fail('needs_abandon', 'Abandon your draft team before joining another.');
    removeDraft(s, own, now);
  }
  team.memberIds.push(recipientId);
  close(inv, 'accepted', now);
  // Everyone on a team of two or more is committed: out of discovery, no open invitations.
  for (const id of team.memberIds) {
    findPerson(s, id).openFor = null;
    const other = pendingIncoming(s, id);
    if (other) close(other, 'closed', now);
  }
  if (team.memberIds.length === TEAM_SIZE) {
    for (const i of s.invitations) {
      if (i.teamId === team.id && i.status === 'pending') close(i, 'closed', now);
    }
  }
  return s;
}

export function setOpen(state, personId, open, now) {
  const s = begin(state, now);
  const p = mustFind(s, personId);
  const challenge = liveChallenge(s) ?? fail('no_live_challenge', NO_LIVE);
  if (open && !challenge.enrollmentOpen) fail('enrollment_closed', CLOSED);
  if (open && isCommitted(s, personId)) fail('already_committed', 'You are already committed to a team for this event.');
  p.openFor = open ? challenge.id : null;
  if (!open) {
    const inv = pendingIncoming(s, personId);
    if (inv) close(inv, 'closed', now);
  }
  return s;
}

export function setShareEmail(state, personId, share) {
  const s = structuredClone(state);
  const p = mustFind(s, personId);
  if (share && !teamOf(s, personId)) fail('no_team', 'Join a team before sharing contact details.');
  p.shareEmailWithTeam = !!share;
  return s;
}

// ---------- challenges (organizer) ----------

const mustFindChallenge = (s, id) =>
  s.challenges.find((c) => c.id === id) ?? fail('unknown_challenge', 'That challenge does not exist.');

const isRealDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));

const READY = 'A challenge needs a title, description and date before it can be live.';
const isReady = (c) => !!(c.title && c.preview && c.date);

// Create a draft, or edit an existing challenge when `id` is given.
export function saveChallenge(state, { id, title, preview, date }) {
  const s = structuredClone(state);
  const fields = {
    title: String(title ?? '').trim(),
    preview: String(preview ?? '').trim(),
    date: String(date ?? '').trim(),
  };
  if (!fields.title || fields.title.length > 80) fail('bad_title', 'Enter a title of up to 80 characters.');
  if (fields.preview.length > 600) fail('bad_preview', 'Keep the description under 600 characters.');
  if (fields.date && !isRealDate(fields.date)) fail('bad_date', 'Enter a valid date.');
  if (id) {
    const c = mustFindChallenge(s, id);
    if (c.status === 'live' && !isReady(fields)) fail('incomplete', READY);
    Object.assign(c, fields);
  } else {
    s.challenges.push({ id: `ch-${s.seq++}`, ...fields, durationHours: 4, teamSize: TEAM_SIZE, status: 'draft', enrollmentOpen: false });
  }
  return s;
}

export function publishChallenge(state, id) {
  const s = structuredClone(state);
  const c = mustFindChallenge(s, id);
  const live = liveChallenge(s);
  if (live && live.id !== id) {
    fail('another_live', `Take “${live.title}” offline first. One challenge is live at a time.`);
  }
  if (!isReady(c)) fail('incomplete', READY);
  c.status = 'live';
  c.enrollmentOpen = true;
  return s;
}

// Its teams and invitations are kept and return if it goes live again.
export function unpublishChallenge(state, id) {
  const s = structuredClone(state);
  mustFindChallenge(s, id).status = 'draft';
  return s;
}

export function deleteChallenge(state, id) {
  const s = structuredClone(state);
  const c = mustFindChallenge(s, id);
  if (c.status === 'live') fail('is_live', 'Take the challenge offline before deleting it.');
  if (s.teams.some((t) => t.challengeId === id)) fail('has_teams', 'This challenge has teams, so it cannot be deleted.');
  s.challenges = s.challenges.filter((x) => x.id !== id);
  return s;
}

export function setEnrollment(state, id, open) {
  const s = structuredClone(state);
  const c = mustFindChallenge(s, id);
  if (c.status !== 'live') fail('not_live', 'Only the live challenge has an enrollment window.');
  c.enrollmentOpen = !!open;
  return s;
}

// ---------- enrollment ----------

// The creator enters a complete team into the competition and the organizer is told.
export function enrollTeam(state, personId, now) {
  const s = begin(state, now);
  const team = teamOf(s, personId) ?? fail('no_team', 'You are not on a team for this competition.');
  if (team.creatorId !== personId) fail('not_creator', 'Only the person who started the team can join the competition.');
  if (team.enrolledAt) fail('already_enrolled', 'Your team has already joined the competition.');
  const members = new Set(team.memberIds);
  const valid = [...members].every(
    (id) => findPerson(s, id) && s.teams.filter((t) => t.challengeId === team.challengeId && t.memberIds.includes(id)).length === 1,
  );
  if (members.size !== TEAM_SIZE || team.memberIds.length !== TEAM_SIZE || !valid) {
    fail('not_ready', `A team needs exactly ${TEAM_SIZE} members to join the competition.`);
  }
  if (!enrollmentOpen(s)) fail('enrollment_closed', CLOSED);
  team.enrolledAt = now;
  s.notifications.push({ id: `note-${s.seq++}`, kind: 'team_enrolled', challengeId: team.challengeId, teamId: team.id, at: now, seen: false });
  return s;
}

export function markNotificationsSeen(state) {
  const s = structuredClone(state);
  for (const n of s.notifications) n.seen = true;
  return s;
}

// ---------- what each viewer may see ----------

// The organizer sees challenges and enrolled teams by name. No emails, no forming teams.
function adminOverview(state) {
  const teamName = (id) => state.teams.find((t) => t.id === id)?.name ?? 'A team';
  return {
    challenges: state.challenges.map((c) => {
      const teams = state.teams.filter((t) => t.challengeId === c.id);
      return {
        ...publicChallenge(c),
        status: c.status,
        teamCount: teams.length,
        enrolled: teams
          .filter((t) => t.enrolledAt)
          .map((t) => ({ id: t.id, name: t.name, enrolledAt: t.enrolledAt, members: t.memberIds.map((id) => findPerson(state, id).displayName) })),
      };
    }),
    notifications: state.notifications
      .filter((n) => !n.seen)
      .map((n) => ({ id: n.id, at: n.at, teamName: teamName(n.teamId), challengeTitle: state.challenges.find((c) => c.id === n.challengeId)?.title ?? '' })),
  };
}

// Everything the interface is given for one viewer. `viewer` comes from the
// server's session, never from the request: null, { organizer: true } or { participantId }.
export function viewFor(state, viewer) {
  const live = liveChallenge(state);
  const base = { role: 'visitor', challenge: publicChallenge(live) };
  if (viewer?.organizer) return { ...base, role: 'organizer', admin: adminOverview(state) };
  const p = viewer?.participantId ? findPerson(state, viewer.participantId) : null;
  if (!p) return base;
  const team = teamOf(state, p.id);
  const incoming = pendingIncoming(state, p.id);
  return {
    ...base,
    role: 'participant',
    me: {
      ...publicProfile(p),
      email: p.email,
      shareEmailWithTeam: p.shareEmailWithTeam,
      isOpen: isOpen(state, p.id),
      isCommitted: isCommitted(state, p.id),
    },
    people: discover(state, p.id),
    team: team && teamView(state, team.id, p.id),
    invitation: incoming && invitationView(state, incoming.id, p.id),
    pastInvitations: state.invitations
      .filter((i) => i.challengeId === live?.id && i.toId === p.id && i.status !== 'pending')
      .map((i) => ({ teamName: i.teamName, status: i.status }))
      .reverse(),
  };
}

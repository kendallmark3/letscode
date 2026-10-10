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

export function createInitialState(demo) {
  return {
    version: 1,
    notice: demo.notice,
    challenge: demo.challenge,
    participants: demo.participants.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      email: p.email,
      avatar: p.avatar,
      skills: [...p.skills],
      open: p.eventStatus === 'open_to_invitations',
      shareEmailWithTeam: false,
      fictional: true,
    })),
    teams: [],
    invitations: [],
    seq: 1,
    currentUserId: null,
    clockOffsetMs: 0,
  };
}

// ---------- queries ----------

export const findPerson = (state, id) => state.participants.find((p) => p.id === id) ?? null;

export const teamOf = (state, personId) =>
  state.teams.find((t) => t.memberIds.includes(personId)) ?? null;

// A creator alone in a draft is not yet committed; two or more members are.
export const isCommitted = (state, personId) => {
  const team = teamOf(state, personId);
  return !!team && team.memberIds.length > 1;
};

export const isDiscoverable = (state, personId) => {
  const p = findPerson(state, personId);
  return !!p && p.open && !isCommitted(state, personId);
};

export const pendingIncoming = (state, personId) =>
  state.invitations.find((i) => i.toId === personId && i.status === 'pending') ?? null;

const publicProfile = (p) => ({
  id: p.id,
  displayName: p.displayName,
  avatar: p.avatar,
  skills: [...p.skills],
});

// Why `fromId` cannot invite `toId` right now, as [code, message], or null.
export function inviteBlock(state, fromId, toId) {
  const team = teamOf(state, fromId);
  if (!team) return ['no_team', 'Create a team before inviting anyone.'];
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
    skills: teamSkills(members),
    invitations: isMember
      ? state.invitations
          .filter((i) => i.teamId === team.id)
          .map((i) => ({
            id: i.id,
            status: i.status,
            fromId: i.fromId,
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
    challenge: state.challenge,
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
    open: false, // unavailable until the person chooses otherwise
    shareEmailWithTeam: false,
    fictional: false,
  });
  s.currentUserId = id;
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
  if (teamOf(s, creatorId)) fail('already_on_team', 'You already have a team for this event.');
  const teamName = String(name ?? '').trim().slice(0, 40) || `${creator.displayName}'s team`;
  s.teams.push({ id: `team-${s.seq++}`, name: teamName, creatorId, memberIds: [creatorId] });
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
    findPerson(s, id).open = false;
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
  if (open && isCommitted(s, personId)) fail('already_committed', 'You are already committed to a team for this event.');
  p.open = !!open;
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

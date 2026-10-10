import * as D from './domain.js';

const STORAGE_KEY = 'lets-code-demo-v1';
// Not a participant: a demo role in the identity switch that unlocks the admin screen.
const ORGANIZER = 'organizer';
const VIEWS = ['challenge', 'people', 'team', 'inbox', 'admin'];
const SKILL_IDEAS = ['JavaScript', 'Python', 'Java', 'C#', 'Testing', 'UI design', 'APIs', 'Databases', 'Cloud', 'AI integration', 'Product thinking', 'Presentation'];

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');

let state;
const ui = { view: 'challenge', query: '', profileOpen: false, pendingAvatar: null, formError: '', editing: null };

// ---------- state ----------

const now = () => Date.now() + state.clockOffsetMs;

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Could not save progress in this browser. The demo still works until you close the tab.', true);
  }
}

async function seed() {
  const demo = await (await fetch('/data/demo.json')).json();
  return D.createInitialState(demo);
}

async function load() {
  try {
    const saved = D.migrate(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    if (saved) return saved;
  } catch {
    // fall through to a fresh demo
  }
  return seed();
}

// Run a rule-checked action; a refused action explains itself and changes nothing.
function act(fn, message) {
  try {
    state = fn(state);
    save();
    if (message) toast(message);
    return true;
  } catch (e) {
    if (!(e instanceof D.DomainError)) throw e;
    toast(e.message, true);
    return false;
  } finally {
    render();
  }
}

// ---------- helpers ----------

const h = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const me = () => (state.currentUserId ? D.findPerson(state, state.currentUserId) : null);
const isOrganizer = () => state.currentUserId === ORGANIZER;

const hue = (id) => ([...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 997, 7) * 137) % 360;

function avatar(p, cls = '') {
  const a = p.avatar;
  if (a?.type === 'image' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(a.value)) {
    return `<img class="avatar ${cls}" src="${a.value}" alt="">`;
  }
  const initials = a?.type === 'initials' ? a.value : D.initialsOf(p.displayName);
  return `<span class="avatar ${cls}" style="--hue:${hue(p.id)}" aria-hidden="true">${h(initials)}</span>`;
}

const formatDate = (d, opts) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
const longDate = (c) => (c.date ? formatDate(c.date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Date to be announced');

const chips = (skills) => `<ul class="chips">${skills.map((s) => `<li>${h(s)}</li>`).join('')}</ul>`;

function timeLeft(expiresAt) {
  const hrs = Math.ceil((expiresAt - now()) / 3_600_000);
  return hrs <= 1 ? 'Expires within the hour' : `Expires in ${hrs} hours`;
}

const STATUS_LABEL = {
  pending: 'Waiting for a reply',
  accepted: 'Accepted',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
  closed: 'Closed',
};

let toastTimer;
function toast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.className = `toast show${isError ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.className = 'toast'), 6000);
}

// ---------- views ----------

function demoBar() {
  const user = me();
  const options = state.participants
    .map((p) => `<option value="${h(p.id)}"${p.id === user?.id ? ' selected' : ''}>${h(p.displayName)}${p.fictional ? '' : ' (your profile)'}</option>`)
    .join('');
  const skipped = Math.round(state.clockOffsetMs / 3_600_000);
  return `
  <aside class="demo-bar" aria-label="Demo controls">
    <p class="demo-note"><strong>Demo</strong> Fictional people. No prize is funded. No messages are sent.</p>
    <div class="demo-controls">
      <label for="identity">View as <span class="hint">(demo switch, not sign-in)</span></label>
      <select id="identity" data-fk="identity">
        <option value=""${state.currentUserId ? '' : ' selected'}>Visitor (no profile)</option>
        ${options}
        <option value="${ORGANIZER}"${isOrganizer() ? ' selected' : ''}>Organizer (demo role)</option>
      </select>
      <button class="btn small ghost" data-action="skip-time" data-fk="skip-time" title="Advance the demo clock to show invitations expiring">Skip 48 hours${skipped ? ` <span class="hint">(+${skipped}h)</span>` : ''}</button>
      <button class="btn small ghost" data-action="reset" data-fk="reset">Reset demo</button>
    </div>
  </aside>`;
}

function header() {
  const user = me();
  const inboxCount = user && D.pendingIncoming(state, user.id) ? 1 : 0;
  const labels = { challenge: 'Challenge', people: 'People', team: 'My team', inbox: 'Inbox', admin: 'Admin' };
  const tabs = VIEWS.filter((v) => v !== 'admin' || isOrganizer()).map(
    (v) => `<a href="#${v}" data-fk="tab-${v}"${ui.view === v ? ' aria-current="page"' : ''}>${labels[v]}${
      v === 'inbox' && inboxCount ? `<span class="badge" aria-label="1 invitation">1</span>` : ''
    }</a>`,
  ).join('');
  return `
  <header class="site-header">
    <a class="brand" href="#challenge"><span class="logo" aria-hidden="true">{ }</span> Let’s Code</a>
    <nav aria-label="Sections">${tabs}</nav>
  </header>`;
}

function statusLine(user) {
  const team = D.teamOf(state, user.id);
  if (team && team.memberIds.length > 1) return `On <strong>${h(team.name)}</strong>`;
  const bits = [];
  if (team) bits.push(`Drafting <strong>${h(team.name)}</strong>`);
  bits.push(D.isOpen(state, user.id) ? 'Open to invitations' : 'Not accepting invitations');
  return bits.join(' · ');
}

function identityStrip() {
  const user = me();
  if (isOrganizer()) {
    return `
    <section class="me" aria-label="Your role">
      <span class="avatar" style="--hue:20" aria-hidden="true">★</span>
      <div>
        <p class="me-name">Organizer <span class="tag warn">demo role</span></p>
        <p class="me-status">Manages challenges. Not a sign-in: anyone using this browser can choose this role.</p>
      </div>
    </section>`;
  }
  if (!user) return '';
  return `
  <section class="me" aria-label="Your profile">
    ${avatar(user)}
    <div>
      <p class="me-name">${h(user.displayName)}${user.fictional ? ' <span class="tag">fictional</span>' : ''}</p>
      <p class="me-status">${statusLine(user)}</p>
    </div>
    <p class="me-email"><span class="hint">Private email, visible only to you</span><br>${h(user.email)}</p>
  </section>`;
}

function createTeamForm(user) {
  return `
  <form class="inline-form" data-form="create-team">
    <label for="team-name">Team name <span class="hint">(optional)</span></label>
    <div class="row">
      <input id="team-name" name="name" maxlength="40" placeholder="${h(user.displayName)}'s team" data-fk="team-name">
      <button class="btn primary" data-fk="create-team">Create a team</button>
    </div>
  </form>`;
}

function profileForm() {
  return `
  <section class="card form-card" aria-labelledby="profile-h">
    <h2 id="profile-h" tabindex="-1">Create your profile</h2>
    <p class="muted">Four things, about a minute. No résumé, no contacts, no payment.</p>
    <form data-form="profile" novalidate>
      <div class="field">
        <label for="pf-name">Display name</label>
        <input id="pf-name" name="displayName" maxlength="40" required autocomplete="name">
      </div>
      <div class="field">
        <label for="pf-email">Email <span class="hint">private; never shown in discovery</span></label>
        <input id="pf-email" name="email" type="email" required autocomplete="email">
      </div>
      <div class="field">
        <label for="pf-skills">Skills <span class="hint">1 to ${D.MAX_SKILLS}, separated by commas</span></label>
        <input id="pf-skills" name="skills" required placeholder="Python, Testing">
        <div class="suggest" role="group" aria-label="Add a suggested skill">
          ${SKILL_IDEAS.map((s) => `<button type="button" class="chip-btn" data-action="add-skill" data-skill="${h(s)}">+ ${h(s)}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label for="pf-photo">Picture <span class="hint">optional; your initials are used otherwise</span></label>
        <div class="row photo-row">
          <span id="pf-preview" class="avatar" style="--hue:210" aria-hidden="true">?</span>
          <input id="pf-photo" name="photo" type="file" accept="image/png,image/jpeg,image/webp">
        </div>
      </div>
      <p class="notice small">This demo keeps your profile in this browser only. Use a made-up email if you prefer.</p>
      <p class="form-error" role="alert">${h(ui.formError)}</p>
      <div class="row">
        <button class="btn primary">Join the challenge</button>
        <button type="button" class="btn ghost" data-action="cancel-profile">Cancel</button>
      </div>
    </form>
  </section>`;
}

function nextStep() {
  const user = me();
  if (!user) {
    if (ui.profileOpen) return profileForm();
    return `
    <section class="card cta">
      <h2>Arrive alone. Leave with a team.</h2>
      <p>Joining is free and takes about a minute.</p>
      <div class="row">
        <button class="btn primary large" data-action="open-profile" data-fk="open-profile">Join free</button>
        <a class="btn ghost large" href="#people">Browse people first</a>
      </div>
      <p class="hint">Or use “View as” above to explore as a fictional participant.</p>
    </section>`;
  }
  const team = D.teamOf(state, user.id);
  if (team) {
    const open = D.TEAM_SIZE - team.memberIds.length;
    return `
    <section class="card cta">
      <h2>${open ? `${h(team.name)} has ${open} open ${open === 1 ? 'seat' : 'seats'}` : `${h(team.name)} is complete`}</h2>
      <div class="row">
        ${open ? `<a class="btn primary large" href="#people">Find teammates</a>` : ''}
        <a class="btn ${open ? 'ghost' : 'primary'} large" href="#team">View my team</a>
      </div>
    </section>`;
  }
  return `
  <section class="card cta">
    <h2>You’re in, ${h(user.displayName.split(' ')[0])}. Choose how to find your team.</h2>
    <div class="choices">
      <div class="choice">
        <h3>Assemble a team</h3>
        <p class="muted">Start a four-seat team and invite people with the skills you’re missing.</p>
        ${createTeamForm(user)}
      </div>
      <div class="choice">
        <h3>Be invited</h3>
        <p class="muted">Appear in discovery with your name, picture and skills. One invitation reaches you at a time.</p>
        ${availabilityButton(user)}
      </div>
    </div>
  </section>`;
}

function availabilityButton(user) {
  return D.isOpen(state, user.id)
    ? `<button class="btn ghost" data-action="pause" data-fk="availability">Pause invitations</button>`
    : `<button class="btn primary" data-action="open" data-fk="availability">Open me to invitations</button>`;
}

function challengeView() {
  const c = D.liveChallenge(state);
  if (!c) return noChallenge('No challenge is open right now');
  const prize = c.illustrativePrizeUSD ? `$${Number(c.illustrativePrizeUSD).toLocaleString('en-US')}` : '';
  return `
  <section class="hero">
    <p class="eyebrow">Intent Driven Saturdays <span class="tag warn">Illustrative demo</span></p>
    <h1 tabindex="-1">${h(c.title)}</h1>
    <p class="tagline">Find your team. Build your proof.</p>
    <p class="lede">${h(c.preview)}</p>
    <dl class="facts">
      <div><dt>Date</dt><dd>${c.date ? formatDate(c.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'To be announced'}</dd></div>
      <div><dt>Time</dt><dd>${h(c.durationHours)} hours</dd></div>
      <div><dt>Team</dt><dd>${h(c.teamSize)} people</dd></div>
      <div><dt>Entry</dt><dd>Free</dd></div>
      ${prize ? `<div class="illustrative"><dt>Sample prize</dt><dd>${prize}</dd><dd class="hint">Illustrative only. Not funded.</dd></div>` : ''}
    </dl>
    <p class="notice"><strong>This is a demonstration.</strong> ${prize ? 'The prize amount is an example of what a sponsored event could offer. ' : ''}No event, prize or sponsor exists yet.</p>
  </section>
  ${nextStep()}
  <section class="steps" aria-label="How it works">
    <div><span class="num">1</span><h3>Say what you’re good at</h3><p>Name, picture and a few skill tags. Your email stays private.</p></div>
    <div><span class="num">2</span><h3>Find complementary skills</h3><p>Search people who opted into this challenge and invite them.</p></div>
    <div><span class="num">3</span><h3>Fill four seats</h3><p>An accepted invitation fills a seat. Four seats make a team.</p></div>
  </section>`;
}

function personCard(p, user) {
  let action;
  if (!user) {
    action = `<button class="btn ghost" data-action="open-profile">Join to invite</button>`;
  } else if (!p.inviteBlock) {
    action = `<button class="btn primary" data-action="invite" data-id="${h(p.id)}" data-fk="invite-${h(p.id)}">Invite to team</button>`;
  } else if (p.inviteBlock[0] === 'no_team') {
    action = `<a class="btn ghost" href="#team">Create a team to invite</a>`;
  } else {
    action = `<p class="blocked">${h(p.inviteBlock[1])}</p>`;
  }
  return `
  <li class="person card">
    ${avatar(p, 'large')}
    <h3>${h(p.displayName)}</h3>
    ${chips(p.skills)}
    <p class="avail"><span class="dot" aria-hidden="true"></span>Open to invitations</p>
    ${action}
  </li>`;
}

function peopleResults() {
  const user = me();
  const people = D.discover(state, user?.id ?? null, ui.query);
  if (!people.length) {
    const any = D.discover(state, user?.id ?? null).length;
    return `
    <div class="empty">
      <h3>${any ? `No one matches “${h(ui.query)}”` : 'No one is open to invitations right now'}</h3>
      <p>${any ? 'Try a broader skill, or clear the search to see everyone.' : 'People appear here once they opt in to this challenge.'}</p>
      ${any ? `<button class="btn ghost" data-action="clear-search">Clear search</button>` : ''}
    </div>`;
  }
  return `
  <div class="carousel-head">
    <p class="muted" aria-live="polite">${people.length} ${people.length === 1 ? 'person' : 'people'} open to invitations</p>
    <div class="row">
      <button class="btn icon" data-action="scroll" data-dir="-1" aria-label="Previous people">‹</button>
      <button class="btn icon" data-action="scroll" data-dir="1" aria-label="Next people">›</button>
    </div>
  </div>
  <ul class="carousel" id="carousel" tabindex="0" aria-label="Participants open to invitations">
    ${people.map((p) => personCard(p, user)).join('')}
  </ul>`;
}

function peopleView() {
  const user = me();
  const team = user ? D.teamOf(state, user.id) : null;
  const skills = [...new Set(D.discover(state, user?.id ?? null).flatMap((p) => p.skills))].sort();
  return `
  <h1 tabindex="-1">Find teammates</h1>
  <p class="lede">Everyone here opted in to this challenge. You see a name, a picture and skills. Nothing else.</p>
  ${team ? teamSummary(team) : ''}
  <div class="search">
    <label for="q">Search by skill</label>
    <input id="q" type="search" value="${h(ui.query)}" placeholder="e.g. Python, Testing, Cloud" autocomplete="off">
    <div class="suggest" role="group" aria-label="Filter by a skill">
      ${skills.map((s) => `<button class="chip-btn${ui.query.toLowerCase() === s.toLowerCase() ? ' on' : ''}" data-action="filter" data-skill="${h(s)}" aria-pressed="${ui.query.toLowerCase() === s.toLowerCase()}">${h(s)}</button>`).join('')}
    </div>
  </div>
  <div id="results">${peopleResults()}</div>`;
}

function teamSummary(team) {
  const v = D.teamView(state, team.id, state.currentUserId);
  return `
  <a class="team-summary" href="#team">
    <span><strong>${h(v.name)}</strong> · ${v.isFull ? 'complete' : `${v.openSeats} open ${v.openSeats === 1 ? 'seat' : 'seats'}`}</span>
    <span class="muted">Has: ${h(v.skills.join(', '))}</span>
  </a>`;
}

function seat(m, i, user) {
  if (!m) {
    return `<li class="seat open"><span class="avatar large empty-avatar" aria-hidden="true">+</span><h3>Open seat</h3><p class="muted">Seat ${i + 1} of ${D.TEAM_SIZE}</p></li>`;
  }
  const mine = m.id === user.id;
  const contact = mine
    ? ''
    : m.email
      ? `<p class="contact"><a href="mailto:${h(m.email)}">${h(m.email)}</a></p>`
      : `<p class="muted small">Contact not shared</p>`;
  return `
  <li class="seat filled">
    ${avatar(m, 'large')}
    <h3>${h(m.displayName)}${mine ? ' <span class="tag">you</span>' : ''}</h3>
    ${m.isCreator ? '<p class="muted small">Started the team</p>' : ''}
    ${chips(m.skills)}
    ${contact}
  </li>`;
}

function teamView() {
  const user = me();
  if (!user) return noIdentity('My team', 'Your four seats will appear here.');
  const team = D.teamOf(state, user.id);
  if (!team) {
    return `
    <h1 tabindex="-1">My team</h1>
    <div class="empty">
      <h3>You don’t have a team yet</h3>
      <p>Start one and invite people, or stay open to invitations and join someone else’s.</p>
      ${createTeamForm(user)}
    </div>`;
  }
  const v = D.teamView(state, team.id, user.id);
  const pending = v.invitations.filter((i) => i.status === 'pending');
  const past = v.invitations.filter((i) => i.status !== 'pending' && i.status !== 'accepted');
  const solo = v.members.length === 1;
  return `
  <h1 tabindex="-1">${h(v.name)}</h1>
  <p class="lede">${
    v.isFull
      ? '<span class="tag ok">Team complete</span> Four members. Remaining invitations were closed.'
      : `${v.members.length} of ${D.TEAM_SIZE} seats filled${solo ? ' · draft' : ''}`
  }</p>
  <ul class="seats">${v.seats.map((m, i) => seat(m, i, user)).join('')}</ul>

  <section class="card">
    <h2>Skills on the team</h2>
    ${chips(v.skills)}
    ${v.isFull ? '' : `<p><a class="btn primary" href="#people">Find teammates</a></p>`}
  </section>

  <section class="card">
    <h2>Invitations sent</h2>
    ${
      pending.length
        ? `<ul class="list">${pending
            .map(
              (i) => `<li>${avatar(i.to)}<div><strong>${h(i.to.displayName)}</strong><br><span class="muted small">${STATUS_LABEL.pending} · ${timeLeft(i.expiresAt)}</span></div>
              ${i.fromId === user.id ? `<button class="btn small ghost" data-action="withdraw" data-id="${h(i.id)}" data-fk="withdraw-${h(i.id)}">Withdraw</button>` : `<span class="muted small">Sent by a teammate</span>`}</li>`,
            )
            .join('')}</ul>`
        : `<p class="muted">${v.isFull ? 'None open.' : 'No invitations are waiting for a reply.'}</p>`
    }
    ${
      past.length
        ? `<h3 class="sub">Earlier</h3><ul class="list quiet">${past.map((i) => `<li>${avatar(i.to)}<div><strong>${h(i.to.displayName)}</strong></div><span class="tag">${STATUS_LABEL[i.status]}</span></li>`).join('')}</ul>`
        : ''
    }
  </section>

  <section class="card">
    <h2>Your contact details</h2>
    <p class="muted">There is no chat here. Teammates see your email only if you choose to share it.</p>
    <label class="switch">
      <input type="checkbox" data-action="share-email" data-fk="share-email"${user.shareEmailWithTeam ? ' checked' : ''}>
      <span>Share <strong>${h(user.email)}</strong> with my teammates</span>
    </label>
  </section>

  ${
    solo
      ? `<section class="card subtle"><h2>Changed your mind?</h2><p class="muted">A draft with no other members can be abandoned. Its open invitations are closed.</p><button class="btn danger" data-action="abandon" data-fk="abandon">Abandon this draft</button></section>`
      : ''
  }`;
}

function noChallenge(title) {
  return `
  <h1 tabindex="-1">${title}</h1>
  <div class="empty">
    <h3>Nothing to join yet</h3>
    <p>Teams form around a live challenge. When an organizer makes one live, it appears here.</p>
    ${
      isOrganizer()
        ? `<a class="btn primary" href="#admin">Manage challenges</a>`
        : `<p class="hint">Organizing? In this demo, choose “Organizer” under “View as”.</p>`
    }
  </div>`;
}

function noIdentity(title, text) {
  return `
  <h1 tabindex="-1">${title}</h1>
  <div class="empty">
    <h3>Join the challenge first</h3>
    <p>${text} Create a profile, or use “View as” above to explore as a fictional participant.</p>
    <button class="btn primary" data-action="open-profile">Join free</button>
  </div>`;
}

function invitationCard(inv, user) {
  const v = D.invitationView(state, inv.id, user.id);
  const draft = D.teamOf(state, user.id);
  const accept = draft
    ? `<p class="notice small">You have a draft team, <strong>${h(draft.name)}</strong>. Joining this team abandons that draft and closes its invitations.</p>
       <button class="btn primary" data-action="accept" data-abandon="1" data-id="${h(v.id)}" data-fk="accept">Abandon my draft and join</button>`
    : `<button class="btn primary" data-action="accept" data-id="${h(v.id)}" data-fk="accept">Accept and join</button>`;
  return `
  <article class="card invitation">
    <p class="eyebrow">Invitation · ${timeLeft(v.expiresAt)}</p>
    <h2>Join ${h(v.teamName)}</h2>
    <p class="muted">For <strong>${h(v.challenge.title)}</strong> · ${h(v.challenge.durationHours)}-hour challenge <span class="tag warn">illustrative</span></p>
    <h3 class="sub">Current members</h3>
    <ul class="list">${v.members.map((m) => `<li>${avatar(m)}<div><strong>${h(m.displayName)}</strong><br><span class="muted small">${h(m.skills.join(', '))}</span></div></li>`).join('')}</ul>
    <h3 class="sub">Skills on the team</h3>
    ${chips(v.skills)}
    <p><strong>${v.openSeats}</strong> of ${D.TEAM_SIZE} seats remaining. Accepting commits you to this team for the event.</p>
    <div class="actions">
      ${accept}
      <button class="btn ghost" data-action="decline" data-id="${h(v.id)}" data-fk="decline">Decline</button>
    </div>
    <p class="hint">Declining needs no explanation, and none is shared.</p>
  </article>`;
}

function inboxView() {
  const user = me();
  if (!user) return noIdentity('Inbox', 'Invitations to join a team arrive here, one at a time.');
  const committed = D.isCommitted(state, user.id);
  const active = D.pendingIncoming(state, user.id);
  const challengeId = D.liveChallenge(state).id;
  const past = state.invitations.filter((i) => i.challengeId === challengeId && i.toId === user.id && i.status !== 'pending').reverse();
  let body;
  if (active) {
    body = invitationCard(active, user);
  } else if (committed) {
    body = `<div class="empty"><h3>You’ve joined a team</h3><p>You’re committed for this event, so no further invitations will arrive.</p><a class="btn primary" href="#team">View my team</a></div>`;
  } else if (D.isOpen(state, user.id)) {
    body = `<div class="empty"><h3>Nothing yet</h3><p>You’re visible in discovery. When a team invites you, it appears here. Only one invitation reaches you at a time.</p></div>`;
  } else {
    body = `<div class="empty"><h3>Invitations are off</h3><p>You’re not shown in discovery and no team can invite you. Turn invitations on when you’re ready.</p></div>`;
  }
  return `
  <h1 tabindex="-1">Inbox</h1>
  <p class="lede">A quiet inbox: at most one invitation at a time, and nothing is sent outside this app.</p>
  ${body}
  ${
    committed
      ? ''
      : `<section class="card">
          <h2>Availability</h2>
          <p class="muted">${D.isOpen(state, user.id) ? 'You are open to invitations for this challenge.' : 'You are not accepting invitations.'}${active ? ' Pausing closes the invitation above.' : ''}</p>
          ${availabilityButton(user)}
        </section>`
  }
  ${
    past.length
      ? `<section class="card"><h2>Earlier invitations</h2><ul class="list quiet">${past.map((i) => `<li><div><strong>${h(i.teamName)}</strong></div><span class="tag">${STATUS_LABEL[i.status]}</span></li>`).join('')}</ul></section>`
      : ''
  }`;
}

function challengeForm(c) {
  return `
  <section class="card form-card" aria-labelledby="chf-h">
    <h2 id="chf-h" tabindex="-1">${c ? `Edit “${h(c.title)}”` : 'Add a challenge'}</h2>
    <form data-form="challenge" data-id="${h(c?.id ?? '')}" novalidate>
      <div class="field">
        <label for="ch-title">Title</label>
        <input id="ch-title" name="title" maxlength="80" required value="${h(c?.title ?? '')}">
      </div>
      <div class="field">
        <label for="ch-preview">Description <span class="hint">what teams will see before the start</span></label>
        <textarea id="ch-preview" name="preview" rows="4" maxlength="600">${h(c?.preview ?? '')}</textarea>
      </div>
      <div class="field">
        <label for="ch-date">Date</label>
        <input id="ch-date" name="date" type="date" value="${h(c?.date ?? '')}">
      </div>
      <p class="hint">A draft can be saved with just a title. It needs a title, description and date to go live.</p>
      <p class="form-error" role="alert"></p>
      <div class="row">
        <button class="btn primary">${c ? 'Save changes' : 'Save as draft'}</button>
        <button type="button" class="btn ghost" data-action="cancel-challenge">Cancel</button>
      </div>
    </form>
  </section>`;
}

function challengeRow(c) {
  const teams = state.teams.filter((t) => t.challengeId === c.id).length;
  const isLive = c.status === 'live';
  return `
  <li class="card challenge-row">
    <div class="challenge-info">
      <h2>${h(c.title)} <span class="tag ${isLive ? 'ok' : ''}">${isLive ? 'Live' : 'Draft'}</span></h2>
      <p class="muted">${longDate(c)} · ${teams} ${teams === 1 ? 'team' : 'teams'}</p>
      ${c.preview ? `<p>${h(c.preview)}</p>` : '<p class="muted">No description yet.</p>'}
    </div>
    <div class="row">
      ${
        isLive
          ? `<button class="btn ghost" data-action="unpublish" data-id="${h(c.id)}" data-fk="live-${h(c.id)}">Take offline</button>`
          : `<button class="btn primary" data-action="publish" data-id="${h(c.id)}" data-fk="live-${h(c.id)}">Make live</button>`
      }
      <button class="btn ghost" data-action="edit-challenge" data-id="${h(c.id)}" data-fk="edit-${h(c.id)}">Edit</button>
      ${!isLive && !teams ? `<button class="btn danger" data-action="delete-challenge" data-id="${h(c.id)}" data-fk="delete-${h(c.id)}">Delete</button>` : ''}
    </div>
  </li>`;
}

function adminView() {
  if (!isOrganizer()) {
    return `
    <h1 tabindex="-1">Organizers only</h1>
    <div class="empty">
      <h3>This screen is for the organizer</h3>
      <p>Challenges are managed by the organizer. In this demo there is no sign-in: choose “Organizer (demo role)” under “View as” to open it.</p>
      <a class="btn ghost" href="#challenge">Back to the challenge</a>
    </div>`;
  }
  const live = D.liveChallenge(state);
  const editing = ui.editing && ui.editing !== 'new' ? state.challenges.find((c) => c.id === ui.editing) : null;
  return `
  <h1 tabindex="-1">Challenges</h1>
  <p class="lede">Add challenges, give each a date, and make one live. Participants see only the live challenge.</p>
  <p class="notice small">${live ? `<strong>${h(live.title)}</strong> is live.` : '<strong>Nothing is live.</strong> Participants cannot form teams.'} One challenge is live at a time. In this demo, challenges are stored in this browser only, and the organizer role is simulated rather than protected by sign-in.</p>
  ${
    ui.editing
      ? challengeForm(editing)
      : `<div><button class="btn primary" data-action="new-challenge" data-fk="new-challenge">Add a challenge</button></div>`
  }
  ${
    state.challenges.length
      ? `<ul class="challenge-list">${state.challenges.map(challengeRow).join('')}</ul>`
      : `<div class="empty"><h3>No challenges yet</h3><p>Add the first one to get started.</p></div>`
  }`;
}

// ---------- render ----------

function render({ focusHeading = false } = {}) {
  const swept = D.sweep(state, now());
  if (swept !== state) {
    state = swept;
    save();
  }
  const fk = document.activeElement?.dataset?.fk;
  const titles = { people: 'Find teammates', team: 'My team', inbox: 'Inbox' };
  const view =
    titles[ui.view] && !D.liveChallenge(state)
      ? noChallenge(titles[ui.view])
      : { challenge: challengeView, people: peopleView, team: teamView, inbox: inboxView, admin: adminView }[ui.view]();
  app.innerHTML = `
    ${demoBar()}
    ${header()}
    ${identityStrip()}
    <main id="main" class="view-${ui.view}">${view}</main>
    <footer class="site-footer">${h(state.notice)}</footer>`;
  if (focusHeading) {
    app.querySelector('main h1')?.focus();
  } else if (fk) {
    (app.querySelector(`[data-fk="${CSS.escape(fk)}"]`) ?? app.querySelector('main h1'))?.focus();
  }
  updateCarouselButtons();
}

function renderResults() {
  const results = document.getElementById('results');
  if (results) results.innerHTML = peopleResults();
  document.querySelectorAll('.search .chip-btn').forEach((b) => {
    const on = b.dataset.skill.toLowerCase() === ui.query.toLowerCase();
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
  });
  updateCarouselButtons();
}

function updateCarouselButtons() {
  const c = document.getElementById('carousel');
  if (!c) return;
  const update = () => {
    const [prev, next] = document.querySelectorAll('[data-action="scroll"]');
    if (!prev) return;
    prev.disabled = c.scrollLeft <= 2;
    next.disabled = c.scrollLeft + c.clientWidth >= c.scrollWidth - 2;
  };
  c.addEventListener('scroll', update, { passive: true });
  update();
}

function go(view) {
  if (location.hash === `#${view}`) {
    ui.view = view;
    render({ focusHeading: true });
  } else {
    location.hash = view;
  }
}

// ---------- events ----------

const actions = {
  'open-profile'() {
    ui.profileOpen = true;
    ui.formError = '';
    ui.pendingAvatar = null;
    ui.view = 'challenge';
    if (location.hash !== '#challenge') history.replaceState(null, '', '#challenge');
    render();
    document.getElementById('profile-h')?.focus();
    document.getElementById('profile-h')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  },
  'cancel-profile'() {
    ui.profileOpen = false;
    render({ focusHeading: true });
  },
  'add-skill'(el) {
    const input = document.getElementById('pf-skills');
    const current = input.value.split(',').map((s) => s.trim()).filter(Boolean);
    if (!current.includes(el.dataset.skill)) current.push(el.dataset.skill);
    input.value = current.join(', ');
  },
  open: () => act((s) => D.setOpen(s, s.currentUserId, true, now()), 'You’re now visible in discovery and open to invitations.'),
  pause: () => act((s) => D.setOpen(s, s.currentUserId, false, now()), 'Invitations paused. You’re hidden from discovery.'),
  invite(el) {
    const name = D.findPerson(state, el.dataset.id)?.displayName;
    act((s) => D.invite(s, s.currentUserId, el.dataset.id, now()), `Invitation placed in ${name}’s inbox. Nothing was emailed.`);
  },
  withdraw: (el) => act((s) => D.withdraw(s, el.dataset.id, s.currentUserId, now()), 'Invitation withdrawn.'),
  decline: (el) => act((s) => D.decline(s, el.dataset.id, s.currentUserId, now()), 'Invitation declined.'),
  accept(el) {
    const ok = act((s) => D.accept(s, el.dataset.id, s.currentUserId, now(), { abandonDraft: el.dataset.abandon === '1' }), 'You’ve joined the team.');
    if (ok) go('team');
  },
  abandon() {
    if (!confirm('Abandon this draft team? Its open invitations will be closed.')) return;
    act((s) => D.abandonDraft(s, s.currentUserId, now()), 'Draft abandoned.');
  },
  'share-email': (el) =>
    act((s) => D.setShareEmail(s, s.currentUserId, el.checked), el.checked ? 'Your email is now visible to your teammates.' : 'Your email is hidden from teammates again.'),
  filter(el) {
    ui.query = ui.query.toLowerCase() === el.dataset.skill.toLowerCase() ? '' : el.dataset.skill;
    document.getElementById('q').value = ui.query;
    renderResults();
  },
  'clear-search'() {
    ui.query = '';
    const q = document.getElementById('q');
    q.value = '';
    renderResults();
    q.focus();
  },
  scroll(el) {
    const c = document.getElementById('carousel');
    const card = c.querySelector('.person');
    const step = card ? card.getBoundingClientRect().width + 16 : c.clientWidth;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    c.scrollBy({ left: Number(el.dataset.dir) * step, behavior: reduce ? 'auto' : 'smooth' });
  },
  'new-challenge': () => editChallenge('new'),
  'edit-challenge': (el) => editChallenge(el.dataset.id),
  'cancel-challenge'() {
    ui.editing = null;
    render({ focusHeading: true });
  },
  publish: (el) => act((s) => D.publishChallenge(s, el.dataset.id), 'Challenge is live. Participants can now form teams.'),
  unpublish: (el) => act((s) => D.unpublishChallenge(s, el.dataset.id), 'Challenge taken offline. Its teams are kept.'),
  'delete-challenge'(el) {
    if (!confirm('Delete this draft challenge?')) return;
    act((s) => D.deleteChallenge(s, el.dataset.id), 'Draft deleted.');
  },
  'skip-time'() {
    state = { ...state, clockOffsetMs: state.clockOffsetMs + D.INVITE_TTL_MS };
    const before = state.invitations.filter((i) => i.status === 'pending').length;
    state = D.sweep(state, now());
    const expired = before - state.invitations.filter((i) => i.status === 'pending').length;
    save();
    toast(`Demo clock moved forward 48 hours. ${expired ? `${expired} invitation${expired === 1 ? '' : 's'} expired.` : 'No invitations were waiting.'}`);
    render();
  },
  async reset() {
    if (!confirm('Reset the demo? Teams, invitations and any profile you created will be erased.')) return;
    localStorage.removeItem(STORAGE_KEY);
    state = await seed();
    save();
    Object.assign(ui, { query: '', profileOpen: false, pendingAvatar: null, formError: '', editing: null });
    toast('Demo reset to its starting point.');
    go('challenge');
  },
};

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.matches('input[type="checkbox"]')) return;
  actions[el.dataset.action]?.(el);
});

app.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'identity') {
    state = { ...state, currentUserId: el.value || null };
    ui.profileOpen = false;
    save();
    const p = me();
    toast(p ? `Now viewing as ${p.displayName}.` : isOrganizer() ? 'Now viewing as the organizer (demo role).' : 'Now viewing as a visitor.');
    if (isOrganizer()) go('admin');
    else if (ui.view === 'admin') go('challenge');
    else render();
  } else if (el.dataset.action === 'share-email') {
    actions['share-email'](el);
  } else if (el.id === 'pf-photo') {
    readPhoto(el.files[0]);
  }
});

app.addEventListener('input', (e) => {
  if (e.target.id !== 'q') return;
  ui.query = e.target.value;
  renderResults();
});

app.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const data = new FormData(form);
  if (form.dataset.form === 'create-team') {
    if (act((s) => D.createTeam(s, s.currentUserId, data.get('name'), now()), 'Team created. You hold the first of four seats.')) go('team');
  } else if (form.dataset.form === 'challenge') {
    const id = form.dataset.id || undefined;
    try {
      state = D.saveChallenge(state, { id, title: data.get('title'), preview: data.get('preview'), date: data.get('date') });
    } catch (err) {
      if (!(err instanceof D.DomainError)) throw err;
      form.querySelector('.form-error').textContent = err.message;
      const field = { bad_title: 'ch-title', bad_preview: 'ch-preview', bad_date: 'ch-date' }[err.code];
      document.getElementById(field)?.focus();
      return;
    }
    save();
    ui.editing = null;
    toast(id ? 'Challenge updated.' : 'Draft saved. Make it live when it is ready.');
    render({ focusHeading: true });
  } else if (form.dataset.form === 'profile') {
    try {
      state = D.addParticipant(state, {
        displayName: data.get('displayName'),
        email: data.get('email'),
        skills: String(data.get('skills')).split(','),
        avatar: ui.pendingAvatar,
      });
    } catch (err) {
      if (!(err instanceof D.DomainError)) throw err;
      // Keep what was typed; only the message changes.
      form.querySelector('.form-error').textContent = err.message;
      const field = { bad_name: 'pf-name', bad_email: 'pf-email', bad_skills: 'pf-skills' }[err.code];
      document.getElementById(field)?.focus();
      return;
    }
    save();
    Object.assign(ui, { profileOpen: false, pendingAvatar: null, formError: '' });
    toast('Profile created. You’re not visible to anyone until you choose to be.');
    render({ focusHeading: true });
  }
});

function editChallenge(id) {
  ui.editing = id;
  render();
  document.getElementById('chf-h')?.focus();
}

// Shrink a chosen picture to a small square so it fits in browser storage.
function readPhoto(file) {
  if (!file) return;
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const size = 160;
    const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
    const side = Math.min(img.width, img.height);
    canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
    URL.revokeObjectURL(url);
    ui.pendingAvatar = { type: 'image', value: canvas.toDataURL('image/jpeg', 0.82) };
    const preview = document.getElementById('pf-preview');
    if (preview) preview.outerHTML = `<img id="pf-preview" class="avatar" src="${ui.pendingAvatar.value}" alt="">`;
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    toast('That file could not be read as a picture. Your initials will be used.', true);
  };
  img.src = url;
}

function syncRoute(focusHeading) {
  const v = location.hash.slice(1);
  ui.view = VIEWS.includes(v) ? v : 'challenge';
  render({ focusHeading });
  if (focusHeading) window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => syncRoute(true));

// The skip link moves focus itself; following its href would change the route.
document.querySelector('.skip').addEventListener('click', (e) => {
  e.preventDefault();
  app.querySelector('main h1')?.focus();
});

state = await load();
syncRoute(false);

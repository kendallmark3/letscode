// The interface. It holds no rules and no authoritative data: it shows the view
// the server gives this signed-in user and sends each action back to be decided there.

const PARTICIPANT_VIEWS = ['people', 'team', 'inbox'];
const VIEWS = ['challenge', ...PARTICIPANT_VIEWS, 'admin', 'login', 'join'];
const SKILL_IDEAS = ['JavaScript', 'Python', 'Java', 'C#', 'Testing', 'UI design', 'APIs', 'Databases', 'Cloud', 'AI integration', 'Product thinking', 'Presentation'];
const MAX_SKILLS = 5;
const REFRESH_MS = 5000;

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');

let view;
const ui = { view: 'challenge', query: '', pendingAvatar: null, editing: null };

// ---------- server ----------

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error?.message ?? 'Something went wrong. Try again.'), { code: data.error?.code });
  return data.view;
}

// Ask the server to do something. A refusal explains itself and changes nothing.
async function act(type, args, message) {
  try {
    view = await api('/api/action', { type, ...args });
    if (message) toast(message);
    return true;
  } catch (e) {
    toast(e.message, true);
    // Someone else may have changed things; show what is true now.
    view = await api('/api/view').catch(() => view);
    return false;
  } finally {
    render();
  }
}

// Pick up other people's actions, unless this user is in the middle of typing.
async function refresh() {
  if (document.hidden || ui.editing || ['login', 'join'].includes(ui.view)) return;
  if (document.activeElement?.matches('input:not([type="checkbox"]), textarea')) return;
  try {
    const next = await api('/api/view');
    if (JSON.stringify(next) !== JSON.stringify(view)) {
      view = next;
      render();
    }
  } catch {
    // Offline for a moment; the next tick tries again.
  }
}

// ---------- helpers ----------

const h = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const hue = (id) => ([...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 997, 7) * 137) % 360;

function avatar(p, cls = '') {
  const a = p.avatar;
  if (a?.type === 'image' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(a.value)) {
    return `<img class="avatar ${cls}" src="${a.value}" alt="">`;
  }
  return `<span class="avatar ${cls}" style="--hue:${hue(p.id)}" aria-hidden="true">${h(a?.value ?? '?')}</span>`;
}

const formatDate = (d, opts) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
const longDate = (c) => (c.date ? formatDate(c.date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Date to be announced');

const chips = (skills) => `<ul class="chips">${skills.map((s) => `<li>${h(s)}</li>`).join('')}</ul>`;

function timeLeft(expiresAt) {
  const hrs = Math.ceil((expiresAt - Date.now()) / 3_600_000);
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

const TEAM_STATUS = { FORMING: ['Forming', ''], READY: ['Ready', 'warn'], ENROLLED: ['Enrolled', 'ok'] };
const statusTag = (status) => `<span class="tag ${TEAM_STATUS[status][1]}">${TEAM_STATUS[status][0]}</span>`;

let toastTimer;
function toast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.className = `toast show${isError ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.className = 'toast'), 6000);
}

const searchPeople = () => {
  const q = ui.query.trim().toLowerCase();
  return q ? view.people.filter((p) => p.skills.some((s) => s.toLowerCase().includes(q))) : view.people;
};

// ---------- views ----------

function demoBar() {
  if (!view.demo) return '';
  return `
  <aside class="demo-bar" aria-label="Demo data">
    <p class="demo-note"><strong>Demo data</strong> Fictional accounts. No prize is funded. No messages are sent.</p>
    <p class="demo-note">Log in as participant1@example.com … participant10@example.com, password <code>${h(view.demo.password)}</code>. Organizer: ${h(view.demo.organizerEmail)}, password <code>${h(view.demo.organizerPassword)}</code>.</p>
  </aside>`;
}

function header() {
  const labels = { challenge: 'Challenge', people: 'People', team: 'My team', inbox: 'Inbox', admin: 'Admin' };
  const shown = ['challenge', ...(view.role === 'participant' ? PARTICIPANT_VIEWS : []), ...(view.role === 'organizer' ? ['admin'] : [])];
  const badge = (v) => {
    if (v === 'inbox' && view.invitation) return `<span class="badge" aria-label="1 invitation">1</span>`;
    const n = v === 'admin' ? view.admin.notifications.length : 0;
    return n ? `<span class="badge" aria-label="${n} new">${n}</span>` : '';
  };
  const tabs = shown.map((v) => `<a href="#${v}" data-fk="tab-${v}"${ui.view === v ? ' aria-current="page"' : ''}>${labels[v]}${badge(v)}</a>`).join('');
  const account =
    view.role === 'visitor'
      ? `<a class="btn small ghost" href="#login" data-fk="go-login">Log in</a><a class="btn small primary" href="#join" data-fk="go-join">Join free</a>`
      : `<button class="btn small ghost" data-action="logout" data-fk="logout">Log out</button>`;
  return `
  <header class="site-header">
    <a class="brand" href="#challenge"><span class="logo" aria-hidden="true">{ }</span> Let’s Code</a>
    <nav aria-label="Sections">${tabs}</nav>
    <div class="account">${account}</div>
  </header>`;
}

function statusLine(me) {
  const team = view.team;
  if (team && team.members.length > 1) return `On <strong>${h(team.name)}</strong>`;
  const bits = [];
  if (team) bits.push(`Drafting <strong>${h(team.name)}</strong>`);
  bits.push(me.isOpen ? 'Open to invitations' : 'Not accepting invitations');
  return bits.join(' · ');
}

function identityStrip() {
  if (view.role === 'organizer') {
    return `
    <section class="me" aria-label="Your role">
      <span class="avatar" style="--hue:20" aria-hidden="true">★</span>
      <div>
        <p class="me-name">Organizer</p>
        <p class="me-status">Manages competitions and enrollment. Does not take part in teams.</p>
      </div>
    </section>`;
  }
  const me = view.me;
  if (!me) return '';
  return `
  <section class="me" aria-label="Your profile">
    ${avatar(me)}
    <div>
      <p class="me-name">${h(me.displayName)}</p>
      <p class="me-status">${view.challenge ? statusLine(me) : 'No competition is open'}</p>
    </div>
    <p class="me-email"><span class="hint">Private email, visible only to you</span><br>${h(me.email)}</p>
  </section>`;
}

function createTeamForm(me) {
  return `
  <form class="inline-form" data-form="create-team">
    <label for="team-name">Team name <span class="hint">(optional)</span></label>
    <div class="row">
      <input id="team-name" name="name" maxlength="40" placeholder="${h(me.displayName)}'s team" data-fk="team-name">
      <button class="btn primary" data-fk="create-team">Create a team</button>
    </div>
  </form>`;
}

function availabilityButton(me) {
  return me.isOpen
    ? `<button class="btn ghost" data-action="pause" data-fk="availability">Pause invitations</button>`
    : `<button class="btn primary" data-action="open" data-fk="availability">Open me to invitations</button>`;
}

function nextStep() {
  const closed = !view.challenge.enrollmentOpen;
  if (view.role === 'organizer') {
    return `<section class="card cta"><h2>You’re signed in as the organizer</h2><div class="row"><a class="btn primary large" href="#admin">Manage competitions</a></div></section>`;
  }
  const team = view.team;
  if (team) {
    const open = team.openSeats;
    const heading = { ENROLLED: `${h(team.name)} has joined the competition`, READY: `${h(team.name)} is ready to join the competition` }[team.status]
      ?? `${h(team.name)} has ${open} open ${open === 1 ? 'seat' : 'seats'}`;
    return `
    <section class="card cta">
      <h2>${heading}</h2>
      <div class="row">
        ${open && !closed ? `<a class="btn primary large" href="#people">Find teammates</a>` : ''}
        <a class="btn ${open && !closed ? 'ghost' : 'primary'} large" href="#team">View my team</a>
      </div>
    </section>`;
  }
  if (closed) {
    return `<section class="card cta"><h2>Enrollment is closed</h2><p class="muted">Teams can no longer be formed or entered for this competition. The next one will open separately.</p></section>`;
  }
  if (view.role === 'visitor') {
    return `
    <section class="card cta">
      <h2>Arrive alone. Leave with a team.</h2>
      <p>Joining is free and takes about a minute.</p>
      <div class="row">
        <a class="btn primary large" href="#join" data-fk="cta-join">Join free</a>
        <a class="btn ghost large" href="#login" data-fk="cta-login">Log in</a>
      </div>
    </section>`;
  }
  const me = view.me;
  return `
  <section class="card cta">
    <h2>You’re in, ${h(me.displayName.split(' ')[0])}. Choose how to find your team.</h2>
    <div class="choices">
      <div class="choice">
        <h3>Assemble a team</h3>
        <p class="muted">Start a four-seat team and invite people with the skills you’re missing.</p>
        ${createTeamForm(me)}
      </div>
      <div class="choice">
        <h3>Be invited</h3>
        <p class="muted">Appear in discovery with your name, picture and skills. One invitation reaches you at a time.</p>
        ${availabilityButton(me)}
      </div>
    </div>
  </section>`;
}

function challengeView() {
  const c = view.challenge;
  if (!c) return noChallenge('No competition is open right now');
  const prize = c.illustrativePrizeUSD ? `$${Number(c.illustrativePrizeUSD).toLocaleString('en-US')}` : '';
  return `
  <section class="hero">
    <p class="eyebrow">Intent Driven Saturdays ${prize ? '<span class="tag warn">Illustrative demo</span>' : ''} <span class="tag ${c.enrollmentOpen ? 'ok' : ''}">${c.enrollmentOpen ? 'Enrollment open' : 'Enrollment closed'}</span></p>
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
    ${prize ? `<p class="notice"><strong>This is a demonstration.</strong> The prize amount is an example of what a sponsored event could offer. No prize or sponsor exists yet.</p>` : ''}
  </section>
  ${nextStep()}
  <section class="steps" aria-label="How it works">
    <div><span class="num">1</span><h3>Say what you’re good at</h3><p>Name, picture and a few skill tags. Your email stays private.</p></div>
    <div><span class="num">2</span><h3>Find complementary skills</h3><p>Search people who opted into this competition and invite them. They choose whether to accept.</p></div>
    <div><span class="num">3</span><h3>Fill four seats and join</h3><p>Four accepted members make a team ready. It then joins the competition.</p></div>
  </section>`;
}

function personCard(p) {
  let action;
  if (!p.inviteBlock) {
    action = `<button class="btn primary" data-action="invite" data-id="${h(p.id)}" data-name="${h(p.displayName)}" data-fk="invite-${h(p.id)}">Invite to team</button>`;
  } else if (p.inviteBlock[0] === 'no_team') {
    action = view.challenge.enrollmentOpen ? `<a class="btn ghost" href="#team">Create a team to invite</a>` : `<p class="blocked">Enrollment is closed.</p>`;
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
  const people = searchPeople();
  if (!people.length) {
    const any = view.people.length;
    return `
    <div class="empty">
      <h3>${any ? `No one matches “${h(ui.query)}”` : 'No one is open to invitations right now'}</h3>
      <p>${any ? 'Try a broader skill, or clear the search to see everyone.' : 'People appear here once they opt in to this competition.'}</p>
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
    ${people.map(personCard).join('')}
  </ul>`;
}

function peopleView() {
  const team = view.team;
  const skills = [...new Set(view.people.flatMap((p) => p.skills))].sort();
  const on = (s) => ui.query.toLowerCase() === s.toLowerCase();
  return `
  <h1 tabindex="-1">Find teammates</h1>
  <p class="lede">Everyone here opted in to this competition. You see a name, a picture and skills. Nothing else.</p>
  ${
    team
      ? `<a class="team-summary" href="#team">
          <span><strong>${h(team.name)}</strong> · ${team.isFull ? 'complete' : `${team.openSeats} open ${team.openSeats === 1 ? 'seat' : 'seats'}`}</span>
          <span class="muted">Has: ${h(team.skills.join(', '))}</span>
        </a>`
      : ''
  }
  <div class="search">
    <label for="q">Search by skill</label>
    <input id="q" type="search" value="${h(ui.query)}" placeholder="e.g. Python, Testing, Cloud" autocomplete="off">
    <div class="suggest" role="group" aria-label="Filter by a skill">
      ${skills.map((s) => `<button class="chip-btn${on(s) ? ' on' : ''}" data-action="filter" data-skill="${h(s)}" aria-pressed="${on(s)}">${h(s)}</button>`).join('')}
    </div>
  </div>
  <div id="results">${peopleResults()}</div>`;
}

function seat(m, i, me, size) {
  if (!m) {
    return `<li class="seat open"><span class="avatar large empty-avatar" aria-hidden="true">+</span><h3>Open seat</h3><p class="muted">Seat ${i + 1} of ${size}</p></li>`;
  }
  const mine = m.id === me.id;
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

// The one step after four seats are filled.
function enrollCard(team) {
  const closed = !view.challenge.enrollmentOpen;
  if (team.status === 'ENROLLED') {
    return `<section class="card enroll done"><h2>You’re in the competition</h2><p>${h(team.name)} has joined <strong>${h(view.challenge.title)}</strong> with all four members. The organizer has been told.</p></section>`;
  }
  if (team.status !== 'READY') return '';
  if (team.canEnroll) {
    return `<section class="card enroll"><h2>All four seats are filled</h2><p>Enter ${h(team.name)} into <strong>${h(view.challenge.title)}</strong>. This confirms the team for the competition.</p><div><button class="btn primary large" data-action="enroll" data-fk="enroll">Join Competition</button></div></section>`;
  }
  return `<section class="card enroll"><h2>All four seats are filled</h2><p class="muted">${
    closed ? 'Enrollment has closed, so this team can no longer be entered.' : `Waiting for ${h(team.creatorName)}, who started the team, to join the competition.`
  }</p></section>`;
}

function teamView() {
  const me = view.me;
  const v = view.team;
  const closed = !view.challenge.enrollmentOpen;
  if (!v) {
    return `
    <h1 tabindex="-1">My team</h1>
    <div class="empty">
      <h3>You don’t have a team yet</h3>
      ${closed ? '<p>Enrollment for this competition is closed, so new teams can no longer be formed.</p>' : `<p>Start one and invite people, or stay open to invitations and join someone else’s.</p>${createTeamForm(me)}`}
    </div>`;
  }
  const pending = v.invitations.filter((i) => i.status === 'pending');
  const past = v.invitations.filter((i) => i.status !== 'pending' && i.status !== 'accepted');
  const solo = v.members.length === 1;
  return `
  <h1 tabindex="-1">${h(v.name)}</h1>
  <p class="lede">${statusTag(v.status)} ${v.members.length} of ${v.seats.length} seats filled${solo ? ' · draft' : ''}</p>
  ${enrollCard(v)}
  <ul class="seats">${v.seats.map((m, i) => seat(m, i, me, v.seats.length)).join('')}</ul>

  <section class="card">
    <h2>Skills on the team</h2>
    ${chips(v.skills)}
    ${v.isFull || closed ? '' : `<p><a class="btn primary" href="#people">Find teammates</a></p>`}
  </section>

  <section class="card">
    <h2>Invitations sent</h2>
    ${
      pending.length
        ? `<ul class="list">${pending
            .map(
              (i) => `<li>${avatar(i.to)}<div><strong>${h(i.to.displayName)}</strong><br><span class="muted small">${STATUS_LABEL.pending} · ${timeLeft(i.expiresAt)}</span></div>
              ${i.mine ? `<button class="btn small ghost" data-action="withdraw" data-id="${h(i.id)}" data-fk="withdraw-${h(i.id)}">Withdraw</button>` : `<span class="muted small">Sent by a teammate</span>`}</li>`,
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
      <input type="checkbox" data-action="share-email" data-fk="share-email"${me.shareEmailWithTeam ? ' checked' : ''}>
      <span>Share <strong>${h(me.email)}</strong> with my teammates</span>
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
    <p>Teams form around an open competition. When the organizer opens one, it appears here.</p>
    ${view.role === 'organizer' ? `<a class="btn primary" href="#admin">Manage competitions</a>` : ''}
  </div>`;
}

function needAccount(title) {
  const organizer = view.role === 'organizer';
  return `
  <h1 tabindex="-1">${title}</h1>
  <div class="empty">
    <h3>${organizer ? 'This is for participants' : 'Log in to continue'}</h3>
    <p>${organizer ? 'The organizer account manages competitions and does not join teams.' : 'You need an account to find teammates, form a team and receive invitations.'}</p>
    ${organizer ? `<a class="btn primary" href="#admin">Manage competitions</a>` : `<div class="row"><a class="btn primary" href="#join">Join free</a><a class="btn ghost" href="#login">Log in</a></div>`}
  </div>`;
}

function invitationCard(v) {
  const draft = view.team;
  const closed = !view.challenge.enrollmentOpen;
  const accept = closed
    ? `<p class="notice small">Enrollment has closed, so this invitation can no longer be accepted.</p>`
    : draft
      ? `<p class="notice small">You have a draft team, <strong>${h(draft.name)}</strong>. Joining this team abandons that draft and closes its invitations.</p>
         <button class="btn primary" data-action="accept" data-abandon="1" data-id="${h(v.id)}" data-fk="accept">Abandon my draft and join</button>`
      : `<button class="btn primary" data-action="accept" data-id="${h(v.id)}" data-fk="accept">Accept and join</button>`;
  return `
  <article class="card invitation">
    <p class="eyebrow">Invitation · ${timeLeft(v.expiresAt)}</p>
    <h2>Join ${h(v.teamName)}</h2>
    <p class="muted">For <strong>${h(v.challenge.title)}</strong> · ${h(v.challenge.durationHours)}-hour competition</p>
    <h3 class="sub">Current members</h3>
    <ul class="list">${v.members.map((m) => `<li>${avatar(m)}<div><strong>${h(m.displayName)}</strong><br><span class="muted small">${h(m.skills.join(', '))}</span></div></li>`).join('')}</ul>
    <h3 class="sub">Skills on the team</h3>
    ${chips(v.skills)}
    <p><strong>${v.openSeats}</strong> of ${h(v.challenge.teamSize)} seats remaining. Accepting commits you to this team for the competition.</p>
    <div class="actions">
      ${accept}
      <button class="btn ghost" data-action="decline" data-id="${h(v.id)}" data-fk="decline">Decline</button>
    </div>
    <p class="hint">Declining needs no explanation, and none is shared.</p>
  </article>`;
}

function inboxView() {
  const me = view.me;
  const closed = !view.challenge.enrollmentOpen;
  let body;
  if (view.invitation) {
    body = invitationCard(view.invitation);
  } else if (me.isCommitted) {
    body = `<div class="empty"><h3>You’ve joined a team</h3><p>You’re committed for this competition, so no further invitations will arrive.</p><a class="btn primary" href="#team">View my team</a></div>`;
  } else if (me.isOpen) {
    body = `<div class="empty"><h3>Nothing yet</h3><p>You’re visible in discovery. When a team invites you, it appears here. Only one invitation reaches you at a time.</p></div>`;
  } else {
    body = `<div class="empty"><h3>Invitations are off</h3><p>${closed ? 'Enrollment for this competition is closed.' : 'You’re not shown in discovery and no team can invite you. Turn invitations on when you’re ready.'}</p></div>`;
  }
  return `
  <h1 tabindex="-1">Inbox</h1>
  <p class="lede">A quiet inbox: at most one invitation at a time.</p>
  ${body}
  ${
    me.isCommitted || (closed && !me.isOpen)
      ? ''
      : `<section class="card">
          <h2>Availability</h2>
          <p class="muted">${me.isOpen ? 'You are open to invitations for this competition.' : 'You are not accepting invitations.'}${view.invitation ? ' Pausing closes the invitation above.' : ''}</p>
          ${availabilityButton(me)}
        </section>`
  }
  ${
    view.pastInvitations.length
      ? `<section class="card"><h2>Earlier invitations</h2><ul class="list quiet">${view.pastInvitations.map((i) => `<li><div><strong>${h(i.teamName)}</strong></div><span class="tag">${STATUS_LABEL[i.status]}</span></li>`).join('')}</ul></section>`
      : ''
  }`;
}

// ---------- accounts ----------

function loginView() {
  return `
  <section class="card form-card auth">
    <h1 tabindex="-1">Log in</h1>
    <form data-form="login" novalidate>
      <div class="field"><label for="li-email">Email</label><input id="li-email" name="email" type="email" required autocomplete="username"></div>
      <div class="field"><label for="li-password">Password</label><input id="li-password" name="password" type="password" required autocomplete="current-password"></div>
      <p class="form-error" role="alert"></p>
      <div class="row"><button class="btn primary">Log in</button><a class="btn ghost" href="#join">Create an account</a></div>
    </form>
  </section>`;
}

function joinView() {
  return `
  <section class="card form-card auth">
    <h1 tabindex="-1">Create your account</h1>
    <p class="muted">About a minute. No résumé, no contacts, no payment.</p>
    <form data-form="join" novalidate>
      <div class="field"><label for="pf-name">Display name</label><input id="pf-name" name="displayName" maxlength="40" required autocomplete="name"></div>
      <div class="field">
        <label for="pf-email">Email <span class="hint">you log in with it; never shown in discovery</span></label>
        <input id="pf-email" name="email" type="email" required autocomplete="username">
      </div>
      <div class="field">
        <label for="pf-password">Password <span class="hint">at least 8 characters</span></label>
        <input id="pf-password" name="password" type="password" required minlength="8" autocomplete="new-password">
      </div>
      <div class="field">
        <label for="pf-skills">Skills <span class="hint">1 to ${MAX_SKILLS}, separated by commas</span></label>
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
      <p class="form-error" role="alert"></p>
      <div class="row"><button class="btn primary">Create account</button><a class="btn ghost" href="#login">I already have one</a></div>
    </form>
  </section>`;
}

// ---------- organizer ----------

function challengeForm(c) {
  return `
  <section class="card form-card" aria-labelledby="chf-h">
    <h2 id="chf-h" tabindex="-1">${c ? `Edit “${h(c.title)}”` : 'Add a competition'}</h2>
    <form data-form="challenge" data-id="${h(c?.id ?? '')}" novalidate>
      <div class="field"><label for="ch-title">Title</label><input id="ch-title" name="title" maxlength="80" required value="${h(c?.title ?? '')}"></div>
      <div class="field">
        <label for="ch-preview">Description <span class="hint">what teams will see before the start</span></label>
        <textarea id="ch-preview" name="preview" rows="4" maxlength="600">${h(c?.preview ?? '')}</textarea>
      </div>
      <div class="field"><label for="ch-date">Date</label><input id="ch-date" name="date" type="date" value="${h(c?.date ?? '')}"></div>
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
  const isLive = c.status === 'live';
  const enrolled = c.enrolled.length
    ? `<h3 class="sub">Enrolled teams</h3><ul class="list">${c.enrolled.map((t) => `<li><div><strong>${h(t.name)}</strong><br><span class="muted small">${h(t.members.join(', '))}</span></div><span class="tag ok">Enrolled</span></li>`).join('')}</ul>`
    : '';
  return `
  <li class="card challenge-row">
    <div class="challenge-info">
      <h2>${h(c.title)} <span class="tag ${isLive ? 'ok' : ''}">${isLive ? 'Live' : 'Draft'}</span>${isLive ? ` <span class="tag ${c.enrollmentOpen ? 'ok' : 'warn'}">${c.enrollmentOpen ? 'Enrollment open' : 'Enrollment closed'}</span>` : ''}</h2>
      <p class="muted">${longDate(c)} · ${c.teamCount} ${c.teamCount === 1 ? 'team' : 'teams'} · ${c.enrolled.length} enrolled</p>
      ${c.preview ? `<p>${h(c.preview)}</p>` : '<p class="muted">No description yet.</p>'}
      ${enrolled}
    </div>
    <div class="row">
      ${
        isLive
          ? `<button class="btn ${c.enrollmentOpen ? 'ghost' : 'primary'}" data-action="set-enrollment" data-open="${c.enrollmentOpen ? '' : '1'}" data-id="${h(c.id)}" data-fk="enrollment-${h(c.id)}">${c.enrollmentOpen ? 'Close enrollment' : 'Open enrollment'}</button>
             <button class="btn ghost" data-action="unpublish" data-id="${h(c.id)}" data-fk="live-${h(c.id)}">Take offline</button>`
          : `<button class="btn primary" data-action="publish" data-id="${h(c.id)}" data-fk="live-${h(c.id)}">Make live</button>`
      }
      <button class="btn ghost" data-action="edit-challenge" data-id="${h(c.id)}" data-fk="edit-${h(c.id)}">Edit</button>
      ${!isLive && !c.teamCount ? `<button class="btn danger" data-action="delete-challenge" data-id="${h(c.id)}" data-fk="delete-${h(c.id)}">Delete</button>` : ''}
    </div>
  </li>`;
}

function adminView() {
  const { challenges, notifications } = view.admin;
  const live = challenges.find((c) => c.status === 'live');
  const editing = ui.editing && ui.editing !== 'new' ? challenges.find((c) => c.id === ui.editing) : null;
  return `
  <h1 tabindex="-1">Competitions</h1>
  <p class="lede">Add competitions, give each a date, make one live, and open or close its enrollment.</p>
  ${
    notifications.length
      ? `<section class="card enroll" aria-label="New enrollments">
          <h2>New enrollments</h2>
          <ul class="list">${notifications.map((n) => `<li><div><strong>${h(n.teamName)}</strong> joined ${h(n.challengeTitle)}<br><span class="muted small">${new Date(n.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span></div></li>`).join('')}</ul>
          <div><button class="btn ghost" data-action="mark-seen" data-fk="mark-seen">Mark as seen</button></div>
        </section>`
      : ''
  }
  <p class="notice small">${live ? `<strong>${h(live.title)}</strong> is live.` : '<strong>Nothing is live.</strong> Participants cannot form teams.'} One competition is live at a time.</p>
  ${ui.editing ? challengeForm(editing) : `<div><button class="btn primary" data-action="new-challenge" data-fk="new-challenge">Add a competition</button></div>`}
  ${
    challenges.length
      ? `<ul class="challenge-list">${challenges.map(challengeRow).join('')}</ul>`
      : `<div class="empty"><h3>No competitions yet</h3><p>Add the first one to get started.</p></div>`
  }`;
}

// ---------- render ----------

function currentView() {
  const v = ui.view;
  if (v === 'login') return loginView();
  if (v === 'join') return joinView();
  if (v === 'admin') {
    return view.role === 'organizer'
      ? adminView()
      : `<h1 tabindex="-1">Organizers only</h1><div class="empty"><h3>This screen is for the organizer</h3><p>Competitions are managed by the organizer, who logs in with the organizer account.</p><a class="btn ghost" href="#challenge">Back to the competition</a></div>`;
  }
  if (v === 'challenge') return challengeView();
  const title = { people: 'Find teammates', team: 'My team', inbox: 'Inbox' }[v];
  if (view.role !== 'participant') return needAccount(title);
  if (!view.challenge) return noChallenge(title);
  return { people: peopleView, team: teamView, inbox: inboxView }[v]();
}

function render({ focusHeading = false } = {}) {
  const fk = document.activeElement?.dataset?.fk;
  const scroll = document.getElementById('carousel')?.scrollLeft ?? 0;
  app.innerHTML = `
    ${demoBar()}
    ${header()}
    ${identityStrip()}
    <main id="main" class="view-${ui.view}">${currentView()}</main>
    <footer class="site-footer">Let’s Code helps programmers arrive alone and leave with a team. Your email is never shown to others unless you share it with your teammates.</footer>`;
  if (focusHeading) {
    app.querySelector('main h1')?.focus();
  } else if (fk) {
    (app.querySelector(`[data-fk="${CSS.escape(fk)}"]`) ?? app.querySelector('main h1'))?.focus();
  }
  const carousel = document.getElementById('carousel');
  if (carousel) carousel.scrollLeft = scroll;
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

function go(target) {
  if (location.hash === `#${target}`) {
    ui.view = target;
    render({ focusHeading: true });
  } else {
    location.hash = target;
  }
}

// ---------- events ----------

const actions = {
  async logout() {
    view = await api('/api/logout', {});
    toast('You’re logged out.');
    go('challenge');
  },
  'add-skill'(el) {
    const input = document.getElementById('pf-skills');
    const current = input.value.split(',').map((s) => s.trim()).filter(Boolean);
    if (!current.includes(el.dataset.skill)) current.push(el.dataset.skill);
    input.value = current.join(', ');
  },
  open: () => act('setOpen', { open: true }, 'You’re now visible in discovery and open to invitations.'),
  pause: () => act('setOpen', { open: false }, 'Invitations paused. You’re hidden from discovery.'),
  invite: (el) => act('invite', { toId: el.dataset.id }, `Invitation sent to ${el.dataset.name}. It’s waiting in their inbox.`),
  withdraw: (el) => act('withdraw', { id: el.dataset.id }, 'Invitation withdrawn.'),
  decline: (el) => act('decline', { id: el.dataset.id }, 'Invitation declined.'),
  async accept(el) {
    if (await act('accept', { id: el.dataset.id, abandonDraft: el.dataset.abandon === '1' }, 'You’ve joined the team.')) go('team');
  },
  enroll: () => act('enroll', {}, 'Your team has joined the competition. The organizer has been told.'),
  abandon() {
    if (!confirm('Abandon this draft team? Its open invitations will be closed.')) return;
    act('abandonDraft', {}, 'Draft abandoned.');
  },
  'share-email': (el) =>
    act('setShareEmail', { share: el.checked }, el.checked ? 'Your email is now visible to your teammates.' : 'Your email is hidden from teammates again.'),
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
  publish: (el) => act('publish', { id: el.dataset.id }, 'The competition is live and enrollment is open.'),
  unpublish: (el) => act('unpublish', { id: el.dataset.id }, 'Taken offline. Its teams are kept.'),
  'set-enrollment': (el) =>
    act('setEnrollment', { id: el.dataset.id, open: el.dataset.open === '1' }, el.dataset.open === '1' ? 'Enrollment is open.' : 'Enrollment is closed. No new teams, members or entries.'),
  'mark-seen': () => act('markSeen', {}),
  'delete-challenge'(el) {
    if (!confirm('Delete this draft competition?')) return;
    act('deleteChallenge', { id: el.dataset.id }, 'Draft deleted.');
  },
};

function editChallenge(id) {
  ui.editing = id;
  render();
  document.getElementById('chf-h')?.focus();
}

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.matches('input[type="checkbox"]')) return;
  actions[el.dataset.action]?.(el);
});

app.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.action === 'share-email') actions['share-email'](el);
  else if (el.id === 'pf-photo') readPhoto(el.files[0]);
});

app.addEventListener('input', (e) => {
  if (e.target.id !== 'q') return;
  ui.query = e.target.value;
  renderResults();
});

// Send a form; on refusal keep what was typed and show why beside it.
async function submitForm(form, path, body, fields) {
  const button = form.querySelector('button.primary');
  button.disabled = true;
  try {
    view = await api(path, body);
    return true;
  } catch (err) {
    form.querySelector('.form-error').textContent = err.message;
    document.getElementById(fields[err.code])?.focus();
    return false;
  } finally {
    button.disabled = false;
  }
}

app.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = new FormData(form);
  const kind = form.dataset.form;
  if (kind === 'create-team') {
    if (await act('createTeam', { name: data.get('name') }, 'Team created. You hold the first of four seats.')) go('team');
  } else if (kind === 'login') {
    if (!(await submitForm(form, '/api/login', { email: data.get('email'), password: data.get('password') }, { bad_login: 'li-password' }))) return;
    toast(view.role === 'organizer' ? 'Logged in as the organizer.' : `Welcome back, ${view.me.displayName.split(' ')[0]}.`);
    go(view.role === 'organizer' ? 'admin' : 'challenge');
  } else if (kind === 'join') {
    const body = {
      displayName: data.get('displayName'),
      email: data.get('email'),
      password: data.get('password'),
      skills: String(data.get('skills')).split(','),
      avatar: ui.pendingAvatar,
    };
    const fields = { bad_name: 'pf-name', bad_email: 'pf-email', email_unavailable: 'pf-email', bad_password: 'pf-password', bad_skills: 'pf-skills' };
    if (!(await submitForm(form, '/api/register', body, fields))) return;
    ui.pendingAvatar = null;
    toast('Account created. You’re not visible to anyone until you choose to be.');
    go('challenge');
  } else if (kind === 'challenge') {
    const id = form.dataset.id || undefined;
    const body = { type: 'saveChallenge', id, title: data.get('title'), preview: data.get('preview'), date: data.get('date') };
    if (!(await submitForm(form, '/api/action', body, { bad_title: 'ch-title', bad_preview: 'ch-preview', bad_date: 'ch-date' }))) return;
    ui.editing = null;
    toast(id ? 'Competition updated.' : 'Draft saved. Make it live when it is ready.');
    render({ focusHeading: true });
  }
});

// Shrink a chosen picture to a small square before it is sent.
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
  // Someone already signed in has no use for the account forms.
  if (['login', 'join'].includes(ui.view) && view.role !== 'visitor') ui.view = 'challenge';
  render({ focusHeading });
  if (focusHeading) window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => syncRoute(true));

// The skip link moves focus itself; following its href would change the route.
document.querySelector('.skip').addEventListener('click', (e) => {
  e.preventDefault();
  app.querySelector('main h1')?.focus();
});

// The earlier single-browser demo kept everything here, including a typed email. Nothing reads it now.
try {
  localStorage.removeItem('lets-code-demo-v1');
} catch {
  // storage unavailable; nothing to clean up
}

view = await api('/api/view');
syncRoute(false);
setInterval(refresh, REFRESH_MS);
document.addEventListener('visibilitychange', refresh);

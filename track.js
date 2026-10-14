/* Parent page: live location + arrival time, schedule, alerts, and absence reporting.
   The private link carries #t=<topic>&k=<key>&r=<riderId>. The key never leaves this device. */
'use strict';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SAVE_KEY = 'rcp.parent';

function readLink() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get('t') && p.get('k') && p.get('r')) {
    const cfg = { t: p.get('t'), k: p.get('k'), r: p.get('r') };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(cfg)); } catch {}
    return cfg;
  }
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; }
}
const cfg = readLink();
let saved = {};
try { saved = JSON.parse(localStorage.getItem(SAVE_KEY + '.data') || '{}'); } catch {}
let liveMsg = saved.live || null;   // latest 'live' payload
let sched = saved.sched || null;    // latest 'sched' payload
let map = null, layers = null;

function persist() { try { localStorage.setItem(SAVE_KEY + '.data', JSON.stringify({ live: liveMsg, sched, reports: saved.reports || [] })); } catch {} }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }
function niceTime(t) { const [h, m] = t.split(':').map(Number); const d = new Date(); d.setHours(h, m); return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
function niceDay(s) {
  const today = dIso(new Date());
  if (s === today) return 'Today';
  if (s === dAdd(today, 1)) return 'Tomorrow';
  return dParse(s).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}
function ago(ms) { const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; }

async function handle(m) {
  const p = await unseal(cfg.k, m.message);
  if (!p) return;
  if (p.type === 'live' && (!liveMsg || p.t >= liveMsg.t)) liveMsg = p;
  if (p.type === 'sched' && (!sched || p.t >= sched.t)) sched = p;
  persist(); render();
}

function childName() {
  const fromLive = liveMsg && liveMsg.st && liveMsg.st.find((s) => s.i === cfg.r);
  return (fromLive && fromLive.n) || (sched && sched.names && sched.names[cfg.r]) || 'your child';
}
function myRoutes() { return sched ? sched.routes.filter((rt) => rt.riders.includes(cfg.r)) : []; }

function statusBlock() {
  const owner = (liveMsg && liveMsg.o) || (sched && sched.o) || 'The driver';
  const me = liveMsg && liveMsg.st && liveMsg.st.find((s) => s.i === cfg.r);
  const fresh = liveMsg && Date.now() - liveMsg.t < 3 * 3600000;
  if (!fresh || !me) {
    const next = myRoutes().length ? upcomingRuns(myRoutes(), sched.cal, dIso(new Date()), 14).find((r) => dParse(r.date).setHours(...r.time.split(':').map(Number)) > Date.now() - 600000) : null;
    return `<section class="status idle"><div class="eyebrow">No run in progress</div>
      <div class="display sm">${next ? `${esc(next.rt.kind === 'pickup' ? 'Pickup' : 'Drop-off')} ${esc(niceDay(next.date).toLowerCase() === 'today' ? 'today' : niceDay(next.date))}` : 'Nothing scheduled'}</div>
      ${next ? `<div class="sub">${niceTime(next.time)}${next.note ? ' · ' + esc(next.note) : ''}</div>` : ''}
      <p class="muted">When ${esc(owner)} starts a run, the live map and arrival time appear here.</p></section>`;
  }
  const kind = liveMsg.r.k;
  const stale = liveMsg.s === 'live' && Date.now() - liveMsg.t > 3 * 60000;
  const ahead = liveMsg.st.filter((s) => s.x === 'w' && (s.e ?? Infinity) < (me.e ?? Infinity)).length;
  let big, line;
  if (liveMsg.s === 'ended') {
    big = me.x === 'a' ? 'Marked absent' : kind === 'pickup' ? (me.x === 'd' ? 'Home' : 'Run finished') : (me.x === 'd' ? 'At school' : 'Run finished');
    line = `${kind === 'pickup' ? 'Afternoon pickup' : 'Morning drop-off'} finished ${ago(liveMsg.t)}.`;
  } else if (me.x === 'a') { big = 'Marked absent'; line = `${owner} knows ${esc(childName())} isn't riding today.`; }
  else if (me.x === 'd') {
    if (kind === 'pickup') { big = 'Dropped off'; line = `${esc(childName())} was dropped off at home.`; }
    else { big = liveMsg.sc && liveMsg.sc.e != null ? etaText(liveMsg.sc.e) : 'In the car'; line = `${esc(childName())} is in the car${liveMsg.sc ? ` — arriving at ${esc(liveMsg.sc.n)}${liveMsg.sc.e != null ? ' in about ' + etaText(liveMsg.sc.e) : ''}` : ''}.`; }
  } else {
    big = me.e != null ? etaText(me.e) : 'On the way';
    line = kind === 'pickup'
      ? `${esc(childName())} should be home ${me.e != null ? 'in about ' + etaText(me.e) : 'soon'}.${ahead ? ` ${ahead} stop${ahead > 1 ? 's' : ''} before you.` : ''}`
      : `${esc(owner)} is on the way to pick up ${esc(childName())}.${ahead ? ` ${ahead} stop${ahead > 1 ? 's' : ''} before you.` : ' You are next.'}${me.e != null && me.e <= 330 ? ' Please be ready!' : ''}`;
  }
  return `<section class="status ${liveMsg.s === 'live' && !stale ? 'live' : ''} ${me.e != null && me.e <= 330 && me.x === 'w' ? 'soon' : ''}">
    <div class="eyebrow">${liveMsg.s === 'live' ? '<span class="pulse"></span> Live · ' : ''}${esc(kind === 'pickup' ? 'Afternoon pickup' : 'Morning drop-off')}</div>
    <div class="display big">${big}</div>
    <p>${line}</p>
    <div class="itemmeta">${stale ? `Last location ${ago(liveMsg.t)} — the driver's signal may be weak.` : `Updated ${ago(liveMsg.t)}`}</div>
  </section>`;
}

function scheduleBlock() {
  const routes = myRoutes();
  if (!routes.length) return '';
  const today = dIso(new Date());
  const days = [];
  for (let i = 0; i < 10; i++) {
    const date = dAdd(today, i);
    const c = calOn(sched.cal, date);
    const runs = routes.map((rt) => ({ rt, time: schedTimeOn(rt, date, sched.cal), note: schedNote(rt, date, sched.cal) })).filter((r) => r.time);
    const away = (saved.reports || []).filter((x) => x.date === date).pop();
    if (!runs.length && !(c && c.type === 'off')) continue;
    days.push(`<div class="item"><div class="itemmain">
      <div class="dayname"><b>${esc(niceDay(date))}</b></div>
      <div class="grow">${c && c.type === 'off' ? `<span class="caltag off">Off</span> ${esc(c.label || 'No carpool')}` :
        away && !away.cancel ? `<span class="caltag off">Absent</span> You reported ${esc(childName())} isn't riding` :
        runs.map((r) => `<div>${r.rt.kind === 'pickup' ? 'Pickup' : 'Drop-off'} <b>${niceTime(r.time)}</b>${r.note ? ` <span class="caltag early">${esc(r.note)}</span>` : ''}</div>`).join('')}</div>
    </div></div>`);
  }
  return `<div class="eyebrow" style="margin:26px 0 8px">Coming up</div>
    <div class="panel list">${days.join('') || '<div class="item">No carpool in the next 10 days.</div>'}</div>
    <div class="actions"><button data-act="calendar">Add to my calendar (alert ${routes[0].mins || 30} min before)</button></div>`;
}

function render() {
  if (!cfg) {
    $('#view').innerHTML = '<div class="panel empty"><div class="display sm">Link incomplete</div><p>Please open the full link the driver sent you.</p></div>';
    return;
  }
  const pool = (sched && sched.pool) || (liveMsg && liveMsg.pool) || 'Carpool';
  document.title = pool; $('#poolName').textContent = pool;
  const phone = (liveMsg && liveMsg.ph) || (sched && sched.ph);
  const owner = (liveMsg && liveMsg.o) || (sched && sched.o) || 'the driver';
  const showMap = liveMsg && liveMsg.s === 'live' && Date.now() - liveMsg.t < 3 * 3600000 && liveMsg.d;
  $('#view').innerHTML = `
    <section class="pagehead"><div><div class="eyebrow">Carpool for</div><div class="display">${esc(childName())}</div></div></section>
    ${statusBlock()}
    ${showMap ? '<div id="pmap"></div>' : ''}
    <div class="actions">
      <button class="primary" data-act="absent">Not riding?</button>
      ${phone ? `<a class="btn" href="sms:${esc(String(phone).replace(/[^\d+]/g, ''))}">Text ${esc(owner)}</a>` : ''}
      <button class="ghost" data-act="alerts">Get alerts on my phone</button>
    </div>
    ${scheduleBlock()}
    <p class="itemmeta" style="margin-top:28px">This page is private to your family. Locations are encrypted; only people with this link can see them.</p>`;
  if (showMap) drawMap(); else if (map) { map.remove(); map = null; }
}

function drawMap() {
  const el = $('#pmap');
  if (!el || !window.L) return;
  if (map) { map.remove(); map = null; }
  map = L.map(el, { zoomControl: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  const pts = [];
  const car = [liveMsg.d.la, liveMsg.d.lo];
  L.marker(car, { icon: L.divIcon({ className: 'pin car', iconSize: [22, 22] }), zIndexOffset: 1000 }).addTo(map);
  pts.push(car);
  const me = liveMsg.st.find((s) => s.i === cfg.r);
  if (me && me.la && me.x === 'w') { L.marker([me.la, me.lo], { icon: L.divIcon({ className: 'pin w', html: 'You', iconSize: [34, 26] }) }).addTo(map); pts.push([me.la, me.lo]); }
  if (liveMsg.sc && liveMsg.sc.la && (liveMsg.r.k !== 'pickup' || !me || me.x !== 'w')) { L.marker([liveMsg.sc.la, liveMsg.sc.lo], { icon: L.divIcon({ className: 'pin school', html: 'S', iconSize: [26, 26] }) }).addTo(map); pts.push([liveMsg.sc.la, liveMsg.sc.lo]); }
  if (pts.length > 1) map.fitBounds(pts, { padding: [36, 36], maxZoom: 16 }); else map.setView(car, 15);
}

// ---- dialogs ----
function openModal(html, onSubmit) {
  const dlg = $('#modal'), form = $('#modalForm');
  form.innerHTML = html;
  form.onsubmit = (e) => {
    if (e.submitter && e.submitter.value === 'cancel') return;
    e.preventDefault();
    Promise.resolve(onSubmit(Object.fromEntries(new FormData(form)))).then((ok) => { if (ok !== false) dlg.close(); });
  };
  dlg.showModal();
}
const buttons = (label) => `<div class="actions" style="justify-content:flex-end;margin-top:16px"><button value="cancel" formnovalidate>Cancel</button><button class="primary" value="ok">${label}</button></div>`;

const actions = {
  absent: () => {
    const today = dIso(new Date());
    const mine = (saved.reports || []).filter((x) => x.date >= today && !x.cancel);
    openModal(`<h3>Not riding</h3>
      <p class="muted">Let ${esc((sched && sched.o) || 'the driver')} know ${esc(childName())} won't need the carpool.</p>
      <label>Which day?</label><input type="date" name="date" required min="${today}" value="${today}">
      <label>Note (optional)</label><input name="note" placeholder="e.g. sick, I'm driving today">
      ${mine.length ? `<label>Already reported</label>${mine.map((x) => `<div class="stop">${esc(niceDay(x.date))} <button class="textbtn" type="button" data-undo="${x.date}">Undo</button></div>`).join('')}` : ''}
      ${buttons('Send')}`, async (d) => {
      try {
        await relayPublish(cfg.t + 'in', await seal(cfg.k, { type: 'absent', riderId: cfg.r, date: d.date, note: d.note || '' }));
        (saved.reports = saved.reports || []).push({ date: d.date, cancel: false });
        persist(); render(); toast('Sent — thank you!');
      } catch { toast('Could not send — check your connection'); return false; }
    });
    document.querySelectorAll('[data-undo]').forEach((b) => (b.onclick = async () => {
      try {
        await relayPublish(cfg.t + 'in', await seal(cfg.k, { type: 'absent', riderId: cfg.r, date: b.dataset.undo, cancel: true }));
        saved.reports = (saved.reports || []).filter((x) => x.date !== b.dataset.undo);
        persist(); $('#modal').close(); render(); toast('Updated — riding again');
      } catch { toast('Could not send — check your connection'); }
    }));
  },
  alerts: () => {
    const topic = cfg.t + 'f' + cfg.r;
    openModal(`<h3>Alerts on your phone</h3>
      <p class="muted">Get a notification when the carpool is 30 minutes away from starting, when the driver is on the way and 5 minutes away, and when ${esc(childName())} is picked up or dropped off.</p>
      <div class="howto"><ol>
        <li>Install the free <a href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noopener">ntfy</a> app (<a href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noopener">Android</a>) and allow notifications.</li>
        <li>Tap <b>+</b> and paste this topic: <code>${esc(topic)}</code></li>
        <li>Tap <b>Subscribe</b>. That's it.</li>
      </ol></div>
      <div class="actions" style="justify-content:flex-end;margin-top:16px"><button value="cancel" formnovalidate>Close</button><button class="primary" type="button" id="copyTopic">Copy topic</button></div>`, () => {});
    $('#copyTopic').onclick = async () => { try { await navigator.clipboard.writeText(topic); toast('Copied — paste it in ntfy'); } catch { prompt('Copy this topic:', topic); } };
  },
  calendar: () => {
    const routes = myRoutes().map((rt) => ({ ...rt, description: `${sched.pool}${rt.destination ? '\n' + rt.destination : ''}` }));
    downloadFile('carpool.ics', buildCalendarFile(sched.pool, routes, sched.cal), 'text/calendar');
    toast('Open the file, then tap Add All');
  },
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && actions[el.dataset.act]) { e.preventDefault(); actions[el.dataset.act](el); }
});

// ---- boot ----
render();
if (cfg) {
  let es = null;
  const connect = () => { if (es) es.close(); es = relaySubscribe(cfg.t, handle, '12h'); };
  connect();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') connect(); });
  setInterval(render, 30000); // refresh "updated x min ago"
}

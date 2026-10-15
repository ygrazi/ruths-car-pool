/* Ruth's Car Pool — single-file PWA. Data is stored on this device (localStorage);
   use Settings → Backup to move it between devices. */
'use strict';

const STORE_KEY = 'ruthsCarPool.v1';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const RATE_LABEL = { month: 'per month', week: 'per week', ride: 'per ride' };

const DEFAULT_STATE = {
  settings: {
    poolName: "Ruth's Car Pool",
    ownerName: 'Ruth',
    ownerPhone: '',
    homeAddress: '',
    zelle: '',
    zelleName: '',
    venmo: '',
    cycle: 'month',     // week | month
    cycleDay: 1,        // month: day of month (1-28). week: 0-6 weekday
    dueDays: 7,
    remindMin: 30,
    nextInvoiceNo: 1001,
    remindParents: true,  // "carpool in 30 min" push to parents who turned on alerts
    remindMe: false,      // same reminders to Ruth's own ntfy app
    liveMapHidden: false,
    alerts30: true,
  },
  riders: [],
  routes: [],
  rides: [],
  invoices: [],
  calendar: [],
  absences: [],
  sentReminders: {},
  liveRun: null,
};

let state = load();
let tab = 'today';
let todayDate = isoDate(new Date());
let billingFilter = 'open';

// ---------- storage ----------
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const st = { ...structuredClone(DEFAULT_STATE), ...s, settings: { ...DEFAULT_STATE.settings, ...s.settings } };
      if (!s.settings.alerts30) { // one-time move from the old 15-minute default to 30 minutes
        if (st.settings.remindMin === 15) st.settings.remindMin = 30;
        st.routes.forEach((rt) => { if (rt.remindMin === 15) rt.remindMin = 30; });
        st.settings.alerts30 = true;
      }
      return st;
    }
  } catch (e) {
    // Never let a damaged save be overwritten: keep the raw copy so it can be recovered.
    console.warn('load failed', e);
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) localStorage.setItem(STORE_KEY + '.damaged.' + Date.now(), raw); } catch {}
  }
  return structuredClone(DEFAULT_STATE);
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Could not save on this device'); }
  localBackup();
  if (typeof cloudPush === 'function') cloudPush();
}

// ---------- helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + (Number(n) || 0).toFixed(2);
function isoDate(d) { const z = new Date(d); z.setMinutes(z.getMinutes() - z.getTimezoneOffset()); return z.toISOString().slice(0, 10); }
function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function niceDate(s) { return parseDate(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); }
function niceTime(t) { if (!t) return ''; const [h, m] = t.split(':').map(Number); const d = new Date(); d.setHours(h, m); return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); }
const rider = (id) => state.riders.find((r) => r.id === id);
const route = (id) => state.routes.find((r) => r.id === id);
const digits = (p) => String(p || '').replace(/[^\d+]/g, '');

// Line icons (Lucide-style, 24px grid, stroke = currentColor)
const ICONS = {
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  receipt: '<path d="M4 2v20l3-2 3 2 2-2 2 2 3-2 3 2V2l-3 2-3-2-2 2-2-2-3 2Z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  nav: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};
const ic = (name) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2400);
}

// ---------- billing math ----------
function invoiceStatus(inv) {
  if (inv.status === 'paid') return 'paid';
  return inv.due < isoDate(new Date()) ? 'overdue' : 'unpaid';
}
function riderBalance(rid) {
  return state.invoices.filter((i) => i.riderId === rid && i.status !== 'paid').reduce((a, i) => a + i.total, 0);
}
function unbilledRides(rid) {
  return state.rides.filter((r) => r.riderId === rid && !r.invoiceId);
}
function nextBillDate(from = isoDate(new Date())) {
  const s = state.settings;
  const d = parseDate(from);
  if (s.cycle === 'week') {
    const diff = (Number(s.cycleDay) - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + diff);
    return isoDate(d);
  }
  const day = Math.min(Math.max(Number(s.cycleDay) || 1, 1), 28);
  let next = new Date(d.getFullYear(), d.getMonth(), day);
  if (next < d) next = new Date(d.getFullYear(), d.getMonth() + 1, day);
  return isoDate(next);
}
function suggestedCharge(r) {
  if (r.rateType === 'month') {
    const month = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    return { amount: Number(r.rate) || 0, rides: unbilledRides(r.id), desc: `Carpool — ${month}` };
  }
  if (r.rateType === 'ride') {
    const rides = unbilledRides(r.id);
    return { amount: rides.reduce((a, x) => a + x.amount, 0), rides, desc: `${rides.length} ride${rides.length === 1 ? '' : 's'} @ ${money(r.rate)}` };
  }
  return { amount: Number(r.rate) || 0, rides: unbilledRides(r.id), desc: `Carpool ${r.rateType === 'week' ? 'weekly' : 'monthly'} fee` };
}

// ---------- links (SMS / maps / payment) ----------
function smsLink(phones, body) {
  const list = (Array.isArray(phones) ? phones : [phones]).map(digits).filter(Boolean);
  // iOS accepts "sms:/open?addresses=a,b&body=" for groups; "sms:num&body=" works for one.
  if (list.length > 1) return `sms:/open?addresses=${list.join(',')}&body=${encodeURIComponent(body)}`;
  return `sms:${list[0] || ''}${/iPhone|iPad|Mac/.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(body)}`;
}
function mapsLink(stops, destination) {
  const s = state.settings;
  const addrs = stops.filter(Boolean);
  const dest = destination || addrs.pop();
  const p = new URLSearchParams({ api: '1', destination: dest || '', travelmode: 'driving' });
  if (s.homeAddress) p.set('origin', s.homeAddress);
  if (addrs.length) p.set('waypoints', addrs.join('|'));
  return 'https://www.google.com/maps/dir/?' + p.toString();
}
// Drop-off: homes in order, then school. Pickup: school first, then each home.
function routeMapsLink(rt, date) {
  const homes = rt.riderIds.map(rider).filter((r) => r && !(date && absenceFor(r.id, date))).map((r) => r.address);
  if (rt.kind === 'pickup' && rt.destination) return mapsLink([rt.destination, ...homes]);
  return mapsLink(homes, rt.destination);
}
function paymentLines(amount) {
  const s = state.settings;
  const lines = [];
  if (s.zelle) lines.push(`Zelle: ${s.zelle}${s.zelleName ? ` (${s.zelleName})` : ''} — open your bank app → Zelle → send ${money(amount)}`);
  if (s.venmo) lines.push(`Venmo: https://venmo.com/${s.venmo.replace(/^@/, '')}?txn=pay&amount=${(+amount).toFixed(2)}`);
  return lines;
}
function invoiceText(inv) {
  const r = rider(inv.riderId) || {};
  const s = state.settings;
  return [
    `${s.poolName} — Invoice #${inv.number}`,
    `Hi ${r.parent || r.name || ''}! Here is the carpool bill for ${r.name || ''}.`,
    ...inv.items.map((it) => `• ${it.desc}: ${money(it.amount)}`),
    `Total due: ${money(inv.total)} by ${niceDate(inv.due)}`,
    ...paymentLines(inv.total),
    `Please put "Invoice ${inv.number}" in the memo. Thank you! — ${s.ownerName}`,
  ].join('\n');
}

// ---------- school calendar (logic lives in live.js) ----------
// state.calendar entries: { id, start, end, label, type: 'off' | 'early', time }
const KIND_LABEL = { dropoff: 'Drop-off', pickup: 'Pickup' };
const calendarOn = (date) => calOn(state.calendar, date);
const routeTimeOn = (rt, date) => schedTimeOn(rt, date, state.calendar);
const routeTimeNote = (rt, date) => schedNote(rt, date, state.calendar);

// ---------- calendar alarms (.ics) ----------
function routeForCalendar(rt) {
  const riders = rt.riderIds.map(rider).filter(Boolean);
  return {
    id: rt.id, kind: rt.kind || 'dropoff', name: rt.name, days: rt.days, time: rt.time, dayTimes: rt.dayTimes,
    mins: Number(rt.remindMin ?? state.settings.remindMin) || 0, destination: rt.destination,
    description: `${state.settings.poolName}\n${riders.map((r, i) => `${i + 1}. ${r.name} — ${r.address || 'no address'}`).join('\n')}`,
  };
}
const buildIcs = (routes) => buildCalendarFile(state.settings.poolName, routes.map(routeForCalendar), state.calendar);
const download = downloadFile;

// In-app reminders while the app is open (iPhone home-screen apps can show these after permission).
const fired = new Set();
function checkReminders() {
  const now = new Date();
  const today = isoDate(now);
  for (const rt of state.routes) {
    const time = routeTimeOn(rt, today);
    if (!time) continue;
    const [h, m] = time.split(':').map(Number);
    const at = new Date(now); at.setHours(h, m, 0, 0);
    const mins = Number(rt.remindMin ?? state.settings.remindMin) || 15;
    const diff = (at - now) / 60000;
    const key = `${rt.id}-${today}`;
    if (diff <= mins && diff > -5 && !fired.has(key)) {
      fired.add(key);
      const msg = `${KIND_LABEL[rt.kind || 'dropoff']}: ${rt.name} at ${niceTime(time)} (${Math.max(0, Math.round(diff))} min)`;
      toast(msg);
      if ('Notification' in window && Notification.permission === 'granted') {
        navigator.serviceWorker?.ready.then((reg) => reg.showNotification(state.settings.poolName, { body: msg, icon: 'icon-180.png' }))
          .catch(() => new Notification(state.settings.poolName, { body: msg }));
      }
    }
  }
}

// ---------- live tracking & parent alerts (driver side; engine in live.js) ----------
function liveCfg() {
  const s = state.settings;
  if (!s.live || !s.live.key) {
    s.live = { topic: 'rcp' + randomId(12), key: b64u.enc(crypto.getRandomValues(new Uint8Array(32))) };
    save();
  }
  return s.live;
}
const liveOn = () => !!(state.settings.live && state.settings.live.key);
const familyTopic = (rid) => `${liveCfg().topic}f${rid}`;
const myTopic = () => `${liveCfg().topic}me`;
const appBase = () => location.origin + location.pathname.replace(/[^/]*$/, '');
const trackLink = (r) => { const c = liveCfg(); return `${appBase()}track.html#t=${c.topic}&k=${c.key}&r=${r.id}`; };
const firstName = (n) => String(n || '').trim().split(/\s+/)[0];
function nowTime() { return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }

// Look up map coordinates for addresses (once per address, 1 per second as the free service asks).
let geoBusy = false;
async function ensureCoords() {
  if (geoBusy) return;
  geoBusy = true;
  try {
    const items = [...state.riders.map((o) => ({ o, a: o.address })), ...state.routes.map((o) => ({ o, a: o.destination }))];
    for (const it of items) {
      if (!it.a || it.o.geoAddr === it.a) continue;
      it.o.geo = await geocode(it.a).catch(() => null);
      it.o.geoAddr = it.a;
      save();
      await new Promise((r) => setTimeout(r, 1100));
    }
  } finally { geoBusy = false; }
}

// Absences reported by parents (encrypted messages in the inbox topic).
function absenceFor(rid, date) {
  const list = (state.absences || []).filter((a) => a.riderId === rid && a.date === date).sort((a, b) => a.at - b.at);
  const last = list[list.length - 1];
  return last && !last.cancel ? last : null;
}
async function pollInbox() {
  if (!liveOn()) return;
  try {
    const msgs = await relayPoll(liveCfg().topic + 'in', '72h');
    const fresh = [];
    for (const m of msgs) {
      if ((state.absences || []).some((a) => a.id === m.id)) continue;
      const p = await unseal(liveCfg().key, m.message);
      if (!p || p.type !== 'absent' || !rider(p.riderId)) continue;
      (state.absences = state.absences || []).push({ id: m.id, riderId: p.riderId, date: p.date, note: p.note || '', at: m.time * 1000, cancel: !!p.cancel });
      fresh.push(p);
    }
    const cutoff = addDays(isoDate(new Date()), -30);
    state.absences = (state.absences || []).filter((a) => a.date >= cutoff);
    if (fresh.length) {
      save(); render();
      const p = fresh[fresh.length - 1];
      toast(`${firstName(rider(p.riderId).name)} ${p.cancel ? 'is riding again' : 'is not riding'} ${niceDate(p.date)}`);
    }
  } catch { /* offline — try again later */ }
}

// Plain-text push alert to a family's ntfy topic (no addresses or locations in these).
function pushFamily(r, message, title) {
  if (!liveOn()) return;
  relayPublish(familyTopic(r.id), message, { title: title || state.settings.poolName, tags: ['oncoming_automobile'], click: appBase() + 'track.html' }).catch(() => {});
}

// Schedule snapshot so parents' pages can show upcoming runs and build calendar alarms.
let syncTimer = null;
function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(() => { publishSchedule(); scheduleReminders(); }, 2500); }
async function publishSchedule() {
  if (!liveOn()) return;
  const s = state.settings;
  const today = isoDate(new Date());
  const snap = {
    v: 1, type: 'sched', t: Date.now(), pool: s.poolName, o: s.ownerName, ph: s.ownerPhone,
    names: Object.fromEntries(state.riders.map((r) => [r.id, firstName(r.name)])),
    routes: state.routes.map((rt) => ({ id: rt.id, kind: rt.kind || 'dropoff', name: rt.name, days: rt.days, time: rt.time, dayTimes: rt.dayTimes || {}, mins: Number(rt.remindMin ?? s.remindMin) || 30, destination: rt.destination, riders: rt.riderIds })),
    cal: (state.calendar || []).filter((c) => (c.end || c.start) >= today).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 30).map(({ type, label, start, end, time }) => ({ type, label, start, end, time })),
  };
  try { await relayPublish(liveCfg().topic, await seal(liveCfg().key, snap)); state.lastSchedPub = Date.now(); save(); } catch {}
}

// "Carpool in 30 minutes" push reminders, queued on the relay up to ~26 hours ahead.
async function scheduleReminders() {
  const s = state.settings;
  if (!liveOn() || (!s.remindParents && !s.remindMe)) return;
  const now = Date.now();
  const sent = (state.sentReminders = state.sentReminders || {});
  for (const run of upcomingRuns(state.routes, state.calendar, isoDate(new Date()), 2)) {
    const [h, m] = run.time.split(':').map(Number);
    const at = parseDate(run.date); at.setHours(h, m, 0, 0);
    const lead = Number(run.rt.remindMin ?? s.remindMin) || 30;
    const fire = at.getTime() - lead * 60000;
    const key = `${run.rt.id}|${run.date}|${run.time}`;
    if (sent[key] || fire < now + 60000 || fire > now + 26 * 3600000) continue;
    const kind = KIND_LABEL[run.rt.kind || 'dropoff'];
    const delay = String(Math.floor(fire / 1000));
    try {
      if (s.remindParents) {
        for (const r of run.rt.riderIds.map(rider).filter(Boolean)) {
          if (absenceFor(r.id, run.date)) continue;
          const msg = run.rt.kind === 'pickup'
            ? `School pickup for ${firstName(r.name)} at ${niceTime(run.time)} — in ${lead} minutes.${run.note ? ' (' + run.note + ')' : ''}`
            : `Carpool leaves at ${niceTime(run.time)} — please have ${firstName(r.name)} ready in about ${lead} minutes.`;
          await relayPublish(familyTopic(r.id), msg, { title: `${s.poolName} · ${kind}`, tags: ['alarm_clock'], delay, click: appBase() + 'track.html' });
        }
      }
      if (s.remindMe) await relayPublish(myTopic(), `${kind}: ${run.rt.name} at ${niceTime(run.time)} — in ${lead} minutes.${run.note ? ' (' + run.note + ')' : ''}`, { title: s.poolName, tags: ['alarm_clock'], priority: 4, delay });
      sent[key] = fire;
    } catch { break; }
  }
  for (const k of Object.keys(sent)) if (sent[k] < now - 2 * 86400000) delete sent[k];
  save();
}

// --- the live run ---
let live = null;
function liveStops(rt, date) {
  return rt.riderIds.map(rider).filter(Boolean).map((r) => ({
    r,
    status: absenceFor(r.id, date) ? 'a' : state.rides.some((x) => x.date === date && x.routeId === rt.id && x.riderId === r.id) ? 'd' : 'w',
  }));
}
async function startLive(routeId, resume) {
  if (!('geolocation' in navigator)) return toast('Location is not available on this device');
  liveCfg();
  if (live) stopLive(true);
  const today = isoDate(new Date());
  live = { routeId, date: today, pos: null, etas: {}, line: null, alerted: new Set((resume && state.liveRun && state.liveRun.alerted) || []), lastPub: 0 };
  state.liveRun = { routeId, date: today, started: resume && state.liveRun ? state.liveRun.started : Date.now(), alerted: [...live.alerted] };
  save();
  ensureCoords().then(() => liveTick());
  if (Date.now() - (state.lastSchedPub || 0) > 3600000) publishSchedule();
  live.watch = navigator.geolocation.watchPosition(onLivePos, onLiveErr, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  live.timer = setInterval(liveTick, 30000);
  keepAwake();
  const rt = route(routeId);
  if (!resume) {
    for (const { r, status } of liveStops(rt, today)) {
      if (status !== 'w') continue;
      pushFamily(r, rt.kind === 'pickup'
        ? `${state.settings.ownerName} is picking up from ${(rt.destination || 'school').split(',')[0]} now.`
        : `${state.settings.ownerName} is on the way. Tap to see the live map and arrival time.`, 'On the way');
    }
    toast('Live — parents can now see you on the map');
  }
  tab = 'today'; todayDate = today; render(); renderLive();
}
function onLivePos(p) {
  if (!live) return;
  const first = !live.pos;
  live.pos = { lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5), acc: Math.round(p.coords.accuracy), sp: p.coords.speed, t: Date.now() };
  live.gpsError = null;
  updateLiveMap();
  if (first) liveTick();
}
function onLiveErr(e) {
  if (!live) return;
  if (e.code === 1) { toast('Allow location access for this app to share your live location'); stopLive(true); return; }
  live.gpsError = 'Waiting for GPS…'; renderLive();
}
let ticking = false;
async function liveTick() {
  if (!live || ticking) return;
  ticking = true;
  try {
    const rt = route(live.routeId);
    if (!rt) return stopLive(true);
    const stops = liveStops(rt, live.date);
    const pending = stops.filter((s) => s.status === 'w' && s.r.geo);
    const targets = pending.map((s) => ({ key: s.r.id, geo: s.r.geo }));
    if (rt.kind !== 'pickup' && rt.geo) targets.push({ key: 'school', geo: rt.geo });
    if (live.pos && targets.length) {
      const res = await drivingRoute([live.pos, ...targets.map((t) => t.geo)]).catch(() => null);
      if (res && live) {
        let acc = 0; live.etas = {};
        targets.forEach((t, i) => { acc += res.legs[i] + (i ? 60 : 0); live.etas[t.key] = Math.round(acc); });
        live.line = res.line;
      }
    } else if (live) live.etas = {};
    if (!live) return;
    for (const s of pending) {
      const e = live.etas[s.r.id];
      if (e != null && e <= 330 && !live.alerted.has(s.r.id + ':5')) {
        live.alerted.add(s.r.id + ':5');
        state.liveRun.alerted = [...live.alerted]; save();
        pushFamily(s.r, rt.kind === 'pickup'
          ? `${firstName(s.r.name)} will be home in about 5 minutes.`
          : `${state.settings.ownerName} is about 5 minutes away — please have ${firstName(s.r.name)} ready.`, '5 minutes away');
      }
    }
    await publishLive(rt, stops, 'live');
    renderLive(); updateLiveMap();
  } finally { ticking = false; }
}
async function publishLive(rt, stops, status) {
  const s = state.settings;
  const etas = (live && live.etas) || {};
  const payload = {
    v: 1, type: 'live', s: status, t: Date.now(), pool: s.poolName, o: s.ownerName, ph: s.ownerPhone,
    r: { id: rt.id, n: rt.name, k: rt.kind || 'dropoff' },
    d: live && live.pos ? { la: live.pos.lat, lo: live.pos.lng, sp: live.pos.sp, at: live.pos.t } : null,
    st: stops.map(({ r, status: x }) => ({ i: r.id, n: firstName(r.name), la: r.geo && r.geo.lat, lo: r.geo && r.geo.lng, x, e: etas[r.id] ?? null })),
    sc: rt.destination ? { n: rt.destination.split(',')[0], la: rt.geo && rt.geo.lat, lo: rt.geo && rt.geo.lng, e: etas.school ?? null } : null,
  };
  try {
    await relayPublish(liveCfg().topic, await seal(liveCfg().key, payload));
    if (live) { live.lastPub = Date.now(); live.relayError = null; }
  } catch { if (live) live.relayError = 'Connection problem — retrying'; }
}
function stopLive(silent) {
  if (!live) return;
  const rt = route(live.routeId);
  const date = live.date;
  navigator.geolocation.clearWatch(live.watch);
  clearInterval(live.timer);
  releaseAwake();
  if (rt) {
    const stops = liveStops(rt, date);
    publishLive(rt, stops, 'ended');
    if (!silent && rt.kind !== 'pickup') {
      for (const { r, status } of stops) if (status === 'd') pushFamily(r, `${firstName(r.name)} was dropped off at ${(rt.destination || 'school').split(',')[0]} at ${nowTime()}.`, 'Arrived at school');
    }
  }
  live = null; state.liveRun = null; save();
  if (liveMap) { liveMap.remove(); liveMap = null; }
  renderLive(); render();
}
// Called when a rider is checked off during a live run.
function liveRideChanged(routeId, riderId, on) {
  if (!live || live.routeId !== routeId || !on) return;
  const rt = route(routeId), r = rider(riderId);
  pushFamily(r, rt.kind === 'pickup' ? `${firstName(r.name)} was dropped off at home at ${nowTime()}.` : `${firstName(r.name)} was picked up at ${nowTime()}.`, rt.kind === 'pickup' ? 'Dropped off' : 'Picked up');
  liveTick();
}

let wakeLock = null;
async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {} }
function releaseAwake() { try { wakeLock && wakeLock.release(); } catch {} wakeLock = null; }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (live) { keepAwake(); liveTick(); }
  pollInbox();
});

// --- live panel + driver map ---
let liveMap = null, liveLayers = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (loadLeaflet.p) return loadLeaflet.p;
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
  document.head.appendChild(css);
  return (loadLeaflet.p = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  }));
}
function renderLive() {
  const box = $('#live');
  if (!live) { box.innerHTML = ''; box.hidden = true; document.body.classList.remove('is-live'); return; }
  const rt = route(live.routeId);
  const stops = liveStops(rt, live.date);
  const next = stops.find((s) => s.status === 'w');
  const nextEta = next ? live.etas[next.r.id] : live.etas.school;
  const status = live.gpsError || live.relayError || (live.lastPub ? `Shared ${Math.max(0, Math.round((Date.now() - live.lastPub) / 1000))}s ago` : 'Starting…');
  box.hidden = false;
  document.body.classList.add('is-live');
  if (!$('#liveInfo')) {
    box.innerHTML = `<div class="livebar"><span class="pulse" aria-hidden="true"></span><div class="grow" id="liveInfo"></div><button data-act="toggleMap" class="ghost light">Map</button><button data-act="stopLive" class="endbtn">End run</button></div><div id="livemap" ${state.settings.liveMapHidden ? 'hidden' : ''}></div>`;
  }
  $('#liveInfo').innerHTML = `<b>Live · ${esc(KIND_LABEL[rt.kind || 'dropoff'])}</b><span>${next ? `Next: ${esc(firstName(next.r.name))}${nextEta != null ? ' · ' + etaText(nextEta) : ''}` : rt.destination && rt.kind !== 'pickup' ? `To ${esc(rt.destination.split(',')[0])}${nextEta != null ? ' · ' + etaText(nextEta) : ''}` : 'All stops done'} · ${esc(status)}</span>`;
  if (!state.settings.liveMapHidden) updateLiveMap();
}
async function updateLiveMap() {
  if (!live || state.settings.liveMapHidden) return;
  const el = $('#livemap');
  if (!el) return;
  try { await loadLeaflet(); } catch { el.textContent = 'Map unavailable offline'; return; }
  if (!live) return;
  if (!liveMap) {
    liveMap = L.map(el, { zoomControl: false, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(liveMap);
    liveLayers = L.layerGroup().addTo(liveMap);
    liveMap.setView(live.pos ? [live.pos.lat, live.pos.lng] : [40.09, -74.22], 14);
  }
  liveLayers.clearLayers();
  const rt = route(live.routeId);
  const pts = [];
  if (live.line) L.polyline(live.line, { color: '#1c1a16', weight: 5, opacity: .8 }).addTo(liveLayers);
  liveStops(rt, live.date).forEach(({ r, status }, i) => {
    if (!r.geo) return;
    L.marker([r.geo.lat, r.geo.lng], { icon: L.divIcon({ className: `pin ${status}`, html: status === 'd' ? '✓' : String(i + 1), iconSize: [26, 26] }) }).addTo(liveLayers);
    if (status === 'w') pts.push([r.geo.lat, r.geo.lng]);
  });
  if (rt.geo) L.marker([rt.geo.lat, rt.geo.lng], { icon: L.divIcon({ className: 'pin school', html: 'S', iconSize: [26, 26] }) }).addTo(liveLayers);
  if (live.pos) {
    L.marker([live.pos.lat, live.pos.lng], { icon: L.divIcon({ className: 'pin car', html: '', iconSize: [22, 22] }), zIndexOffset: 1000 }).addTo(liveLayers);
    pts.push([live.pos.lat, live.pos.lng]);
  }
  if (pts.length > 1) liveMap.fitBounds(pts, { padding: [30, 30], maxZoom: 16 });
  else if (pts.length) liveMap.setView(pts[0], 15);
  setTimeout(() => liveMap && liveMap.invalidateSize(), 50);
}

// ---------- views ----------
function render() {
  document.title = state.settings.poolName;
  $('#poolName').textContent = state.settings.poolName;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  const v = $('#view');
  const blocked = cloudBlocking();
  document.body.classList.toggle('authing', blocked);
  if (blocked) { v.innerHTML = viewAuth(); return; }
  v.innerHTML = ({ today: viewToday, riders: viewRiders, routes: viewRoutes, billing: viewBilling, settings: viewSettings })[tab]();
}

function ledger(items) {
  return `<div class="ledger">${items.map(([label, value, cls]) => `<div><span>${label}</span><b class="${cls || ''}">${value}</b></div>`).join('')}</div>`;
}
function shortDate(s) { return parseDate(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function timeParts(t) { const s = niceTime(t); const m = s.match(/^(.*?)\s*([AP]M)$/i); return m ? [m[1], m[2]] : [s, '']; }

function stopsHtml(rt, withChecks) {
  const riders = rt.riderIds.map(rider).filter(Boolean);
  const school = rt.destination ? `<li class="dest"><label><span class="stopnum end">${ic('flag')}</span><span class="grow"><span class="stopname">${esc(rt.destination)}</span><span class="stopaddr">${rt.kind === 'pickup' ? 'Pick up at school' : 'Drop off at school'}</span></span></label></li>` : '';
  const homes = riders.map((r, i) => {
    const away = withChecks && absenceFor(r.id, todayDate);
    const done = withChecks && state.rides.some((x) => x.date === todayDate && x.routeId === rt.id && x.riderId === r.id);
    const eta = withChecks && live && live.routeId === rt.id && !done && !away ? live.etas[r.id] : null;
    const marker = away ? '<span class="stopnum away">–</span>'
      : withChecks ? `<input type="checkbox" class="stopcheck" aria-label="${esc(r.name)} ${rt.kind === 'pickup' ? 'dropped off' : 'picked up'}" data-act="toggleRide" data-route="${rt.id}" data-rider="${r.id}" ${done ? 'checked' : ''}>`
      : `<span class="stopnum">${i + 1}</span>`;
    return `<li class="${away ? 'away' : ''}"><label>${marker}<span class="grow"><span class="stopname">${esc(r.name)}${away ? ' <span class="caltag off">Absent</span>' : ''}${eta != null ? ` <span class="eta">${etaText(eta)}</span>` : ''}</span><span class="stopaddr">${away ? esc(away.note || 'Parent reported not riding') : esc(r.address || 'No address on file')}</span></span></label></li>`;
  }).join('');
  return rt.kind === 'pickup' ? `<ol class="road">${school}${homes}</ol>` : `<ol class="road">${homes}${school}</ol>`;
}

function viewToday() {
  const d = parseDate(todayDate);
  const dow = d.getDay();
  const isToday = todayDate === isoDate(new Date());
  const cal = calendarOn(todayDate);
  const routesToday = state.routes.filter((r) => routeTimeOn(r, todayDate)).sort((a, b) => routeTimeOn(a, todayDate).localeCompare(routeTimeOn(b, todayDate)));
  const owed = state.invoices.filter((i) => i.status !== 'paid').reduce((a, i) => a + i.total, 0);
  const overdue = state.invoices.filter((i) => invoiceStatus(i) === 'overdue').length;
  // Week strip: Sunday–Saturday of the selected date's week
  const weekStart = addDays(todayDate, -dow);
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((day) => {
    const c = calendarOn(day);
    const runs = state.routes.filter((r) => routeTimeOn(r, day)).length;
    const cls = [day === todayDate ? 'sel' : '', day === isoDate(new Date()) ? 'now' : '', c && c.type === 'off' ? 'off' : '', c && c.type === 'early' ? 'early' : '', !runs && !(c && c.type === 'off') ? 'none' : ''].join(' ');
    return `<button class="wd ${cls}" data-act="pickDay" data-d="${day}" title="${esc(c ? c.label : runs + ' runs')}"><span>${DAYS[parseDate(day).getDay()][0]}</span><b>${parseDate(day).getDate()}</b><i></i></button>`;
  }).join('');
  const upcoming = (state.calendar || []).filter((c) => (c.end || c.start) >= isoDate(new Date())).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 3);
  let html = `
    <section class="dayhead">
      <div>
        <div class="eyebrow">${isToday ? 'Today' : 'Schedule for'}</div>
        <div class="display">${d.toLocaleDateString(undefined, { weekday: 'long' })}</div>
        <div class="sub">${d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</div>
      </div>
      <label class="datepick">Change<input type="date" value="${todayDate}" data-act="setDate"></label>
    </section>
    <div class="week">
      <button class="wknav" data-act="shiftWeek" data-n="-7" aria-label="Previous week">‹</button>${week}<button class="wknav" data-act="shiftWeek" data-n="7" aria-label="Next week">›</button>
    </div>
    <div class="legend"><span class="k off"></span>No carpool <span class="k early"></span>Early dismissal</div>
    ${ledger([['Owed to you', money(owed), owed ? 'hl' : ''], ['Overdue', overdue, overdue ? 'bad' : ''], ['Next bill', shortDate(nextBillDate())]])}
    ${cal ? `<div class="banner ${cal.type}"><b>${cal.type === 'off' ? 'No carpool' : 'Early dismissal'}${cal.type === 'early' && cal.time ? ' · pickup ' + niceTime(cal.time) : ''}</b><span>${esc(cal.label || '')}${cal.end && cal.end !== cal.start ? ` · ${shortDate(cal.start)} – ${shortDate(cal.end)}` : ''}</span></div>` : ''}`;
  if (cal && cal.type === 'off') {
    html += upcoming.length ? `<div class="eyebrow" style="margin-top:22px">Coming up</div><div class="panel list">${upcoming.map(calRow).join('')}</div>` : '';
    return html;
  }
  if (!state.riders.length) {
    html += `<div class="panel empty"><div class="display sm">Let's get rolling.</div><p>Add the people in your carpool, then set up your routes.</p><div class="actions"><button class="primary" data-act="addRider">${ic('plus')}Add a rider</button><button class="ghost" data-act="loadDemo">Try sample data</button></div></div>`;
  } else if (!routesToday.length) {
    html += `<div class="panel empty"><p>No runs scheduled on ${d.toLocaleDateString(undefined, { weekday: 'long' })}.</p><button class="ghost" data-act="goto" data-tab="routes">Set up routes</button></div>`;
  }
  const isLiveToday = todayDate === isoDate(new Date());
  for (const rt of routesToday) {
    const riders = rt.riderIds.map(rider).filter(Boolean);
    const time = routeTimeOn(rt, todayDate);
    const note = routeTimeNote(rt, todayDate);
    const [t, ap] = timeParts(time);
    html += `<article class="run">
      <div class="runhead">
        <div class="clock"><b>${esc(t)}</b><span>${esc(ap)}</span></div>
        <div class="grow"><div class="kind ${rt.kind || 'dropoff'}">${KIND_LABEL[rt.kind || 'dropoff']}${note ? ` · <em>${esc(note)}</em>` : ''}</div><div class="runname">${esc(rt.name)}</div><div class="runmeta">${riders.length} rider${riders.length === 1 ? '' : 's'}${rt.destination ? ' · ' + esc(rt.destination.split(',')[0]) : ''}</div></div>
      </div>
      ${stopsHtml(rt, true)}
      <div class="actions">
        ${isLiveToday ? (live && live.routeId === rt.id
          ? `<button class="livebtn on" data-act="stopLive">${ic('nav')}Live now · End run</button>`
          : `<button class="livebtn" data-act="goLive" data-route="${rt.id}">${ic('nav')}Start run · share live</button>`) : ''}
        <a class="btn" target="_blank" rel="noopener" href="${esc(routeMapsLink(rt, todayDate))}">${ic('pin')}Directions</a>
        <a class="btn" href="${esc(smsLink(riders.filter((r) => !absenceFor(r.id, todayDate)).map((r) => r.phone), `Hi! ${state.settings.ownerName} here — on my way for ${rt.name} (${niceTime(time)}).`))}">${ic('msg')}Text all</a>
        <button class="ghost" data-act="markAll" data-route="${rt.id}">${ic('check')}${rt.kind === 'pickup' ? 'All dropped off' : 'All picked up'}</button>
      </div>
    </article>`;
  }
  return html;
}

function viewRiders() {
  const list = [...state.riders].sort((a, b) => a.name.localeCompare(b.name));
  const monthly = list.filter((r) => r.rateType === 'month').reduce((a, r) => a + (+r.rate || 0), 0);
  return `<section class="pagehead"><div><div class="eyebrow">Directory</div><div class="display">Riders</div></div><button class="primary" data-act="addRider">${ic('plus')}Add</button></section>
  ${list.length ? ledger([['Riders', list.length], ['Monthly billing', money(monthly)]]) : ''}
  ${list.length ? '' : '<div class="panel empty"><p>No riders yet.</p></div>'}
  ${list.length ? `<div class="panel list">${list.map((r) => {
    const bal = riderBalance(r.id);
    return `<div class="item">
      <div class="itemmain">
        <div class="grow"><div class="itemname">${esc(r.name)}</div>
          <div class="itemmeta">${r.parent ? esc(r.parent) + ' · ' : ''}${esc(r.address || 'No address')}</div></div>
        <div class="itemright"><div class="amt">${money(r.rate)}</div><div class="itemmeta">${RATE_LABEL[r.rateType]}</div></div>
      </div>
      ${r.address && r.geoAddr === r.address && !r.geo ? '<div class="itemmeta warn">Address not found on the map — check the spelling so live arrival times work.</div>' : ''}
      ${(state.absences || []).filter((a) => a.riderId === r.id && a.date >= isoDate(new Date()) && absenceFor(r.id, a.date) === a).map((a) => `<div class="itemmeta"><span class="caltag off">Absent</span> ${niceDate(a.date)}${a.note ? ' — ' + esc(a.note) : ''}</div>`).join('')}
      <div class="itemfoot">
        ${r.phone ? `<button class="small-btn" data-act="sendLink" data-id="${r.id}">${ic('nav')}Text parent link</button>` : ''}
        <button class="textbtn" data-act="copyLink" data-id="${r.id}">Copy link</button>
      </div>
      <div class="itemfoot">
        ${bal ? `<span class="tag due">Owes ${money(bal)}</span>` : '<span class="tag">Paid up</span>'}
        <span class="links">
          ${r.phone ? `<a href="tel:${esc(digits(r.phone))}">Call</a><a href="${esc(smsLink(r.phone, ''))}">Text</a>` : ''}
          ${r.address ? `<a target="_blank" rel="noopener" href="${esc(mapsLink([r.address]))}">Map</a>` : ''}
          <button class="textbtn" data-act="editRider" data-id="${r.id}">Edit</button>
        </span>
      </div></div>`;
  }).join('')}</div>` : ''}`;
}

function calRow(c) {
  const range = c.end && c.end !== c.start ? `${shortDate(c.start)} – ${shortDate(c.end)}` : niceDate(c.start);
  return `<div class="item"><div class="itemmain">
    <span class="caltag ${c.type}">${c.type === 'off' ? 'Off' : 'Early'}</span>
    <div class="grow"><div class="itemname">${esc(c.label || (c.type === 'off' ? 'No school' : 'Early dismissal'))}</div>
    <div class="itemmeta">${range}${c.type === 'early' && c.time ? ' · pickup ' + niceTime(c.time) : ''}</div></div>
    <button class="textbtn" data-act="editCal" data-id="${c.id}">Edit</button></div></div>`;
}

function viewRoutes() {
  const cal = [...(state.calendar || [])].sort((a, b) => a.start.localeCompare(b.start));
  const today = isoDate(new Date());
  const future = cal.filter((c) => (c.end || c.start) >= today);
  const past = cal.length - future.length;
  return `<section class="pagehead"><div><div class="eyebrow">Runs &amp; alarms</div><div class="display">Routes</div></div><button class="primary" data-act="addRoute">${ic('plus')}Add</button></section>
  ${state.routes.length ? `<div class="alarmbox">
    <div><b>Alarms on your iPhone</b><span>One tap adds every drop-off and pickup to your Calendar with an alert before each one. Days off are skipped and early pickups use the earlier time. Tap again after you change a schedule.</span></div>
    <button class="primary" data-act="icsAll">${ic('bell')}Set all alarms</button>
  </div>` : ''}
  ${state.routes.length ? '' : '<div class="panel empty"><p>No routes yet. Add a morning drop-off and an afternoon pickup.</p></div>'}
  ${state.routes.map((rt) => {
    const [t, ap] = timeParts(rt.time);
    const extra = Object.entries(rt.dayTimes || {}).filter(([d, v]) => v && rt.days.includes(+d));
    return `<article class="run">
    <div class="runhead">
      <div class="clock"><b>${esc(t)}</b><span>${esc(ap)}</span></div>
      <div class="grow"><div class="kind ${rt.kind || 'dropoff'}">${KIND_LABEL[rt.kind || 'dropoff']}</div><div class="runname">${esc(rt.name)}</div>
      <div class="daystrip">${DAYS.map((d, i) => `<span class="${rt.days.includes(i) ? 'on' : ''}${rt.dayTimes && rt.dayTimes[i] && rt.days.includes(i) ? ' alt' : ''}">${d[0]}</span>`).join('')}</div>
      ${extra.length ? `<div class="runmeta">${extra.map(([d, v]) => `${DAYS[d]} at ${niceTime(v)}`).join(' · ')}</div>` : ''}</div>
    </div>
    ${stopsHtml(rt, false)}
    <div class="runnote">${ic('bell')}Alert ${rt.remindMin ?? state.settings.remindMin} min before</div>
    <div class="actions">
      <a class="btn" target="_blank" rel="noopener" href="${esc(routeMapsLink(rt))}">${ic('nav')}Open route</a>
      <button class="ghost" data-act="ics" data-id="${rt.id}">${ic('bell')}Alarm for this route</button>
      <button class="ghost" data-act="editRoute" data-id="${rt.id}">Edit</button>
    </div></article>`;
  }).join('')}
  <section class="pagehead" style="margin-top:34px"><div><div class="eyebrow">Days off &amp; early pickups</div><div class="display sm">School calendar</div></div></section>
  <div class="actions" style="margin:0 0 14px">
    <button data-act="addCal" data-type="off">${ic('plus')}Day off / break</button>
    <button data-act="addCal" data-type="early">${ic('plus')}Early dismissal</button>
  </div>
  ${future.length ? `<div class="panel list">${future.map(calRow).join('')}</div>` : '<div class="panel empty"><p>Add holidays, vacations and early-dismissal days from the school calendar. Those days show as “No carpool” and alarms skip them.</p></div>'}
  ${past ? `<div class="itemmeta" style="margin-top:8px">${past} past date${past === 1 ? '' : 's'} hidden.</div>` : ''}`;
}

function viewBilling() {
  const s = state.settings;
  const invs = state.invoices
    .filter((i) => billingFilter === 'all' || (billingFilter === 'open' ? i.status !== 'paid' : i.status === 'paid'))
    .sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number);
  const owed = state.invoices.filter((i) => i.status !== 'paid').reduce((a, i) => a + i.total, 0);
  const paidMonth = state.invoices.filter((i) => i.status === 'paid' && (i.paidDate || '').slice(0, 7) === isoDate(new Date()).slice(0, 7)).reduce((a, i) => a + i.total, 0);
  return `
  <section class="pagehead"><div><div class="eyebrow">Outstanding</div><div class="display big">${money(owed)}</div></div></section>
  ${ledger([['Collected', money(paidMonth)], ['Next bill', shortDate(nextBillDate())], ['Cycle', s.cycle === 'week' ? 'Weekly' : 'Monthly']])}
  ${!s.zelle ? `<div class="notice">Add your Zelle email or phone in <button class="textbtn" data-act="goto" data-tab="settings">Settings</button> so it prints on every invoice.</div>` : ''}
  <div class="actions" style="margin:0 0 22px">
    <button class="primary" data-act="billAll">${ic('receipt')}Bill all riders</button>
    <button class="ghost" data-act="newInvoice">${ic('plus')}Single invoice</button>
  </div>
  <div class="seg" role="tablist">
    ${['open', 'paid', 'all'].map((f) => `<button data-act="filter" data-f="${f}" class="${billingFilter === f ? 'on' : ''}">${{ open: 'Unpaid', paid: 'Paid', all: 'All' }[f]}</button>`).join('')}
  </div>
  ${invs.length ? '' : '<div class="panel empty"><p>Nothing here.</p></div>'}
  ${invs.map((inv) => {
    const r = rider(inv.riderId) || { name: '(deleted rider)' };
    const st = invoiceStatus(inv);
    return `<article class="ticket ${st}">
      <div class="stub">
        <span class="stublabel">No.</span><b>${inv.number}</b>
        <span class="stublabel">Due</span><b class="small">${shortDate(inv.due)}</b>
      </div>
      <div class="tbody">
        <div class="row between">
          <div class="grow"><div class="itemname">${esc(r.name)}</div>
          <div class="itemmeta">${esc(inv.items.map((i) => i.desc).join(', '))}</div></div>
          <div class="amt lg">${money(inv.total)}</div>
        </div>
        <div class="stamp ${st}">${st === 'paid' ? `Paid · ${esc(inv.method)} · ${shortDate(inv.paidDate)}` : st}</div>
        <div class="actions">
          ${inv.status !== 'paid' ? `
            ${r.phone ? `<a class="btn primary" href="${esc(smsLink(r.phone, invoiceText(inv)))}">${ic('msg')}Text invoice</a>` : ''}
            ${r.email ? `<a class="btn" href="mailto:${esc(r.email)}?subject=${encodeURIComponent(`${s.poolName} invoice #${inv.number}`)}&body=${encodeURIComponent(invoiceText(inv))}">${ic('mail')}Email</a>` : ''}
            <button data-act="markPaid" data-id="${inv.id}">${ic('check')}Mark paid</button>` :
            `<button class="ghost" data-act="markUnpaid" data-id="${inv.id}">Undo paid</button>`}
          <span class="links"><button class="textbtn" data-act="copyInvoice" data-id="${inv.id}">Copy</button><button class="textbtn danger" data-act="delInvoice" data-id="${inv.id}">Delete</button></span>
        </div>
        ${!r.phone && inv.status !== 'paid' ? '<div class="itemmeta">Add a phone number to this rider to text the invoice.</div>' : ''}
      </div>
    </article>`;
  }).join('')}`;
}

function viewSettings() {
  const s = state.settings;
  const notif = 'Notification' in window ? Notification.permission : 'unsupported';
  return `<section class="pagehead"><div><div class="eyebrow">Your carpool</div><div class="display">Settings</div></div></section>
  <div class="panel pad">
    <label>Carpool name</label><input data-set="poolName" value="${esc(s.poolName)}">
    <div class="grid2">
      <div><label>Your name</label><input data-set="ownerName" value="${esc(s.ownerName)}"></div>
      <div><label>Your phone</label><input data-set="ownerPhone" type="tel" value="${esc(s.ownerPhone)}"></div>
    </div>
    <label>Starting address (for routes)</label><input data-set="homeAddress" value="${esc(s.homeAddress)}" placeholder="Where you start driving from">
  </div>
  <h2>Getting paid</h2>
  <div class="panel pad">
    <div class="grid2">
      <div><label>Zelle email or phone</label><input data-set="zelle" value="${esc(s.zelle)}"></div>
      <div><label>Name on Zelle</label><input data-set="zelleName" value="${esc(s.zelleName)}"></div>
    </div>
    <label>Venmo username (optional)</label><input data-set="venmo" value="${esc(s.venmo)}" placeholder="@username">
    <div class="grid2">
      <div><label>Bill every</label><select data-set="cycle"><option value="month" ${s.cycle === 'month' ? 'selected' : ''}>Month</option><option value="week" ${s.cycle === 'week' ? 'selected' : ''}>Week</option></select></div>
      <div><label>${s.cycle === 'week' ? 'On' : 'On day of month'}</label>
        ${s.cycle === 'week'
          ? `<select data-set="cycleDay">${DAYS.map((d, i) => `<option value="${i}" ${+s.cycleDay === i ? 'selected' : ''}>${d}</option>`).join('')}</select>`
          : `<input data-set="cycleDay" type="number" min="1" max="28" value="${esc(s.cycleDay)}">`}</div>
    </div>
    <div class="grid2">
      <div><label>Days to pay</label><input data-set="dueDays" type="number" min="0" value="${esc(s.dueDays)}"></div>
      <div><label>Default alarm (min before)</label><input data-set="remindMin" type="number" min="0" value="${esc(s.remindMin)}"></div>
    </div>
  </div>
  <h2>Reminders &amp; alerts</h2>
  <div class="panel pad">
    <p class="muted">Your own alarms: on the Routes tab tap <b>Set all alarms</b>. They ring ${esc(s.remindMin)} minutes before each run (change it above or per route), even when this app is closed.</p>
    <label class="switch"><input type="checkbox" data-set="remindParents" ${s.remindParents ? 'checked' : ''}><span>Send parents a push alert ${esc(s.remindMin)} min before each carpool</span></label>
    <label class="switch"><input type="checkbox" data-set="remindMe" ${s.remindMe ? 'checked' : ''}><span>Also send those push alerts to my phone</span></label>
    ${s.remindMe ? `<div class="howto">
      <b>Set up push alerts on your iPhone (one time)</b>
      <ol><li>Install the free <a href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noopener">ntfy</a> app and allow notifications.</li>
      <li>Tap <b>+</b>, then paste this topic name: <code>${esc(myTopic())}</code> <button class="textbtn" data-act="copyText" data-text="${esc(myTopic())}">Copy</button></li>
      <li>Tap <b>Subscribe</b>, then come back and <button class="textbtn" data-act="testAlert">send a test alert</button>.</li></ol>
    </div>` : ''}
    <div class="actions"><button class="ghost" data-act="notify">${ic('bell')}Alerts while this app is open (${notif})</button></div>
  </div>
  <h2>Parent links &amp; live tracking</h2>
  <div class="panel pad">
    <p class="muted">Each family gets a private link (Riders tab → <b>Text parent link</b>). On it they see your live location and arrival time during a run, the carpool schedule, and can tell you when their child isn't riding. Locations are encrypted, so only people with a link can see them.</p>
    <p class="muted">During a run, keep this app open on screen (in a phone mount). iPhone stops sharing location from web apps that are in the background.</p>
    <div class="actions"><button class="danger ghost" data-act="resetLinks">Make new links (old links stop working)</button></div>
  </div>
  <h2>Devices &amp; sync</h2>
  <div class="panel pad">
    ${cloud.auth_state !== 'in' ? '<p class="muted">Online sync is not available right now — your data is saved on this device.</p>'
      : `<p><b id="syncState">${esc(syncLabel())}</b></p>
        <p class="muted">Signed in as ${esc(cloud.user.email)}. Everything you change shows up on every phone and computer signed in to this carpool (${ALLOWED_EMAILS.map(esc).join(' and ')}).</p>
        <div class="actions"><button class="ghost" data-act="signOut">Sign out of this device</button></div>`}
  </div>
  <h2>Backups</h2>
  <div class="panel pad">
    <p class="muted">Automatic: once a day the app saves a copy online (kept 30 days) and on this device (kept 7 days). If something gets deleted by mistake, restore it here.</p>
    <div class="actions">
      <button class="primary" data-act="restore">${ic('upload')}Restore a backup</button>
      <button data-act="export">${ic('download')}Download backup file</button>
      <label class="btn" >${ic('upload')}Import backup<input type="file" accept=".json" data-act="import" hidden></label>
      <button class="danger" data-act="reset">Erase all data</button>
    </div>
  </div>
  <h2>Install on iPhone</h2>
  <div class="panel pad muted">Open this page in <b>Safari</b> → tap the <b>Share</b> button → <b>Add to Home Screen</b>. It will open full-screen like a regular app.</div>`;
}

// ---------- forms ----------
function openModal(html, onSubmit) {
  const dlg = $('#modal'), form = $('#modalForm');
  form.innerHTML = html;
  form.onsubmit = (e) => {
    const btn = e.submitter?.value;
    if (btn === 'cancel') return;
    if (btn === 'delete') { onSubmit(null, 'delete'); dlg.close(); render(); return; }
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    data._days = [...form.querySelectorAll('input[name=day]:checked')].map((x) => +x.value);
    if (onSubmit(data) !== false) { dlg.close(); save(); render(); }
  };
  dlg.showModal();
}
const modalButtons = (canDelete) => `<div class="actions" style="justify-content:flex-end;margin-top:16px">
  ${canDelete ? '<button class="danger" value="delete" formnovalidate style="margin-right:auto">Delete</button>' : ''}
  <button value="cancel" formnovalidate>Cancel</button><button class="primary" value="save">Save</button></div>`;

function riderForm(r) {
  const isNew = !r;
  r = r || { rateType: 'month', rate: '' };
  openModal(`<h3>${isNew ? 'Add rider' : 'Edit rider'}</h3>
    <label>Rider name *</label><input name="name" required value="${esc(r.name)}">
    <div class="grid2">
      <div><label>Parent / payer</label><input name="parent" value="${esc(r.parent)}"></div>
      <div><label>Phone (for texts)</label><input name="phone" type="tel" value="${esc(r.phone)}"></div>
    </div>
    <label>Email</label><input name="email" type="email" value="${esc(r.email)}">
    <label>Pickup address</label><input name="address" value="${esc(r.address)}">
    <div class="grid2">
      <div><label>Rate ($)</label><input name="rate" type="number" step="0.01" min="0" value="${esc(r.rate)}"></div>
      <div><label>Charged</label><select name="rateType">${Object.entries(RATE_LABEL).map(([k, v]) => `<option value="${k}" ${r.rateType === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    </div>
    <label>Notes</label><textarea name="notes">${esc(r.notes)}</textarea>
    ${modalButtons(!isNew)}`, (d, action) => {
    if (action === 'delete') {
      if (!confirm(`Delete ${r.name}? Their bills stay in history.`)) return;
      state.riders = state.riders.filter((x) => x.id !== r.id);
      state.routes.forEach((rt) => (rt.riderIds = rt.riderIds.filter((id) => id !== r.id)));
      save(); return;
    }
    const obj = { name: d.name.trim(), parent: d.parent.trim(), phone: d.phone.trim(), email: d.email.trim(), address: d.address.trim(), rate: +d.rate || 0, rateType: d.rateType, notes: d.notes };
    if (isNew) state.riders.push({ id: uid(), ...obj }); else Object.assign(r, obj);
    toast('Saved');
    setTimeout(ensureCoords, 300); scheduleSync();
  });
}

function routeForm(rt) {
  const isNew = !rt;
  rt = rt || { kind: 'dropoff', days: [0, 1, 2, 3, 4], time: '07:30', dayTimes: {}, riderIds: [], remindMin: state.settings.remindMin };
  const dayTimes = rt.dayTimes || {};
  const order = [...rt.riderIds, ...state.riders.map((r) => r.id).filter((id) => !rt.riderIds.includes(id))];
  openModal(`<h3>${isNew ? 'Add route' : 'Edit route'}</h3>
    <label>Type</label>
    <div class="seg full">${['dropoff', 'pickup'].map((k) => `<label class="${(rt.kind || 'dropoff') === k ? 'on' : ''}"><input type="radio" name="kind" value="${k}" ${(rt.kind || 'dropoff') === k ? 'checked' : ''} onchange="this.closest('.seg').querySelectorAll('label').forEach(l=>l.classList.toggle('on', l.contains(this)))">${k === 'dropoff' ? 'Drop-off (morning)' : 'Pickup (afternoon)'}</label>`).join('')}</div>
    <label>Route name *</label><input name="name" required value="${esc(rt.name)}" placeholder="e.g. School — morning">
    <label>Days</label><div class="days">${DAYS.map((d, i) => `<label><input type="checkbox" name="day" value="${i}" ${rt.days.includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</div>
    <div class="grid2">
      <div><label>Usual time</label><input name="time" type="time" value="${esc(rt.time)}"></div>
      <div><label>Alert (min before)</label><input name="remindMin" type="number" min="0" value="${esc(rt.remindMin)}"></div>
    </div>
    <details class="daytimes" ${Object.values(dayTimes).some(Boolean) ? 'open' : ''}>
      <summary>Different time on some days (e.g. early Friday)</summary>
      <div class="dtgrid">${DAYS.map((d, i) => `<label>${d}<input name="dt_${i}" type="time" value="${esc(dayTimes[i] || '')}"></label>`).join('')}</div>
      <div class="itemmeta">Leave blank to use the usual time.</div>
    </details>
    <label>School / destination</label><input name="destination" value="${esc(rt.destination)}">
    <label>Riders in pickup order (number = stop #, blank = not on this route)</label>
    ${order.map(rider).filter(Boolean).map((r) => {
      const i = rt.riderIds.indexOf(r.id);
      return `<div class="stop"><input name="ord_${r.id}" type="number" min="1" style="width:64px" value="${i >= 0 ? i + 1 : ''}"><span>${esc(r.name)}</span></div>`;
    }).join('') || '<div class="muted small">Add riders first.</div>'}
    ${modalButtons(!isNew)}`, (d, action) => {
    if (action === 'delete') { if (confirm('Delete this route?')) { state.routes = state.routes.filter((x) => x.id !== rt.id); save(); } return; }
    if (!d._days.length) { alert('Pick at least one day'); return false; }
    const riderIds = Object.entries(d).filter(([k, v]) => k.startsWith('ord_') && v).sort((a, b) => a[1] - b[1]).map(([k]) => k.slice(4));
    const dts = {};
    DAYS.forEach((_, i) => { if (d['dt_' + i] && d['dt_' + i] !== d.time) dts[i] = d['dt_' + i]; });
    const obj = { kind: d.kind || 'dropoff', name: d.name.trim(), days: d._days, time: d.time, dayTimes: dts, remindMin: +d.remindMin, destination: d.destination.trim(), riderIds };
    if (isNew) state.routes.push({ id: uid(), ...obj }); else Object.assign(rt, obj);
    toast('Route saved — tap “Set all alarms” to update your iPhone');
    setTimeout(ensureCoords, 300); scheduleSync();
  });
}

function calForm(c, type) {
  const isNew = !c;
  c = c || { type, start: isoDate(new Date()), end: '', label: '', time: '12:00' };
  openModal(`<h3>${c.type === 'off' ? 'Day off / break' : 'Early dismissal'}</h3>
    <label>What is it?</label><input name="label" value="${esc(c.label)}" placeholder="${c.type === 'off' ? 'e.g. Sukkot break, Thanksgiving' : 'e.g. Rosh Chodesh, half day'}">
    <div class="grid2">
      <div><label>${c.type === 'off' ? 'First day' : 'Date'}</label><input name="start" type="date" required value="${esc(c.start)}"></div>
      ${c.type === 'off'
        ? `<div><label>Last day (if more than one)</label><input name="end" type="date" value="${esc(c.end && c.end !== c.start ? c.end : '')}"></div>`
        : `<div><label>Pickup time that day</label><input name="time" type="time" required value="${esc(c.time)}"></div>`}
    </div>
    ${modalButtons(!isNew)}`, (d, action) => {
    if (action === 'delete') { state.calendar = state.calendar.filter((x) => x.id !== c.id); save(); return; }
    const end = d.end && d.end > d.start ? d.end : d.start;
    const obj = { type: c.type, label: d.label.trim(), start: d.start, end, time: d.time || '' };
    state.calendar = state.calendar || [];
    if (isNew) state.calendar.push({ id: uid(), ...obj }); else Object.assign(c, obj);
    toast('Saved — tap “Set all alarms” to update your iPhone');
    scheduleSync();
  });
}

function createInvoice(r, amount, desc, rides) {
  const s = state.settings;
  const today = isoDate(new Date());
  const inv = {
    id: uid(), number: s.nextInvoiceNo++, riderId: r.id, date: today, due: addDays(today, +s.dueDays || 0),
    items: [{ desc, amount: +amount }], total: +amount, status: 'unpaid', rideIds: rides.map((x) => x.id),
  };
  rides.forEach((x) => (x.invoiceId = inv.id));
  state.invoices.push(inv);
  return inv;
}

function invoiceForm() {
  if (!state.riders.length) return toast('Add a rider first');
  const first = state.riders[0];
  const sug = suggestedCharge(first);
  openModal(`<h3>New invoice</h3>
    <label>Rider</label><select name="riderId" id="invRider">${state.riders.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select>
    <label>Description</label><input name="desc" id="invDesc" value="${esc(sug.desc)}">
    <label>Amount ($)</label><input name="amount" id="invAmt" type="number" step="0.01" min="0" required value="${sug.amount.toFixed(2)}">
    ${modalButtons(false)}`, (d) => {
    const r = rider(d.riderId);
    const sg = suggestedCharge(r);
    createInvoice(r, d.amount, d.desc, sg.rides);
    billingFilter = 'open';
    toast('Bill created — tap "Text bill" to send');
  });
  $('#invRider').onchange = (e) => { const g = suggestedCharge(rider(e.target.value)); $('#invDesc').value = g.desc; $('#invAmt').value = g.amount.toFixed(2); };
}

function paidForm(inv) {
  openModal(`<h3>Mark #${inv.number} paid</h3>
    <label>How did they pay?</label><select name="method">${['Zelle', 'Cash', 'Venmo', 'Check', 'Other'].map((m) => `<option>${m}</option>`).join('')}</select>
    <label>Date received</label><input name="paidDate" type="date" value="${isoDate(new Date())}">
    ${modalButtons(false)}`, (d) => {
    Object.assign(inv, { status: 'paid', method: d.method, paidDate: d.paidDate });
    toast(`Marked paid via ${d.method}`);
  });
}

// ---------- actions ----------
const actions = {
  filter: (el) => { billingFilter = el.dataset.f; render(); },
  goto: (el) => { tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
  addRider: () => riderForm(),
  editRider: (el) => riderForm(rider(el.dataset.id)),
  addRoute: () => routeForm(),
  editRoute: (el) => routeForm(route(el.dataset.id)),
  ics: (el) => { const rt = route(el.dataset.id); download(`${rt.name.replace(/\W+/g, '-')}.ics`, buildIcs([rt]), 'text/calendar'); toast('Open the file, then tap Add All'); },
  icsAll: () => { download('carpool-alarms.ics', buildIcs(state.routes), 'text/calendar'); toast('Open the file, then tap Add All'); },
  addCal: (el) => calForm(null, el.dataset.type),
  editCal: (el) => calForm(state.calendar.find((c) => c.id === el.dataset.id)),
  pickDay: (el) => { todayDate = el.dataset.d; render(); },
  shiftWeek: (el) => { todayDate = addDays(todayDate, +el.dataset.n); render(); },
  markAll: (el) => {
    const rt = route(el.dataset.route);
    rt.riderIds.filter((rid) => rider(rid) && !absenceFor(rid, todayDate)).forEach((rid) => {
      const was = state.rides.some((x) => x.date === todayDate && x.routeId === rt.id && x.riderId === rid);
      setRide(rt.id, rid, true);
      if (!was) liveRideChanged(rt.id, rid, true);
    });
    save(); render(); toast(rt.kind === 'pickup' ? 'All dropped off' : 'All picked up');
  },
  ...authActions,
  restore: async () => {
    const list = await listBackups();
    if (!list.length) return toast('No backups yet — the first one is made today');
    openModal(`<h3>Restore a backup</h3>
      <p class="muted">Pick a day. Everything goes back to how it was at the start of that day (riders, routes, bills, settings). Your current data is kept as “Before last restore” in case you change your mind.</p>
      <label>Backup</label><select name="pick">${list.map((b, i) => `<option value="${i}">${esc(/^\d{4}-/.test(b.id) ? niceDate(b.id) : b.id)} · ${esc(b.where)}${b.by ? ' · ' + esc(b.by) : ''}</option>`).join('')}</select>
      <div class="actions" style="justify-content:flex-end;margin-top:16px"><button value="cancel" formnovalidate>Cancel</button><button class="primary danger-fill" value="save">Restore</button></div>`, (d) => {
      const b = list[+d.pick];
      let data;
      try { data = b.load(); } catch { toast('That backup could not be read'); return false; }
      if (!confirm(`Replace everything with the backup from ${/^\d{4}-/.test(b.id) ? niceDate(b.id) : b.id}?`)) return false;
      restoreBackup(data);
      toast('Backup restored');
    });
  },
  goLive: (el) => startLive(el.dataset.route),
  stopLive: () => { if (confirm('End this run? Parents will see that the run is finished.')) stopLive(); },
  toggleMap: () => { state.settings.liveMapHidden = !state.settings.liveMapHidden; save(); const m = $('#livemap'); if (m) m.hidden = state.settings.liveMapHidden; if (!m.hidden) updateLiveMap(); },
  sendLink: (el) => {
    const r = rider(el.dataset.id);
    const body = `Hi${r.parent ? ' ' + firstName(r.parent) : ''}! Here is your private ${state.settings.poolName} page for ${firstName(r.name)}: live map and arrival time, carpool schedule, alerts, and a button to tell me when ${firstName(r.name)} isn't riding.\n${trackLink(r)}`;
    location.href = smsLink(r.phone, body);
    scheduleSync();
  },
  copyLink: async (el) => {
    const link = trackLink(rider(el.dataset.id));
    try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch { prompt('Copy this link:', link); }
    scheduleSync();
  },
  copyText: async (el) => { try { await navigator.clipboard.writeText(el.dataset.text); toast('Copied'); } catch { prompt('Copy:', el.dataset.text); } },
  resetLinks: () => {
    if (!confirm('Make new private links? Every link you already sent to parents will stop working, and their alert subscriptions must be set up again.')) return;
    state.settings.live = null; liveCfg(); scheduleSync(); render(); toast('New links created — send them to parents again');
  },
  testAlert: () => { relayPublish(myTopic(), 'Test alert from your carpool app — it works!', { title: state.settings.poolName, tags: ['white_check_mark'] }).then(() => toast('Test alert sent')).catch(() => toast('Could not reach the alert service')); },
  newInvoice: () => invoiceForm(),
  billAll: () => {
    const made = [];
    for (const r of state.riders) {
      const sg = suggestedCharge(r);
      if (sg.amount > 0) made.push(createInvoice(r, sg.amount, sg.desc, sg.rides));
    }
    save(); billingFilter = 'open'; render();
    toast(made.length ? `Created ${made.length} bill${made.length === 1 ? '' : 's'}` : 'Nothing to bill yet');
  },
  markPaid: (el) => paidForm(state.invoices.find((i) => i.id === el.dataset.id)),
  markUnpaid: (el) => { const inv = state.invoices.find((i) => i.id === el.dataset.id); Object.assign(inv, { status: 'unpaid', paidDate: null, method: null }); save(); render(); },
  copyInvoice: async (el) => {
    const inv = state.invoices.find((i) => i.id === el.dataset.id);
    try { await navigator.clipboard.writeText(invoiceText(inv)); toast('Bill copied'); } catch { prompt('Copy this bill:', invoiceText(inv)); }
  },
  delInvoice: (el) => {
    if (!confirm('Delete this bill? Rides on it become unbilled again.')) return;
    const id = el.dataset.id;
    state.rides.forEach((x) => { if (x.invoiceId === id) x.invoiceId = null; });
    state.invoices = state.invoices.filter((i) => i.id !== id);
    save(); render();
  },
  notify: async () => {
    if (!('Notification' in window)) return toast('On iPhone, add to Home Screen first to enable notifications');
    const p = await Notification.requestPermission(); toast('Notifications: ' + p); render();
  },
  export: () => download(`ruths-carpool-backup-${isoDate(new Date())}.json`, JSON.stringify(state, null, 2), 'application/json'),
  reset: () => { if (confirm('Erase ALL riders, routes and bills on this device?') && confirm('Are you sure? This cannot be undone.')) { state = structuredClone(DEFAULT_STATE); save(); render(); } },
  loadDemo: () => { loadDemo(); save(); render(); toast('Sample data loaded — edit or erase anytime in Settings'); },
};

function setRide(routeId, riderId, on) {
  const existing = state.rides.find((x) => x.date === todayDate && x.routeId === routeId && x.riderId === riderId);
  if (on && !existing) {
    const r = rider(riderId);
    state.rides.push({ id: uid(), date: todayDate, routeId, riderId, amount: r.rateType === 'ride' ? +r.rate : 0, invoiceId: null });
  } else if (!on && existing) {
    if (existing.invoiceId) { toast('Already billed — delete the bill first'); return false; }
    state.rides = state.rides.filter((x) => x !== existing);
  }
}

document.addEventListener('click', (e) => {
  const tabBtn = e.target.closest('#tabs button');
  if (tabBtn) { tab = tabBtn.dataset.tab; render(); window.scrollTo(0, 0); return; }
  const el = e.target.closest('[data-act]');
  if (el && el.tagName === 'BUTTON' && actions[el.dataset.act]) { e.preventDefault(); actions[el.dataset.act](el); }
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.set && el.type === 'checkbox') {
    state.settings[el.dataset.set] = el.checked; save(); scheduleSync(); toast('Saved'); return;
  }
  if (el.dataset.set) {
    const num = ['cycleDay', 'dueDays', 'remindMin'].includes(el.dataset.set);
    state.settings[el.dataset.set] = num ? +el.value : el.value.trim();
    if (el.dataset.set === 'cycle') state.settings.cycleDay = el.value === 'week' ? 5 : 1;
    save(); render(); toast('Saved'); return;
  }
  switch (el.dataset.act) {
    case 'setDate': todayDate = el.value || isoDate(new Date()); render(); break;
        case 'toggleRide':
      if (setRide(el.dataset.route, el.dataset.rider, el.checked) === false) el.checked = true;
      else liveRideChanged(el.dataset.route, el.dataset.rider, el.checked);
      save(); break;
    case 'import': {
      const f = el.files[0]; if (!f) return;
      f.text().then((t) => {
        const s = JSON.parse(t);
        if (!s.riders || !s.settings) throw new Error('bad file');
        if (!confirm('Replace everything on this device with this backup?')) return;
        state = { ...structuredClone(DEFAULT_STATE), ...s }; save(); render(); toast('Backup restored');
      }).catch(() => toast('That file is not a valid backup'));
    }
  }
});

function loadDemo() {
  const a = { id: uid(), name: 'Avi Cohen', parent: 'Sarah Cohen', phone: '555-201-1111', email: '', address: '12 Maple Ave, Lakewood, NJ', rate: 150, rateType: 'month', notes: '' };
  const b = { id: uid(), name: 'Leah Gold', parent: 'Dina Gold', phone: '555-201-2222', email: '', address: '40 Oak St, Lakewood, NJ', rate: 120, rateType: 'month', notes: 'Booster seat' };
  const c = { id: uid(), name: 'Moshe Klein', parent: 'Rivka Klein', phone: '555-201-3333', email: '', address: '7 Pine Ct, Lakewood, NJ', rate: 150, rateType: 'month', notes: '' };
  state.riders.push(a, b, c);
  state.routes.push(
    { id: uid(), kind: 'dropoff', name: 'School — morning', days: [0, 1, 2, 3, 4, 5], time: '07:30', dayTimes: {}, remindMin: 30, destination: 'Main Street School, Lakewood, NJ', riderIds: [a.id, b.id, c.id] },
    { id: uid(), kind: 'pickup', name: 'School — afternoon', days: [0, 1, 2, 3, 4, 5], time: '15:45', dayTimes: { 5: '12:30' }, remindMin: 30, destination: 'Main Street School, Lakewood, NJ', riderIds: [c.id, b.id, a.id] },
  );
  const t = isoDate(new Date());
  state.calendar = [
    { id: uid(), type: 'early', label: 'Half day', start: addDays(t, 2), end: addDays(t, 2), time: '12:00' },
    { id: uid(), type: 'off', label: 'Winter break', start: addDays(t, 9), end: addDays(t, 13), time: '' },
  ];
}

// ---------- boot ----------
document.querySelectorAll('[data-ic]').forEach((el) => (el.innerHTML = ic(el.dataset.ic)));
render();
localBackup();
cloudStart();
setInterval(checkReminders, 30000); checkReminders();
ensureCoords();
pollInbox(); setInterval(pollInbox, 120000);
if (liveOn() && Date.now() - (state.lastSchedPub || 0) > 6 * 3600000) scheduleSync();
else if (liveOn()) scheduleReminders();
// Resume a run that was live when the app was closed or reloaded (within 3 hours).
if (state.liveRun && state.liveRun.date === isoDate(new Date()) && Date.now() - state.liveRun.started < 3 * 3600000 && route(state.liveRun.routeId)) startLive(state.liveRun.routeId, true);
else if (state.liveRun) { state.liveRun = null; save(); }
setInterval(() => { if (live) renderLive(); }, 5000);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

/* Ruth's Car Pool — single-file PWA. Data is stored on this device (localStorage);
   use Settings → Backup to move it between devices. */
'use strict';

const STORE_KEY = 'ruthsCarPool.v1';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ICS_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
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
    remindMin: 15,
    nextInvoiceNo: 1001,
  },
  riders: [],
  routes: [],
  rides: [],
  invoices: [],
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
      return { ...structuredClone(DEFAULT_STATE), ...s, settings: { ...DEFAULT_STATE.settings, ...s.settings } };
    }
  } catch (e) { console.warn('load failed', e); }
  return structuredClone(DEFAULT_STATE);
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Could not save on this device'); }
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

// ---------- calendar alarms (.ics) ----------
function routeIcs(rt) {
  const s = state.settings;
  const [h, m] = (rt.time || '07:30').split(':');
  const start = new Date(); // next matching weekday
  for (let i = 0; i < 7 && !rt.days.includes(start.getDay()); i++) start.setDate(start.getDate() + 1);
  const ymd = isoDate(start).replace(/-/g, '');
  const stops = rt.riderIds.map(rider).filter(Boolean).map((r) => `${r.name} — ${r.address || 'no address'}`).join('\\n');
  const mins = Number(rt.remindMin ?? s.remindMin) || 15;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ruths Car Pool//EN', 'BEGIN:VEVENT',
    `UID:${rt.id}@ruthscarpool`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART:${ymd}T${h}${m}00`, 'DURATION:PT45M',
    `RRULE:FREQ=WEEKLY;BYDAY=${rt.days.map((d) => ICS_DAYS[d]).join(',')}`,
    `SUMMARY:${s.poolName}: ${rt.name}`,
    `DESCRIPTION:Pickups:\\n${stops}`,
    `LOCATION:${(rt.destination || '').replace(/,/g, '\\,')}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${rt.name} in ${mins} min`, `TRIGGER:-PT${mins}M`, 'END:VALARM',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${rt.name} now`, 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// In-app reminders while the app is open (iPhone home-screen apps can show these after permission).
const fired = new Set();
function checkReminders() {
  const now = new Date();
  const today = isoDate(now);
  for (const rt of state.routes) {
    if (!rt.days.includes(now.getDay()) || !rt.time) continue;
    const [h, m] = rt.time.split(':').map(Number);
    const at = new Date(now); at.setHours(h, m, 0, 0);
    const mins = Number(rt.remindMin ?? state.settings.remindMin) || 15;
    const diff = (at - now) / 60000;
    const key = `${rt.id}-${today}`;
    if (diff <= mins && diff > -5 && !fired.has(key)) {
      fired.add(key);
      const msg = `${rt.name} at ${niceTime(rt.time)} — ${Math.max(0, Math.round(diff))} min`;
      toast(msg);
      if ('Notification' in window && Notification.permission === 'granted') {
        navigator.serviceWorker?.ready.then((reg) => reg.showNotification(state.settings.poolName, { body: msg, icon: 'icon-180.png' }))
          .catch(() => new Notification(state.settings.poolName, { body: msg }));
      }
    }
  }
}

// ---------- views ----------
function render() {
  document.title = state.settings.poolName;
  $('#poolName').textContent = state.settings.poolName;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  const v = $('#view');
  v.innerHTML = ({ today: viewToday, riders: viewRiders, routes: viewRoutes, billing: viewBilling, settings: viewSettings })[tab]();
}

function viewToday() {
  const dow = parseDate(todayDate).getDay();
  const routesToday = state.routes.filter((r) => r.days.includes(dow)).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const owed = state.invoices.filter((i) => i.status !== 'paid').reduce((a, i) => a + i.total, 0);
  const overdue = state.invoices.filter((i) => invoiceStatus(i) === 'overdue').length;
  let html = `
    <div class="stats">
      <div class="stat"><b class="money">${money(owed)}</b><span>Owed to you</span></div>
      <div class="stat"><b>${overdue}</b><span>Overdue bills</span></div>
      <div class="stat"><b>${niceDate(nextBillDate()).replace(/^\w+, /, '')}</b><span>Next bill date</span></div>
    </div>
    <h2>
      <span>Schedule</span>
      <input type="date" value="${todayDate}" data-act="setDate" style="width:auto">
    </h2>`;
  if (!state.riders.length) {
    html += `<div class="card empty">Welcome! Start by adding the people in your carpool.<div class="actions" style="justify-content:center"><button class="primary" data-act="addRider">${ic('plus')}Add a rider</button><button data-act="loadDemo">Try with sample data</button></div></div>`;
  } else if (!routesToday.length) {
    html += `<div class="card empty">No routes on ${DAYS[dow]}. <button class="link" data-act="goto" data-tab="routes">Set up routes →</button></div>`;
  }
  for (const rt of routesToday) {
    const riders = rt.riderIds.map(rider).filter(Boolean);
    html += `<div class="card">
      <div class="row between"><div><div class="title">${esc(rt.name)}</div><div class="muted">${niceTime(rt.time)}${rt.destination ? ' → ' + esc(rt.destination) : ''}</div></div>
      <span class="pill info">${riders.length} rider${riders.length === 1 ? '' : 's'}</span></div>
      <div style="margin-top:8px">
      ${riders.map((r) => {
        const done = state.rides.some((x) => x.date === todayDate && x.routeId === rt.id && x.riderId === r.id);
        return `<label class="check"><input type="checkbox" data-act="toggleRide" data-route="${rt.id}" data-rider="${r.id}" ${done ? 'checked' : ''}>
          <span class="grow"><span class="title" style="color:var(--text)">${esc(r.name)}</span><br><span class="small">${esc(r.address || '')}</span></span></label>`;
      }).join('')}
      </div>
      <div class="actions">
        <a class="btn primary" target="_blank" rel="noopener" href="${esc(mapsLink(riders.map((r) => r.address), rt.destination))}">${ic('nav')}Navigate</a>
        <a class="btn" href="${esc(smsLink(riders.map((r) => r.phone), `Hi! ${state.settings.ownerName} here — on my way for ${rt.name} (${niceTime(rt.time)}).`))}">${ic('msg')}On my way</a>
        <button data-act="markAll" data-route="${rt.id}">${ic('check')}All present</button>
      </div>
    </div>`;
  }
  return html;
}

function viewRiders() {
  const list = [...state.riders].sort((a, b) => a.name.localeCompare(b.name));
  return `<h2><span>People in the carpool</span><button class="primary" data-act="addRider">${ic('plus')}Add</button></h2>
  ${list.length ? '' : '<div class="card empty">No riders yet.</div>'}
  ${list.map((r) => {
    const bal = riderBalance(r.id);
    return `<div class="card">
      <div class="row between"><div class="grow"><div class="title">${esc(r.name)}</div>
        <div class="muted">${r.parent ? 'Parent: ' + esc(r.parent) + ' · ' : ''}${money(r.rate)} ${RATE_LABEL[r.rateType]}</div>
        <div class="small muted">${esc(r.address || 'No address')}</div></div>
        <div style="text-align:right"><div class="money">${money(bal)}</div><div class="small muted">owes</div></div></div>
      <div class="actions">
        ${r.phone ? `<a class="btn" href="tel:${esc(digits(r.phone))}">${ic('phone')}Call</a><a class="btn" href="${esc(smsLink(r.phone, ''))}">${ic('msg')}Text</a>` : ''}
        ${r.address ? `<a class="btn" target="_blank" rel="noopener" href="${esc(mapsLink([r.address]))}">${ic('pin')}Map</a>` : ''}
        <button data-act="editRider" data-id="${r.id}">Edit</button>
      </div></div>`;
  }).join('')}`;
}

function viewRoutes() {
  return `<h2><span>Routes & alarms</span><button class="primary" data-act="addRoute">${ic('plus')}Add</button></h2>
  ${state.routes.length ? '' : '<div class="card empty">No routes yet. A route is a trip like "School morning" with its pickup order.</div>'}
  ${state.routes.map((rt) => `<div class="card">
    <div class="row between"><div><div class="title">${esc(rt.name)}</div>
    <div class="muted">${rt.days.map((d) => DAYS[d]).join(', ')} · ${niceTime(rt.time)} · Alert ${rt.remindMin ?? state.settings.remindMin} min before</div></div></div>
    <div style="margin-top:6px">${rt.riderIds.map(rider).filter(Boolean).map((r, i) => `<div class="stop"><span class="n">${i + 1}</span><span class="grow">${esc(r.name)} <span class="small muted">${esc(r.address || '')}</span></span></div>`).join('')}
    ${rt.destination ? `<div class="stop"><span class="n end">${ic('flag')}</span><span>${esc(rt.destination)}</span></div>` : ''}</div>
    <div class="actions">
      <a class="btn" target="_blank" rel="noopener" href="${esc(mapsLink(rt.riderIds.map(rider).filter(Boolean).map((r) => r.address), rt.destination))}">${ic('nav')}Open route</a>
      <button data-act="ics" data-id="${rt.id}">${ic('bell')}Add alarm to calendar</button>
      <button data-act="editRoute" data-id="${rt.id}">Edit</button>
    </div></div>`).join('')}`;
}

function viewBilling() {
  const s = state.settings;
  const invs = state.invoices
    .filter((i) => billingFilter === 'all' || (billingFilter === 'open' ? i.status !== 'paid' : i.status === 'paid'))
    .sort((a, b) => b.date.localeCompare(a.date));
  const owed = state.invoices.filter((i) => i.status !== 'paid').reduce((a, i) => a + i.total, 0);
  const paidMonth = state.invoices.filter((i) => i.status === 'paid' && (i.paidDate || '').slice(0, 7) === isoDate(new Date()).slice(0, 7)).reduce((a, i) => a + i.total, 0);
  return `
  <div class="stats">
    <div class="stat"><b class="money">${money(owed)}</b><span>Outstanding</span></div>
    <div class="stat"><b class="money">${money(paidMonth)}</b><span>Paid this month</span></div>
    <div class="stat"><b>${niceDate(nextBillDate()).replace(/^\w+, /, '')}</b><span>Next bill (${s.cycle === 'week' ? 'weekly' : 'monthly'})</span></div>
  </div>
  ${!s.zelle ? `<div class="card notice">Add your Zelle email or phone in <button class="link" data-act="goto" data-tab="settings">Settings</button> so it shows on invoices.</div>` : ''}
  <div class="actions" style="margin-bottom:12px">
    <button class="primary" data-act="billAll">${ic('receipt')}Bill all riders</button>
    <button data-act="newInvoice">${ic('plus')}Single invoice</button>
  </div>
  <h2><span>Bills</span>
    <select data-act="filter" style="width:auto">
      ${['open', 'paid', 'all'].map((f) => `<option value="${f}" ${billingFilter === f ? 'selected' : ''}>${{ open: 'Unpaid', paid: 'Paid', all: 'All' }[f]}</option>`).join('')}
    </select></h2>
  ${invs.length ? '' : '<div class="card empty">No bills here.</div>'}
  ${invs.map((inv) => {
    const r = rider(inv.riderId) || { name: '(deleted rider)' };
    const st = invoiceStatus(inv);
    return `<div class="card">
      <div class="row between"><div class="grow"><div class="title">${esc(r.name)} <span class="muted small">#${inv.number}</span></div>
      <div class="muted small">Sent ${niceDate(inv.date)} · Due ${niceDate(inv.due)}${inv.paidDate ? ` · Paid ${niceDate(inv.paidDate)} via ${esc(inv.method)}` : ''}</div></div>
      <div style="text-align:right"><div class="money">${money(inv.total)}</div><span class="pill ${st}">${st}</span></div></div>
      <div class="actions">
        ${inv.status !== 'paid' ? `
          ${r.phone ? `<a class="btn primary" href="${esc(smsLink(r.phone, invoiceText(inv)))}">${ic('msg')}Text invoice</a>` : '<span class="muted small">Add a phone number to text this bill</span>'}
          ${r.email ? `<a class="btn" href="mailto:${esc(r.email)}?subject=${encodeURIComponent(`${s.poolName} invoice #${inv.number}`)}&body=${encodeURIComponent(invoiceText(inv))}">${ic('mail')}Email</a>` : ''}
          <button data-act="markPaid" data-id="${inv.id}">${ic('check')}Mark paid</button>` :
          `<button data-act="markUnpaid" data-id="${inv.id}">Undo paid</button>`}
        <button data-act="copyInvoice" data-id="${inv.id}">Copy</button>
        <button class="danger" data-act="delInvoice" data-id="${inv.id}">Delete</button>
      </div></div>`;
  }).join('')}`;
}

function viewSettings() {
  const s = state.settings;
  const notif = 'Notification' in window ? Notification.permission : 'unsupported';
  return `<h2>Settings</h2>
  <div class="card">
    <label>Carpool name</label><input data-set="poolName" value="${esc(s.poolName)}">
    <div class="grid2">
      <div><label>Your name</label><input data-set="ownerName" value="${esc(s.ownerName)}"></div>
      <div><label>Your phone</label><input data-set="ownerPhone" type="tel" value="${esc(s.ownerPhone)}"></div>
    </div>
    <label>Starting address (for routes)</label><input data-set="homeAddress" value="${esc(s.homeAddress)}" placeholder="Where you start driving from">
  </div>
  <h2>Getting paid</h2>
  <div class="card">
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
  <h2>Reminders</h2>
  <div class="card">
    <div class="muted">Best on iPhone: on the Routes tab tap <b>"Add alarm to iPhone calendar"</b> — the alarm then rings even when this app is closed.</div>
    <div class="actions"><button data-act="notify">${ic('bell')}Enable notifications (${notif})</button></div>
  </div>
  <h2>Backup</h2>
  <div class="card">
    <div class="muted">Your data is saved on this device only. Export a backup to move it to another phone or computer.</div>
    <div class="actions">
      <button data-act="export">${ic('download')}Export backup</button>
      <label class="btn" style="margin:0;color:var(--text);font-size:15px">${ic('upload')}Import backup<input type="file" accept=".json" data-act="import" hidden></label>
      <button class="danger" data-act="reset">Erase all data</button>
    </div>
  </div>
  <h2>Install on iPhone</h2>
  <div class="card muted">Open this page in <b>Safari</b> → tap the <b>Share</b> button → <b>Add to Home Screen</b>. It will open full-screen like a regular app.</div>`;
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
  });
}

function routeForm(rt) {
  const isNew = !rt;
  rt = rt || { days: [1, 2, 3, 4, 5], time: '07:30', riderIds: [], remindMin: state.settings.remindMin };
  const order = [...rt.riderIds, ...state.riders.map((r) => r.id).filter((id) => !rt.riderIds.includes(id))];
  openModal(`<h3>${isNew ? 'Add route' : 'Edit route'}</h3>
    <label>Route name *</label><input name="name" required value="${esc(rt.name)}" placeholder="e.g. School – morning">
    <label>Days</label><div class="days">${DAYS.map((d, i) => `<label><input type="checkbox" name="day" value="${i}" ${rt.days.includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</div>
    <div class="grid2">
      <div><label>Pickup start time</label><input name="time" type="time" value="${esc(rt.time)}"></div>
      <div><label>Alarm (min before)</label><input name="remindMin" type="number" min="0" value="${esc(rt.remindMin)}"></div>
    </div>
    <label>Destination (school, office…)</label><input name="destination" value="${esc(rt.destination)}">
    <label>Riders in pickup order (number = stop #, blank = not on this route)</label>
    ${order.map(rider).filter(Boolean).map((r) => {
      const i = rt.riderIds.indexOf(r.id);
      return `<div class="stop"><input name="ord_${r.id}" type="number" min="1" style="width:64px" value="${i >= 0 ? i + 1 : ''}"><span>${esc(r.name)}</span></div>`;
    }).join('') || '<div class="muted small">Add riders first.</div>'}
    ${modalButtons(!isNew)}`, (d, action) => {
    if (action === 'delete') { if (confirm('Delete this route?')) { state.routes = state.routes.filter((x) => x.id !== rt.id); save(); } return; }
    if (!d._days.length) { alert('Pick at least one day'); return false; }
    const riderIds = Object.entries(d).filter(([k, v]) => k.startsWith('ord_') && v).sort((a, b) => a[1] - b[1]).map(([k]) => k.slice(4));
    const obj = { name: d.name.trim(), days: d._days, time: d.time, remindMin: +d.remindMin, destination: d.destination.trim(), riderIds };
    if (isNew) state.routes.push({ id: uid(), ...obj }); else Object.assign(rt, obj);
    toast('Route saved');
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
  goto: (el) => { tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
  addRider: () => riderForm(),
  editRider: (el) => riderForm(rider(el.dataset.id)),
  addRoute: () => routeForm(),
  editRoute: (el) => routeForm(route(el.dataset.id)),
  ics: (el) => { const rt = route(el.dataset.id); download(`${rt.name.replace(/\W+/g, '-')}.ics`, routeIcs(rt), 'text/calendar'); toast('Open the file and tap "Add All" to set the alarm'); },
  markAll: (el) => {
    const rt = route(el.dataset.route);
    rt.riderIds.forEach((rid) => setRide(rt.id, rid, true));
    save(); render(); toast('All riders checked in');
  },
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
  if (el.dataset.set) {
    const num = ['cycleDay', 'dueDays', 'remindMin'].includes(el.dataset.set);
    state.settings[el.dataset.set] = num ? +el.value : el.value.trim();
    if (el.dataset.set === 'cycle') state.settings.cycleDay = el.value === 'week' ? 5 : 1;
    save(); render(); toast('Saved'); return;
  }
  switch (el.dataset.act) {
    case 'setDate': todayDate = el.value || isoDate(new Date()); render(); break;
    case 'filter': billingFilter = el.value; render(); break;
    case 'toggleRide': if (setRide(el.dataset.route, el.dataset.rider, el.checked) === false) el.checked = true; save(); break;
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
    { id: uid(), name: 'School – morning', days: [0, 1, 2, 3, 4], time: '07:30', remindMin: 15, destination: 'Main Street School, Lakewood, NJ', riderIds: [a.id, b.id, c.id] },
    { id: uid(), name: 'School – pickup', days: [0, 1, 2, 3, 4], time: '15:45', remindMin: 20, destination: '', riderIds: [c.id, b.id, a.id] },
  );
}

// ---------- boot ----------
document.querySelectorAll('[data-ic]').forEach((el) => (el.innerHTML = ic(el.dataset.ic)));
render();
setInterval(checkReminders, 30000); checkReminders();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

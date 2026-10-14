/* Live tracking engine shared by the driver app (index.html) and the parent page (track.html).
   Messages go through the free ntfy.sh relay. Location data is end-to-end encrypted with
   AES-GCM; the key lives only in the parents' link fragment (#...), which browsers never send
   to any server. Push alerts to the optional ntfy phone app are short plain-text lines. */
'use strict';

const RELAY = 'https://ntfy.sh';
const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

const b64u = {
  enc: (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0)),
};
function randomId(bytes = 12) { return b64u.enc(crypto.getRandomValues(new Uint8Array(bytes))).replace(/[-_]/g, 'x'); }

const keyCache = new Map();
async function cryptoKey(k) {
  if (!keyCache.has(k)) keyCache.set(k, await crypto.subtle.importKey('raw', b64u.dec(k), 'AES-GCM', false, ['encrypt', 'decrypt']));
  return keyCache.get(k);
}
async function seal(k, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(k), new TextEncoder().encode(JSON.stringify(obj)));
  const out = new Uint8Array(12 + ct.byteLength); out.set(iv); out.set(new Uint8Array(ct), 12);
  return 'rcp1.' + b64u.enc(out);
}
async function unseal(k, text) {
  if (!text || !text.startsWith('rcp1.')) return null;
  try {
    const raw = b64u.dec(text.slice(5));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await cryptoKey(k), raw.slice(12));
    return JSON.parse(new TextDecoder().decode(pt));
  } catch { return null; }
}

// Publish without custom headers (text/plain body = no CORS preflight).
async function relayPublish(topic, message, extra = {}) {
  const res = await fetch(RELAY, { method: 'POST', body: JSON.stringify({ topic, message, ...extra }) });
  if (!res.ok) throw new Error('relay ' + res.status);
}
async function relayPoll(topic, since = '48h') {
  const res = await fetch(`${RELAY}/${topic}/json?poll=1&since=${since}`);
  if (!res.ok) throw new Error('relay ' + res.status);
  return (await res.text()).split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((m) => m.event === 'message');
}
function relaySubscribe(topic, onMessage, since = '2h') {
  const es = new EventSource(`${RELAY}/${topic}/sse?since=${since}`);
  es.onmessage = (e) => { try { const m = JSON.parse(e.data); if (m.event === 'message') onMessage(m); } catch {} };
  return es;
}

async function geocode(address) {
  if (!address) return null;
  const res = await fetch(`${NOMINATIM}?format=json&limit=1&q=${encodeURIComponent(address)}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const [hit] = await res.json();
  return hit ? { lat: +(+hit.lat).toFixed(5), lng: +(+hit.lon).toFixed(5) } : null;
}
// Driving route through points [{lat,lng}...]. Returns leg durations (s) and the line to draw.
async function drivingRoute(points) {
  if (points.length < 2) return null;
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const res = await fetch(`${OSRM}${coords}?overview=full&geometries=geojson`);
  if (!res.ok) return null;
  const j = await res.json();
  if (j.code !== 'Ok' || !j.routes[0]) return null;
  return { legs: j.routes[0].legs.map((l) => l.duration), line: j.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]) };
}
function metersBetween(a, b) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function etaText(sec) {
  if (sec == null) return '';
  const m = Math.max(1, Math.round(sec / 60));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

// ---------- schedule + calendar file (shared, no app state) ----------
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
function dIso(d) { const z = new Date(d); z.setMinutes(z.getMinutes() - z.getTimezoneOffset()); return z.toISOString().slice(0, 10); }
function dParse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function dAdd(s, n) { const d = dParse(s); d.setDate(d.getDate() + n); return dIso(d); }
function calOn(calendar, date) { return (calendar || []).find((c) => c.start <= date && date <= (c.end || c.start)); }
// Time a route runs on a date (HH:MM), or null when it doesn't run.
function schedTimeOn(rt, date, calendar) {
  const dow = dParse(date).getDay();
  if (!rt.days.includes(dow)) return null;
  const c = calOn(calendar, date);
  if (c && c.type === 'off') return null;
  if (c && c.type === 'early' && rt.kind === 'pickup' && c.time) return c.time;
  return (rt.dayTimes && rt.dayTimes[dow]) || rt.time;
}
function schedNote(rt, date, calendar) {
  const c = calOn(calendar, date);
  if (c && c.type === 'early' && rt.kind === 'pickup' && c.time) return c.label || 'Early dismissal';
  const dow = dParse(date).getDay();
  return rt.dayTimes && rt.dayTimes[dow] ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow] + ' schedule' : '';
}
// Upcoming runs [{rt, date, time, note}] from `from` for `days` days.
function upcomingRuns(routes, calendar, from, days) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const date = dAdd(from, i);
    for (const rt of routes) { const time = schedTimeOn(rt, date, calendar); if (time) out.push({ rt, date, time, note: schedNote(rt, date, calendar) }); }
  }
  return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

const icsEsc = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
function icsEvent({ uid, date, time, rrule, exdates, summary, description, location, mins }) {
  const t = time.replace(':', '') + '00';
  const out = ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART:${date.replace(/-/g, '')}T${t}`, 'DURATION:PT30M'];
  if (rrule) out.push(`RRULE:${rrule}`);
  if (exdates && exdates.length) out.push(`EXDATE:${exdates.map((d) => d.replace(/-/g, '') + 'T' + t).join(',')}`);
  out.push(`SUMMARY:${icsEsc(summary)}`, `DESCRIPTION:${icsEsc(description)}`);
  if (location) out.push(`LOCATION:${icsEsc(location)}`);
  if (mins > 0) out.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(summary)} in ${mins} min`, `TRIGGER:-PT${mins}M`, 'END:VALARM');
  out.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(summary)} now`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
  return out;
}
// routes: [{id, kind, name, days, time, dayTimes, mins, destination, description}]
// Repeating events skip days off; early dismissals become one-off events. Covers 12 months.
function buildCalendarFile(calName, routes, calendar) {
  const today = dIso(new Date());
  const until = dAdd(today, 365);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ruths Car Pool//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsEsc(calName)}`];
  for (const rt of routes) {
    const summary = `${rt.kind === 'pickup' ? 'Pickup' : 'Drop-off'}: ${rt.name}`;
    const normal = (dow) => (rt.dayTimes && rt.dayTimes[dow]) || rt.time;
    const groups = {};
    for (const d of rt.days) (groups[normal(d)] = groups[normal(d)] || []).push(d);
    for (const [time, days] of Object.entries(groups)) {
      let first = today;
      while (!days.includes(dParse(first).getDay())) first = dAdd(first, 1);
      const exdates = [];
      for (let d = first; d <= until; d = dAdd(d, 1)) if (days.includes(dParse(d).getDay()) && schedTimeOn(rt, d, calendar) !== time) exdates.push(d);
      lines.push(...icsEvent({
        uid: `${rt.id}-${time.replace(':', '')}@ruthscarpool`, date: first, time,
        rrule: `FREQ=WEEKLY;BYDAY=${days.map((d) => DAY_CODES[d]).join(',')};UNTIL=${until.replace(/-/g, '')}T235959`,
        exdates, summary, description: rt.description, location: rt.destination, mins: rt.mins,
      }));
    }
    for (let d = today; d <= until; d = dAdd(d, 1)) {
      const t = schedTimeOn(rt, d, calendar);
      if (t && t !== normal(dParse(d).getDay())) lines.push(...icsEvent({ uid: `${rt.id}-${d}@ruthscarpool`, date: d, time: t, summary: `${summary} (${schedNote(rt, d, calendar)})`, description: rt.description, location: rt.destination, mins: rt.mins }));
    }
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
function downloadFile(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

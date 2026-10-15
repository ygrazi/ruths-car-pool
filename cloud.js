/* Cloud sync: every signed-in device sees the same data, live.
   Data lives in Firestore under /pools/main. Only the emails listed in firestore.rules can
   read or write it, and only after confirming their email address. Each device also keeps
   a local copy, so the app works offline and catches up when the connection returns. */
'use strict';

const FB_VER = '10.12.2';
const SYNC_COLS = ['riders', 'routes', 'rides', 'invoices', 'calendar', 'absences'];
const ALLOWED_EMAILS = ['ygrazi@gmail.com', 'ruthiegrazi52@gmail.com']; // keep in step with firestore.rules
const cloud = {
  fs: null, db: null, auth: null, authMod: null, user: null,
  auth_state: 'loading', // loading | signedOut | unverified | denied | in | off
  shadow: {}, poolShadow: '', ready: false, status: 'off', pendingRender: false, unsubs: [],
};

function cloudConfigured() { return !!(window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey); }
function cloudBlocking() { return cloudConfigured() && cloud.auth_state !== 'in' && cloud.auth_state !== 'off'; }

// Stable JSON (sorted keys) so the same data always compares equal.
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
const plain = (o) => JSON.parse(JSON.stringify(o));
const poolFields = () => ({ settings: state.settings, sentReminders: state.sentReminders || {}, lastSchedPub: state.lastSchedPub || 0 });
const hasLocalData = (s) => s.riders.length || s.routes.length || s.invoices.length;

function setSyncStatus(s) { cloud.status = s; const el = document.querySelector('#syncState'); if (el) el.textContent = syncLabel(); }
function syncLabel() {
  return { off: 'Not connected', connecting: 'Connecting…', live: 'Synced — all devices up to date', offline: 'Offline — changes will sync when back online', error: 'Sync problem — retrying' }[cloud.status] || cloud.status;
}

async function cloudStart() {
  if (!cloudConfigured()) { cloud.auth_state = 'off'; return; }
  try {
    const appMod = await import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app.js`);
    cloud.authMod = await import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-auth.js`);
    cloud.fs = await import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-firestore.js`);
    const app = appMod.initializeApp(window.FIREBASE_CONFIG);
    cloud.auth = cloud.authMod.getAuth(app);
    try { cloud.db = cloud.fs.initializeFirestore(app, { localCache: cloud.fs.persistentLocalCache({ tabManager: cloud.fs.persistentMultipleTabManager() }) }); }
    catch { cloud.db = cloud.fs.getFirestore(app); }
    cloud.authMod.onAuthStateChanged(cloud.auth, onUser);
  } catch (e) {
    console.warn('cloud start failed', e);
    cloud.auth_state = 'off'; // can't reach the service (offline first run) — keep working locally
    render();
  }
}

function onUser(user) {
  cloud.user = user;
  stopSync();
  if (!user) cloud.auth_state = 'signedOut';
  else if (!ALLOWED_EMAILS.includes((user.email || '').toLowerCase())) cloud.auth_state = 'denied';
  else if (!user.emailVerified) cloud.auth_state = 'unverified';
  else { cloud.auth_state = 'in'; startSync(); }
  render();
}

async function startSync() {
  const { fs, db } = cloud;
  setSyncStatus('connecting');
  const local = plain(state);
  const poolRef = fs.doc(db, 'pools', 'main');
  try {
    const [poolSnap, ridersSnap] = await Promise.all([fs.getDoc(poolRef), fs.getDocs(fs.collection(db, 'pools', 'main', 'riders'))]);
    if (ridersSnap.empty && hasLocalData(local)) {
      // The shared carpool is empty and this device has data: this device's data becomes the shared data.
      cloud.ready = true;
      if (!poolSnap.exists()) await fs.setDoc(poolRef, { ...plain(poolFields()), created: Date.now() });
      pushAll();
      toast('Your data is now saved online');
    } else if (!ridersSnap.empty && hasLocalData(local)) {
      // Joining a carpool that already has data: keep this device's old copy as a backup.
      try { localStorage.setItem(STORE_KEY + '.beforeSync', JSON.stringify(local)); } catch {}
    }
  } catch (e) { console.warn('initial sync check failed', e); }
  cloud.ready = true;
  cloud.unsubs.push(fs.onSnapshot(poolRef, { includeMetadataChanges: true }, (d) => {
    setSyncStatus(d.metadata.fromCache ? 'offline' : 'live');
    if (!d.exists()) return;
    const data = d.data();
    cloud.poolShadow = stable(plain({ settings: data.settings, sentReminders: data.sentReminders || {}, lastSchedPub: data.lastSchedPub || 0 }));
    if (data.settings) state.settings = { ...DEFAULT_STATE.settings, ...data.settings };
    state.sentReminders = data.sentReminders || {};
    state.lastSchedPub = data.lastSchedPub || 0;
    afterRemote();
  }, (e) => { console.warn(e); setSyncStatus('error'); }));
  for (const col of SYNC_COLS) {
    cloud.unsubs.push(fs.onSnapshot(fs.collection(db, 'pools', 'main', col), (qs) => {
      applyCollection(col, qs.docs);
      afterRemote();
    }, (e) => { console.warn(e); setSyncStatus('error'); }));
  }
  setTimeout(cloudBackup, 8000);
}
function stopSync() {
  cloud.unsubs.forEach((u) => u());
  cloud.unsubs = []; cloud.ready = false; cloud.shadow = {}; cloud.poolShadow = '';
  setSyncStatus('off');
}

// Replace a collection with the server's version, keeping object identity for open forms.
function applyCollection(col, docs) {
  const byId = new Map((state[col] || []).map((o) => [o.id, o]));
  const shadow = (cloud.shadow[col] = {});
  state[col] = docs.map((d) => {
    const data = { ...d.data(), id: d.id };
    shadow[d.id] = stable(data);
    const o = byId.get(d.id);
    if (!o) return data;
    for (const k of Object.keys(o)) delete o[k];
    return Object.assign(o, data);
  });
}

let remoteTimer = null;
function afterRemote() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
  clearTimeout(remoteTimer);
  remoteTimer = setTimeout(() => {
    const a = document.activeElement;
    if (a && a.closest && a.closest('#view, dialog') && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { cloud.pendingRender = true; return; }
    render();
  }, 120);
}
document.addEventListener('focusout', () => { if (cloud.pendingRender) { cloud.pendingRender = false; setTimeout(render, 50); } });

// Send whatever changed since the last server snapshot. Called from save().
function cloudPush() {
  if (!cloud.ready || !cloud.fs || cloud.auth_state !== 'in') return;
  const { fs, db } = cloud;
  const ops = [];
  for (const col of SYNC_COLS) {
    const shadow = (cloud.shadow[col] = cloud.shadow[col] || {});
    const seen = new Set();
    for (const o of state[col] || []) {
      if (!o || !o.id) continue;
      seen.add(o.id);
      const s = stable(o);
      if (shadow[o.id] !== s) { ops.push(['set', fs.doc(db, 'pools', 'main', col, o.id), plain(o)]); shadow[o.id] = s; }
    }
    for (const id of Object.keys(shadow)) if (!seen.has(id)) { ops.push(['del', fs.doc(db, 'pools', 'main', col, id)]); delete shadow[id]; }
  }
  const pf = stable(plain(poolFields()));
  if (pf !== cloud.poolShadow) { ops.push(['merge', fs.doc(db, 'pools', 'main'), plain(poolFields())]); cloud.poolShadow = pf; }
  for (let i = 0; i < ops.length; i += 450) {
    const batch = fs.writeBatch(db);
    for (const [kind, ref, data] of ops.slice(i, i + 450)) {
      if (kind === 'del') batch.delete(ref);
      else if (kind === 'merge') batch.set(ref, data, { merge: true });
      else batch.set(ref, data);
    }
    batch.commit().catch((e) => { console.warn('sync write failed', e); setSyncStatus('error'); });
  }
}
function pushAll() { cloud.shadow = {}; cloud.poolShadow = ''; cloudPush(); }

// ---------- sign-in screen ----------
const AUTH_MSG = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'No account with that email yet — tap “Create account”.',
  'auth/email-already-in-use': 'That email already has an account — tap “Sign in”.',
  'auth/weak-password': 'Use at least 6 characters for the password.',
  'auth/invalid-email': 'That email address doesn’t look right.',
  'auth/too-many-requests': 'Too many tries — wait a minute and try again.',
  'auth/network-request-failed': 'No internet connection.',
};
function viewAuth() {
  const st = cloud.auth_state;
  const pool = esc(state.settings.poolName);
  if (st === 'loading') return `<div class="panel empty"><p>Loading…</p></div>`;
  if (st === 'denied') return `<section class="authbox"><div class="eyebrow">${pool}</div><div class="display sm">No access</div>
    <p>${esc(cloud.user.email)} isn’t on the list for this carpool. Sign in with the email the carpool owner set up.</p>
    <div class="actions"><button data-act="signOut">Use a different email</button></div></section>`;
  if (st === 'unverified') return `<section class="authbox"><div class="eyebrow">One more step</div><div class="display sm">Check your email</div>
    <p>We sent a confirmation link to <b>${esc(cloud.user.email)}</b>. Open it (check Spam too), then come back and tap the button below.</p>
    <div class="actions"><button class="primary" data-act="checkVerified">I confirmed my email</button><button class="ghost" data-act="resendVerify">Send the link again</button></div>
    <div class="actions"><button class="textbtn" data-act="signOut">Use a different email</button></div></section>`;
  return `<section class="authbox"><div class="eyebrow">${pool}</div><div class="display sm">Sign in</div>
    <p class="muted">Sign in once on each phone or computer — everything stays in sync.</p>
    <button class="google" type="button" data-act="google"><svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Continue with Google</button>
    <div class="autherr" id="googleErr"></div>
    <div class="orline"><span>or use email</span></div>
    <form id="authForm">
      <label>Email</label><input name="email" type="email" autocomplete="username" required>
      <label>Password</label><input name="password" type="password" autocomplete="current-password" required minlength="6">
      <div class="autherr" id="authErr"></div>
      <div class="actions"><button class="primary" name="mode" value="in">Sign in</button><button name="mode" value="up">Create account</button></div>
      <div class="actions"><button class="textbtn" type="button" data-act="forgot">Forgot password?</button></div>
    </form></section>`;
}
async function authSubmit(form, mode) {
  const { email, password } = Object.fromEntries(new FormData(form));
  const err = document.querySelector('#authErr');
  err.textContent = '';
  const a = cloud.authMod;
  try {
    if (mode === 'up') {
      if (!ALLOWED_EMAILS.includes(email.trim().toLowerCase())) { err.textContent = 'This email isn’t on the list for this carpool.'; return; }
      const cred = await a.createUserWithEmailAndPassword(cloud.auth, email.trim(), password);
      await a.sendEmailVerification(cred.user);
    } else {
      await a.signInWithEmailAndPassword(cloud.auth, email.trim(), password);
    }
  } catch (e) { err.textContent = AUTH_MSG[e.code] || 'Something went wrong — please try again.'; }
}
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'authForm') return;
  e.preventDefault();
  authSubmit(e.target, e.submitter && e.submitter.value === 'up' ? 'up' : 'in');
});
const authActions = {
  google: async () => {
    const a = cloud.authMod;
    const err = document.querySelector('#googleErr');
    if (err) err.textContent = '';
    const provider = new a.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try { await a.signInWithPopup(cloud.auth, provider); }
    catch (e) {
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
      const msg = {
        'auth/operation-not-allowed': 'Google sign-in isn’t switched on yet — use email for now.',
        'auth/popup-blocked': 'Your browser blocked the sign-in window — allow pop-ups, or use email below.',
        'auth/network-request-failed': 'No internet connection.',
        'auth/unauthorized-domain': 'This website isn’t allowed to use Google sign-in yet.',
      }[e.code] || 'Google sign-in didn’t finish — try again, or use email below.';
      if (err) err.textContent = msg; else toast(msg);
    }
  },
  signOut: () => cloud.authMod.signOut(cloud.auth),
  checkVerified: async () => { await cloud.user.reload(); await cloud.user.getIdToken(true); onUser(cloud.auth.currentUser); if (cloud.auth_state === 'unverified') toast('Not confirmed yet — open the link in the email first'); },
  resendVerify: async () => { try { await cloud.authMod.sendEmailVerification(cloud.user); toast('Sent — check your email'); } catch { toast('Please wait a minute before sending again'); } },
  forgot: async () => {
    const email = (document.querySelector('#authForm [name=email]').value || '').trim();
    if (!email) return toast('Type your email first');
    try { await cloud.authMod.sendPasswordResetEmail(cloud.auth, email); toast('Password reset email sent'); } catch { toast('Could not send — check the email address'); }
  },
};

// ---------- automatic backups ----------
// Once a day each device saves a copy of the day's starting data: online (kept 30 days,
// shared by both of you) and on the device itself (kept 7 days). Restore from Settings.
const BK_PREFIX = () => STORE_KEY + '.backup.';
function backupData() { const s = plain(state); delete s.liveRun; return s; }
function localBackup() {
  try {
    if (!hasLocalData(state)) return;
    const key = BK_PREFIX() + dIso(new Date());
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(backupData()));
    Object.keys(localStorage).filter((k) => k.startsWith(BK_PREFIX())).sort().slice(0, -7).forEach((k) => localStorage.removeItem(k));
  } catch {}
}
async function cloudBackup() {
  if (!cloud.ready || cloud.auth_state !== 'in' || !hasLocalData(state)) return;
  const { fs, db } = cloud;
  const today = dIso(new Date());
  try {
    const ref = fs.doc(db, 'pools', 'main', 'backups', today);
    const snap = await fs.getDoc(ref);
    if (!snap.exists()) await fs.setDoc(ref, { t: Date.now(), by: cloud.user.email, json: JSON.stringify(backupData()) });
    const cutoff = dAdd(today, -30);
    const all = await fs.getDocs(fs.collection(db, 'pools', 'main', 'backups'));
    all.docs.filter((d) => d.id < cutoff).forEach((d) => fs.deleteDoc(d.ref));
  } catch (e) { console.warn('backup failed', e); }
}
async function listBackups() {
  const out = [];
  if (cloud.ready && cloud.auth_state === 'in') {
    try {
      const all = await cloud.fs.getDocs(cloud.fs.collection(cloud.db, 'pools', 'main', 'backups'));
      all.docs.forEach((d) => out.push({ where: 'online', id: d.id, t: d.data().t, by: d.data().by, load: () => JSON.parse(d.data().json) }));
    } catch {}
  }
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(BK_PREFIX())).forEach((k) => out.push({ where: 'this device', id: k.slice(BK_PREFIX().length), load: () => JSON.parse(localStorage.getItem(k)) }));
    for (const extra of ['beforeSync', 'beforeRestore']) {
      const raw = localStorage.getItem(STORE_KEY + '.' + extra);
      if (raw) out.push({ where: 'this device', id: extra === 'beforeSync' ? 'Before online sync' : 'Before last restore', load: () => JSON.parse(raw) });
    }
  } catch {}
  return out.sort((a, b) => String(b.id).localeCompare(String(a.id)));
}
function restoreBackup(data) {
  try { localStorage.setItem(STORE_KEY + '.beforeRestore', JSON.stringify(backupData())); } catch {}
  for (const col of SYNC_COLS) state[col] = data[col] || [];
  state.settings = { ...DEFAULT_STATE.settings, ...(data.settings || {}) };
  save(); render();
}

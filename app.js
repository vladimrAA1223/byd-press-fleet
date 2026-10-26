(() => {
'use strict';

const CFG = window.FLEET_CONFIG || {};
const DEMO = new URLSearchParams(location.search).has('demo');

// ------------------------------------------------------------------ constants
const PURPOSES = [
  ['Press / Test drive', '#BDD7EE'],
  ['Event', '#C6E0B4'],
  ['Partner / Corporate', '#FFE699'],
  ['Training', '#D9D2E9'],
  ['Service / Registration', '#F8CBAD'],
  ['Damaged / Out of service', '#FF9F9F'],
  ['Long-term loan', '#C9C9C9'],
  ['Bulgaria', '#9FD5D1'],
  ['Other', '#E7E6E6'],
];
const PURPOSE_BG = Object.fromEntries(PURPOSES);
const CAR_STATUSES = ['Active', 'Long-term loan', 'Not registered', 'In service', 'Sold'];
const BOOKING_STATUSES = ['Confirmed', 'Tentative', 'Cancelled'];
const BOOKING_FIELDS = ['car_id', 'start_date', 'end_date', 'client', 'purpose', 'status', 'booked_by', 'notes'];
const CAR_FIELDS = ['id', 'model', 'trim_level', 'colour', 'plate', 'vin', 'status', 'holder', 'notes'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ICON = {
  car: '<svg viewBox="0 0 24 24" fill="#1F3864"><path d="M3 15l2.2-5.4A2.5 2.5 0 0 1 7.5 8h9a2.5 2.5 0 0 1 2.3 1.6L21 15v3.5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1V18h-11v.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  xls: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>',
  left: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 18l-6-6 6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9 18l6-6-6-6"/></svg>',
};

// ------------------------------------------------------------------ dates (ISO yyyy-mm-dd, timezone-free)
const pad = n => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const toISO = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return toISO(d); };
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const dow = s => parse(s).getUTCDay();
const mondayOf = s => addDays(s, -((dow(s) + 6) % 7));
const fmt = s => s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : '';
const fmtShort = s => s ? `${s.slice(8, 10)}.${s.slice(5, 7)}` : '';
const fmtLong = s => s ? `${DOW[dow(s)]} ${fmt(s)}` : '';
const isISO = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const maxISO = (a, b) => (a > b ? a : b);
const minISO = (a, b) => (a < b ? a : b);

// ------------------------------------------------------------------ helpers
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k] === '' ? null : o[k]]));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const nameFromEmail = e => (e || '').split('@')[0].split(/[._-]+/).filter(Boolean).map(p => p[0].toUpperCase() + p.slice(1)).join(' ');
const store = {
  get(k, d) { try { const v = localStorage.getItem('fleet.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('fleet.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

function toast(msg, err = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), err ? 6000 : 3000);
}

function friendlyError(e) {
  const code = e && (e.code || e.status);
  const msg = (e && e.message) || String(e);
  if (code === '23P01' || /no_overlap/.test(msg)) return 'That car is already booked on some of those days (someone may have just booked it). Pick other dates or another car.';
  if (code === '23514' || /end_after_start/.test(msg)) return 'The end date must be on or after the start date.';
  if (code === '23505') return 'That ID already exists.';
  if (code === '23503') return 'This item is still used elsewhere (for example a car with bookings).';
  if (code === '42501' || /row-level security/.test(msg)) return 'You do not have permission to do that.';
  if (/Invalid login credentials/i.test(msg)) return 'Wrong email or password.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'No connection to the server. Check your internet and try again.';
  return msg;
}

// ------------------------------------------------------------------ state
const S = {
  me: '', isAdmin: false,
  cars: [], bookings: [], models: [], members: [],
  carMap: new Map(), byCar: new Map(),
  view: store.get('view', 'find'),
  find: { model: 'All', days: 5, start: '', ...store.get('find', {}) },
  cal: { start: '', weeks: 6, model: 'All', inactive: false, ...store.get('cal', {}) },
  list: { q: '', period: 'current', model: 'All', purpose: 'All', cancelled: false, ...store.get('list', {}) },
  fleet: { q: '', status: 'All', ...store.get('fleet', {}) },
};
S.find.start = '';
S.cal.start = '';

function setData(d) {
  const sortOf = Object.fromEntries(d.models.map(m => [m.name, m.sort]));
  const st = s => CAR_STATUSES.indexOf(s);
  S.models = d.models.slice().sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  S.cars = d.cars.slice().sort((a, b) => (sortOf[a.model] ?? 999) - (sortOf[b.model] ?? 999) || st(a.status) - st(b.status) || a.id.localeCompare(b.id));
  S.bookings = d.bookings.slice().sort((a, b) => a.start_date.localeCompare(b.start_date) || a.car_id.localeCompare(b.car_id));
  S.members = d.members.slice().sort((a, b) => a.email.localeCompare(b.email));
  S.carMap = new Map(S.cars.map(c => [c.id, c]));
  S.byCar = new Map();
  for (const b of S.bookings) {
    if (b.status === 'Cancelled') continue;
    if (!S.byCar.has(b.car_id)) S.byCar.set(b.car_id, []);
    S.byCar.get(b.car_id).push(b);
  }
  const me = S.members.find(m => m.email === S.me);
  S.isAdmin = !!me && me.role === 'admin';
}

// ------------------------------------------------------------------ availability logic
const bookingsOf = id => S.byCar.get(id) || [];
const conflicts = (carId, s, e, ignoreId) => bookingsOf(carId).filter(b => b.id !== ignoreId && b.start_date <= e && b.end_date >= s);
const currentBooking = (carId, day = todayISO()) => bookingsOf(carId).find(b => b.start_date <= day && b.end_date >= day);
const nextBookingAfter = (carId, day, ignoreId) => bookingsOf(carId).find(b => b.start_date > day && b.id !== ignoreId);

// earliest start >= from where the car is free for n consecutive days
function earliestFree(carId, from, n, ignoreId) {
  let t = from;
  for (let guard = 0; guard < 2000; guard++) {
    const clash = conflicts(carId, t, addDays(t, n - 1), ignoreId);
    if (!clash.length) return t;
    t = addDays(clash.reduce((m, b) => maxISO(m, b.end_date), clash[0].end_date), 1);
  }
  return null;
}

const poolCars = model => S.cars.filter(c => c.status === 'Active' && (model === 'All' || c.model === model));

function findResults(model, n, start) {
  return poolCars(model).map(car => {
    const from = earliestFree(car.id, start, n);
    const next = nextBookingAfter(car.id, from);
    return { car, from, to: addDays(from, n - 1), freeUntil: next ? addDays(next.start_date, -1) : null, now: currentBooking(car.id) };
  }).sort((a, b) => a.from.localeCompare(b.from) || a.car.id.localeCompare(b.car.id));
}

function modelOverview(n, start) {
  const today = todayISO();
  return S.models.map(m => {
    const res = findResults(m.name, n, start);
    const pool = poolCars(m.name);
    const best = res[0];
    return {
      model: m.name, pool: pool.length,
      freeToday: pool.filter(c => !currentBooking(c.id, today)).length,
      earliest: best ? best.from : null, to: best ? best.to : null, bestCar: best ? best.car.id : null,
      others: best ? res.filter(r => r.from === best.from).length - 1 : 0,
    };
  });
}

// ------------------------------------------------------------------ data API (Supabase or demo)
function makeSupabaseApi() {
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
  async function all(table, order) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(table).select('*').order(order).range(from, from + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) return out;
    }
  }
  const ok = ({ error }) => { if (error) throw error; };
  return {
    async session() { const { data } = await sb.auth.getSession(); return data.session; },
    async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
    async signOut() { await sb.auth.signOut(); },
    async changePassword(password) { ok(await sb.auth.updateUser({ password })); },
    onSignedOut(cb) { sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') cb(); }); },
    async loadAll() {
      const [cars, bookings, models, members] = await Promise.all([all('cars', 'id'), all('bookings', 'id'), all('models', 'name'), all('fleet_members', 'email')]);
      return { cars, bookings, models, members };
    },
    async saveBooking(b) {
      const row = pick(b, BOOKING_FIELDS);
      ok(b.id ? await sb.from('bookings').update(row).eq('id', b.id) : await sb.from('bookings').insert(row));
    },
    async saveCar(c, isNew) {
      const row = pick(c, CAR_FIELDS);
      ok(isNew ? await sb.from('cars').insert(row) : await sb.from('cars').update(row).eq('id', c.id));
    },
    async deleteCar(id) { ok(await sb.from('cars').delete().eq('id', id)); },
    async addMember(email, role) { ok(await sb.from('fleet_members').insert({ email, role })); },
    async setRole(email, role) { ok(await sb.from('fleet_members').update({ role }).eq('email', email)); },
    async removeMember(email) { ok(await sb.from('fleet_members').delete().eq('email', email)); },
    async addModel(name, sort) { ok(await sb.from('models').insert({ name, sort })); },
    async deleteModel(name) { ok(await sb.from('models').delete().eq('name', name)); },
    async history(id) {
      const { data, error } = await sb.from('booking_log').select('*').eq('booking_id', id).order('changed_at', { ascending: false }).limit(15);
      if (error) throw error;
      return data;
    },
    subscribe(cb) {
      const ch = sb.channel('fleet-changes');
      for (const table of ['bookings', 'cars', 'models']) ch.on('postgres_changes', { event: '*', schema: 'public', table }, cb);
      ch.subscribe();
    },
  };
}

// Demo mode: same interface, data kept in memory (used for local testing only)
function makeDemoApi() {
  let db = null, seq = 100000;
  const log = [];
  const clone = x => JSON.parse(JSON.stringify(x));
  const err = (code, message) => Object.assign(new Error(message), { code });
  return {
    async session() { return { user: { email: 'demo@example.com' } }; },
    async signIn() {}, async signOut() { location.reload(); }, async changePassword() {}, onSignedOut() {},
    async loadAll() {
      if (!db) {
        const r = await fetch('demo-data.json');
        if (!r.ok) throw new Error('demo-data.json not found');
        db = await r.json();
        db.members = [{ email: 'demo@example.com', role: 'admin' }];
      }
      return clone(db);
    },
    async saveBooking(b) {
      const row = { ...pick(b, BOOKING_FIELDS) };
      if (row.end_date < row.start_date) throw err('23514', 'end_after_start');
      if (row.status !== 'Cancelled' && db.bookings.some(x => x.id !== b.id && x.car_id === row.car_id && x.status !== 'Cancelled' && x.start_date <= row.end_date && x.end_date >= row.start_date)) throw err('23P01', 'no_overlap');
      if (b.id) Object.assign(db.bookings.find(x => x.id === b.id), row, { updated_by: 'demo@example.com' });
      else db.bookings.push({ ...row, id: ++seq, created_by: 'demo@example.com' });
      log.push({ booking_id: b.id || seq, action: b.id ? 'update' : 'insert', changed_by: 'demo@example.com', changed_at: new Date().toISOString(), data: row });
    },
    async saveCar(c, isNew) {
      if (isNew && db.cars.some(x => x.id === c.id)) throw err('23505', 'dup');
      if (isNew) db.cars.push(pick(c, CAR_FIELDS)); else Object.assign(db.cars.find(x => x.id === c.id), pick(c, CAR_FIELDS));
    },
    async deleteCar(id) { if (db.bookings.some(b => b.car_id === id)) throw err('23503', 'fk'); db.cars = db.cars.filter(c => c.id !== id); },
    async addMember(email, role) { db.members.push({ email, role }); },
    async setRole(email, role) { db.members.find(m => m.email === email).role = role; },
    async removeMember(email) { db.members = db.members.filter(m => m.email !== email); },
    async addModel(name, sort) { db.models.push({ name, sort }); },
    async deleteModel(name) { if (db.cars.some(c => c.model === name)) throw err('23503', 'fk'); db.models = db.models.filter(m => m.name !== name); },
    async history(id) { return log.filter(l => l.booking_id === id).reverse(); },
    subscribe() {},
  };
}

const api = DEMO ? makeDemoApi() : makeSupabaseApi();

async function reload(silent = true) {
  try {
    setData(await api.loadAll());
    renderView();
  } catch (e) {
    if (!silent) toast(friendlyError(e), true);
  }
}

// ------------------------------------------------------------------ small render helpers
const purposeTag = p => `<span class="purpose"><i style="background:${PURPOSE_BG[p] || '#E7E6E6'}"></i>${esc(p)}</span>`;
const statusBadge = s => `<span class="badge ${s === 'Confirmed' ? 'green' : s === 'Tentative' ? 'amber' : ''}">${esc(s)}</span>`;
const carStatusBadge = s => `<span class="badge ${s === 'Active' ? 'green' : s === 'Sold' ? 'red' : s === 'In service' ? 'amber' : ''}">${esc(s)}</span>`;
const modelOptions = (sel, withAll = true) => (withAll ? `<option value="All"${sel === 'All' ? ' selected' : ''}>All models</option>` : '') +
  S.models.map(m => `<option${m.name === sel ? ' selected' : ''}>${esc(m.name)}</option>`).join('');
const opts = (list, sel) => list.map(v => `<option${v === sel ? ' selected' : ''}>${esc(v)}</option>`).join('');
const carLabel = c => `${c.id} · ${c.model}${c.colour ? ', ' + c.colour : ''}`;
function whereText(carId) {
  const b = currentBooking(carId);
  return b ? `${b.client} (until ${fmtShort(b.end_date)})` : null;
}

// ------------------------------------------------------------------ shell
function renderLogin(message = '') {
  $('#app').innerHTML = `
  <div class="login-wrap"><div class="login">
    <div class="brand"><span class="brand-mark">${ICON.car}</span>${esc(CFG.appName || 'Fleet')}</div>
    <div class="card"><div class="card-body">
      <h1>Sign in</h1>
      <div class="muted">Press car bookings, availability and calendar.</div>
      <form id="login-form" autocomplete="on">
        <label class="field"><span>Email</span><input type="email" name="email" required autocomplete="username"></label>
        <label class="field"><span>Password</span><input type="password" name="password" required autocomplete="current-password"></label>
        ${message ? `<div class="alert red">${esc(message)}</div>` : ''}
        <button class="btn primary" type="submit">Sign in</button>
      </form>
      <p class="small muted" style="margin:14px 0 0">Access is by invitation. Ask the fleet admin to add your email.</p>
    </div></div>
  </div></div>`;
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = e.target.querySelector('button');
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      await api.signIn(String(f.get('email')).trim(), String(f.get('password')));
      const s = await api.session();
      await enter(s.user.email);
    } catch (err) {
      renderLogin(friendlyError(err));
    }
  });
}

function renderNoAccess() {
  $('#app').innerHTML = `
  <div class="login-wrap"><div class="login">
    <div class="brand"><span class="brand-mark">${ICON.car}</span>${esc(CFG.appName || 'Fleet')}</div>
    <div class="card"><div class="card-body">
      <h1>No access yet</h1>
      <p>You are signed in as <b>${esc(S.me)}</b>, but this email is not on the team list.</p>
      <p class="muted">Ask the fleet admin to add it in the Team tab, then reload this page.</p>
      <div class="row"><button class="btn" data-action="reload-page">Reload</button><button class="btn" data-action="sign-out">Sign out</button></div>
    </div></div>
  </div></div>`;
}

async function enter(email) {
  S.me = String(email || '').toLowerCase();
  $('#app').innerHTML = '<div class="boot">Loading the fleet…</div>';
  try {
    setData(await api.loadAll());
  } catch (e) {
    $('#app').innerHTML = `<div class="boot">Could not load data: ${esc(friendlyError(e))}<br><br><button class="btn" data-action="reload-page">Try again</button></div>`;
    return;
  }
  if (!S.members.some(m => m.email === S.me)) return renderNoAccess();
  renderShell();
  api.subscribe(debounce(() => reload(true), 500));
}

const TABS = [['find', 'Find a car'], ['calendar', 'Calendar'], ['bookings', 'Bookings'], ['fleet', 'Fleet'], ['team', 'Team']];

function renderShell() {
  if (!TABS.some(t => t[0] === S.view)) S.view = 'find';
  $('#app').innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="brand-mark">${ICON.car}</span><span class="name">${esc(CFG.appName || 'Fleet')}</span></div>
    <nav class="tabs" role="tablist">${TABS.map(([k, l]) => `<button class="tab" role="tab" data-action="tab" data-tab="${k}">${l}</button>`).join('')}</nav>
    <button class="user-btn" data-action="user-menu" title="${esc(S.me)}">${esc(nameFromEmail(S.me) || S.me)} ▾</button>
  </header>
  <main id="view"></main>`;
  renderView();
}

function renderView() {
  const v = $('#view');
  if (!v) return;
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === S.view));
  v.classList.toggle('wide', S.view === 'calendar');
  ({ find: renderFind, calendar: renderCalendar, bookings: renderBookings, fleet: renderFleet, team: renderTeam })[S.view]();
}

// ------------------------------------------------------------------ FIND A CAR
function renderFind() {
  const f = S.find;
  if (!f.start) f.start = todayISO();
  const today = todayISO();
  const pool = poolCars('All');
  const out = pool.filter(c => currentBooking(c.id, today)).length;
  const weekEnd = addDays(today, 6);
  const starting = S.bookings.filter(b => b.status !== 'Cancelled' && b.start_date >= today && b.start_date <= weekEnd).length;
  $('#view').innerHTML = `
  <div class="page-head"><div><h1>Find a car</h1><p>Pick a model and how many days. The earliest free dates are worked out from all bookings.</p></div></div>
  <div class="kpis">
    <div class="kpi"><div class="label">Cars in pool</div><div class="value">${pool.length}</div></div>
    <div class="kpi"><div class="label">Free today</div><div class="value green">${pool.length - out}</div></div>
    <div class="kpi"><div class="label">Out today</div><div class="value">${out}</div></div>
    <div class="kpi"><div class="label">Starting in 7 days</div><div class="value">${starting}</div></div>
  </div>
  <div class="card">
    <div class="card-body">
      <div class="search-grid">
        <label class="field grow"><span>Model</span><select id="f-model">${modelOptions(f.model)}</select></label>
        <div class="field"><span>Number of days</span>
          <div class="stepper"><button type="button" data-action="days-step" data-d="-1" aria-label="Fewer days">−</button><input id="f-days" type="number" min="1" max="365" value="${f.days}" inputmode="numeric"><button type="button" data-action="days-step" data-d="1" aria-label="More days">+</button></div>
        </div>
        <label class="field"><span>Earliest start</span><input id="f-start" type="date" value="${f.start}"></label>
        <button class="btn" data-action="find-today" type="button">Today</button>
      </div>
      <div class="quick">${[1, 3, 5, 7, 10, 14].map(d => `<button class="chip-btn${d === f.days ? ' on' : ''}" data-action="days-set" data-d="${d}">${plural(d, 'day')}</button>`).join('')}</div>
    </div>
  </div>
  <div class="card" id="find-results"></div>
  <div class="card" id="find-overview"></div>`;
  $('#f-model').addEventListener('change', e => { f.model = e.target.value; saveFind(); });
  $('#f-days').addEventListener('input', e => { const n = parseInt(e.target.value, 10); if (n >= 1 && n <= 365) { f.days = n; saveFind(false); } });
  $('#f-start').addEventListener('change', e => { if (isISO(e.target.value)) { f.start = e.target.value; saveFind(); } });
  renderFindResults();
}

function saveFind(full = true) {
  store.set('find', { model: S.find.model, days: S.find.days });
  if (full) { $$('.quick .chip-btn').forEach(b => b.classList.toggle('on', +b.dataset.d === S.find.days)); }
  renderFindResults();
}

function renderFindResults() {
  const f = S.find;
  const res = findResults(f.model, f.days, f.start);
  const title = f.model === 'All' ? 'All models' : f.model;
  $('#find-results').innerHTML = `
    <div class="card-head">
      <div><h2>${esc(title)} · ${plural(f.days, 'day')} from ${fmtLong(f.start)}</h2><div class="sub">${res.length ? `${plural(res.length, 'car')} in the pool, earliest free first` : ''}</div></div>
      <div class="row">
        <button class="btn sm" data-action="copy-text" ${res.length ? '' : 'disabled'}>${ICON.copy}Copy text</button>
        <button class="btn sm" data-action="export-find" ${res.length ? '' : 'disabled'}>${ICON.xls}Excel</button>
      </div>
    </div>
    ${res.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Car</th><th>Free from</th><th>Return by</th><th class="hide-sm">Free until</th><th class="hide-sm">Today</th><th></th></tr></thead>
      <tbody>${res.map(r => `
        <tr>
          <td><div class="car-id">${esc(r.car.id)}</div><div class="car-sub">${esc(r.car.model)} · ${esc(r.car.colour || '')}${r.car.trim_level ? ' · ' + esc(r.car.trim_level) : ''}</div></td>
          <td class="nowrap">${r.from === f.start ? `<span class="badge green">${fmt(r.from)}</span>` : `<b>${fmt(r.from)}</b>`}<div class="car-sub">${r.from === f.start ? 'free right away' : `in ${plural(daysBetween(f.start, r.from), 'day')}`}</div></td>
          <td class="nowrap">${fmt(r.to)}</td>
          <td class="nowrap hide-sm">${r.freeUntil ? fmt(r.freeUntil) : '<span class="muted">no later booking</span>'}</td>
          <td class="hide-sm">${whereText(r.car.id) ? esc(whereText(r.car.id)) : '<span class="badge green">Available</span>'}</td>
          <td class="nowrap" style="text-align:right"><button class="btn sm primary" data-action="book-from-find" data-car="${esc(r.car.id)}" data-from="${r.from}">Book</button></td>
        </tr>`).join('')}</tbody></table></div>`
      : `<div class="empty">No ${esc(title)} car is in the pool. Only cars with Fleet status "Active" are offered.</div>`}`;

  const ov = modelOverview(f.days, f.start);
  $('#find-overview').innerHTML = `
    <div class="card-head"><div><h2>Overview by model</h2><div class="sub">Earliest ${plural(f.days, 'day')} slot per model, from ${fmt(f.start)}</div></div>
      <button class="btn sm" data-action="export-overview">${ICON.xls}Excel (all models)</button></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Model</th><th>In pool</th><th>Free today</th><th>Earliest start</th><th class="hide-sm">Return by</th><th>Best car</th><th class="hide-sm">Other cars free then</th></tr></thead>
      <tbody>${ov.map(o => `
        <tr class="clickable" data-action="pick-model" data-model="${esc(o.model)}">
          <td><b>${esc(o.model)}</b></td><td>${o.pool}</td><td>${o.freeToday}</td>
          <td class="nowrap">${o.earliest ? (o.earliest === f.start ? `<span class="badge green">${fmt(o.earliest)}</span>` : fmt(o.earliest)) : '<span class="muted">no car in pool</span>'}</td>
          <td class="nowrap hide-sm">${o.to ? fmt(o.to) : ''}</td><td class="car-id">${esc(o.bestCar || '')}</td><td class="hide-sm">${o.earliest ? o.others : ''}</td>
        </tr>`).join('')}</tbody></table></div>`;
}

function findText() {
  const f = S.find;
  const res = findResults(f.model, f.days, f.start).slice(0, 10);
  const head = `Availability - ${f.model === 'All' ? 'all models' : f.model} - ${plural(f.days, 'day')} from ${fmt(f.start)}:`;
  return [head, ...res.map(r => `• ${r.car.id} (${r.car.model}${r.car.colour ? ', ' + r.car.colour : ''}): ${fmt(r.from)} - ${fmt(r.to)}`)].join('\n');
}

// ------------------------------------------------------------------ CALENDAR
function renderCalendar() {
  const c = S.cal;
  if (!c.start) c.start = mondayOf(todayISO());
  const days = c.weeks * 7;
  const end = addDays(c.start, days - 1);
  const today = todayISO();
  const dates = Array.from({ length: days }, (_, i) => addDays(c.start, i));
  const cars = S.cars.filter(x => x.status !== 'Sold' && (c.model === 'All' || x.model === c.model) && (c.inactive || x.status === 'Active' || x.status === 'In service'));
  const hidden = S.cars.filter(x => x.status !== 'Sold' && (c.model === 'All' || x.model === c.model)).length - cars.length;

  let head = '';
  dates.forEach((d, i) => {
    if (i === 0 || d.slice(8) === '01') {
      const monthDays = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 0)).getUTCDate();
      const span = Math.min(days - i, monthDays - +d.slice(8) + 1);
      head += `<div class="cal-month" style="grid-column:${i + 1}/span ${span}">${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}</div>`;
    }
    const we = dow(d) === 0 || dow(d) === 6;
    head += `<div class="cal-day${we ? ' we' : ''}${d === today ? ' today' : ''}" style="grid-column:${i + 1}">${DOW[dow(d)].slice(0, 2)}<b>${+d.slice(8)}</b></div>`;
  });

  let rows = '', lastModel = null;
  for (const car of cars) {
    if (c.model === 'All' && car.model !== lastModel) {
      rows += `<div class="cal-group">${esc(car.model)}</div>`;
      lastModel = car.model;
    }
    const freeNow = car.status === 'Active' && !currentBooking(car.id, today);
    let cells = '';
    dates.forEach((d, i) => {
      const we = dow(d) === 0 || dow(d) === 6;
      cells += `<div class="cal-cell${we ? ' we' : ''}${d === today ? ' today' : ''}" style="grid-column:${i + 1}" data-action="cal-new" data-car="${esc(car.id)}" data-date="${d}"></div>`;
    });
    for (const b of bookingsOf(car.id)) {
      if (b.end_date < c.start || b.start_date > end) continue;
      const s = maxISO(b.start_date, c.start), e = minISO(b.end_date, end);
      const col = daysBetween(c.start, s) + 1, span = daysBetween(s, e) + 1;
      const tip = `${b.client}\n${fmt(b.start_date)} - ${fmt(b.end_date)} (${plural(daysBetween(b.start_date, b.end_date) + 1, 'day')})\n${b.purpose} · ${b.status}${b.notes ? '\n' + b.notes : ''}`;
      cells += `<div class="cal-bar${b.start_date < c.start ? ' cl' : ''}${b.end_date > end ? ' cr' : ''}${b.status === 'Tentative' ? ' tentative' : ''}" style="grid-column:${col}/span ${span};background:${PURPOSE_BG[b.purpose] || '#E7E6E6'}" title="${esc(tip)}" data-action="edit-booking" data-id="${b.id}">
        <span class="t">${esc(b.client)}</span>${span >= 3 ? `<span class="s">${fmtShort(b.start_date)}–${fmtShort(b.end_date)}</span>` : ''}</div>`;
    }
    rows += `<div class="cal-car${freeNow ? ' free' : ''}"><div class="car-id">${esc(car.id)}</div><div class="car-sub">${esc(car.colour || '')}${car.status !== 'Active' ? ' · ' + esc(car.status) : ''}</div></div><div class="cal-track">${cells}</div>`;
  }

  $('#view').innerHTML = `
  <div class="card">
    <div class="cal-toolbar">
      <button class="icon-btn" data-action="cal-move" data-d="-7" title="Previous week">${ICON.left}</button>
      <button class="btn sm" data-action="cal-today">Today</button>
      <button class="icon-btn" data-action="cal-move" data-d="7" title="Next week">${ICON.right}</button>
      <span class="range">${fmt(c.start)} – ${fmt(end)}</span>
      <input type="date" id="c-jump" value="${c.start}" style="width:auto" title="Jump to date">
      <span class="spacer"></span>
      <select id="c-model" style="width:auto">${modelOptions(c.model)}</select>
      <select id="c-weeks" style="width:auto">${[2, 4, 6, 8, 12].map(w => `<option value="${w}"${w === c.weeks ? ' selected' : ''}>${w} weeks</option>`).join('')}</select>
      <label class="row small" style="gap:6px"><input type="checkbox" id="c-inactive" ${c.inactive ? 'checked' : ''}> Long-term &amp; unregistered${!c.inactive && hidden > 0 ? ` (${hidden})` : ''}</label>
      <button class="btn sm primary" data-action="new-booking">${ICON.plus}New booking</button>
    </div>
    <div class="legend">${PURPOSES.map(([n, col]) => `<span class="purpose"><i style="background:${col}"></i>${esc(n)}</span>`).join('')}<span class="purpose"><i style="background:repeating-linear-gradient(135deg,#bbb 0 3px,#fff 3px 6px)"></i>Tentative</span><span class="muted">· Click an empty day to book, a bar to edit.</span></div>
    <div class="cal-scroll"><div class="cal" style="--days:${days}">
      <div class="cal-corner">Car</div><div class="cal-head">${head}</div>
      ${rows || '<div class="empty" style="grid-column:1/-1">No cars to show.</div>'}
    </div></div>
  </div>`;
  const save = () => { store.set('cal', { weeks: c.weeks, model: c.model, inactive: c.inactive }); renderCalendar(); };
  $('#c-model').addEventListener('change', e => { c.model = e.target.value; save(); });
  $('#c-weeks').addEventListener('change', e => { c.weeks = +e.target.value; save(); });
  $('#c-inactive').addEventListener('change', e => { c.inactive = e.target.checked; save(); });
  $('#c-jump').addEventListener('change', e => { if (isISO(e.target.value)) { c.start = mondayOf(e.target.value); renderCalendar(); } });
  // keep "today" in view on first paint
  const sc = $('.cal-scroll');
  const ti = daysBetween(c.start, today);
  if (sc && ti > 7 && ti < days) sc.scrollLeft = (ti - 3) * 34;
}

// ------------------------------------------------------------------ BOOKINGS LIST
function filteredBookings() {
  const L = S.list, today = todayISO(), q = L.q.trim().toLowerCase();
  let rows = S.bookings.filter(b => {
    if (!L.cancelled && b.status === 'Cancelled') return false;
    if (L.period === 'current' && b.end_date < today) return false;
    if (L.period === 'past' && b.end_date >= today) return false;
    if (L.purpose !== 'All' && b.purpose !== L.purpose) return false;
    const car = S.carMap.get(b.car_id);
    if (L.model !== 'All' && (!car || car.model !== L.model)) return false;
    if (q && ![b.car_id, b.client, b.notes, b.booked_by, car && car.model].some(v => (v || '').toLowerCase().includes(q))) return false;
    return true;
  });
  if (L.period !== 'current') rows = rows.slice().reverse();
  return rows;
}

function renderBookings() {
  const L = S.list;
  $('#view').innerHTML = `
  <div class="page-head"><div><h1>Bookings</h1><p>One row per reservation. Cancel instead of deleting, so the history stays.</p></div>
    <div class="row"><button class="btn" data-action="export-bookings">${ICON.xls}Excel</button><button class="btn primary" data-action="new-booking">${ICON.plus}New booking</button></div></div>
  <div class="card">
    <div class="card-head" style="justify-content:flex-start">
      <input type="search" id="l-q" placeholder="Search car, client, notes…" value="${esc(L.q)}" style="max-width:260px">
      <select id="l-period" style="width:auto">${[['current', 'Current & upcoming'], ['past', 'Past'], ['all', 'All dates']].map(([v, t]) => `<option value="${v}"${L.period === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
      <select id="l-model" style="width:auto">${modelOptions(L.model)}</select>
      <select id="l-purpose" style="width:auto"><option value="All">All purposes</option>${opts(PURPOSES.map(p => p[0]), L.purpose)}</select>
      <label class="row small" style="gap:6px"><input type="checkbox" id="l-cancelled" ${L.cancelled ? 'checked' : ''}> Show cancelled</label>
      <span class="spacer"></span><span class="muted small" id="l-count"></span>
    </div>
    <div id="l-rows"></div>
  </div>`;
  const save = () => { store.set('list', { period: L.period, model: L.model, purpose: L.purpose, cancelled: L.cancelled }); renderBookingRows(); };
  $('#l-q').addEventListener('input', debounce(e => { L.q = e.target.value; renderBookingRows(); }, 150));
  $('#l-period').addEventListener('change', e => { L.period = e.target.value; save(); });
  $('#l-model').addEventListener('change', e => { L.model = e.target.value; save(); });
  $('#l-purpose').addEventListener('change', e => { L.purpose = e.target.value; save(); });
  $('#l-cancelled').addEventListener('change', e => { L.cancelled = e.target.checked; save(); });
  renderBookingRows();
}

function renderBookingRows() {
  const rows = filteredBookings(), today = todayISO();
  $('#l-count').textContent = plural(rows.length, 'booking');
  $('#l-rows').innerHTML = rows.length ? `<div class="table-wrap"><table>
    <thead><tr><th>Car</th><th>Dates</th><th>Days</th><th>Driver / client</th><th>Purpose</th><th>Status</th><th class="hide-sm">Booked by</th></tr></thead>
    <tbody>${rows.map(b => {
      const car = S.carMap.get(b.car_id);
      const now = b.status !== 'Cancelled' && b.start_date <= today && b.end_date >= today;
      return `<tr class="clickable${b.status === 'Cancelled' ? ' cancelled' : ''}" data-action="edit-booking" data-id="${b.id}">
        <td><div class="car-id">${esc(b.car_id)}</div><div class="car-sub">${esc(car ? car.model : '')}</div></td>
        <td class="nowrap">${fmt(b.start_date)} – ${fmt(b.end_date)}${now ? ' <span class="badge blue">now</span>' : ''}</td>
        <td>${daysBetween(b.start_date, b.end_date) + 1}</td>
        <td>${esc(b.client)}${b.notes && b.notes.indexOf('Imported') !== 0 ? `<div class="car-sub" style="white-space:normal">${esc(b.notes)}</div>` : ''}</td>
        <td>${purposeTag(b.purpose)}</td><td>${statusBadge(b.status)}</td>
        <td class="hide-sm small muted">${esc(b.booked_by || '')}</td></tr>`;
    }).join('')}</tbody></table></div>` : '<div class="empty">No bookings match these filters.</div>';
}

// ------------------------------------------------------------------ FLEET
function renderFleet() {
  const F = S.fleet;
  $('#view').innerHTML = `
  <div class="page-head"><div><h1>Fleet</h1><p>Only cars with status <b>Active</b> are offered in Find a car.</p></div>
    <div class="row"><button class="btn" data-action="export-fleet">${ICON.xls}Excel</button><button class="btn primary" data-action="new-car">${ICON.plus}Add car</button></div></div>
  <div class="card">
    <div class="card-head" style="justify-content:flex-start">
      <input type="search" id="fl-q" placeholder="Search plate, VIN, holder…" value="${esc(F.q)}" style="max-width:260px">
      <select id="fl-status" style="width:auto"><option value="All">All statuses</option>${opts(CAR_STATUSES, F.status)}</select>
      <span class="spacer"></span><span class="muted small" id="fl-count"></span>
    </div>
    <div id="fl-rows"></div>
  </div>`;
  $('#fl-q').addEventListener('input', debounce(e => { F.q = e.target.value; renderFleetRows(); }, 150));
  $('#fl-status').addEventListener('change', e => { F.status = e.target.value; store.set('fleet', { status: F.status }); renderFleetRows(); });
  renderFleetRows();
}

function renderFleetRows() {
  const F = S.fleet, q = F.q.trim().toLowerCase(), today = todayISO();
  const cars = S.cars.filter(c => (F.status === 'All' || c.status === F.status) &&
    (!q || [c.id, c.model, c.plate, c.vin, c.holder, c.notes, c.colour].some(v => (v || '').toLowerCase().includes(q))));
  $('#fl-count').textContent = plural(cars.length, 'car');
  $('#fl-rows').innerHTML = cars.length ? `<div class="table-wrap"><table>
    <thead><tr><th>Car ID</th><th>Model</th><th class="hide-sm">Trim / colour</th><th class="hide-sm">Plate / VIN</th><th>Status</th><th>Today</th><th class="hide-sm">Next free day</th></tr></thead>
    <tbody>${cars.map(c => {
      const now = currentBooking(c.id, today);
      const nextFree = c.status === 'Active' ? earliestFree(c.id, today, 1) : null;
      return `<tr class="clickable" data-action="edit-car" data-id="${esc(c.id)}">
        <td class="car-id">${esc(c.id)}</td><td>${esc(c.model)}</td>
        <td class="hide-sm">${esc(c.trim_level || '')}<div class="car-sub">${esc(c.colour || '')}</div></td>
        <td class="hide-sm small">${esc(c.plate || '')}<div class="car-sub">${esc(c.vin || '')}</div></td>
        <td>${carStatusBadge(c.status)}${c.holder ? `<div class="car-sub">${esc(c.holder)}</div>` : ''}</td>
        <td class="small">${now ? `${esc(now.client)}<div class="car-sub">until ${fmt(now.end_date)}</div>` : c.status === 'Active' ? '<span class="badge green">Available</span>' : '<span class="muted">–</span>'}</td>
        <td class="hide-sm nowrap">${nextFree ? (nextFree === today ? 'today' : fmt(nextFree)) : '<span class="muted">–</span>'}</td></tr>`;
    }).join('')}</tbody></table></div>` : '<div class="empty">No cars match.</div>';
}

// ------------------------------------------------------------------ TEAM
function renderTeam() {
  const admin = S.isAdmin;
  $('#view').innerHTML = `
  <div class="page-head"><div><h1>Team &amp; settings</h1><p>${admin ? 'You are an admin: you can invite people and manage models.' : 'Only admins can change these settings.'}</p></div></div>
  <div class="card">
    <div class="card-head"><h2>People with access</h2><span class="sub">${plural(S.members.length, 'person')}</span></div>
    <div class="table-wrap"><table><thead><tr><th>Email</th><th>Role</th><th></th></tr></thead><tbody>
    ${S.members.map(m => `<tr><td>${esc(m.email)}${m.email === S.me ? ' <span class="badge blue">you</span>' : ''}</td>
      <td>${admin && m.email !== S.me ? `<select data-role="${esc(m.email)}" style="width:auto">${opts(['member', 'admin'], m.role)}</select>` : esc(m.role)}</td>
      <td style="text-align:right">${admin && m.email !== S.me ? `<button class="btn sm danger" data-action="remove-member" data-email="${esc(m.email)}">Remove</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>
    ${admin ? `<div class="card-body" style="border-top:1px solid var(--line)">
      <form id="add-member" class="row">
        <input type="email" name="email" placeholder="colleague@company.com" required style="max-width:300px">
        <select name="role" style="width:auto"><option>member</option><option>admin</option></select>
        <button class="btn primary" type="submit">Add person</button>
      </form>
      <div class="alert blue" style="margin-top:12px"><b>How to invite someone</b><br>
        1. Add their email above.<br>
        2. Create their login in the <a href="${esc(CFG.dashboardUsersUrl || '#')}" target="_blank" rel="noopener">Supabase dashboard → Authentication → Users</a> → <i>Add user</i> → <i>Create new user</i>, with the same email, a temporary password, and <i>Auto Confirm User</i> ticked.<br>
        3. Send them this page's link and the temporary password. They can change it from the menu at the top right.</div>
    </div>` : ''}
  </div>
  <div class="card">
    <div class="card-head"><h2>Models</h2><span class="sub">Used in drop-downs everywhere</span></div>
    <div class="card-body">
      <div class="row">${S.models.map(m => `<span class="badge" style="font-size:13px;padding:4px 10px">${esc(m.name)}${admin ? ` <a href="#" data-action="delete-model" data-name="${esc(m.name)}" title="Remove model" style="text-decoration:none;margin-left:4px">×</a>` : ''}</span>`).join('')}</div>
      ${admin ? `<form id="add-model" class="row" style="margin-top:12px"><input type="text" name="name" placeholder="New model, e.g. Seal 6 DM-i" required style="max-width:300px"><button class="btn" type="submit">Add model</button></form>` : ''}
    </div>
  </div>`;
  if (!admin) return;
  $('#add-member').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const email = String(f.get('email')).trim().toLowerCase();
    if (S.members.some(m => m.email === email)) return toast('That email is already on the list.', true);
    try { await api.addMember(email, f.get('role')); toast(`${email} added`); await reload(false); } catch (err) { toast(friendlyError(err), true); }
  });
  $('#add-model').addEventListener('submit', async e => {
    e.preventDefault();
    const name = String(new FormData(e.target).get('name')).trim();
    if (!name) return;
    if (S.models.some(m => m.name.toLowerCase() === name.toLowerCase())) return toast('That model already exists.', true);
    try { await api.addModel(name, S.models.length ? Math.max(...S.models.map(m => m.sort)) + 1 : 0); toast(`${name} added`); await reload(false); } catch (err) { toast(friendlyError(err), true); }
  });
  $$('select[data-role]').forEach(sel => sel.addEventListener('change', async e => {
    try { await api.setRole(e.target.dataset.role, e.target.value); toast('Role updated'); await reload(false); } catch (err) { toast(friendlyError(err), true); }
  }));
}

// ------------------------------------------------------------------ modal
function openModal(html, size = '') {
  $('#modal-root').innerHTML = `<div class="modal-back" data-action="modal-backdrop"><div class="modal ${size}" role="dialog" aria-modal="true">${html}</div></div>`;
  document.body.style.overflow = 'hidden';
  const first = $('#modal-root input:not([type=hidden]), #modal-root select');
  if (first && window.matchMedia('(pointer:fine)').matches) first.focus();
}
function closeModal() { $('#modal-root').innerHTML = ''; document.body.style.overflow = ''; }

// ------------------------------------------------------------------ booking form
function openBooking(pref = {}) {
  const existing = pref.id ? S.bookings.find(b => b.id === pref.id) : null;
  const b = existing ? { ...existing } : {
    car_id: pref.car_id || '', start_date: pref.start_date || todayISO(), end_date: pref.end_date || '',
    client: '', purpose: 'Press / Test drive', status: 'Confirmed', booked_by: nameFromEmail(S.me), notes: '',
  };
  if (!b.end_date) b.end_date = addDays(b.start_date, (S.find.days || 1) - 1);
  const carChoices = S.cars.filter(c => c.status !== 'Sold' || c.id === b.car_id);
  const groups = S.models.map(m => {
    const list = carChoices.filter(c => c.model === m.name);
    return list.length ? `<optgroup label="${esc(m.name)}">${list.map(c => `<option value="${esc(c.id)}"${c.id === b.car_id ? ' selected' : ''}>${esc(c.id)} · ${esc(c.colour || '')}${c.status !== 'Active' ? ' (' + esc(c.status) + ')' : ''}</option>`).join('')}</optgroup>` : '';
  }).join('');
  openModal(`
    <div class="modal-head"><h3>${existing ? 'Edit booking' : 'New booking'}</h3><button class="close-x" data-action="close-modal" aria-label="Close">×</button></div>
    <form id="bk-form" novalidate>
    <div class="modal-body">
      <div class="form-grid">
        <label class="field req full"><span>Car</span><select id="bk-car"><option value="">Choose a car…</option>${groups}</select></label>
        <label class="field req"><span>Start date</span><input type="date" id="bk-start" value="${b.start_date}"></label>
        <label class="field req"><span>End date (car comes back)</span><input type="date" id="bk-end" value="${b.end_date}"></label>
        <label class="field"><span>Number of days</span><input type="number" id="bk-days" min="1" max="730" value="${daysBetween(b.start_date, b.end_date) + 1}"></label>
        <label class="field"><span>Status</span><select id="bk-status">${opts(BOOKING_STATUSES, b.status)}</select></label>
        <label class="field req full"><span>Driver / client</span><input type="text" id="bk-client" value="${esc(b.client)}" placeholder="e.g. Andrei Pana - Autocritica" maxlength="200"></label>
        <label class="field"><span>Purpose</span><select id="bk-purpose">${opts(PURPOSES.map(p => p[0]), b.purpose)}</select></label>
        <label class="field"><span>Booked by</span><input type="text" id="bk-by" value="${esc(b.booked_by || '')}" maxlength="80"></label>
        <label class="field full"><span>Notes</span><textarea id="bk-notes" maxlength="1000" placeholder="Pick-up place, contact, damage…">${esc(b.notes || '')}</textarea></label>
      </div>
      <div class="checks" id="bk-checks"></div>
      ${existing ? `<div class="history"><h4>History</h4><ul id="bk-history"><li>Loading…</li></ul></div>` : ''}
    </div>
    <div class="modal-foot">
      ${existing && b.status !== 'Cancelled' ? '<button type="button" class="btn danger left" data-action="cancel-booking">Cancel booking</button>' : ''}
      <button type="button" class="btn" data-action="close-modal">Close</button>
      <button type="submit" class="btn primary" id="bk-save">${existing ? 'Save changes' : 'Save booking'}</button>
    </div>
    </form>`);

  const el = id => $('#' + id);
  const read = () => ({
    id: existing ? existing.id : undefined,
    car_id: el('bk-car').value, start_date: el('bk-start').value, end_date: el('bk-end').value,
    client: el('bk-client').value.trim(), purpose: el('bk-purpose').value, status: el('bk-status').value,
    booked_by: el('bk-by').value.trim(), notes: el('bk-notes').value.trim(),
  });

  function check() {
    const v = read(), out = [];
    let blocking = false;
    el('bk-end').classList.toggle('invalid', isISO(v.start_date) && isISO(v.end_date) && v.end_date < v.start_date);
    if (!v.car_id || !isISO(v.start_date) || !isISO(v.end_date)) { el('bk-checks').innerHTML = ''; return { blocking: true, v }; }
    if (v.end_date < v.start_date) { el('bk-checks').innerHTML = '<div class="alert red">The end date is before the start date.</div>'; return { blocking: true, v }; }
    const car = S.carMap.get(v.car_id);
    const n = daysBetween(v.start_date, v.end_date) + 1;
    if (v.status !== 'Cancelled') {
      const clash = conflicts(v.car_id, v.start_date, v.end_date, v.id);
      if (clash.length) {
        blocking = true;
        const alt = earliestFree(v.car_id, v.start_date, n, v.id);
        const others = car ? poolCars(car.model).filter(c => c.id !== v.car_id && !conflicts(c.id, v.start_date, v.end_date, v.id).length) : [];
        out.push(`<div class="alert red"><b>${esc(v.car_id)} is already booked on these dates:</b><br>${clash.map(x => `${esc(x.client)} · ${fmt(x.start_date)} – ${fmt(x.end_date)}${x.status === 'Tentative' ? ' (tentative)' : ''}`).join('<br>')}
          <div class="row">
            ${alt ? `<button type="button" class="btn sm" data-action="bk-move" data-from="${alt}" data-n="${n}">Move to ${fmt(alt)} – ${fmt(addDays(alt, n - 1))}</button>` : ''}
            ${others.slice(0, 6).map(c => `<button type="button" class="btn sm" data-action="bk-switch" data-car="${esc(c.id)}">Switch to ${esc(c.id)}${c.colour ? ' (' + esc(c.colour) + ')' : ''}</button>`).join('')}
          </div>
          ${car && !others.length ? `<div class="small" style="margin-top:6px">No other ${esc(car.model)} is free on these dates.</div>` : ''}</div>`);
      } else {
        out.push(`<div class="alert green">${esc(v.car_id)} is free for all ${plural(n, 'day')} (${fmtLong(v.start_date)} – ${fmtLong(v.end_date)}).</div>`);
      }
    }
    if (car && car.status !== 'Active') out.push(`<div class="alert amber">This car's fleet status is <b>${esc(car.status)}</b>${car.holder ? ` (${esc(car.holder)})` : ''}. Double-check it can really be booked.</div>`);
    if (!existing && v.start_date < todayISO()) out.push('<div class="alert amber">The start date is in the past.</div>');
    if (n > 60 && v.purpose !== 'Long-term loan') out.push(`<div class="alert amber">${plural(n, 'day')} is a long booking. Should the purpose be "Long-term loan"?</div>`);
    el('bk-checks').innerHTML = out.join('');
    return { blocking, v };
  }

  el('bk-start').addEventListener('change', () => {
    const s = el('bk-start').value, n = parseInt(el('bk-days').value, 10) || 1;
    if (isISO(s)) el('bk-end').value = addDays(s, n - 1);
    check();
  });
  el('bk-end').addEventListener('change', () => {
    const s = el('bk-start').value, e = el('bk-end').value;
    if (isISO(s) && isISO(e) && e >= s) el('bk-days').value = daysBetween(s, e) + 1;
    check();
  });
  el('bk-days').addEventListener('input', () => {
    const s = el('bk-start').value, n = parseInt(el('bk-days').value, 10);
    if (isISO(s) && n >= 1) el('bk-end').value = addDays(s, n - 1);
    check();
  });
  ['bk-car', 'bk-status', 'bk-purpose'].forEach(id => el(id).addEventListener('change', check));
  $('#bk-form').addEventListener('click', e => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    if (a.dataset.action === 'bk-move') {
      el('bk-start').value = a.dataset.from;
      el('bk-end').value = addDays(a.dataset.from, +a.dataset.n - 1);
      check();
    } else if (a.dataset.action === 'bk-switch') {
      el('bk-car').value = a.dataset.car;
      check();
    } else if (a.dataset.action === 'cancel-booking') {
      e.stopPropagation();
      if (!confirm(`Cancel the booking for ${existing.client} (${fmt(existing.start_date)} – ${fmt(existing.end_date)})? The car becomes free on those days.`)) return;
      saveBooking({ ...read(), status: 'Cancelled' }, 'Booking cancelled');
    }
  });
  $('#bk-form').addEventListener('submit', e => {
    e.preventDefault();
    const { blocking, v } = check();
    const missing = [['bk-car', v.car_id], ['bk-start', isISO(v.start_date)], ['bk-end', isISO(v.end_date)], ['bk-client', v.client]].filter(([, ok]) => !ok);
    missing.forEach(([id]) => el(id).classList.add('invalid'));
    if (missing.length) return toast('Please fill in the car, the dates and the driver / client.', true);
    if (blocking) return toast('This car is not free on those dates. Use one of the suggestions.', true);
    saveBooking(v, existing ? 'Booking updated' : `Booked ${v.car_id}: ${fmt(v.start_date)} – ${fmt(v.end_date)}`);
  });
  $$('#bk-form input, #bk-form select').forEach(i => i.addEventListener('input', () => i.classList.remove('invalid')));
  check();

  if (existing) {
    api.history(existing.id).then(rows => {
      const h = $('#bk-history');
      if (!h) return;
      h.innerHTML = rows.length ? rows.map(r => {
        const d = new Date(r.changed_at);
        const what = r.action === 'insert' ? 'created' : r.data && r.data.status === 'Cancelled' ? 'cancelled' : 'changed';
        return `<li>${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())} · ${what} by ${esc(r.changed_by || 'import')}</li>`;
      }).join('') : `<li>Imported from the old Excel calendar${existing.created_by && existing.created_by !== 'import' ? ` · created by ${esc(existing.created_by)}` : ''}.</li>`;
    }).catch(() => { const h = $('#bk-history'); if (h) h.innerHTML = '<li>History not available.</li>'; });
  }
}

async function saveBooking(v, msg) {
  const btn = $('#bk-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    await api.saveBooking(v);
    closeModal();
    toast(msg);
    await reload(false);
  } catch (err) {
    toast(friendlyError(err), true);
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    reload(true);
  }
}

// ------------------------------------------------------------------ car form
function openCar(id) {
  const existing = id ? S.carMap.get(id) : null;
  const c = existing ? { ...existing } : { id: '', model: S.models[0] ? S.models[0].name : '', status: 'Active' };
  const nBookings = existing ? S.bookings.filter(b => b.car_id === existing.id).length : 0;
  openModal(`
    <div class="modal-head"><h3>${existing ? 'Edit car ' + esc(c.id) : 'Add car'}</h3><button class="close-x" data-action="close-modal" aria-label="Close">×</button></div>
    <form id="car-form" novalidate>
    <div class="modal-body"><div class="form-grid">
      <label class="field req"><span>Car ID (plate)</span><input type="text" id="car-id" value="${esc(c.id)}" ${existing ? 'readonly' : ''} placeholder="e.g. B123BYD" maxlength="20" style="text-transform:uppercase"></label>
      <label class="field req"><span>Model</span><select id="car-model">${modelOptions(c.model, false)}</select></label>
      <label class="field"><span>Trim</span><input type="text" id="car-trim" value="${esc(c.trim_level || '')}"></label>
      <label class="field"><span>Colour</span><input type="text" id="car-colour" value="${esc(c.colour || '')}"></label>
      <label class="field"><span>Plate (full)</span><input type="text" id="car-plate" value="${esc(c.plate || '')}"></label>
      <label class="field"><span>VIN</span><input type="text" id="car-vin" value="${esc(c.vin || '')}" maxlength="20"></label>
      <label class="field"><span>Status</span><select id="car-status">${opts(CAR_STATUSES, c.status)}</select></label>
      <label class="field"><span>Main user / holder</span><input type="text" id="car-holder" value="${esc(c.holder || '')}"></label>
      <label class="field full"><span>Notes</span><textarea id="car-notes">${esc(c.notes || '')}</textarea></label>
    </div>
    ${existing ? `<p class="small muted" style="margin:12px 0 0">The Car ID can't be changed here because ${plural(nBookings, 'booking')} use it.</p>` : '<p class="small muted" style="margin:12px 0 0">Car ID: the plate without spaces. For a car with no plates yet, use e.g. VIN-123456 (last 6 of the VIN).</p>'}
    </div>
    <div class="modal-foot">
      ${existing && S.isAdmin && !nBookings ? '<button type="button" class="btn danger left" data-action="delete-car">Delete car</button>' : ''}
      <button type="button" class="btn" data-action="close-modal">Close</button>
      <button type="submit" class="btn primary">${existing ? 'Save changes' : 'Add car'}</button>
    </div></form>`);
  $('#car-form').addEventListener('submit', async e => {
    e.preventDefault();
    const v = {
      id: $('#car-id').value.trim().toUpperCase().replace(/\s+/g, ''), model: $('#car-model').value,
      trim_level: $('#car-trim').value.trim(), colour: $('#car-colour').value.trim(), plate: $('#car-plate').value.trim(),
      vin: $('#car-vin').value.trim().toUpperCase(), status: $('#car-status').value, holder: $('#car-holder').value.trim(), notes: $('#car-notes').value.trim(),
    };
    if (!v.id) { $('#car-id').classList.add('invalid'); return toast('The Car ID is required.', true); }
    if (!existing && S.carMap.has(v.id)) { $('#car-id').classList.add('invalid'); return toast(`${v.id} already exists.`, true); }
    try { await api.saveCar(v, !existing); closeModal(); toast(existing ? 'Car updated' : `${v.id} added`); await reload(false); } catch (err) { toast(friendlyError(err), true); }
  });
  $('#car-form').addEventListener('click', async e => {
    if (!e.target.closest('[data-action="delete-car"]')) return;
    if (!confirm(`Delete ${existing.id} permanently?`)) return;
    try { await api.deleteCar(existing.id); closeModal(); toast('Car deleted'); await reload(false); } catch (err) { toast(friendlyError(err), true); }
  });
}

function openPassword() {
  openModal(`
    <div class="modal-head"><h3>Change password</h3><button class="close-x" data-action="close-modal" aria-label="Close">×</button></div>
    <form id="pw-form"><div class="modal-body"><div class="form-grid">
      <label class="field full"><span>New password (min. 8 characters)</span><input type="password" id="pw1" minlength="8" autocomplete="new-password" required></label>
      <label class="field full"><span>Repeat new password</span><input type="password" id="pw2" minlength="8" autocomplete="new-password" required></label>
    </div></div>
    <div class="modal-foot"><button type="button" class="btn" data-action="close-modal">Close</button><button class="btn primary" type="submit">Change password</button></div></form>`, 'sm');
  $('#pw-form').addEventListener('submit', async e => {
    e.preventDefault();
    const a = $('#pw1').value, b = $('#pw2').value;
    if (a.length < 8) return toast('Use at least 8 characters.', true);
    if (a !== b) return toast('The two passwords are different.', true);
    try { await api.changePassword(a); closeModal(); toast('Password changed'); } catch (err) { toast(friendlyError(err), true); }
  });
}

// ------------------------------------------------------------------ exports
let xlsxLoading = null;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve();
  xlsxLoading = xlsxLoading || new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = res;
    s.onerror = () => { xlsxLoading = null; rej(new Error('Could not load the Excel export. Check your connection.')); };
    document.head.appendChild(s);
  });
  return xlsxLoading;
}
async function exportXlsx(filename, sheets) {
  try {
    await loadXLSX();
    const wb = window.XLSX.utils.book_new();
    for (const { name, rows } of sheets) {
      const ws = window.XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: 'No rows' }]);
      const keys = Object.keys(rows[0] || { Info: '' });
      ws['!cols'] = keys.map(k => ({ wch: Math.min(50, Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length)) + 2) }));
      window.XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    }
    window.XLSX.writeFile(wb, filename);
  } catch (e) { toast(friendlyError(e), true); }
}
const stamp = () => todayISO().replace(/-/g, '');
const findRows = (model, n, start) => findResults(model, n, start).map(r => ({
  'Car ID': r.car.id, Model: r.car.model, Trim: r.car.trim_level || '', Colour: r.car.colour || '',
  'Free from': fmt(r.from), 'Return by': fmt(r.to), 'Free until': r.freeUntil ? fmt(r.freeUntil) : 'no later booking', 'Today': whereText(r.car.id) || 'Available',
}));
const bookingRow = b => {
  const car = S.carMap.get(b.car_id) || {};
  return {
    'Car ID': b.car_id, Model: car.model || '', Colour: car.colour || '', Start: fmt(b.start_date), End: fmt(b.end_date), Days: daysBetween(b.start_date, b.end_date) + 1,
    'Driver / client': b.client, Purpose: b.purpose, Status: b.status, 'Booked by': b.booked_by || '', Notes: b.notes || '',
  };
};

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied. Paste it in WeCom chat or email.'); return; } catch { /* fall back below */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  if (ok) return toast('Copied. Paste it in WeCom chat or email.');
  openModal(`<div class="modal-head"><h3>Copy this text</h3><button class="close-x" data-action="close-modal">×</button></div>
    <div class="modal-body"><textarea style="min-height:220px" readonly>${esc(text)}</textarea></div>`, 'sm');
  $('#modal-root textarea').select();
}

// ------------------------------------------------------------------ actions (event delegation)
const actions = {
  tab(el) { S.view = el.dataset.tab; store.set('view', S.view); closeMenu(); renderView(); window.scrollTo(0, 0); },
  'user-menu'(el, e) {
    e.stopPropagation();
    if ($('.menu')) return closeMenu();
    const m = document.createElement('div');
    m.className = 'menu';
    m.innerHTML = `<div class="menu-who">${esc(S.me)}${S.isAdmin ? ' · admin' : ''}</div><button data-action="change-password">Change password</button><button data-action="refresh">Refresh data</button><button data-action="sign-out">Sign out</button>`;
    document.body.appendChild(m);
  },
  'change-password'() { closeMenu(); openPassword(); },
  refresh() { closeMenu(); reload(false).then(() => toast('Up to date')); },
  async 'sign-out'() { closeMenu(); await api.signOut(); S.me = ''; renderLogin(); },
  'reload-page'() { location.reload(); },
  'days-step'(el) { const n = Math.min(365, Math.max(1, S.find.days + +el.dataset.d)); S.find.days = n; $('#f-days').value = n; saveFind(); },
  'days-set'(el) { S.find.days = +el.dataset.d; $('#f-days').value = S.find.days; saveFind(); },
  'find-today'() { S.find.start = todayISO(); $('#f-start').value = S.find.start; saveFind(); },
  'pick-model'(el) { S.find.model = el.dataset.model; $('#f-model').value = S.find.model; saveFind(); $('#find-results').scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  'book-from-find'(el) { openBooking({ car_id: el.dataset.car, start_date: el.dataset.from, end_date: addDays(el.dataset.from, S.find.days - 1) }); },
  'copy-text'() { copyText(findText()); },
  'export-find'() { const f = S.find; exportXlsx(`Availability_${(f.model === 'All' ? 'All_models' : f.model).replace(/\W+/g, '_')}_${f.days}d_${stamp()}.xlsx`, [{ name: 'Availability', rows: findRows(f.model, f.days, f.start) }]); },
  'export-overview'() {
    const f = S.find;
    const ov = modelOverview(f.days, f.start).map(o => ({ Model: o.model, 'In pool': o.pool, 'Free today': o.freeToday, 'Earliest start': o.earliest ? fmt(o.earliest) : 'no car in pool', 'Return by': o.to ? fmt(o.to) : '', 'Best car': o.bestCar || '', 'Other cars free then': o.earliest ? o.others : '' }));
    exportXlsx(`Availability_by_model_${f.days}d_${stamp()}.xlsx`, [{ name: 'Overview', rows: ov }, ...S.models.map(m => ({ name: m.name.replace(/[\\/?*[\]:]/g, '-'), rows: findRows(m.name, f.days, f.start) }))]);
  },
  'export-bookings'() { exportXlsx(`Bookings_${stamp()}.xlsx`, [{ name: 'Bookings', rows: filteredBookings().map(bookingRow) }]); },
  'export-fleet'() {
    exportXlsx(`Fleet_${stamp()}.xlsx`, [{ name: 'Fleet', rows: S.cars.map(c => ({ 'Car ID': c.id, Model: c.model, Trim: c.trim_level || '', Colour: c.colour || '', Plate: c.plate || '', VIN: c.vin || '', Status: c.status, Holder: c.holder || '', Today: whereText(c.id) || '', Notes: c.notes || '' })) }]);
  },
  'cal-move'(el) { S.cal.start = addDays(S.cal.start, +el.dataset.d); renderCalendar(); },
  'cal-today'() { S.cal.start = mondayOf(todayISO()); renderCalendar(); },
  'cal-new'(el) { openBooking({ car_id: el.dataset.car, start_date: el.dataset.date, end_date: addDays(el.dataset.date, Math.max(1, S.find.days) - 1) }); },
  'new-booking'() { openBooking({}); },
  'edit-booking'(el) { openBooking({ id: +el.dataset.id }); },
  'new-car'() { openCar(null); },
  'edit-car'(el) { openCar(el.dataset.id); },
  async 'remove-member'(el) {
    if (!confirm(`Remove ${el.dataset.email}? They will lose access immediately.`)) return;
    try { await api.removeMember(el.dataset.email); toast('Removed'); await reload(false); } catch (err) { toast(friendlyError(err), true); }
  },
  async 'delete-model'(el, e) {
    e.preventDefault();
    const name = el.dataset.name;
    if (S.cars.some(c => c.model === name)) return toast(`${name} is still used by cars, so it can't be removed.`, true);
    if (!confirm(`Remove the model ${name}?`)) return;
    try { await api.deleteModel(name); await reload(false); } catch (err) { toast(friendlyError(err), true); }
  },
  'close-modal'() { closeModal(); },
  // a stray click outside must never throw away a half-filled form
  'modal-backdrop'(el, e) { if (e.target === el && !el.querySelector('form')) closeModal(); },
};
function closeMenu() { const m = $('.menu'); if (m) m.remove(); }

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) { closeMenu(); return; }
  if (el.closest('#bk-form') && el.dataset.action.startsWith('bk-')) return; // handled by the form
  if (el.dataset.action === 'cancel-booking') return;
  const fn = actions[el.dataset.action];
  if (fn) fn(el, e);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeMenu(); } });
window.addEventListener('focus', debounce(() => { if (S.me && $('#view')) reload(true); }, 1000));

// ------------------------------------------------------------------ boot
(async function boot() {
  if (!DEMO && !window.supabase) {
    $('#app').innerHTML = '<div class="boot">Could not load the app libraries. Check your internet connection and reload.</div>';
    return;
  }
  api.onSignedOut(() => { if (S.me) { S.me = ''; renderLogin(); } });
  try {
    const s = await api.session();
    if (s && s.user) await enter(s.user.email); else renderLogin();
  } catch (e) {
    renderLogin(friendlyError(e));
  }
})();

// exposed for tests
window.__fleet = { earliestFree, conflicts, findResults, modelOverview, addDays, daysBetween, mondayOf, S };
})();

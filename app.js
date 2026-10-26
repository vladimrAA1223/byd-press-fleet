(() => {
'use strict';

const CFG = window.FLEET_CONFIG || {};
const DEMO = new URLSearchParams(location.search).has('demo');

// ------------------------------------------------------------------ constants
const PURPOSES = ['Press / Test drive', 'Event', 'Partner / Corporate', 'Training', 'Service / Registration',
  'Damaged / Out of service', 'Long-term loan', 'Bulgaria', 'Other'];
// Gantt colours follow the original Excel: yellow = booked, grey = company car / long-term, red = damaged
const barColour = b => b.purpose === 'Long-term loan' ? 'grey' : b.purpose === 'Damaged / Out of service' ? 'red' : 'yellow';
const CAR_STATUSES = ['Active', 'Long-term loan', 'Not registered', 'In service', 'Sold'];
const BOOKING_STATUSES = ['Confirmed', 'Tentative', 'Cancelled'];
const BOOKING_FIELDS = ['car_id', 'start_date', 'end_date', 'client', 'purpose', 'status', 'booked_by', 'notes'];
// a car's id is its VIN (never changes); the plate is an attribute with its own history
const CAR_FIELDS = ['id', 'model', 'trim_level', 'colour', 'vin', 'status', 'holder', 'notes'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ICON = {
  car: '<svg viewBox="0 0 24 24" fill="#1F3864"><path d="M3 15l2.2-5.4A2.5 2.5 0 0 1 7.5 8h9a2.5 2.5 0 0 1 2.3 1.6L21 15v3.5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1V18h-11v.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4L3 8l4 4"/><path d="M3 8h14"/><path d="M17 20l4-4-4-4"/><path d="M21 16H7"/></svg>',
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
const nDays = b => daysBetween(b.start_date, b.end_date) + 1;

// ------------------------------------------------------------------ helpers
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k] === '' ? null : o[k]]));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const nameFromEmail = e => (e || '').split('@')[0].split(/[._-]+/).filter(Boolean).map(p => p[0].toUpperCase() + p.slice(1)).join(' ');
const opts = (list, sel) => list.map(v => `<option${v === sel ? ' selected' : ''}>${esc(v)}</option>`).join('');
const store = {
  get(k, d) { try { const v = localStorage.getItem('fleet.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('fleet.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

function toast(msg, err = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), err ? 6000 : 3200);
}

function friendlyError(e) {
  const code = e && (e.code || e.status);
  const msg = (e && e.message) || String(e);
  if (code === '23P01' || /no_overlap/.test(msg)) return 'That car is already booked on some of those days (someone may have just booked it). Pick other dates or another car.';
  if (code === '23514' || /end_after_start/.test(msg)) return 'The end date must be on or after the start date.';
  if (code === '23505') return 'That ID already exists.';
  if (code === '23503') return 'This item is still used elsewhere (for example a car with bookings).';
  if (code === 'P0002') return 'That booking no longer exists. The page will refresh.';
  if (code === '42501' || /row-level security/.test(msg)) return 'You do not have permission to do that.';
  if (/Invalid login credentials/i.test(msg)) return 'Wrong email or password.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'No connection to the server. Check your internet and try again.';
  return msg;
}

// ------------------------------------------------------------------ state
const S = {
  me: '', isAdmin: false,
  cars: [], bookings: [], models: [], members: [], plates: [],
  carMap: new Map(), byCar: new Map(),
  view: store.get('view2', 'calendar'),
  cal: { start: '', weeks: 6, model: 'All', q: '', mode: 'timeline', company: true, unreg: false, details: true, ...store.get('cal2', {}) },
  list: { period: 'current', purpose: 'All', cancelled: false, ...store.get('list2', {}) },
  quick: { model: 'All', days: 5, start: '', client: '', purpose: 'Press / Test drive', ...store.get('quick', {}) },
  fleet: { q: '', status: 'All', ...store.get('fleet2', {}) },
};
S.cal.start = ''; S.cal.q = ''; S.quick.start = ''; S.quick.client = ''; S.fleet.q = '';
const saveCal = () => store.set('cal2', { weeks: S.cal.weeks, model: S.cal.model, mode: S.cal.mode, company: S.cal.company, unreg: S.cal.unreg, details: S.cal.details });

function setData(d) {
  const sortOf = Object.fromEntries(d.models.map(m => [m.name, m.sort]));
  const st = s => CAR_STATUSES.indexOf(s);
  S.models = d.models.slice().sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  S.cars = d.cars.slice().sort((a, b) => (sortOf[a.model] ?? 999) - (sortOf[b.model] ?? 999) || st(a.status) - st(b.status) || (a.plate || '~' + a.id).localeCompare(b.plate || '~' + b.id));
  S.bookings = d.bookings.slice().sort((a, b) => a.start_date.localeCompare(b.start_date) || a.car_id.localeCompare(b.car_id));
  S.members = d.members.slice().sort((a, b) => a.email.localeCompare(b.email));
  S.plates = (d.plates || []).slice().sort((a, b) => (b.valid_from || '').localeCompare(a.valid_from || '') || b.id - a.id);
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
const bookingById = id => S.bookings.find(b => b.id === id);
const conflicts = (carId, s, e, ...ignore) => bookingsOf(carId).filter(b => !ignore.includes(b.id) && b.start_date <= e && b.end_date >= s);
const currentBooking = (carId, day = todayISO()) => bookingsOf(carId).find(b => b.start_date <= day && b.end_date >= day);
const nextBookingAfter = (carId, day) => bookingsOf(carId).find(b => b.start_date > day);
const isPool = c => c.status === 'Active' || c.status === 'In service';
// how a car is named on screen: its current plate (cars without plates show the end of the VIN)
const label = c => (c ? c.plate || `No plate …${c.id.slice(-6)}` : '?');
const plateOf = id => label(S.carMap.get(id));
const platesOf = id => S.plates.filter(p => p.car_id === id);
const isCompany = c => c.status === 'Long-term loan';

// earliest start >= from where the car is free for n consecutive days
function earliestFree(carId, from, n, ...ignore) {
  let t = from;
  for (let guard = 0; guard < 2000; guard++) {
    const clash = conflicts(carId, t, addDays(t, n - 1), ...ignore);
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

// what can happen if booking b goes to car t: free move, a swap with one booking, or nothing
function swapOption(b, t) {
  const clash = conflicts(t.id, b.start_date, b.end_date, b.id);
  if (!clash.length) return { kind: 'move' };
  if (clash.length === 1) {
    const x = clash[0];
    const xFits = !conflicts(b.car_id, x.start_date, x.end_date, b.id, x.id).length;
    if (xFits) return { kind: 'swap', other: x };
    return { kind: 'busy', other: x, why: `${x.client} would not fit on ${plateOf(b.car_id)}` };
  }
  return { kind: 'busy', why: clash.map(x => x.client).join(', ') };
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
      const [cars, bookings, models, members, plates] = await Promise.all([all('cars', 'id'), all('bookings', 'id'), all('models', 'name'), all('fleet_members', 'email'), all('plate_history', 'id')]);
      return { cars, bookings, models, members, plates };
    },
    async changePlate(car, plate, from, note) { ok(await sb.rpc('change_plate', { p_car: car, p_plate: plate, p_from: from, p_note: note || null })); },
    async swapPlates(a, b, from, note) { ok(await sb.rpc('swap_plates', { p_a: a, p_b: b, p_from: from, p_note: note || null })); },
    async saveBooking(b) {
      const row = pick(b, BOOKING_FIELDS);
      ok(b.id ? await sb.from('bookings').update(row).eq('id', b.id) : await sb.from('bookings').insert(row));
    },
    async swapBookings(a, b) { ok(await sb.rpc('swap_booking_cars', { a, b })); },
    // oldId: the VIN before editing (fixing a VIN typo renames the car; bookings follow)
    async saveCar(c, isNew, oldId) {
      const row = pick(c, CAR_FIELDS);
      if (isNew) {
        ok(await sb.from('cars').insert(row));
        if (c.plate) ok(await sb.rpc('change_plate', { p_car: c.id, p_plate: c.plate, p_from: todayISO(), p_note: 'First plate' }));
      } else ok(await sb.from('cars').update(row).eq('id', oldId || c.id));
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
      for (const table of ['bookings', 'cars', 'models', 'plate_history']) ch.on('postgres_changes', { event: '*', schema: 'public', table }, cb);
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
  const overlap = (rows) => rows.some(x => x.status !== 'Cancelled' && rows.some(y => y !== x && y.status !== 'Cancelled' && y.car_id === x.car_id && y.start_date <= x.end_date && y.end_date >= x.start_date));
  return {
    async session() { return { user: { email: 'demo@example.com' } }; },
    async signIn() {}, async signOut() { location.reload(); }, async changePassword() {}, onSignedOut() {},
    async loadAll() {
      if (!db) {
        const r = await fetch('demo-data.json');
        if (!r.ok) throw new Error('demo-data.json not found');
        db = await r.json();
        db.members = [{ email: 'demo@example.com', role: 'admin' }];
        db.plates = db.plates || [];
      }
      return clone(db);
    },
    async saveBooking(b) {
      const row = { ...pick(b, BOOKING_FIELDS) };
      if (row.end_date < row.start_date) throw err('23514', 'end_after_start');
      const next = db.bookings.map(x => (x.id === b.id ? { ...x, ...row } : x));
      if (!b.id) next.push({ ...row, id: seq + 1 });
      if (overlap(next)) throw err('23P01', 'no_overlap');
      if (!b.id) seq++;
      db.bookings = next;
      log.push({ booking_id: b.id || seq, action: b.id ? 'update' : 'insert', changed_by: 'demo@example.com', changed_at: new Date().toISOString(), data: row });
    },
    async swapBookings(a, b) {
      const A = db.bookings.find(x => x.id === a), B = db.bookings.find(x => x.id === b);
      if (!A || !B) throw err('P0002', 'not found');
      const next = db.bookings.map(x => (x.id === a ? { ...x, car_id: B.car_id } : x.id === b ? { ...x, car_id: A.car_id } : x));
      if (overlap(next)) throw err('23P01', 'no_overlap');
      db.bookings = next;
    },
    async saveCar(c, isNew, oldId) {
      if ((isNew || c.id !== oldId) && db.cars.some(x => x.id === c.id)) throw err('23505', 'dup');
      if (isNew) { db.cars.push({ ...pick(c, CAR_FIELDS), plate: null }); if (c.plate) await this.changePlate(c.id, c.plate, todayISO(), 'First plate'); return; }
      Object.assign(db.cars.find(x => x.id === (oldId || c.id)), pick(c, CAR_FIELDS));
      if (oldId && oldId !== c.id) for (const t of [db.bookings, db.plates]) t.forEach(x => { if (x.car_id === oldId) x.car_id = c.id; });
    },
    async changePlate(car, plate, from, note) {
      plate = (plate || '').replace(/\s/g, '').toUpperCase() || null;
      const c = db.cars.find(x => x.id === car);
      if (plate && db.cars.some(x => x.plate === plate && x.id !== car)) throw err('23505', 'cars_plate_unique');
      db.plates.filter(p => p.car_id === car && p.plate === c.plate && !p.valid_to).forEach(p => { p.valid_to = addDays(from, -1); });
      c.plate = plate;
      if (plate) db.plates.push({ id: ++seq, car_id: car, plate, valid_from: from, valid_to: null, note });
    },
    async swapPlates(a, b, from, note) {
      const A = db.cars.find(x => x.id === a), B = db.cars.find(x => x.id === b);
      const pa = A.plate, pb = B.plate;
      db.plates.filter(p => !p.valid_to && ((p.car_id === a && p.plate === pa) || (p.car_id === b && p.plate === pb))).forEach(p => { p.valid_to = addDays(from, -1); });
      A.plate = pb; B.plate = pa;
      if (pb) db.plates.push({ id: ++seq, car_id: a, plate: pb, valid_from: from, note: note || 'Plates swapped' });
      if (pa) db.plates.push({ id: ++seq, car_id: b, plate: pa, valid_from: from, note: note || 'Plates swapped' });
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

// run a change, then refresh; one place for error handling
async function mutate(fn, okMsg) {
  try {
    await fn();
    if (okMsg) toast(okMsg);
    await reload(false);
    return true;
  } catch (e) {
    toast(friendlyError(e), true);
    reload(true);
    return false;
  }
}

// ------------------------------------------------------------------ small render helpers
const statusBadge = s => `<span class="badge ${s === 'Confirmed' ? 'green' : s === 'Tentative' ? 'amber' : ''}">${esc(s)}</span>`;
const carStatusBadge = s => `<span class="badge ${s === 'Active' ? 'green' : s === 'Sold' ? 'red' : s === 'In service' ? 'amber' : ''}">${esc(s)}</span>`;
const modelOptions = (sel, withAll = true) => (withAll ? `<option value="All"${sel === 'All' ? ' selected' : ''}>All models</option>` : '') +
  S.models.map(m => `<option${m.name === sel ? ' selected' : ''}>${esc(m.name)}</option>`).join('');
function whereText(carId) {
  const b = currentBooking(carId);
  return b ? `${b.client} (until ${fmtShort(b.end_date)})` : null;
}
const dateRange = b => `${fmt(b.start_date)} – ${fmt(b.end_date)}`;

// ------------------------------------------------------------------ login / shell
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
      <p class="muted">Ask the fleet admin to add it on the Cars page, then reload this page.</p>
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
  api.subscribe(debounce(() => { if (!$('.modal')) reload(true); else pendingReload = true; }, 500));
}
let pendingReload = false;

const TABS = [['calendar', 'Calendar'], ['cars', 'Cars']];

function renderShell() {
  if (!TABS.some(t => t[0] === S.view)) S.view = 'calendar';
  $('#app').innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="brand-mark">${ICON.car}</span><span class="name">${esc(CFG.appName || 'Fleet')}</span></div>
    <nav class="tabs" role="tablist">${TABS.map(([k, l]) => `<button class="tab" role="tab" data-action="tab" data-tab="${k}">${l}</button>`).join('')}</nav>
    <button class="btn quick-top" data-action="quick-reserve">${ICON.bolt}<span>Quick reserve</span></button>
    <button class="user-btn" data-action="user-menu" title="${esc(S.me)}">${esc(nameFromEmail(S.me) || S.me)} ▾</button>
  </header>
  <main id="view"></main>`;
  renderView();
}

function renderView() {
  const v = $('#view');
  if (!v) return;
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === S.view));
  v.className = S.view === 'calendar' ? 'wide' : '';
  if (S.view === 'calendar') renderCalendar(); else renderCars();
}

// ------------------------------------------------------------------ CALENDAR (Excel-style Gantt)
function renderCalendar() {
  const c = S.cal;
  if (!c.start) c.start = addDays(mondayOf(todayISO()), -7);
  const today = todayISO();
  const pool = poolCars('All');
  const out = pool.filter(x => currentBooking(x.id, today)).length;
  $('#view').innerHTML = `
  <div class="sheet">
    <div class="sheet-bar">
      <div class="seg" role="group">
        <button class="seg-btn${c.mode === 'timeline' ? ' on' : ''}" data-action="cal-mode" data-mode="timeline">Timeline</button>
        <button class="seg-btn${c.mode === 'list' ? ' on' : ''}" data-action="cal-mode" data-mode="list">List</button>
      </div>
      ${c.mode === 'timeline' ? `
      <button class="icon-btn" data-action="cal-move" data-d="-7" title="Previous week">${ICON.left}</button>
      <button class="btn sm" data-action="cal-today">Today</button>
      <button class="icon-btn" data-action="cal-move" data-d="7" title="Next week">${ICON.right}</button>
      <input type="date" id="c-jump" value="${c.start}" title="Jump to date" class="w-auto">
      <select id="c-weeks" class="w-auto">${[2, 4, 6, 8, 12, 26].map(w => `<option value="${w}"${w === c.weeks ? ' selected' : ''}>${w} weeks</option>`).join('')}</select>` : `
      <select id="l-period" class="w-auto">${[['current', 'Current & upcoming'], ['past', 'Past'], ['all', 'All dates']].map(([v, t]) => `<option value="${v}"${S.list.period === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
      <select id="l-purpose" class="w-auto"><option value="All">All purposes</option>${opts(PURPOSES, S.list.purpose)}</select>
      <label class="check"><input type="checkbox" id="l-cancelled" ${S.list.cancelled ? 'checked' : ''}> Cancelled</label>`}
      <select id="c-model" class="w-auto">${modelOptions(c.model)}</select>
      <input type="search" id="c-q" placeholder="Search car or client…" value="${esc(c.q)}" class="w-search">
      <span class="spacer"></span>
      <span class="summary"><b class="green-t">${pool.length - out}</b> of ${pool.length} press cars free today</span>
      <button class="btn sm" data-action="swap-pick">${ICON.swap}Swap cars</button>
      <button class="btn sm primary only-narrow" data-action="quick-reserve">${ICON.bolt}Quick reserve</button>
      <button class="btn sm" data-action="${c.mode === 'timeline' ? 'export-calendar' : 'export-bookings'}" title="Download Excel">${ICON.xls}Excel</button>
    </div>
    <div id="cal-body"></div>
  </div>`;
  $('#c-model').addEventListener('change', e => { c.model = e.target.value; saveCal(); renderCalBody(); });
  $('#c-q').addEventListener('input', debounce(e => { c.q = e.target.value; renderCalBody(); }, 150));
  if (c.mode === 'timeline') {
    $('#c-weeks').addEventListener('change', e => { c.weeks = +e.target.value; saveCal(); renderCalBody(); });
    $('#c-jump').addEventListener('change', e => { if (isISO(e.target.value)) { c.start = mondayOf(e.target.value); renderCalBody(); } });
  } else {
    const saveList = () => { store.set('list2', S.list); renderCalBody(); };
    $('#l-period').addEventListener('change', e => { S.list.period = e.target.value; saveList(); });
    $('#l-purpose').addEventListener('change', e => { S.list.purpose = e.target.value; saveList(); });
    $('#l-cancelled').addEventListener('change', e => { S.list.cancelled = e.target.checked; saveList(); });
  }
  renderCalBody();
}

function renderCalBody() {
  if (S.cal.mode === 'list') return renderList();
  renderTimeline();
}

// a car matches its model, colour, user, VIN, current plate or any plate it ever had
function matchCar(car, q) {
  return !q || [car.id, car.model, car.plate, car.colour, car.holder, ...platesOf(car.id).map(p => p.plate)].some(v => (v || '').toLowerCase().includes(q));
}

function renderTimeline() {
  const c = S.cal;
  const days = c.weeks * 7;
  const end = addDays(c.start, days - 1);
  const today = todayISO();
  const q = c.q.trim().toLowerCase();
  const dates = Array.from({ length: days }, (_, i) => addDays(c.start, i));
  const inModel = x => c.model === 'All' || x.model === c.model;
  const hitClient = x => q && bookingsOf(x.id).some(b => b.end_date >= c.start && b.start_date <= end && b.client.toLowerCase().includes(q));
  const show = x => inModel(x) && (matchCar(x, q) || hitClient(x));
  const sections = [
    ['Press cars', S.cars.filter(x => isPool(x) && show(x)), true],
    ['Company cars', S.cars.filter(x => isCompany(x) && show(x)), c.company, 'company'],
    ['Not registered', S.cars.filter(x => x.status === 'Not registered' && show(x)), c.unreg, 'unreg'],
  ];
  $('#c-jump') && ($('#c-jump').value = c.start);

  let head = '';
  dates.forEach((d, i) => {
    if (i === 0 || d.slice(8) === '01') {
      const monthDays = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 0)).getUTCDate();
      const span = Math.min(days - i, monthDays - +d.slice(8) + 1);
      head += `<div class="g-month" style="grid-column:${i + 1}/span ${span}">${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}</div>`;
    }
    const we = dow(d) === 0 || dow(d) === 6;
    head += `<div class="g-day${we ? ' we' : ''}${d === today ? ' today' : ''}" style="grid-column:${i + 1}"><span>${DOW[dow(d)].slice(0, 2)}</span><b>${pad(+d.slice(8))}</b></div>`;
  });

  let rows = '';
  for (const [title, cars, open, key] of sections) {
    if (!cars.length && !key) continue;
    rows += `<div class="g-section${key ? ' toggle' : ''}" ${key ? `data-action="cal-section" data-key="${key}"` : ''}>
      <span>${key ? (open ? '▾' : '▸') : ''} ${esc(title)} <em>${cars.length}</em></span></div>`;
    if (!open) continue;
    for (const car of cars) {
      const freeNow = car.status === 'Active' && !currentBooking(car.id, today);
      let cells = '';
      dates.forEach((d, i) => {
        const we = dow(d) === 0 || dow(d) === 6;
        cells += `<div class="g-cell${we ? ' we' : ''}${d === today ? ' today' : ''}" style="grid-column:${i + 1}" data-car="${esc(car.id)}" data-date="${d}"></div>`;
      });
      for (const b of bookingsOf(car.id)) {
        if (b.end_date < c.start || b.start_date > end) continue;
        const s = maxISO(b.start_date, c.start), e = minISO(b.end_date, end);
        const col = daysBetween(c.start, s) + 1, span = daysBetween(s, e) + 1;
        const hit = q && b.client.toLowerCase().includes(q);
        const tip = `${b.client}\n${dateRange(b)} (${plural(nDays(b), 'day')})\n${b.purpose} · ${b.status}${b.notes && !/^Imported/.test(b.notes) ? '\n' + b.notes : ''}`;
        cells += `<div class="g-bar ${barColour(b)}${b.start_date < c.start ? ' cl' : ''}${b.end_date > end ? ' cr' : ''}${b.status === 'Tentative' ? ' tentative' : ''}${hit ? ' hit' : ''}" style="grid-column:${col}/span ${span}" title="${esc(tip)}" data-action="booking-actions" data-id="${b.id}">${esc(b.client)}</div>`;
      }
      const user = isCompany(car) ? (car.holder || '') : (whereText(car.id) || (freeNow ? 'Available' : ''));
      rows += `<div class="g-car${freeNow ? ' free' : ''}${c.details ? '' : ' compact'}" data-action="edit-car" data-id="${esc(car.id)}" title="${esc(`${car.model} · ${car.colour || ''}\nVIN ${car.id}\nPlate ${car.plate || '–'}${car.trim_level ? '\nTrim ' + car.trim_level : ''}${car.notes ? '\n' + car.notes : ''}\n\nClick for details, plate change or plate swap`)}">
        <div class="g-name">
          <div class="g-l1"><b>${esc(car.model)}</b><span>${esc(car.colour || '')}</span></div>
          <div class="g-l2"><span class="g-vin">${esc(car.id)}</span><b class="g-plate">${esc(car.plate || 'no plate')}</b></div>
        </div>
        ${c.details ? `<div class="g-user${freeNow ? ' ok' : ''}">${esc(user)}</div>` : ''}
      </div><div class="g-track">${cells}</div>`;
    }
  }

  $('#cal-body').innerHTML = `
    <div class="legend">
      <span class="lg"><i class="yellow"></i>Booked</span><span class="lg"><i class="yellow tentative"></i>Tentative</span>
      <span class="lg"><i class="grey"></i>Company car / long-term</span><span class="lg"><i class="red"></i>Damaged / out of service</span>
      <span class="muted">· Click or drag across empty days to reserve · click a yellow block to extend, swap or edit</span>
      <span class="spacer"></span>
      <label class="check"><input type="checkbox" id="c-details" ${c.details ? 'checked' : ''}> User column</label>
    </div>
    <div class="g-scroll"><div class="gantt${c.details ? '' : ' compact'}" style="--days:${days}">
      <div class="g-corner${c.details ? '' : ' compact'}"><div>Model · Colour<br><span>VIN · Plate</span></div>${c.details ? '<div>User / now</div>' : ''}</div>
      <div class="g-head">${head}</div>
      ${rows || '<div class="empty" style="grid-column:1/-1">No cars match.</div>'}
    </div></div>`;
  $('#c-details').addEventListener('change', e => { c.details = e.target.checked; saveCal(); renderTimeline(); });
  const sc = $('.g-scroll');
  const ti = daysBetween(c.start, today);
  if (sc && ti > 10 && ti < days) sc.scrollLeft = (ti - 7) * 30;
}

// drag across empty days in one row to reserve exactly that range (a single click = start date)
let drag = null;
function markDrag() {
  if (!drag) return;
  const s = minISO(drag.a, drag.b), e = maxISO(drag.a, drag.b);
  $$('.g-cell', drag.row).forEach(x => x.classList.toggle('sel', x.dataset.date >= s && x.dataset.date <= e));
}
document.addEventListener('pointerdown', e => {
  const cell = e.target.closest('.g-cell');
  if (!cell || e.button !== 0) return;
  drag = { car: cell.dataset.car, a: cell.dataset.date, b: cell.dataset.date, row: cell.parentElement, moved: false };
  if (e.pointerType === 'mouse') e.preventDefault();
  markDrag();
});
document.addEventListener('pointerover', e => {
  if (!drag) return;
  const cell = e.target.closest('.g-cell');
  if (cell && cell.parentElement === drag.row && cell.dataset.date !== drag.b) { drag.b = cell.dataset.date; drag.moved = true; markDrag(); }
});
document.addEventListener('pointerup', () => {
  if (!drag) return;
  const d = drag; drag = null;
  $$('.g-cell.sel').forEach(x => x.classList.remove('sel'));
  const s = minISO(d.a, d.b), e = maxISO(d.a, d.b);
  openBooking({ car_id: d.car, start_date: s, end_date: d.moved ? e : addDays(s, Math.max(1, S.quick.days) - 1) });
});
document.addEventListener('pointercancel', () => { drag = null; $$('.g-cell.sel').forEach(x => x.classList.remove('sel')); });

// ------------------------------------------------------------------ list mode
function filteredBookings() {
  const L = S.list, today = todayISO(), q = S.cal.q.trim().toLowerCase();
  let rows = S.bookings.filter(b => {
    if (!L.cancelled && b.status === 'Cancelled') return false;
    if (L.period === 'current' && b.end_date < today) return false;
    if (L.period === 'past' && b.end_date >= today) return false;
    if (L.purpose !== 'All' && b.purpose !== L.purpose) return false;
    const car = S.carMap.get(b.car_id);
    if (S.cal.model !== 'All' && (!car || car.model !== S.cal.model)) return false;
    if (q && ![car && car.plate, b.client, b.notes, b.booked_by, car && car.model].some(v => (v || '').toLowerCase().includes(q))) return false;
    return true;
  });
  if (L.period !== 'current') rows = rows.slice().reverse();
  return rows;
}

function renderList() {
  const rows = filteredBookings(), today = todayISO();
  $('#cal-body').innerHTML = rows.length ? `<div class="table-wrap"><table>
    <thead><tr><th>Car</th><th>Dates</th><th>Days</th><th>Driver / client</th><th class="hide-sm">Purpose</th><th>Status</th><th class="hide-sm">Booked by</th></tr></thead>
    <tbody>${rows.map(b => {
      const car = S.carMap.get(b.car_id);
      const now = b.status !== 'Cancelled' && b.start_date <= today && b.end_date >= today;
      return `<tr class="clickable${b.status === 'Cancelled' ? ' cancelled' : ''}" data-action="booking-actions" data-id="${b.id}">
        <td><div class="car-id">${esc(plateOf(b.car_id))}</div><div class="car-sub">${esc(car ? car.model : '')}</div></td>
        <td class="nowrap">${dateRange(b)}${now ? ' <span class="badge blue">now</span>' : ''}</td>
        <td>${nDays(b)}</td>
        <td>${esc(b.client)}${b.notes && !/^Imported/.test(b.notes) ? `<div class="car-sub" style="white-space:normal">${esc(b.notes)}</div>` : ''}</td>
        <td class="hide-sm small">${esc(b.purpose)}</td><td>${statusBadge(b.status)}</td>
        <td class="hide-sm small muted">${esc(b.booked_by || '')}</td></tr>`;
    }).join('')}</tbody></table></div><div class="list-foot muted small">${plural(rows.length, 'booking')}</div>` : '<div class="empty">No bookings match these filters.</div>';
}

// ------------------------------------------------------------------ CARS (fleet + team)
function renderCars() {
  const F = S.fleet;
  $('#view').innerHTML = `
  <div class="page-head"><div><h1>Cars</h1><p>Press cars (status <b>Active</b>) can be reserved. Company cars are <b>Long-term loan</b> with their user.</p></div>
    <div class="row"><button class="btn" data-action="export-fleet">${ICON.xls}Excel</button><button class="btn primary" data-action="new-car">${ICON.plus}Add car</button></div></div>
  <div class="card">
    <div class="card-head" style="justify-content:flex-start">
      <input type="search" id="fl-q" placeholder="Search plate, VIN, user…" value="${esc(F.q)}" style="max-width:260px">
      <select id="fl-status" class="w-auto"><option value="All">All statuses</option>${opts(CAR_STATUSES, F.status)}</select>
      <span class="spacer"></span><span class="muted small" id="fl-count"></span>
    </div>
    <div id="fl-rows"></div>
  </div>
  <div id="team"></div>`;
  $('#fl-q').addEventListener('input', debounce(e => { F.q = e.target.value; renderFleetRows(); }, 150));
  $('#fl-status').addEventListener('change', e => { F.status = e.target.value; store.set('fleet2', { status: F.status }); renderFleetRows(); });
  renderFleetRows();
  renderTeam();
}

function renderFleetRows() {
  const F = S.fleet, q = F.q.trim().toLowerCase(), today = todayISO();
  const cars = S.cars.filter(c => (F.status === 'All' || c.status === F.status) &&
    (!q || matchCar(c, q) || (c.notes || '').toLowerCase().includes(q)));
  $('#fl-count').textContent = plural(cars.length, 'car');
  $('#fl-rows').innerHTML = cars.length ? `<div class="table-wrap"><table>
    <thead><tr><th>Plate</th><th>Model · colour</th><th class="hide-sm">Trim</th><th class="hide-sm">VIN</th><th>Status / user</th><th>Today</th><th class="hide-sm">Next free day</th></tr></thead>
    <tbody>${cars.map(c => {
      const now = currentBooking(c.id, today);
      const nextFree = c.status === 'Active' ? earliestFree(c.id, today, 1) : null;
      return `<tr class="clickable" data-action="edit-car" data-id="${esc(c.id)}">
        <td class="car-id">${esc(label(c))}</td><td>${esc(c.model)}<div class="car-sub">${esc(c.colour || '')}</div></td>
        <td class="hide-sm">${esc(c.trim_level || '')}</td>
        <td class="hide-sm small mono">${esc(c.id)}</td>
        <td>${carStatusBadge(c.status)}${c.holder ? `<div class="car-sub">${esc(c.holder)}</div>` : ''}</td>
        <td class="small">${now ? `${esc(now.client)}<div class="car-sub">until ${fmt(now.end_date)}</div>` : c.status === 'Active' ? '<span class="badge green">Available</span>' : '<span class="muted">–</span>'}</td>
        <td class="hide-sm nowrap">${nextFree ? (nextFree === today ? 'today' : fmt(nextFree)) : '<span class="muted">–</span>'}</td></tr>`;
    }).join('')}</tbody></table></div>` : '<div class="empty">No cars match.</div>';
}

function renderTeam() {
  const admin = S.isAdmin;
  $('#team').innerHTML = `
  <div class="card">
    <div class="card-head"><h2>Team access</h2><span class="sub">${plural(S.members.length, 'person')}${admin ? '' : ' · only admins can change this'}</span></div>
    <div class="table-wrap"><table><thead><tr><th>Email</th><th>Role</th><th></th></tr></thead><tbody>
    ${S.members.map(m => `<tr><td>${esc(m.email)}${m.email === S.me ? ' <span class="badge blue">you</span>' : ''}</td>
      <td>${admin && m.email !== S.me ? `<select data-role="${esc(m.email)}" class="w-auto">${opts(['member', 'admin'], m.role)}</select>` : esc(m.role)}</td>
      <td style="text-align:right">${admin && m.email !== S.me ? `<button class="btn sm danger" data-action="remove-member" data-email="${esc(m.email)}">Remove</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>
    ${admin ? `<div class="card-body" style="border-top:1px solid var(--line)">
      <form id="add-member" class="row">
        <input type="email" name="email" placeholder="colleague@company.com" required style="max-width:300px">
        <select name="role" class="w-auto"><option>member</option><option>admin</option></select>
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
    mutate(() => api.addMember(email, f.get('role')), `${email} added`);
  });
  $('#add-model').addEventListener('submit', async e => {
    e.preventDefault();
    const name = String(new FormData(e.target).get('name')).trim();
    if (!name) return;
    if (S.models.some(m => m.name.toLowerCase() === name.toLowerCase())) return toast('That model already exists.', true);
    mutate(() => api.addModel(name, S.models.length ? Math.max(...S.models.map(m => m.sort)) + 1 : 0), `${name} added`);
  });
  $$('select[data-role]').forEach(sel => sel.addEventListener('change', e => mutate(() => api.setRole(e.target.dataset.role, e.target.value), 'Role updated')));
}

// ------------------------------------------------------------------ modal
function openModal(html, size = '') {
  $('#modal-root').innerHTML = `<div class="modal-back" data-action="modal-backdrop"><div class="modal ${size}" role="dialog" aria-modal="true">${html}</div></div>`;
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  $('#modal-root').innerHTML = '';
  document.body.style.overflow = '';
  if (pendingReload) { pendingReload = false; reload(true); }
}
const modalHead = title => `<div class="modal-head"><h3>${title}</h3><button class="close-x" data-action="close-modal" aria-label="Close">×</button></div>`;

// ------------------------------------------------------------------ QUICK RESERVE (find a free car and book it in one click)
function openQuickReserve() {
  const Q = S.quick;
  if (!Q.start) Q.start = todayISO();
  openModal(`${modalHead(`${ICON.bolt} Quick reserve`)}
    <div class="modal-body">
      <div class="q-grid">
        <label class="field"><span>Model</span><select id="q-model">${modelOptions(Q.model)}</select></label>
        <div class="field"><span>Days</span><div class="stepper"><button type="button" data-q="-1" aria-label="Fewer days">−</button><input id="q-days" type="number" min="1" max="365" value="${Q.days}" inputmode="numeric"><button type="button" data-q="1" aria-label="More days">+</button></div></div>
        <label class="field"><span>From</span><input id="q-start" type="date" value="${Q.start}"></label>
      </div>
      <div class="quick">${[1, 2, 3, 5, 7, 10, 14].map(d => `<button type="button" class="chip-btn${d === Q.days ? ' on' : ''}" data-qd="${d}">${plural(d, 'day')}</button>`).join('')}</div>
      <div class="q-grid two" style="margin-top:12px">
        <label class="field req"><span>Driver / client</span><input id="q-client" type="text" value="${esc(Q.client)}" placeholder="Type the name, then press Reserve on a car" maxlength="200"></label>
        <label class="field"><span>Purpose</span><select id="q-purpose">${opts(PURPOSES, Q.purpose)}</select></label>
      </div>
      <div id="q-results" class="q-results"></div>
    </div>
    <div class="modal-foot">
      <button type="button" class="btn sm left" data-action="q-copy">${ICON.copy}Copy text</button>
      <button type="button" class="btn sm" data-action="q-export">${ICON.xls}Excel (this model)</button>
      <button type="button" class="btn sm" data-action="q-export-all">${ICON.xls}Excel (all models)</button>
      <button type="button" class="btn" data-action="close-modal">Close</button>
    </div>`, 'wide');
  const draw = () => {
    store.set('quick', { model: Q.model, days: Q.days, purpose: Q.purpose });
    $$('#modal-root [data-qd]').forEach(b => b.classList.toggle('on', +b.dataset.qd === Q.days));
    const res = findResults(Q.model, Q.days, Q.start);
    $('#q-results').innerHTML = res.length ? `
      <div class="q-head">${esc(Q.model === 'All' ? 'All models' : Q.model)} · ${plural(Q.days, 'day')} from ${fmtLong(Q.start)} · earliest first</div>
      <div class="table-wrap"><table><tbody>${res.map(r => `
        <tr>
          <td><div class="car-id">${esc(label(r.car))}</div><div class="car-sub">${esc(r.car.model)} · ${esc(r.car.colour || '')}</div></td>
          <td class="nowrap">${r.from === Q.start ? '<span class="badge green">free</span> ' : ''}<b>${fmtShort(r.from)} – ${fmt(r.to)}</b>
            <div class="car-sub">${r.from === Q.start ? 'right away' : `${plural(daysBetween(Q.start, r.from), 'day')} later`}${r.freeUntil ? ` · free until ${fmtShort(r.freeUntil)}` : ''}</div></td>
          <td class="hide-sm small muted">${esc(whereText(r.car.id) || 'Available now')}</td>
          <td style="text-align:right"><button type="button" class="btn sm primary" data-action="q-reserve" data-car="${esc(r.car.id)}" data-from="${r.from}">Reserve</button></td>
        </tr>`).join('')}</tbody></table></div>`
      : `<div class="empty">No ${esc(Q.model)} car is in the pool (Cars page, status "Active").</div>`;
  };
  $('#q-model').addEventListener('change', e => { Q.model = e.target.value; draw(); });
  $('#q-days').addEventListener('input', e => { const n = parseInt(e.target.value, 10); if (n >= 1 && n <= 365) { Q.days = n; draw(); } });
  $('#q-start').addEventListener('change', e => { if (isISO(e.target.value)) { Q.start = e.target.value; draw(); } });
  $('#q-client').addEventListener('input', e => { Q.client = e.target.value; e.target.classList.remove('invalid'); });
  $('#q-purpose').addEventListener('change', e => { Q.purpose = e.target.value; });
  $('#modal-root .modal').addEventListener('click', e => {
    const step = e.target.closest('[data-q]'), chip = e.target.closest('[data-qd]');
    if (step) { Q.days = Math.min(365, Math.max(1, Q.days + +step.dataset.q)); $('#q-days').value = Q.days; draw(); }
    if (chip) { Q.days = +chip.dataset.qd; $('#q-days').value = Q.days; draw(); }
  });
  draw();
  if (window.matchMedia('(pointer:fine)').matches) $('#q-client').focus();
}

async function quickReserve(carId, from) {
  const Q = S.quick;
  const client = Q.client.trim();
  if (!client) { $('#q-client').classList.add('invalid'); $('#q-client').focus(); return toast('Type the driver / client name first.', true); }
  const b = { car_id: carId, start_date: from, end_date: addDays(from, Q.days - 1), client, purpose: Q.purpose, status: 'Confirmed', booked_by: nameFromEmail(S.me), notes: null };
  if (conflicts(carId, b.start_date, b.end_date).length) return toast('Someone just booked that car. The list is refreshed.', true);
  $$('#modal-root [data-action="q-reserve"]').forEach(x => { x.disabled = true; });
  const ok = await mutate(() => api.saveBooking(b), `Reserved ${plateOf(carId)} for ${client}: ${fmt(b.start_date)} – ${fmt(b.end_date)}`);
  if (ok) {
    Q.client = '';
    closeModal();
    S.view = 'calendar'; S.cal.mode = 'timeline';
    if (b.start_date < S.cal.start || b.start_date > addDays(S.cal.start, S.cal.weeks * 7 - 1)) S.cal.start = addDays(mondayOf(b.start_date), -7);
    renderShell();
    flashCar(carId);
  } else {
    $$('#modal-root [data-action="q-reserve"]').forEach(x => { x.disabled = false; });
  }
}

function flashCar(carId) {
  const el = $(`.g-car[data-id="${CSS.escape(carId)}"]`);
  if (!el) return;
  el.scrollIntoView({ block: 'center' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 2200);
}

// ------------------------------------------------------------------ BOOKING ACTIONS (click a yellow block)
function openBookingActions(id) {
  const b = bookingById(id);
  if (!b) return;
  const car = S.carMap.get(b.car_id) || {};
  const live = b.status !== 'Cancelled';
  const next = conflicts(b.car_id, addDays(b.end_date, 1), addDays(b.end_date, 7), b.id)[0];
  const canExtend = n => !conflicts(b.car_id, addDays(b.end_date, 1), addDays(b.end_date, n), b.id).length;
  openModal(`${modalHead(esc(b.client))}
    <div class="modal-body">
      <div class="act-info">
        <div><span class="muted small">Car</span><b>${esc(plateOf(b.car_id))}</b> <span class="muted">${esc(car.model || '')} · ${esc(car.colour || '')}</span></div>
        <div><span class="muted small">Dates</span><b>${fmtLong(b.start_date)} – ${fmtLong(b.end_date)}</b> <span class="muted">(${plural(nDays(b), 'day')})</span></div>
        <div><span class="muted small">Purpose / status</span>${esc(b.purpose)} · ${statusBadge(b.status)}</div>
        ${b.notes && !/^Imported/.test(b.notes) ? `<div><span class="muted small">Notes</span>${esc(b.notes)}</div>` : ''}
        ${next ? `<div class="small muted">Next on this car: ${esc(next.client)} from ${fmt(next.start_date)}</div>` : ''}
      </div>
      ${live ? `
      <div class="act-group"><div class="act-label">Return date</div>
        <div class="row">
          <button class="btn sm" data-action="bk-shift-end" data-id="${b.id}" data-n="-1" ${nDays(b) > 1 ? '' : 'disabled'}>− 1 day</button>
          <button class="btn sm" data-action="bk-shift-end" data-id="${b.id}" data-n="1" ${canExtend(1) ? '' : 'disabled title="The car is booked the next day"'}>+ 1 day</button>
          <button class="btn sm" data-action="bk-shift-end" data-id="${b.id}" data-n="7" ${canExtend(7) ? '' : 'disabled title="The car is booked within the next week"'}>+ 1 week</button>
        </div></div>
      <div class="act-group"><div class="act-label">Whole booking</div>
        <div class="row">
          <button class="btn sm" data-action="bk-shift-all" data-id="${b.id}" data-n="-1">◀ 1 day earlier</button>
          <button class="btn sm" data-action="bk-shift-all" data-id="${b.id}" data-n="1">1 day later ▶</button>
          <button class="btn sm primary" data-action="swap-open" data-id="${b.id}">${ICON.swap}Swap / change car</button>
        </div></div>` : '<div class="alert amber">This booking is cancelled.</div>'}
    </div>
    <div class="modal-foot">
      ${live ? `<button class="btn danger left" data-action="bk-cancel" data-id="${b.id}">Cancel booking</button>` : `<button class="btn left" data-action="bk-restore" data-id="${b.id}">Restore booking</button>`}
      <button class="btn" data-action="edit-booking" data-id="${b.id}">Edit details</button>
      <button class="btn" data-action="close-modal">Close</button>
    </div>`, 'sm');
}

async function changeBooking(b, patch, msg) {
  const v = { ...b, ...patch };
  if (v.status !== 'Cancelled') {
    const clash = conflicts(v.car_id, v.start_date, v.end_date, b.id);
    if (clash.length) return toast(`Not possible: ${plateOf(v.car_id)} is booked by ${clash[0].client} (${dateRange(clash[0])}).`, true);
  }
  if (await mutate(() => api.saveBooking(v), msg)) {
    closeModal();
    if (v.status !== 'Cancelled') openBookingActions(b.id);
  }
}

// ------------------------------------------------------------------ SWAP / CHANGE CAR
function openSwapPicker() {
  const today = todayISO();
  const list = S.bookings.filter(b => b.status !== 'Cancelled' && b.end_date >= today && b.purpose !== 'Long-term loan');
  openModal(`${modalHead(`${ICON.swap} Swap cars`)}
    <div class="modal-body">
      <p class="muted" style="margin-top:0">Which booking should get another car?</p>
      <input type="search" id="sp-q" placeholder="Search car or client…">
      <div id="sp-list" class="pick-list"></div>
    </div>
    <div class="modal-foot"><button class="btn" data-action="close-modal">Close</button></div>`, 'wide');
  const draw = q => {
    q = q.trim().toLowerCase();
    const rows = list.filter(b => !q || [plateOf(b.car_id), b.client].some(v => v.toLowerCase().includes(q))).slice(0, 60);
    $('#sp-list').innerHTML = rows.length ? rows.map(b => {
      const car = S.carMap.get(b.car_id) || {};
      return `<button type="button" class="pick" data-action="swap-open" data-id="${b.id}"><b>${esc(plateOf(b.car_id))}</b> <span class="muted">${esc(car.model || '')}</span><span class="pick-mid">${esc(b.client)}</span><span class="muted nowrap">${fmtShort(b.start_date)} – ${fmtShort(b.end_date)}</span></button>`;
    }).join('') : '<div class="empty">No current or upcoming bookings match.</div>';
  };
  $('#sp-q').addEventListener('input', e => draw(e.target.value));
  draw('');
  if (window.matchMedia('(pointer:fine)').matches) $('#sp-q').focus();
}

function openSwap(id) {
  const b = bookingById(id);
  if (!b) return;
  const car = S.carMap.get(b.car_id) || {};
  const cands = S.cars.filter(c => c.id !== b.car_id && isPool(c));
  const same = cands.filter(c => c.model === car.model), other = cands.filter(c => c.model !== car.model);
  const row = t => {
    const o = swapOption(b, t);
    const action = o.kind === 'move'
      ? `<button class="btn sm primary" data-action="do-move" data-id="${b.id}" data-car="${esc(t.id)}">Move here</button>`
      : o.kind === 'swap'
        ? `<button class="btn sm" data-action="do-swap" data-a="${b.id}" data-b="${o.other.id}">${ICON.swap}Swap</button>`
        : '<span class="muted small">not possible</span>';
    const status = o.kind === 'move' ? '<span class="badge green">free on these dates</span>'
      : o.kind === 'swap' ? `<span class="small">has <b>${esc(o.other.client)}</b> ${fmtShort(o.other.start_date)}–${fmtShort(o.other.end_date)}<br><span class="muted">they would get ${esc(plateOf(b.car_id))}</span></span>`
        : `<span class="small muted">busy: ${esc(o.why)}</span>`;
    return `<tr class="${o.kind === 'busy' ? 'dim' : ''}"><td><div class="car-id">${esc(label(t))}</div><div class="car-sub">${esc(t.model)} · ${esc(t.colour || '')}</div></td><td>${status}</td><td style="text-align:right">${action}</td></tr>`;
  };
  const sortRows = list => list.map(t => [t, swapOption(b, t).kind]).sort((x, y) => 'mswapbusy'.indexOf(x[1][0]) - 'mswapbusy'.indexOf(y[1][0])).map(x => x[0]);
  openModal(`${modalHead(`${ICON.swap} Swap / change car`)}
    <div class="modal-body">
      <div class="alert blue"><b>${esc(b.client)}</b> · ${esc(plateOf(b.car_id))} (${esc(car.model || '')}) · ${dateRange(b)}</div>
      <div class="q-head" style="margin-top:14px">${esc(car.model || 'Same model')}</div>
      ${same.length ? `<div class="table-wrap"><table><tbody>${sortRows(same).map(row).join('')}</tbody></table></div>` : '<div class="muted small">No other car of this model in the pool.</div>'}
      <details style="margin-top:14px"><summary class="q-head" style="cursor:pointer">Other models (${other.length})</summary>
        <div class="table-wrap"><table><tbody>${sortRows(other).map(row).join('')}</tbody></table></div></details>
    </div>
    <div class="modal-foot"><button class="btn left" data-action="booking-actions" data-id="${b.id}">◀ Back</button><button class="btn" data-action="close-modal">Close</button></div>`, 'wide');
}

// ------------------------------------------------------------------ full booking form
function openBooking(pref = {}) {
  const existing = pref.id ? bookingById(pref.id) : null;
  const b = existing ? { ...existing } : {
    car_id: pref.car_id || '', start_date: pref.start_date || todayISO(), end_date: pref.end_date || '',
    client: '', purpose: S.quick.purpose || 'Press / Test drive', status: 'Confirmed', booked_by: nameFromEmail(S.me), notes: '',
  };
  if (!b.end_date) b.end_date = addDays(b.start_date, (S.quick.days || 1) - 1);
  const carChoices = S.cars.filter(c => c.status !== 'Sold' || c.id === b.car_id);
  const groups = S.models.map(m => {
    const list = carChoices.filter(c => c.model === m.name);
    return list.length ? `<optgroup label="${esc(m.name)}">${list.map(c => `<option value="${esc(c.id)}"${c.id === b.car_id ? ' selected' : ''}>${esc(label(c))} · ${esc(c.colour || '')}${c.status !== 'Active' ? ' (' + esc(c.status) + ')' : ''}</option>`).join('')}</optgroup>` : '';
  }).join('');
  openModal(`${modalHead(existing ? 'Edit booking' : `${ICON.bolt} Reserve`)}
    <form id="bk-form" novalidate>
    <div class="modal-body">
      <div class="form-grid">
        <label class="field req full"><span>Car</span><select id="bk-car"><option value="">Choose a car…</option>${groups}</select></label>
        <label class="field req full"><span>Driver / client</span><input type="text" id="bk-client" value="${esc(b.client)}" placeholder="e.g. Andrei Pana - Autocritica" maxlength="200"></label>
        <label class="field req"><span>Start date</span><input type="date" id="bk-start" value="${b.start_date}"></label>
        <label class="field req"><span>End date (car comes back)</span><input type="date" id="bk-end" value="${b.end_date}"></label>
        <div class="field full"><span>Number of days</span>
          <div class="row"><input type="number" id="bk-days" min="1" max="730" value="${nDays(b)}" style="width:90px">
          ${[1, 2, 3, 5, 7, 14].map(d => `<button type="button" class="chip-btn" data-bkd="${d}">${plural(d, 'day')}</button>`).join('')}</div></div>
        <label class="field"><span>Purpose</span><select id="bk-purpose">${opts(PURPOSES, b.purpose)}</select></label>
        <label class="field"><span>Status</span><select id="bk-status">${opts(BOOKING_STATUSES, b.status)}</select></label>
        <label class="field"><span>Booked by</span><input type="text" id="bk-by" value="${esc(b.booked_by || '')}" maxlength="80"></label>
        <label class="field full"><span>Notes</span><textarea id="bk-notes" maxlength="1000" placeholder="Pick-up place, contact, damage…">${esc(b.notes || '')}</textarea></label>
      </div>
      <div class="checks" id="bk-checks"></div>
      ${existing ? `<div class="history"><h4>History</h4><ul id="bk-history"><li>Loading…</li></ul></div>` : ''}
    </div>
    <div class="modal-foot">
      ${existing ? `<button type="button" class="btn left" data-action="booking-actions" data-id="${existing.id}">◀ Back</button>` : ''}
      <button type="button" class="btn" data-action="close-modal">Close</button>
      <button type="submit" class="btn primary" id="bk-save">${existing ? 'Save changes' : 'Reserve'}</button>
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
        out.push(`<div class="alert red"><b>${esc(plateOf(v.car_id))} is already booked on these dates:</b><br>${clash.map(x => `${esc(x.client)} · ${dateRange(x)}${x.status === 'Tentative' ? ' (tentative)' : ''}`).join('<br>')}
          <div class="row">
            ${alt ? `<button type="button" class="btn sm" data-bk="move" data-from="${alt}" data-n="${n}">Move to ${fmt(alt)} – ${fmt(addDays(alt, n - 1))}</button>` : ''}
            ${others.slice(0, 6).map(c => `<button type="button" class="btn sm" data-bk="switch" data-car="${esc(c.id)}">Use ${esc(label(c))}${c.colour ? ' (' + esc(c.colour) + ')' : ''}</button>`).join('')}
          </div>
          ${car && !others.length ? `<div class="small" style="margin-top:6px">No other ${esc(car.model)} is free on these dates.</div>` : ''}</div>`);
      } else {
        out.push(`<div class="alert green">${esc(plateOf(v.car_id))} is free for all ${plural(n, 'day')} (${fmtLong(v.start_date)} – ${fmtLong(v.end_date)}).</div>`);
      }
    }
    if (car && car.status !== 'Active') out.push(`<div class="alert amber">This car's status is <b>${esc(car.status)}</b>${car.holder ? ` (${esc(car.holder)})` : ''}. Double-check it can really be booked.</div>`);
    if (!existing && v.start_date < todayISO()) out.push('<div class="alert amber">The start date is in the past.</div>');
    if (n > 60 && v.purpose !== 'Long-term loan') out.push(`<div class="alert amber">${plural(n, 'day')} is a long booking. Should the purpose be "Long-term loan"?</div>`);
    el('bk-checks').innerHTML = out.join('');
    return { blocking, v };
  }
  const setDays = n => { const s = el('bk-start').value; if (isISO(s) && n >= 1) { el('bk-end').value = addDays(s, n - 1); el('bk-days').value = n; } check(); };

  el('bk-start').addEventListener('change', () => setDays(parseInt(el('bk-days').value, 10) || 1));
  el('bk-end').addEventListener('change', () => {
    const s = el('bk-start').value, e = el('bk-end').value;
    if (isISO(s) && isISO(e) && e >= s) el('bk-days').value = daysBetween(s, e) + 1;
    check();
  });
  el('bk-days').addEventListener('input', () => { const n = parseInt(el('bk-days').value, 10); if (n >= 1) setDays(n); });
  ['bk-car', 'bk-status', 'bk-purpose'].forEach(id => el(id).addEventListener('change', check));
  $('#bk-form').addEventListener('click', e => {
    const chip = e.target.closest('[data-bkd]');
    if (chip) return setDays(+chip.dataset.bkd);
    const a = e.target.closest('[data-bk]');
    if (!a) return;
    if (a.dataset.bk === 'move') { el('bk-start').value = a.dataset.from; el('bk-end').value = addDays(a.dataset.from, +a.dataset.n - 1); check(); }
    if (a.dataset.bk === 'switch') { el('bk-car').value = a.dataset.car; check(); }
  });
  $('#bk-form').addEventListener('submit', async e => {
    e.preventDefault();
    const { blocking, v } = check();
    const missing = [['bk-car', v.car_id], ['bk-start', isISO(v.start_date)], ['bk-end', isISO(v.end_date)], ['bk-client', v.client]].filter(([, ok]) => !ok);
    missing.forEach(([id]) => el(id).classList.add('invalid'));
    if (missing.length) return toast('Please fill in the car, the dates and the driver / client.', true);
    if (blocking) return toast('This car is not free on those dates. Use one of the suggestions.', true);
    const btn = el('bk-save'); btn.disabled = true; btn.textContent = 'Saving…';
    if (await mutate(() => api.saveBooking(v), existing ? 'Booking updated' : `Reserved ${plateOf(v.car_id)}: ${fmt(v.start_date)} – ${fmt(v.end_date)}`)) closeModal();
    else { btn.disabled = false; btn.textContent = existing ? 'Save changes' : 'Reserve'; }
  });
  $$('#bk-form input, #bk-form select').forEach(i => i.addEventListener('input', () => i.classList.remove('invalid')));
  check();
  if (window.matchMedia('(pointer:fine)').matches) (b.car_id ? el('bk-client') : el('bk-car')).focus();

  if (existing) {
    api.history(existing.id).then(rows => {
      const h = $('#bk-history');
      if (!h) return;
      h.innerHTML = rows.length ? rows.map(r => {
        const d = new Date(r.changed_at);
        const what = r.action === 'insert' ? 'created' : r.data && r.data.status === 'Cancelled' ? 'cancelled' : 'changed';
        return `<li>${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())} · ${what} by ${esc(r.changed_by || 'Excel import')}</li>`;
      }).join('') : '<li>Imported from the Excel calendar.</li>';
    }).catch(() => { const h = $('#bk-history'); if (h) h.innerHTML = '<li>History not available.</li>'; });
  }
}

// ------------------------------------------------------------------ car form (VIN = identity, plate managed with history)
function openCar(id) {
  const existing = id ? S.carMap.get(id) : null;
  const c = existing ? { ...existing } : { id: '', model: S.models[0] ? S.models[0].name : '', status: 'Active' };
  const nBookings = existing ? S.bookings.filter(b => b.car_id === existing.id).length : 0;
  const hist = existing ? platesOf(existing.id) : [];
  openModal(`${modalHead(existing ? `${esc(c.model)} · ${esc(c.colour || '')} <span class="muted">${esc(label(c))}</span>` : 'Add car')}
    <form id="car-form" novalidate>
    <div class="modal-body">
      ${existing ? `
      <div class="plate-box">
        <div><span class="muted small">Current plate</span><div class="plate-big">${esc(c.plate || 'no plate')}</div></div>
        <div class="row">
          <button type="button" class="btn sm primary" data-action="plate-change" data-id="${esc(c.id)}">Change plate</button>
          <button type="button" class="btn sm" data-action="plate-swap" data-id="${esc(c.id)}">${ICON.swap}Swap plates with another car</button>
        </div>
        ${hist.length ? `<ul class="plate-hist">${hist.map(p => `<li><b>${esc(p.plate)}</b> <span class="muted">${p.valid_from ? 'from ' + fmt(p.valid_from) : ''}${p.valid_to ? ' until ' + fmt(p.valid_to) : p.plate === c.plate ? ' · current' : ''}${p.note ? ' · ' + esc(p.note) : ''}</span></li>`).join('')}</ul>` : ''}
        <div class="small muted">Bookings belong to the car (its VIN), so they stay with it whatever plate it has.</div>
      </div>` : ''}
      <div class="form-grid">
        <label class="field req"><span>Model</span><select id="car-model">${modelOptions(c.model, false)}</select></label>
        <label class="field"><span>Colour</span><input type="text" id="car-colour" value="${esc(c.colour || '')}"></label>
        <label class="field req"><span>VIN (chassis number)</span><input type="text" id="car-vin" value="${esc(c.id)}" maxlength="20" style="text-transform:uppercase" class="mono"></label>
        ${existing ? '' : '<label class="field"><span>Plate</span><input type="text" id="car-plate" placeholder="e.g. B123BYD (empty if not registered)" maxlength="15" style="text-transform:uppercase"></label>'}
        <label class="field"><span>Trim</span><input type="text" id="car-trim" value="${esc(c.trim_level || '')}"></label>
        <label class="field"><span>Status</span><select id="car-status">${opts(CAR_STATUSES, c.status)}</select></label>
        <label class="field ${existing ? '' : 'full'}"><span>User (company car holder)</span><input type="text" id="car-holder" value="${esc(c.holder || '')}"></label>
        <label class="field full"><span>Notes</span><textarea id="car-notes">${esc(c.notes || '')}</textarea></label>
      </div>
      <p class="small muted" style="margin:12px 0 0">Status <b>Active</b> = press car (can be reserved) · <b>Long-term loan</b> = company car, shown under Company cars.
        ${existing && nBookings ? ` Correcting a VIN typo keeps all ${plural(nBookings, 'booking')} attached.` : ''}</p>
    </div>
    <div class="modal-foot">
      ${existing && S.isAdmin && !nBookings ? '<button type="button" class="btn danger left" data-action="delete-car">Delete car</button>' : ''}
      <button type="button" class="btn" data-action="close-modal">Close</button>
      <button type="submit" class="btn primary">${existing ? 'Save changes' : 'Add car'}</button>
    </div></form>`);
  $('#car-form').addEventListener('submit', async e => {
    e.preventDefault();
    const vin = $('#car-vin').value.trim().toUpperCase().replace(/\s+/g, '');
    const v = {
      id: vin, vin, model: $('#car-model').value, colour: $('#car-colour').value.trim(), trim_level: $('#car-trim').value.trim(),
      status: $('#car-status').value, holder: $('#car-holder').value.trim(), notes: $('#car-notes').value.trim(),
      plate: existing ? existing.plate : $('#car-plate').value.trim().toUpperCase().replace(/\s+/g, ''),
    };
    if (!vin) { $('#car-vin').classList.add('invalid'); return toast('The VIN is required.', true); }
    if (vin.length !== 17 && !confirm(`The VIN has ${vin.length} characters (normally 17). Save anyway?`)) return;
    if ((!existing || vin !== existing.id) && S.carMap.has(vin)) { $('#car-vin').classList.add('invalid'); return toast('Another car already has this VIN.', true); }
    if (!existing && v.plate && S.cars.some(x => x.plate === v.plate)) return toast(`Plate ${v.plate} is already on another car.`, true);
    if (existing && vin !== existing.id && !confirm(`Change the VIN from ${existing.id} to ${vin}? All bookings stay with this car.`)) return;
    if (await mutate(() => api.saveCar(v, !existing, existing && existing.id), existing ? 'Car updated' : `${label(v)} added`)) closeModal();
  });
  $('#car-form').addEventListener('click', async e => {
    if (!e.target.closest('[data-action="delete-car"]')) return;
    if (!confirm(`Delete ${label(existing)} permanently?`)) return;
    if (await mutate(() => api.deleteCar(existing.id), 'Car deleted')) closeModal();
  });
}

function openPlateChange(id) {
  const c = S.carMap.get(id);
  openModal(`${modalHead(`Change plate · ${esc(c.model)} ${esc(c.colour || '')}`)}
    <form id="pl-form"><div class="modal-body">
      <div class="alert blue">VIN <span class="mono">${esc(c.id)}</span> · current plate <b>${esc(c.plate || 'none')}</b></div>
      <div class="form-grid" style="margin-top:12px">
        <label class="field req"><span>New plate</span><input type="text" id="pl-new" maxlength="15" style="text-transform:uppercase" placeholder="e.g. B671BYD"></label>
        <label class="field"><span>Valid from</span><input type="date" id="pl-from" value="${todayISO()}"></label>
        <label class="field full"><span>Note</span><input type="text" id="pl-note" placeholder="e.g. permanent plates after registration" maxlength="200"></label>
      </div>
      <p class="small muted">Leave the new plate empty to record that the car has no plate (e.g. plates returned). Bookings are not affected.</p>
    </div>
    <div class="modal-foot"><button type="button" class="btn left" data-action="edit-car" data-id="${esc(c.id)}">◀ Back</button><button type="button" class="btn" data-action="close-modal">Close</button><button class="btn primary" type="submit">Save new plate</button></div></form>`, 'sm');
  if (window.matchMedia('(pointer:fine)').matches) $('#pl-new').focus();
  $('#pl-form').addEventListener('submit', async e => {
    e.preventDefault();
    const plate = $('#pl-new').value.trim().toUpperCase().replace(/\s+/g, '');
    const from = $('#pl-from').value || todayISO();
    const other = plate && S.cars.find(x => x.plate === plate && x.id !== c.id);
    if (other) return toast(`${plate} is on ${other.model} (VIN …${other.id.slice(-6)}). Use "Swap plates" instead.`, true);
    if (!plate && !confirm(`Remove the plate from this car? It will show as "no plate".`)) return;
    if (await mutate(() => api.changePlate(c.id, plate, from, $('#pl-note').value.trim()), plate ? `Plate changed: ${c.plate || 'none'} → ${plate}` : 'Plate removed')) openCar(c.id);
  });
}

function openPlateSwap(id) {
  const c = S.carMap.get(id);
  const others = S.cars.filter(x => x.id !== c.id && x.status !== 'Sold');
  openModal(`${modalHead(`${ICON.swap} Swap plates`)}
    <form id="ps-form"><div class="modal-body">
      <div class="alert blue">${esc(c.model)} · ${esc(c.colour || '')} · VIN <span class="mono">${esc(c.id)}</span> has <b>${esc(c.plate || 'no plate')}</b></div>
      <div class="form-grid" style="margin-top:12px">
        <label class="field req full"><span>Swap plates with</span><select id="ps-other"><option value="">Choose the other car…</option>
          ${S.models.map(m => { const l = others.filter(x => x.model === m.name); return l.length ? `<optgroup label="${esc(m.name)}">${l.map(x => `<option value="${esc(x.id)}">${esc(x.plate || 'no plate')} · ${esc(x.colour || '')} · VIN …${esc(x.id.slice(-6))}</option>`).join('')}</optgroup>` : ''; }).join('')}
        </select></label>
        <label class="field"><span>Valid from</span><input type="date" id="ps-from" value="${todayISO()}"></label>
        <label class="field"><span>Note</span><input type="text" id="ps-note" maxlength="200" placeholder="optional"></label>
      </div>
      <div id="ps-preview" class="checks"></div>
    </div>
    <div class="modal-foot"><button type="button" class="btn left" data-action="edit-car" data-id="${esc(c.id)}">◀ Back</button><button type="button" class="btn" data-action="close-modal">Close</button><button class="btn primary" type="submit">Swap plates</button></div></form>`, 'sm');
  const preview = () => {
    const o = S.carMap.get($('#ps-other').value);
    $('#ps-preview').innerHTML = o ? `<div class="alert green">${esc(c.model)} ${esc(c.colour || '')} (…${esc(c.id.slice(-6))}): <b>${esc(c.plate || 'none')} → ${esc(o.plate || 'none')}</b><br>
      ${esc(o.model)} ${esc(o.colour || '')} (…${esc(o.id.slice(-6))}): <b>${esc(o.plate || 'none')} → ${esc(c.plate || 'none')}</b><br><span class="small">Each car keeps its own bookings.</span></div>` : '';
  };
  $('#ps-other').addEventListener('change', preview);
  $('#ps-form').addEventListener('submit', async e => {
    e.preventDefault();
    const o = S.carMap.get($('#ps-other').value);
    if (!o) return toast('Choose the other car.', true);
    if (await mutate(() => api.swapPlates(c.id, o.id, $('#ps-from').value || todayISO(), $('#ps-note').value.trim()), `Plates swapped: ${c.plate || 'none'} ⇄ ${o.plate || 'none'}`)) openCar(c.id);
  });
}

function openPassword() {
  openModal(`${modalHead('Change password')}
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
    const X = window.XLSX;
    const wb = X.utils.book_new();
    for (const { name, rows, aoa, cols } of sheets) {
      const ws = aoa ? X.utils.aoa_to_sheet(aoa) : X.utils.json_to_sheet(rows.length ? rows : [{ Info: 'No rows' }]);
      if (cols) ws['!cols'] = cols;
      else {
        const keys = Object.keys(rows[0] || { Info: '' });
        ws['!cols'] = keys.map(k => ({ wch: Math.min(50, Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length)) + 2) }));
      }
      X.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    }
    X.writeFile(wb, filename);
  } catch (e) { toast(friendlyError(e), true); }
}
const stamp = () => todayISO().replace(/-/g, '');
const findRows = (model, n, start) => findResults(model, n, start).map(r => ({
  Plate: label(r.car), Model: r.car.model, Trim: r.car.trim_level || '', Colour: r.car.colour || '',
  'Free from': fmt(r.from), 'Return by': fmt(r.to), 'Free until': r.freeUntil ? fmt(r.freeUntil) : 'no later booking', Today: whereText(r.car.id) || 'Available',
}));
const bookingRow = b => {
  const car = S.carMap.get(b.car_id) || {};
  return {
    Plate: plateOf(b.car_id), VIN: b.car_id, Model: car.model || '', Colour: car.colour || '', Start: fmt(b.start_date), End: fmt(b.end_date), Days: nDays(b),
    'Driver / client': b.client, Purpose: b.purpose, Status: b.status, 'Booked by': b.booked_by || '', Notes: b.notes || '',
  };
};
// the visible Gantt as a grid, like the original Excel: one row per car, one column per day
function calendarSheet() {
  const c = S.cal, days = c.weeks * 7;
  const dates = Array.from({ length: days }, (_, i) => addDays(c.start, i));
  const cars = S.cars.filter(x => x.status !== 'Sold' && (c.model === 'All' || x.model === c.model));
  const aoa = [['Model', 'Colour', 'VIN', 'Plate', 'Trim', 'User', ...dates.map(fmtShort)]];
  for (const car of cars) {
    const row = [car.model, car.colour || '', car.id, car.plate || '', car.trim_level || '', car.holder || ''];
    for (const d of dates) {
      const b = bookingsOf(car.id).find(x => x.start_date <= d && x.end_date >= d);
      row.push(b ? (b.start_date === d || d === dates[0] ? b.client : '•') : '');
    }
    aoa.push(row);
  }
  return { name: 'Calendar', aoa, cols: [{ wch: 16 }, { wch: 11 }, { wch: 18 }, { wch: 13 }, { wch: 14 }, { wch: 18 }, ...dates.map(() => ({ wch: 7 }))] };
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied. Paste it in WeCom chat or email.'); return; } catch { /* fall back below */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  if (ok) return toast('Copied. Paste it in WeCom chat or email.');
  window.prompt('Copy this text:', text);
}
function quickText() {
  const Q = S.quick;
  const res = findResults(Q.model, Q.days, Q.start).slice(0, 10);
  const head = `Availability - ${Q.model === 'All' ? 'all models' : Q.model} - ${plural(Q.days, 'day')} from ${fmt(Q.start)}:`;
  return [head, ...res.map(r => `• ${label(r.car)} (${r.car.model}${r.car.colour ? ', ' + r.car.colour : ''}): ${fmt(r.from)} - ${fmt(r.to)}`)].join('\n');
}

// ------------------------------------------------------------------ actions (event delegation)
const actions = {
  tab(el) { S.view = el.dataset.tab; store.set('view2', S.view); closeMenu(); renderView(); window.scrollTo(0, 0); },
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
  'quick-reserve'() { openQuickReserve(); },
  'q-reserve'(el) { quickReserve(el.dataset.car, el.dataset.from); },
  'q-copy'() { copyText(quickText()); },
  'q-export'() { const Q = S.quick; exportXlsx(`Availability_${(Q.model === 'All' ? 'All_models' : Q.model).replace(/\W+/g, '_')}_${Q.days}d_${stamp()}.xlsx`, [{ name: 'Availability', rows: findRows(Q.model, Q.days, Q.start) }]); },
  'q-export-all'() {
    const Q = S.quick;
    const ov = modelOverview(Q.days, Q.start).map(o => ({ Model: o.model, 'In pool': o.pool, 'Free today': o.freeToday, 'Earliest start': o.earliest ? fmt(o.earliest) : 'no car in pool', 'Return by': o.to ? fmt(o.to) : '', 'Best car': o.bestCar || '', 'Other cars free then': o.earliest ? o.others : '' }));
    exportXlsx(`Availability_by_model_${Q.days}d_${stamp()}.xlsx`, [{ name: 'Overview', rows: ov }, ...S.models.map(m => ({ name: m.name.replace(/[\\/?*[\]:]/g, '-'), rows: findRows(m.name, Q.days, Q.start) }))]);
  },
  'cal-mode'(el) { S.cal.mode = el.dataset.mode; saveCal(); renderCalendar(); },
  'cal-move'(el) { S.cal.start = addDays(S.cal.start, +el.dataset.d); renderTimeline(); },
  'cal-today'() { S.cal.start = addDays(mondayOf(todayISO()), -7); renderTimeline(); },
  'cal-section'(el) { const k = el.dataset.key; S.cal[k] = !S.cal[k]; saveCal(); renderTimeline(); },
  'export-calendar'() { exportXlsx(`Calendar_${stamp()}.xlsx`, [calendarSheet()]); },
  'export-bookings'() { exportXlsx(`Bookings_${stamp()}.xlsx`, [{ name: 'Bookings', rows: filteredBookings().map(bookingRow) }]); },
  'export-fleet'() {
    exportXlsx(`Cars_${stamp()}.xlsx`, [{ name: 'Cars', rows: S.cars.map(c => ({ Plate: c.plate || '', Model: c.model, Colour: c.colour || '', Trim: c.trim_level || '', VIN: c.id, 'Earlier plates': platesOf(c.id).filter(p => p.plate !== c.plate).map(p => p.plate).join(', '), Status: c.status, User: c.holder || '', Today: whereText(c.id) || '', Notes: c.notes || '' })) }]);
  },
  'booking-actions'(el) { openBookingActions(+el.dataset.id); },
  'edit-booking'(el) { openBooking({ id: +el.dataset.id }); },
  'bk-shift-end'(el) {
    const b = bookingById(+el.dataset.id), n = +el.dataset.n;
    changeBooking(b, { end_date: addDays(b.end_date, n) }, n > 0 ? `Extended to ${fmt(addDays(b.end_date, n))}` : `Now returns ${fmt(addDays(b.end_date, n))}`);
  },
  'bk-shift-all'(el) {
    const b = bookingById(+el.dataset.id), n = +el.dataset.n;
    changeBooking(b, { start_date: addDays(b.start_date, n), end_date: addDays(b.end_date, n) }, `Moved to ${fmt(addDays(b.start_date, n))} – ${fmt(addDays(b.end_date, n))}`);
  },
  async 'bk-cancel'(el) {
    const b = bookingById(+el.dataset.id);
    if (!confirm(`Cancel the booking for ${b.client} (${dateRange(b)})? The car becomes free on those days.`)) return;
    if (await mutate(() => api.saveBooking({ ...b, status: 'Cancelled' }), 'Booking cancelled')) closeModal();
  },
  'bk-restore'(el) { const b = bookingById(+el.dataset.id); changeBooking(b, { status: 'Confirmed' }, 'Booking restored'); },
  'swap-pick'() { openSwapPicker(); },
  'swap-open'(el) { openSwap(+el.dataset.id); },
  async 'do-move'(el) {
    const b = bookingById(+el.dataset.id), to = el.dataset.car;
    if (await mutate(() => api.saveBooking({ ...b, car_id: to }), `${b.client} moved from ${plateOf(b.car_id)} to ${plateOf(to)}`)) { closeModal(); flashCar(to); }
  },
  async 'do-swap'(el) {
    const a = bookingById(+el.dataset.a), b = bookingById(+el.dataset.b);
    if (!confirm(`Swap cars?\n\n${a.client}: ${plateOf(a.car_id)} → ${plateOf(b.car_id)}\n${b.client}: ${plateOf(b.car_id)} → ${plateOf(a.car_id)}`)) return;
    if (await mutate(() => api.swapBookings(a.id, b.id), `Swapped: ${a.client} now has ${plateOf(b.car_id)}, ${b.client} has ${plateOf(a.car_id)}`)) { closeModal(); flashCar(b.car_id); }
  },
  'new-car'() { openCar(null); },
  'plate-change'(el) { openPlateChange(el.dataset.id); },
  'plate-swap'(el) { openPlateSwap(el.dataset.id); },
  'edit-car'(el) { openCar(el.dataset.id); },
  async 'remove-member'(el) {
    if (!confirm(`Remove ${el.dataset.email}? They will lose access immediately.`)) return;
    mutate(() => api.removeMember(el.dataset.email), 'Removed');
  },
  async 'delete-model'(el, e) {
    e.preventDefault();
    const name = el.dataset.name;
    if (S.cars.some(c => c.model === name)) return toast(`${name} is still used by cars, so it can't be removed.`, true);
    if (!confirm(`Remove the model ${name}?`)) return;
    mutate(() => api.deleteModel(name));
  },
  'close-modal'() { closeModal(); },
  // a stray click outside must never throw away a half-filled form
  'modal-backdrop'(el, e) { if (e.target === el && !el.querySelector('form, #q-client')) closeModal(); },
};
function closeMenu() { const m = $('.menu'); if (m) m.remove(); }

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) { closeMenu(); return; }
  const fn = actions[el.dataset.action];
  if (fn && !el.disabled) fn(el, e);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeMenu(); } });
window.addEventListener('focus', debounce(() => { if (S.me && $('#view') && !$('.modal')) reload(true); }, 1000));

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
window.__fleet = { earliestFree, conflicts, findResults, modelOverview, swapOption, addDays, daysBetween, mondayOf, S };
})();

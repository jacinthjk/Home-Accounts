/* =====================================================================
   Home Accounts – a private, offline account book for the home.
   All data is encrypted (AES-256-GCM) with a key protected by the
   user's password (PBKDF2-SHA256) and stored only on this device.
   Works on phones (installable app) and computers, in English and Tamil.
   ===================================================================== */
'use strict';
(() => {

/* ---------------------------------------------------------------------
   Small helpers
   --------------------------------------------------------------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');
const pad = n => String(n).padStart(2, '0');
const dkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pkey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d || 1); };
const todayKey = () => dkey(new Date());
const addDays = (k, n) => { const d = pkey(k); d.setDate(d.getDate() + n); return dkey(d); };
const mkey = k => k.slice(0, 7);
const addMonths = (mk, n) => { const d = pkey(mk + '-01'); d.setMonth(d.getMonth() + n); return dkey(d).slice(0, 7); };
const daysInMonth = mk => { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '').trim()); return Number.isFinite(n) ? n : NaN; };
const round2 = n => Math.round(n * 100) / 100;
const fmtQty = q => (q % 1 ? String(+q.toFixed(3)) : String(q));
const pct = n => `${Math.round(n)}%`;

/* ---------------------------------------------------------------------
   Language (English / Tamil). Texts are written in English in the code;
   i18n.js supplies the Tamil for each one.
   --------------------------------------------------------------------- */
const I18N = window.HA_I18N || { ui: {}, names: {}, units: {} };
const PREFS_KEY = 'homeAccounts.prefs'; // display prefs only (theme, text size, language) – nothing financial
function readPrefs() { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; } }
function writePrefs(p) { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...p })); } catch { /* ignore */ } }
let LANG = readPrefs().lang || (/^ta\b/i.test(navigator.language || '') ? 'ta' : 'en');
const missing = new Set(); window.__i18nMissing = missing; // helps spot untranslated text
function tr(s) {
  if (LANG !== 'ta') return s;
  const r = I18N.ui[s];
  if (r == null) { missing.add(s); return s; }
  return r;
}
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m));
/** Plain text in the current language. */
const t = (s, v) => fill(tr(s), v);
/** HTML: the text is escaped, **bold** becomes <b>, {vars} are inserted as given (already safe HTML). */
const th = (s, v) => fill(esc(tr(s)).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'), v);
/** "1 item" / "3 items" */
const plural = (n, one, many, v = {}) => t(n === 1 ? one : many, { n, ...v });
/** Names of the standard items, categories and income sources in Tamil (user-typed names stay as typed). */
const nm = name => (LANG === 'ta' && I18N.names[name]) || name;
/** The English name shown small under a translated one, so both languages are visible. */
const sub = name => (LANG === 'ta' && I18N.names[name] ? `<div class="sub-en">${esc(name)}</div>` : '');
const DLOC = () => (LANG === 'ta' ? 'ta-IN' : undefined);
const fmtDate = k => pkey(k).toLocaleDateString(DLOC(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtShort = k => pkey(k).toLocaleDateString(DLOC(), { weekday: 'short', day: 'numeric', month: 'short' });
const fmtMonth = mk => pkey(mk + '-01').toLocaleDateString(DLOC(), { month: 'long', year: 'numeric' });
const fmtMonthShort = mk => pkey(mk + '-01').toLocaleDateString(DLOC(), { month: 'short' });

function setLang(l) {
  LANG = l === 'ta' ? 'ta' : 'en';
  writePrefs({ lang: LANG });
  paintShell();
  if (!L.classList.contains('hidden')) (lockScreen || (() => showLock(lockMsg)))(); // stay on the same screen
  else if (S.dataKey) { render(); updateBadge(); }
}
/** Static parts of the page (menu, top bar) in the current language. */
function paintShell() {
  document.documentElement.lang = LANG;
  $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  // The phone menu has little room, so it uses short Tamil words
  if (LANG === 'ta') $$('.nav-lbl[data-i18n]').forEach(el => { el.textContent = I18N.menu?.[el.dataset.i18n] || el.textContent; });
  $('#toastHost').innerHTML = ''; // messages shown in the previous language
  const b = $('#btnLang');
  if (b) {
    b.innerHTML = LANG === 'ta' ? '<span aria-hidden="true">A</span><span class="lbl">English</span>' : '<span aria-hidden="true">அ</span><span class="lbl">தமிழ்</span>';
    b.title = LANG === 'ta' ? 'Switch to English' : 'தமிழுக்கு மாற்று';
  }
  $('#btnLock').title = t('Lock the app now');
  $('#btnPrivacy').title = t('Hide or show amounts');
  if (S.ui?.view) $('#topTitle').textContent = t(TITLES[S.ui.view]);
  applyPrefs();
  paintSyncBtn();
}
const langSwitch = () => `<div class="lang-switch" role="group" aria-label="Language / மொழி">
  <button type="button" class="chip" data-lang="en" aria-pressed="${LANG === 'en'}">English</button>
  <button type="button" class="chip" data-lang="ta" aria-pressed="${LANG === 'ta'}">தமிழ்</button></div>`;
document.addEventListener('click', e => { const b = e.target.closest('[data-lang]'); if (b) setLang(b.dataset.lang); });

/* ---------------------------------------------------------------------
   Money
   --------------------------------------------------------------------- */
const CURRENCIES = {
  INR: { sym: '₹', name: 'Indian Rupee (₹)', loc: 'en-IN' },
  USD: { sym: '$', name: 'US Dollar ($)', loc: 'en-US' },
  GBP: { sym: '£', name: 'British Pound (£)', loc: 'en-GB' },
  EUR: { sym: '€', name: 'Euro (€)', loc: 'en-IE' },
  AED: { sym: 'AED ', name: 'UAE Dirham (AED)', loc: 'en-US' },
  SAR: { sym: 'SAR ', name: 'Saudi Riyal (SAR)', loc: 'en-US' },
  PKR: { sym: 'Rs ', name: 'Pakistani Rupee (Rs)', loc: 'en-US' },
  LKR: { sym: 'Rs ', name: 'Sri Lankan Rupee (Rs)', loc: 'en-US' },
  BDT: { sym: '৳', name: 'Bangladeshi Taka (৳)', loc: 'en-US' },
  NPR: { sym: 'Rs ', name: 'Nepalese Rupee (Rs)', loc: 'en-US' },
  MYR: { sym: 'RM ', name: 'Malaysian Ringgit (RM)', loc: 'en-US' },
  SGD: { sym: 'S$', name: 'Singapore Dollar (S$)', loc: 'en-US' },
  AUD: { sym: 'A$', name: 'Australian Dollar (A$)', loc: 'en-AU' },
  CAD: { sym: 'C$', name: 'Canadian Dollar (C$)', loc: 'en-CA' },
  NGN: { sym: '₦', name: 'Nigerian Naira (₦)', loc: 'en-US' },
  KES: { sym: 'KSh ', name: 'Kenyan Shilling (KSh)', loc: 'en-US' },
};
const cur = () => CURRENCIES[S.data?.settings.cur] || CURRENCIES.INR;
function money(n) {
  const c = cur(), v = round2(n || 0);
  return (v < 0 ? '−' : '') + c.sym + Math.abs(v).toLocaleString(c.loc, { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
}
function compact(n) {
  const c = cur();
  return c.sym + new Intl.NumberFormat(c.loc, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
/** Money as HTML – blurred when "Hide amounts" is on. */
const M = n => `<span class="money num">${esc(money(n))}</span>`;

/* ---------------------------------------------------------------------
   Encryption (Web Crypto)
   A random 256-bit data key encrypts the accounts. That key is stored
   twice, each copy wrapped by a key derived from a secret:
     1) the user's password    2) the one-time recovery code
   --------------------------------------------------------------------- */
const VAULT_KEY = 'homeAccounts.vault.v1';
const ATTEMPT_KEY = 'homeAccounts.attempts';
const ITER = 310000;
const te = new TextEncoder(), td = new TextDecoder();
const b64 = buf => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const rand = n => crypto.getRandomValues(new Uint8Array(n));

async function deriveKek(secret, salt, iter) {
  const base = await crypto.subtle.importKey('raw', te.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(key, bytes) {
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { iv: b64(iv), ct: b64(ct) };
}
async function unseal(key, box) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct)));
}
async function wrapRaw(secret, raw) {
  const salt = rand(16);
  const k = await deriveKek(secret, salt, ITER);
  return { salt: b64(salt), iter: ITER, ...(await seal(k, raw)) };
}
async function unwrapRaw(secret, w) { // throws if the secret is wrong
  const k = await deriveKek(secret, unb64(w.salt), w.iter);
  return unseal(k, w);
}
const importDataKey = raw => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

const RC_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no 0/O/1/I
function newRecoveryCode() {
  const b = rand(20);
  const s = [...b].map(x => RC_ALPHABET[x & 31]).join('');
  return s.match(/.{4}/g).join('-');
}
const normCode = s => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

const readVault = () => { try { return JSON.parse(localStorage.getItem(VAULT_KEY)); } catch { return null; } };
const validVault = v => !!(v && v.app === 'HomeAccounts' && v.pw?.salt && v.pw?.ct && v.iv && v.ct);

/* ---------------------------------------------------------------------
   Session state (lives only in memory while unlocked)
   --------------------------------------------------------------------- */
const S = { dataKey: null, vault: null, data: null, ui: {}, shown: new Set() };

let saveTimer = null;
/** Save (encrypted) shortly. Also sends the change to the family, unless noSync. */
function persist(noSync) { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 300); if (!noSync) syncSoon(); }
async function flush() {
  clearTimeout(saveTimer); saveTimer = null;
  const key = S.dataKey;
  if (!key || !S.data) return;
  const box = await seal(key, te.encode(JSON.stringify(S.data)));
  if (S.dataKey !== key) return; // locked meanwhile
  S.vault = { ...S.vault, iv: box.iv, ct: box.ct, updated: new Date().toISOString() };
  try { localStorage.setItem(VAULT_KEY, JSON.stringify(S.vault)); }
  catch { toast(t('⚠️ Could not save'), t('Your browser storage is full or blocked. Please make a backup.'), 'danger'); }
}
window.addEventListener('pagehide', () => { if (saveTimer) flush(); });

function applyPrefs() {
  const p = readPrefs();
  document.documentElement.style.fontSize = `${17 * (p.fontScale || 1)}px`;
  if (p.theme === 'light' || p.theme === 'dark') document.documentElement.dataset.theme = p.theme;
  else delete document.documentElement.dataset.theme;
  document.body.classList.toggle('privacy', !!p.privacy && !!S.dataKey);
  const b = $('#btnPrivacy');
  if (b) { b.setAttribute('aria-pressed', String(!!p.privacy)); b.innerHTML = p.privacy ? `🙈<span class="lbl">${esc(t('Show'))}</span>` : `👁️<span class="lbl">${esc(t('Hide'))}</span>`; }
}

/* ---------------------------------------------------------------------
   Default data
   --------------------------------------------------------------------- */
const DEFAULT_CATS = [
  ['groc', 'Groceries', '🛒'], ['veg', 'Vegetables & Fruits', '🥦'], ['dairy', 'Milk & Dairy', '🥛'],
  ['home', 'Household & Cleaning', '🧴'], ['bills', 'Bills & Utilities', '💡'], ['travel', 'Travel & Fuel', '🚌'],
  ['health', 'Health & Medicine', '💊'], ['edu', 'Education & Kids', '📚'], ['cloth', 'Clothing & Personal', '👕'],
  ['eat', 'Eating Out & Snacks', '🍽️'], ['fest', 'Festivals & Gifts', '🎁'], ['other', 'Others', '📦'],
];
/* Units. Units with the same `dim` convert into each other (f = size in the smallest unit). */
const UNITS = {
  kg: { label: 'kg', dim: 'w', f: 1000, step: 1 },
  g: { label: 'g', dim: 'w', f: 1, step: 100 },
  L: { label: 'L', dim: 'v', f: 1000, step: 1 },
  ml: { label: 'ml', dim: 'v', f: 1, step: 100 },
  pcs: { label: 'pcs', dim: 'n', f: 1, step: 1 },
  dozen: { label: 'dozen', dim: 'n', f: 12, step: 1 },
  packet: { label: 'packet', dim: 'packet', f: 1, step: 1 },
  bottle: { label: 'bottle', dim: 'bottle', f: 1, step: 1 },
  box: { label: 'box', dim: 'box', f: 1, step: 1 },
  bundle: { label: 'bundle', dim: 'bundle', f: 1, step: 1 },
  metre: { label: 'metre', dim: 'metre', f: 1, step: 1 },
  each: { label: 'each', dim: 'each', f: 1, step: 1 },
};
const UNIT_KEYS = Object.keys(UNITS);
const unitOf = u => UNITS[u] || UNITS.each;
/** Unit name in the current language */
const ul = u => (LANG === 'ta' && I18N.units[u]) || unitOf(u).label;
const sameDim = (a, b) => unitOf(a).dim === unitOf(b).dim;
/** How many `to` units are in one `from` unit (only for units of the same kind). */
const conv = (from, to) => (sameDim(from, to) ? unitOf(from).f / unitOf(to).f : 1);
/** "₹60 / kg" or "₹45 each" */
const priceLabel = (price, unit) => (unit && unit !== 'each' ? `${M(price)} / ${esc(ul(unit))}` : th('{p} each', { p: M(price) }));
/** "2 kg", "500 g" – or just "2" for 'each' */
const qtyLabel = (q, unit) => (unit && unit !== 'each' ? `${fmtQty(q)} ${ul(unit)}` : fmtQty(q));
const unitOptions = sel => UNIT_KEYS.map(u => `<option value="${u}" ${u === sel ? 'selected' : ''}>${esc(ul(u))}</option>`).join('');

// [name, price for 1 unit, category, picture, unit]
const DEFAULT_ITEMS = [
  ['Rice', 60, 'groc', '🍚', 'kg'], ['Wheat Flour / Atta', 50, 'groc', '🌾', 'kg'], ['Cooking Oil', 160, 'groc', '🫒', 'L'],
  ['Sugar', 45, 'groc', '🍬', 'kg'], ['Dal / Pulses', 140, 'groc', '🥣', 'kg'], ['Tea / Coffee Powder', 120, 'groc', '☕', 'packet'],
  ['Salt & Spices', 50, 'groc', '🧂', 'packet'], ['Bread', 45, 'groc', '🍞', 'packet'], ['Eggs', 7, 'groc', '🥚', 'pcs'],
  ['Vegetables', 60, 'veg', '🥦', 'kg'], ['Onions', 40, 'veg', '🧅', 'kg'], ['Tomatoes', 40, 'veg', '🍅', 'kg'],
  ['Potatoes', 35, 'veg', '🥔', 'kg'], ['Fruits', 100, 'veg', '🍎', 'kg'], ['Bananas', 60, 'veg', '🍌', 'dozen'],
  ['Milk', 60, 'dairy', '🥛', 'L'], ['Curd / Yogurt', 40, 'dairy', '🥣', 'packet'], ['Butter / Ghee', 120, 'dairy', '🧈', 'packet'],
  ['Bathing Soap', 40, 'home', '🧼', 'pcs'], ['Washing Detergent', 120, 'home', '🧺', 'kg'], ['Dish Wash', 50, 'home', '🧽', 'bottle'], ['Toilet Cleaner', 90, 'home', '🧻', 'bottle'],
  ['Electricity Bill', 1500, 'bills', '💡', 'each'], ['Water Bill', 300, 'bills', '💧', 'each'], ['Cooking Gas Cylinder', 900, 'bills', '🔥', 'each'],
  ['Mobile Recharge', 299, 'bills', '📱', 'each'], ['Internet / Wi-Fi', 600, 'bills', '📶', 'each'], ['TV / Cable', 350, 'bills', '📺', 'each'],
  ['Bus / Auto Fare', 30, 'travel', '🚌', 'each'], ['Petrol', 105, 'travel', '⛽', 'L'],
  ['Medicines', 200, 'health', '💊', 'each'], ['Doctor Visit', 300, 'health', '🩺', 'each'],
  ['Stationery', 50, 'edu', '✏️', 'each'], ['School / Tuition Fees', 1000, 'edu', '🎒', 'each'],
  ['Clothes', 500, 'cloth', '👕', 'pcs'], ['Haircut / Salon', 150, 'cloth', '💇', 'each'],
  ['Snacks', 30, 'eat', '🍿', 'packet'], ['Eating Out', 300, 'eat', '🍽️', 'each'],
  ['Gifts', 500, 'fest', '🎁', 'each'], ['Pooja / Prayer Items', 100, 'fest', '🪔', 'each'],
  ['Home Repairs', 500, 'other', '🔧', 'each'],
];
// Older versions kept the quantity in the name ("Milk (1 L)"). Map them to a plain name + unit.
const OLD_NAMES = {
  'Rice (1 kg)': ['Rice', 'kg'], 'Wheat Flour / Atta (1 kg)': ['Wheat Flour / Atta', 'kg'], 'Cooking Oil (1 L)': ['Cooking Oil', 'L'],
  'Sugar (1 kg)': ['Sugar', 'kg'], 'Dal / Pulses (1 kg)': ['Dal / Pulses', 'kg'], 'Eggs (12)': ['Eggs', 'dozen'],
  'Onions (1 kg)': ['Onions', 'kg'], 'Tomatoes (1 kg)': ['Tomatoes', 'kg'], 'Potatoes (1 kg)': ['Potatoes', 'kg'],
  'Bananas (dozen)': ['Bananas', 'dozen'], 'Milk (1 L)': ['Milk', 'L'], 'Petrol (1 L)': ['Petrol', 'L'],
};
const DEFAULT_UNIT = Object.fromEntries(DEFAULT_ITEMS.map(x => [x[0], x[4]]));
const EMOJIS = ['🛒','🥦','🍎','🍌','🥛','🧈','🍞','🥚','🍚','🌾','🫒','🍬','🥣','☕','🧂','🧅','🍅','🥔','🐟','🍗','🧴','🧼','🧺','🧽','🧻','💡','💧','🔥','📱','📶','📺','🚌','⛽','🚕','💊','🩺','📚','✏️','🎒','👕','👗','💇','🍿','🍽️','🎁','🪔','🎉','🙏','🏠','🔧','🐶','👶','💳','📦'];
const INCOME_SOURCES = ['Salary', 'Business', 'Pension', 'Rent received', 'Interest / Savings', 'Gift received', 'Other'];

function defaultData(name, curCode) {
  const inr = curCode === 'INR';
  return {
    v: 2,
    created: new Date().toISOString(),
    settings: { name: name || '', cur: curCode, monthlyBudget: 0, autoLock: 5, lastBackup: null, voiceLang: LANG === 'ta' ? 'ta-IN' : 'en-IN', voiceCloudOk: false },
    categories: DEFAULT_CATS.map(([id, n, icon]) => ({ id, name: n, icon, budget: 0 })),
    // Sample prices are typical Indian prices; for other currencies the user sets their own.
    // `unit` = what the price is for; `qUnit` = the unit last used when buying (remembered).
    items: DEFAULT_ITEMS.map(([n, price, cat, icon, unit]) => ({ id: uid(), name: n, price: inr ? price : 0, cat, icon, unit, qUnit: unit })),
    ledger: {},
    income: [],
    plans: {},
  };
}
function migrate(d) {
  d.settings = { name: '', cur: 'INR', monthlyBudget: 0, autoLock: 5, lastBackup: null, voiceLang: 'en-IN', voiceCloudOk: false, ...(d.settings || {}) };
  d.categories ||= DEFAULT_CATS.map(([id, n, icon]) => ({ id, name: n, icon, budget: 0 }));
  if (!d.categories.some(c => c.id === 'other')) d.categories.push({ id: 'other', name: 'Others', icon: '📦', budget: 0 });
  d.items ||= []; d.ledger ||= {}; d.income ||= [];
  d.plans ||= {}; // month plans: { 'YYYY-MM': { income, cats: {catId: amount}, note, items: {id: planned payment} } }
  // v1 -> v2: add units. The amount of every saved entry stays exactly the same.
  const addUnit = x => {
    if (!x.unit) {
      const old = OLD_NAMES[x.name];
      if (old) [x.name, x.unit] = old;
      else x.unit = DEFAULT_UNIT[x.name] || 'each';
    }
    x.qUnit ||= x.unit;
  };
  d.items.forEach(addUnit);
  for (const day of Object.values(d.ledger)) Object.values(day.lines).forEach(addUnit);
  d.v = 2;
  return d;
}
const catInfo = id => S.data.categories.find(c => c.id === id) || S.data.categories.find(c => c.id === 'other');

/* ---------------------------------------------------------------------
   Calculations
   --------------------------------------------------------------------- */
/** Amount = quantity (in the unit bought) converted to the price's unit × price. 500 g of ₹60/kg = ₹30 */
const lineAmt = l => round2(l.qty * conv(l.qUnit || l.unit, l.unit) * l.price);
/** Adds a quantity to a {unit: qty} map, using kg / L / pcs for weight, volume and count. */
const NORMAL_UNIT = { w: 'kg', v: 'L', n: 'pcs' };
function addQty(map, q, unit) {
  const u = NORMAL_UNIT[unitOf(unit).dim] || unit || 'each';
  map[u] = round2((map[u] || 0) + q * conv(unit, u));
}
const qtyMapLabel = map => Object.entries(map).map(([u, q]) => (u === 'each' ? plural(q, '{n} time', '{n} times', { n: fmtQty(q) }) : qtyLabel(q, u))).join(' + ');
function dayTotal(k) {
  const d = S.data.ledger[k];
  return d ? round2(Object.values(d.lines).reduce((s, l) => s + lineAmt(l), 0)) : 0;
}
function monthStats(mk) {
  const r = { expense: 0, income: 0, byCat: {}, byItem: {}, byDay: {} };
  for (const [k, d] of Object.entries(S.data.ledger)) {
    if (!k.startsWith(mk)) continue;
    for (const l of Object.values(d.lines)) {
      const a = lineAmt(l);
      r.expense += a;
      r.byCat[l.cat] = (r.byCat[l.cat] || 0) + a;
      r.byDay[k] = (r.byDay[k] || 0) + a;
      const ik = l.name.trim().toLowerCase();
      const it = (r.byItem[ik] ||= { name: l.name, icon: l.icon, qty: {}, amt: 0 });
      addQty(it.qty, l.qty, l.qUnit || l.unit); it.amt += a;
    }
  }
  for (const i of S.data.income) if (i.date.startsWith(mk)) r.income += i.amount;
  r.expense = round2(r.expense); r.income = round2(r.income);
  return r;
}

/** Warnings & tips. Each alert: {id, lvl: danger|warning|info|good, ico, t (title), m (message)} */
function computeAlerts() {
  const tk = todayKey(), mk = mkey(tk), st = monthStats(mk), set = S.data.settings, out = [];
  const dom = pkey(tk).getDate(), dim = daysInMonth(mk), left = dim - dom + 1;

  if (set.monthlyBudget > 0) {
    const b = set.monthlyBudget, p = st.expense / b;
    if (p >= 1) out.push({ id: `bud-over-${mk}`, lvl: 'danger', ico: '🚨', t: t('Monthly budget crossed'),
      m: t('You have spent {a} this month – {b} more than your budget of {c}.', { a: money(st.expense), b: money(st.expense - b), c: money(b) }) });
    else if (p >= 0.8) out.push({ id: `bud-80-${mk}`, lvl: 'warning', ico: '⚠️', t: t('{p} of your monthly budget is used', { p: pct(p * 100) }),
      m: t(left > 1 ? 'Only {a} is left for the remaining {n} days. About {d} per day.' : 'Only {a} is left for the remaining {n} day. About {d} per day.',
        { a: money(b - st.expense), n: left, d: money((b - st.expense) / left) }) });
    else if (dom >= 5) {
      const proj = (st.expense / dom) * dim;
      if (proj > b * 1.05) out.push({ id: `bud-pace-${mk}`, lvl: 'info', ico: '📈', t: t('Spending is going fast'),
        m: t('At this pace you may spend about {a} this month, more than your budget of {b}.', { a: money(proj), b: money(b) }) });
    }
  }
  for (const c of S.data.categories) {
    if (!(c.budget > 0)) continue;
    const s = st.byCat[c.id] || 0, p = s / c.budget;
    if (p >= 1) out.push({ id: `cat-over-${c.id}-${mk}`, lvl: 'danger', ico: c.icon, t: t('{c}: budget crossed', { c: nm(c.name) }),
      m: t('Spent {a} against a budget of {b} ({c} extra).', { a: money(s), b: money(c.budget), c: money(s - c.budget) }) });
    else if (p >= 0.8) out.push({ id: `cat-80-${c.id}-${mk}`, lvl: 'warning', ico: c.icon, t: t('{c}: {p} of budget used', { c: nm(c.name), p: pct(p * 100) }),
      m: t('Spent {a} of {b}. {c} left.', { a: money(s), b: money(c.budget), c: money(c.budget - s) }) });
  }
  if (st.income > 0 && st.expense > st.income) {
    out.push({ id: `inc-over-${mk}`, lvl: 'danger', ico: '🔴', t: t('Spending is more than income'),
      m: t('This month you spent {a} but received {b}. You are short by {c}.', { a: money(st.expense), b: money(st.income), c: money(st.expense - st.income) }) });
  } else if (st.income > 0 && st.expense > st.income * 0.9) {
    out.push({ id: `inc-90-${mk}`, lvl: 'warning', ico: '🟠', t: t('Savings are very low this month'),
      m: t("You have used {p} of this month's income. Try to save at least 10–20%.", { p: pct(st.expense / st.income * 100) }) });
  }

  // Today compared with the usual daily spend (last 30 days with spending)
  const prev = [];
  for (let i = 1; i <= 30; i++) { const v = dayTotal(addDays(tk, -i)); if (v > 0) prev.push(v); }
  const today = dayTotal(tk);
  if (prev.length >= 5) {
    const avg = prev.reduce((a, b) => a + b, 0) / prev.length;
    if (today > avg * 2) out.push({ id: `day-high-${tk}-${Math.floor(today / avg)}`, lvl: 'warning', ico: '📅', t: t('High spending today'),
      m: t('Today you spent {a}, which is {x}× your usual daily spend of {b}.', { a: money(today), x: (today / avg).toFixed(1), b: money(avg) }) });
  }

  // Items costing more than usual (compared with the average of the last 3 months)
  const prevM = [1, 2, 3].map(n => monthStats(addMonths(mk, -n))).filter(s => s.expense > 0);
  if (prevM.length) {
    const over = [];
    for (const [k, it] of Object.entries(st.byItem)) {
      const avg = prevM.reduce((s, m) => s + (m.byItem[k]?.amt || 0), 0) / prevM.length;
      if (avg > 0 && it.amt > avg * 1.3) over.push({ k, it, avg, extra: it.amt - avg });
    }
    over.sort((a, b) => b.extra - a.extra).slice(0, 3).forEach(o => out.push({
      id: `item-${o.k}-${mk}`, lvl: 'warning', ico: o.it.icon || '🛍️', t: t('More spent on {i}', { i: nm(o.it.name) }),
      m: t('{a} this month, but usually about {b} a month ({c} more).', { a: money(o.it.amt), b: money(o.avg), c: money(o.extra) }) }));
  }

  // This month's plan: payments due soon / overdue, and spending above the plan
  const plan = S.data.plans?.[mk];
  if (plan) {
    for (const [pid, it] of Object.entries(plan.items || {})) {
      if (it.done || !it.day) continue;
      const due = `${mk}-${pad(Math.min(it.day, dim))}`, diff = Math.round((pkey(due) - pkey(tk)) / 864e5);
      if (diff < 0) out.push({ id: `plan-late-${mk}-${pid}`, lvl: 'warning', ico: '⏰', t: t('Planned payment overdue: {i}', { i: it.name }),
        m: t('{a} was due on {d}. Tick it in the Planner when it is paid.', { a: money(it.amount), d: fmtShort(due) }), act: 'planner', mk });
      else if (diff <= 3) out.push({ id: `plan-due-${mk}-${pid}`, lvl: 'info', ico: '📌', t: diff === 0 ? t('{i} is due today', { i: it.name }) : diff === 1 ? t('{i} is due tomorrow', { i: it.name }) : t('{i} is due in {n} days', { i: it.name, n: diff }),
        m: t('{a} – due on {d}.', { a: money(it.amount), d: fmtShort(due) }), act: 'planner', mk });
    }
    const pt = plannedTotal(mk);
    if (pt > 0 && st.expense > pt) out.push({ id: `plan-over-${mk}`, lvl: 'warning', ico: '📅', t: t("Spending is more than this month's plan"),
      m: t('Planned {a}, spent {b} ({c} more).', { a: money(pt), b: money(st.expense), c: money(st.expense - pt) }), act: 'planner', mk });
    for (const c of S.data.categories) {
      const p = planForCat(mk, c.id);
      if (!(p > 0) || c.budget > 0) continue; // a standing budget already warns for this type
      const s = st.byCat[c.id] || 0;
      if (s > p) out.push({ id: `plan-cat-${c.id}-${mk}`, lvl: 'warning', ico: c.icon, t: t('{c}: more than planned', { c: nm(c.name) }),
        m: t('Planned {a}, spent {b}.', { a: money(p), b: money(s) }), act: 'planner', mk });
    }
  }

  // Nothing wrong? Say something nice.
  if (!out.some(a => a.lvl === 'danger' || a.lvl === 'warning') && st.income > 0 && st.expense < st.income) {
    const rate = (st.income - st.expense) / st.income * 100;
    if (rate >= 20) out.push({ id: `good-${mk}`, lvl: 'good', ico: '🌟', t: t('Well done!'), m: t("You have saved {p} of this month's income so far.", { p: pct(rate) }) });
  }
  // Backup reminder
  const hasData = Object.keys(S.data.ledger).length || S.data.income.length;
  const lb = set.lastBackup ? (Date.now() - new Date(set.lastBackup)) / 864e5 : Infinity;
  if (hasData && lb > 14) out.push({ id: 'backup', lvl: 'info', ico: '💾', t: t('Time to make a backup'),
    m: set.lastBackup ? t('Your last backup was {n} days ago.', { n: Math.floor(lb) }) : t('You have not made a backup yet. If this device is lost, a backup keeps your accounts safe.'), act: 'backup' });
  return out;
}
function updateBadge(alerts = computeAlerts()) {
  const n = alerts.filter(a => a.lvl === 'danger' || a.lvl === 'warning').length;
  const b = $('#alertBadge'); b.textContent = n; b.classList.toggle('hidden', !n);
}
let alertTimer = null;
function scheduleAlertCheck() {
  clearTimeout(alertTimer);
  alertTimer = setTimeout(() => {
    if (!S.data) return;
    const alerts = computeAlerts(); updateBadge(alerts);
    let shown = 0;
    for (const a of alerts) {
      if ((a.lvl === 'danger' || a.lvl === 'warning') && !S.shown.has(a.id)) {
        S.shown.add(a.id);
        if (shown++ < 2) toast(`${a.ico} ${a.t}`, a.m, a.lvl);
      }
    }
  }, 700);
}

/* ---------------------------------------------------------------------
   UI primitives: toast, modal, confirm, file helpers
   --------------------------------------------------------------------- */
function toast(title, msg = '', lvl = '') {
  const el = document.createElement('div');
  el.className = `toast ${lvl}`;
  el.setAttribute('role', lvl === 'danger' ? 'alert' : 'status');
  el.innerHTML = `<div style="flex:1"><b>${esc(title)}</b>${msg ? `<div class="small">${esc(msg)}</div>` : ''}</div><button class="link-btn" style="color:inherit" aria-label="${esc(t('Close'))}">✕</button>`;
  el.querySelector('button').onclick = () => el.remove();
  const host = $('#toastHost');
  host.appendChild(el);
  while (host.children.length > 2) host.firstElementChild.remove();
  setTimeout(() => el.remove(), lvl ? 9000 : 2500);
}
function modal(html, setup, onClose) {
  const host = $('#modalHost');
  host.innerHTML = `<div class="overlay"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const ov = host.firstElementChild, box = ov.firstElementChild;
  const onKey = e => { if (e.key === 'Escape') close(); };
  const close = () => {
    if (!ov.isConnected) return;
    host.innerHTML = ''; document.removeEventListener('keydown', onKey);
    if (S.dataKey) onClose?.();
  };
  document.addEventListener('keydown', onKey);
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  $$('[data-close]', box).forEach(b => { b.onclick = close; });
  setup?.(box, close);
  // On phones, don't pop the keyboard up straight away – only focus a field on computers.
  const first = box.querySelector('[autofocus], input:not([type=checkbox]), select, textarea');
  if (first && (!isTouch() || first.hasAttribute('autofocus'))) { first.focus(); first.select?.(); }
  return close;
}
const isTouch = () => matchMedia('(pointer: coarse)').matches;
function confirmBox(msg, okLabel = t('Yes'), danger = false) {
  return new Promise(res => {
    let done = false;
    modal(`<h3>${esc(t('Please confirm'))}</h3><p>${esc(msg)}</p>
      <div class="actions"><button class="btn" data-no>${esc(t('Cancel'))}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(okLabel)}</button></div>`,
      (box, close) => {
        box.querySelector('[data-no]').onclick = () => { done = true; close(); res(false); };
        box.querySelector('[data-yes]').onclick = () => { done = true; close(); res(true); };
      });
    const obs = new MutationObserver(() => { if (!$('#modalHost').firstChild) { obs.disconnect(); if (!done) res(false); } });
    obs.observe($('#modalHost'), { childList: true });
  });
}
function infoBox(title, msg) {
  modal(`<h3>${esc(title)}</h3><p>${esc(msg)}</p><div class="actions"><button class="btn primary" data-close>${esc(t('OK'))}</button></div>`);
}
function pickFile(accept) {
  return new Promise(res => {
    const i = document.createElement('input');
    i.type = 'file';
    if (accept && !isTouch()) i.accept = accept; // phones may grey out .json files when filtered
    i.onchange = () => res(i.files[0] || null);
    i.click();
  });
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
const pwToggle = form => {
  const cb = form.querySelector('[data-showpw]');
  if (cb) cb.onchange = () => $$('input[type=password], input[data-pw]', form).forEach(i => { i.dataset.pw = '1'; i.type = cb.checked ? 'text' : 'password'; });
  // Warn when Caps Lock is on – a common reason a correct password "doesn't work"
  const warn = document.createElement('div');
  warn.className = 'alert warning hidden';
  warn.setAttribute('role', 'status');
  warn.innerHTML = `<span class="ico" aria-hidden="true">⇪</span><div><b>${esc(t('Caps Lock is ON'))}</b><span class="small">${esc(t('Capital letters are being typed. Press the Caps Lock key to turn it off.'))}</span></div>`;
  (cb?.closest('label') || form.lastElementChild).before(warn);
  const onKey = e => { if (e.getModifierState) warn.classList.toggle('hidden', !e.getModifierState('CapsLock')); };
  $$('input[type=password]', form).forEach(i => { i.addEventListener('keydown', onKey); i.addEventListener('keyup', onKey); });
};
const WEAK = ['123456', '1234567', '12345678', '123456789', 'password', 'qwerty', '111111', '000000', 'abcdef', 'abc123', '654321', '121212'];
function checkNewPassword(p1, p2) {
  if (p1.length < 6) return t('Password must have at least 6 letters or numbers.');
  if (WEAK.includes(p1.toLowerCase()) || /^(.)\1+$/.test(p1)) return t('That password is too easy to guess. Please choose another.');
  if (p1 !== p2) return t('The two passwords do not match. Please type them again.');
  return '';
}
const busy = async (btn, label, fn) => {
  const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = `⏳ ${esc(label)}`;
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = old; }
};

/* ---------------------------------------------------------------------
   Accounts & lock screen
   Everyone signs up with a mobile number (their unique login) + password,
   and can log in on any device. The password is never sent anywhere:
     • authSecret (PBKDF2 of password + number) is what the cloud sign-in sees;
     • a different key, also from the password, unlocks the data key.
   The data key unlocks this device's copy and the person's key ring in
   the cloud (which family book they use, and that book's key).
   --------------------------------------------------------------------- */
const L = $('#lock');
let lockMsg = '';
let lockScreen = null; // the lock screen now shown, so a language switch can draw it again
const frame = inner => `<div class="lock-card">${langSwitch()}<div class="lock-logo" aria-hidden="true">📒</div><h1>${esc(t('Home Accounts'))}</h1>${inner}</div>`;
const curOptions = sel => Object.entries(CURRENCIES).map(([k, c]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(nm(c.name))}</option>`).join('');

const HA_CFG = () => window.HA_CONFIG || {};
const cloudReady = () => !!(HA_CFG().supabaseUrl && HA_CFG().supabaseKey);
const cloudCfg = () => ({ url: cleanUrl(HA_CFG().supabaseUrl), anon: String(HA_CFG().supabaseKey || '').trim() });
const phoneEmail = p => `${p.slice(1)}@phone.home-accounts.app`;
const COUNTRIES = [['91', '🇮🇳'], ['94', '🇱🇰'], ['92', '🇵🇰'], ['880', '🇧🇩'], ['977', '🇳🇵'], ['971', '🇦🇪'], ['966', '🇸🇦'], ['974', '🇶🇦'],
  ['965', '🇰🇼'], ['968', '🇴🇲'], ['973', '🇧🇭'], ['65', '🇸🇬'], ['60', '🇲🇾'], ['44', '🇬🇧'], ['1', '🇺🇸'], ['61', '🇦🇺'], ['64', '🇳🇿'],
  ['234', '🇳🇬'], ['254', '🇰🇪'], ['27', '🇿🇦']];
/** "+919876543210" from country code + what was typed, or null if it is not a valid mobile number */
function normPhone(cc, typed) {
  let d = String(typed || '').replace(/\D/g, '');
  if (d.length > 10 && d.startsWith(cc)) d = d.slice(cc.length);
  d = d.replace(/^0+/, '');
  if (cc === '91') return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
  return d.length >= 6 && cc.length + d.length <= 15 ? `+${cc}${d}` : null;
}
const splitPhone = p => { const c = COUNTRIES.map(x => x[0]).sort((a, b) => b.length - a.length).find(x => p?.startsWith('+' + x)); return c ? [c, p.slice(c.length + 1)] : ['91', '']; };
const showPhone = p => { const [c, n] = splitPhone(p); return n ? `+${c} ${n}` : p || ''; };
const maskPhone = p => { const [c, n] = splitPhone(p); return n ? `+${c} ${n.slice(0, 2)}${'•'.repeat(Math.max(0, n.length - 5))}${n.slice(-3)}` : ''; };
const phoneField = (phone = '') => { const [cc, n] = splitPhone(phone); return `<label class="field"><span>${esc(t('Mobile number'))}</span>
  <div class="row phone-row"><select class="input" name="cc" aria-label="${esc(t('Country code'))}">${COUNTRIES.map(([c, f]) => `<option value="${c}" ${c === cc ? 'selected' : ''}>${f} +${c}</option>`).join('')}</select>
  <input class="input" name="phone" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="16" value="${esc(n)}" placeholder="98765 43210"></div></label>`; };

async function pbkdfB64(secret, saltText, iter) {
  const base = await crypto.subtle.importKey('raw', te.encode(secret), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: te.encode(saltText), iterations: iter, hash: 'SHA-256' }, base, 256));
}
const authSecret = (phone, pw) => pbkdfB64(pw, 'home-accounts:auth:' + phone, ITER);
const rcProof = (phone, code) => pbkdfB64(normCode(code), 'home-accounts:recovery:' + phone, 100000);
const sha256hex = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
async function sealStr(key, obj) { const b = await seal(key, te.encode(JSON.stringify(obj))); return `${b.iv}.${b.ct}`; }
async function openStr(key, s) { const [iv, ct] = String(s).split('.'); return JSON.parse(td.decode(await unseal(key, { iv, ct }))); }
class UserError extends Error {}
function accountError(e) {
  if (e instanceof UserError) return e.message;
  if (e?.net) return t('This needs an internet connection. Please connect and try again.');
  if (e?.status === 429) return t('Too many tries. Please wait a few minutes and try again.');
  return setupError(e);
}
/** Lines/notes/income that belong to other people in a family book: kept as one's own (keep) or removed. */
function detachShared(d, keep) {
  const me = d.sync?.me;
  for (const [date, day] of Object.entries(d.ledger || {})) {
    for (const k of Object.keys(day.lines)) {
      if (!k.includes('@')) continue;
      if (keep) day.lines['x_' + uid()] = day.lines[k];
      delete day.lines[k];
    }
    delete day.others;
    if (!Object.keys(day.lines).length && !day.note) delete d.ledger[date];
  }
  if (!keep) {
    d.income = (d.income || []).filter(i => !i.by || i.by === me);
    for (const p of Object.values(d.plans || {})) for (const [id, it] of Object.entries(p.items || {})) if (it.by && it.by !== me) delete p.items[id];
  }
  delete d.sync;
}
const markMine = (d, id) => {
  for (const x of [...d.items, ...d.categories, ...d.income]) x.by = id;
  for (const p of Object.values(d.plans || {})) for (const it of Object.values(p.items || {})) it.by = id;
};

/** Creates the account's own family book, key ring and profile, and this device's locked copy. Returns the recovery code. */
async function finishAccount(cfg, userId, phone, password, name, curCode, existing) {
  const raw = rand(32), code = newRecoveryCode();
  const pw = await wrapRaw(password, raw), rc = await wrapRaw(normCode(code), raw);
  const dataKey = await importDataKey(raw); raw.fill(0);
  const fk = rand(32);
  SYNC.key = await importDataKey(fk);
  const book = await rpc('ha_create_book', { p_key_check: await sealRec({ check: 'home-accounts' }), p_name_enc: await sealRec({ n: name || showPhone(phone) }) }, cfg);
  await rpc('ha_register', { p_phone: phone, p_pw_wrap: JSON.stringify(pw), p_rc_wrap: JSON.stringify(rc),
    p_rc_verifier: await sha256hex(await rcProof(phone, code)), p_keyring: await sealStr(dataKey, { book, fk: b64(fk), creator: true }) }, cfg);
  const d = existing || defaultData(name, curCode);
  if (existing) detachShared(d, true);
  markMine(d, userId);
  if (name) d.settings.name = name;
  d.account = { phone, uid: userId };
  d.sync = { url: cfg.url, anon: cfg.anon, rt: cfg.rt, book, me: userId, role: 'owner', creator: true, name: name || '', fk: b64(fk), cursor: 0, snap: {},
    members: { [userId]: { name, role: 'owner', status: 'active' } } };
  fk.fill(0);
  S.dataKey = dataKey; S.vault = { app: 'HomeAccounts', v: 2, pw, rc, acct: { phone } }; S.data = migrate(d);
  await flush();
  return code;
}
async function createAccount(phone, password, name, curCode, existing = null) {
  const cfg = cloudCfg();
  stopSync();
  let j;
  try { j = await sbFetch(cfg, '/auth/v1/signup', { email: phoneEmail(phone), password: await authSecret(phone, password), data: {} }); }
  catch (e) {
    if (e.code === 'user_already_exists' || /already (registered|exists)/i.test(e.message)) throw new UserError(t('This mobile number already has an account. Please log in instead.'));
    throw e;
  }
  if (!j?.access_token) throw new UserError(t('The cloud is set to confirm email addresses. In Supabase, turn OFF "Confirm email" (Authentication → Sign In / Providers → Email).'));
  const a = tokenInfo(j);
  SYNC.at = a.at; SYNC.atExp = a.exp; cfg.rt = a.rt;
  return finishAccount(cfg, a.uid, phone, password, name, curCode, existing);
}
/** Logs in on this device. Returns { code } if the account set-up had to be finished now. */
async function logIn(phone, password) {
  const cfg = cloudCfg();
  stopSync();
  let j;
  try { j = await sbFetch(cfg, '/auth/v1/token?grant_type=password', { email: phoneEmail(phone), password: await authSecret(phone, password) }); }
  catch (e) {
    if (e.status === 400 || e.code === 'invalid_credentials') throw new UserError(t('The mobile number or password is not correct.'));
    throw e;
  }
  const a = tokenInfo(j);
  SYNC.at = a.at; SYNC.atExp = a.exp; cfg.rt = a.rt;
  const prof = await rpc('ha_profile_get', {}, cfg);
  if (!prof) return { code: await finishAccount(cfg, a.uid, phone, password, '', 'INR', null) };
  const pw = JSON.parse(prof.pw_wrap), rc = prof.rc_wrap ? JSON.parse(prof.rc_wrap) : null;
  let raw;
  try { raw = await unwrapRaw(password, pw); } catch { throw new UserError(t('The mobile number or password is not correct.')); }
  const key = await importDataKey(raw); raw.fill(0);
  const kr = await openStr(key, prof.keyring);
  // This account's copy already on this device? Keep it (it may hold changes not yet sent).
  const local = readVault();
  let data = null;
  if (local?.acct?.phone === phone) { try { data = JSON.parse(td.decode(await unseal(key, local))); } catch { data = null; } }
  const fresh = !data || data.sync?.book !== kr.book;
  if (fresh) data = { settings: { name: '', cur: 'INR' }, categories: [], items: [], ledger: {}, income: [], plans: {} };
  data.account = { phone, uid: a.uid };
  data.sync = { ...(fresh ? { cursor: 0, snap: {}, members: {}, fresh: true } : data.sync), url: cfg.url, anon: cfg.anon, rt: cfg.rt,
    book: kr.book, me: a.uid, role: data.sync?.role || 'owner', creator: !!kr.creator, name: data.sync?.name || '', fk: kr.fk };
  S.dataKey = key; S.vault = { app: 'HomeAccounts', v: 2, pw, rc, acct: { phone } }; S.data = migrate(data);
  await flush();
  return {};
}
async function recoverAccount(phone, code, newPassword) {
  const cfg = cloudCfg(), proof = await rcProof(phone, code);
  let r;
  try { r = await sbFetch(cfg, '/rest/v1/rpc/ha_recovery_start', { p_phone: phone, p_proof: proof }); }
  catch (e) { if (/not correct/.test(e.message || '')) throw new UserError(t('That mobile number and recovery code do not match.')); throw e; }
  let raw;
  try { raw = await unwrapRaw(normCode(code), JSON.parse(r.rc_wrap)); } catch { throw new UserError(t('That mobile number and recovery code do not match.')); }
  const pw = await wrapRaw(newPassword, raw); raw.fill(0);
  await sbFetch(cfg, '/rest/v1/rpc/ha_recovery_finish', { p_phone: phone, p_proof: proof, p_new_auth: await authSecret(phone, newPassword), p_pw_wrap: JSON.stringify(pw) });
  return logIn(phone, newPassword);
}
/** Sign out of this device: send anything left, then remove this device's copy (it stays in the cloud). */
async function signOutDevice() {
  if (shared() && S.dataKey) {
    try { await syncNow({ throwErrors: true }); }
    catch { if (!(await confirmBox(t('Some changes on this device have not reached the cloud yet (no internet). If you sign out now they will be lost. Sign out anyway?'), t('Sign out'), true))) return; }
    try { await sbFetch(sy(), '/auth/v1/logout', {}, SYNC.at); } catch { /* offline: fine */ }
  }
  localStorage.removeItem(VAULT_KEY);
  resetAttempts();
  hardLock(t('You have signed out of this device. Log in to see your accounts again.'));
}

function showLock(msg = '') {
  lockMsg = msg;
  $('#app').classList.add('hidden');
  L.classList.remove('hidden');
  applyPrefs();
  if (!window.crypto?.subtle) {
    L.innerHTML = frame(`<p class="sub">${esc(t('This browser cannot protect your data. Please open this app in a recent version of Google Chrome, Microsoft Edge, Safari or Firefox, from its secure (https) address.'))}</p>`);
    return;
  }
  let embedded = true;
  try { embedded = window.self !== window.top; } catch { /* cross-origin parent => embedded */ }
  if (embedded) { // e.g. an editor's preview pane: it reloads on its own and may not keep data safely
    L.innerHTML = frame(`<div class="alert warning"><span class="ico" aria-hidden="true">⚠️</span><div>
      <b>${esc(t('Please open this app in your web browser'))}</b>
      <span class="small">${esc(t('It is running inside a preview window, which can reload by itself and lose what you type.'))}</span></div></div>
      <p>${th('Close this window, then go to the **Account Management** folder and **double-click index.html**. It will open in Microsoft Edge or Google Chrome.')}</p>`);
    return;
  }
  const v = readVault();
  if (v) return lockUnlock(msg);
  if (!cloudReady()) return lockNoCloud();
  lockSignup(msg);
}

function lockNoCloud() {
  lockScreen = () => lockNoCloud();
  L.innerHTML = frame(`<div class="alert warning"><span class="ico" aria-hidden="true">☁️</span><div>
      <b>${esc(t('This app is not connected to its cloud yet'))}</b>
      <span class="small">${esc(t('Accounts are stored in the cloud, so the person who set up this app must first add the cloud address in the file config.js (see the README, "Setting up the cloud").'))}</span></div></div>
    <div class="links"><button class="link-btn" id="lnkRestore">${esc(t('Restore from a backup file'))}</button></div>`);
  $('#lnkRestore').onclick = async () => { if (await restoreFromFile()) showLock(t('Backup loaded. Enter the password you used when the backup was made.')); };
}

function lockSignup(msg = '') {
  lockScreen = () => lockSignup(msg);
  L.innerHTML = frame(`
    ${msg ? `<div class="alert info"><span class="ico">ℹ️</span><div>${esc(msg)}</div></div>` : ''}
    <button class="btn block" id="toLogin" style="margin-bottom:14px">🔑 ${esc(t('I already have an account – Log in'))}</button>
    <h3 style="text-align:center;margin:4px 0 6px">${esc(t('Create your account'))}</h3>
    <p class="sub">${esc(t('Your mobile number is your login. Use the same number and password to open your accounts on any phone or computer.'))}</p>
    <form id="f" autocomplete="off">
      <label class="field"><span>${esc(t('Your name'))}</span><input class="input" name="name" maxlength="40" autocomplete="name"></label>
      ${phoneField()}
      <label class="field"><span>${esc(t('Currency'))}</span><select class="input" name="cur">${curOptions('INR')}</select></label>
      <label class="field"><span>${esc(t('Create a password'))}</span><input class="input" type="password" name="p1" autocomplete="new-password"></label>
      <label class="field"><span>${esc(t('Type the same password again'))}</span><input class="input" type="password" name="p2" autocomplete="new-password"></label>
      <label class="check"><input type="checkbox" data-showpw> ${esc(t('Show password'))}</label>
      <p class="small muted">${th('Use at least 6 letters or numbers. A short phrase you will remember is best, for example **mango tree 1984**. Do not share it with anyone.')}</p>
      <div class="error-msg" id="err" role="alert"></div>
      <button class="btn primary block">🔐 ${esc(t('Create my account'))}</button>
    </form>
    <div class="links"><button class="link-btn" id="lnkRestore">${esc(t('I already have a backup file'))}</button></div>`);
  const f = $('#f'); pwToggle(f);
  $('#toLogin').onclick = () => lockLogin();
  $('#lnkRestore').onclick = async () => { if (await restoreFromFile()) showLock(t('Backup loaded. Enter the password you used when the backup was made.')); };
  f.onsubmit = async e => {
    e.preventDefault();
    const phone = normPhone(f.cc.value, f.phone.value);
    const err = checkNewPassword(f.p1.value, f.p2.value) || (!phone ? t('Please enter a valid mobile number.') : '');
    $('#err').textContent = err; if (err) return;
    await busy(f.querySelector('button.primary'), t('Creating your account…'), async () => {
      try { const code = await createAccount(phone, f.p1.value, f.name.value.trim(), f.cur.value); showRecoveryCode(code, () => startApp()); }
      catch (ex) { S.dataKey = null; S.data = null; $('#err').textContent = accountError(ex); }
    });
  };
}

function lockLogin(phone = '') {
  lockScreen = () => lockLogin(phone);
  L.innerHTML = frame(`
    <h3 style="text-align:center;margin:4px 0 6px">${esc(t('Log in'))}</h3>
    <p class="sub">${esc(t('Use the mobile number and password of your Home Accounts account.'))}</p>
    <form id="f" autocomplete="on">
      ${phoneField(phone)}
      <label class="field"><span>${esc(t('Password'))}</span><input class="input" type="password" name="pw" autocomplete="current-password"></label>
      <label class="check"><input type="checkbox" data-showpw> ${esc(t('Show password'))}</label>
      <div class="error-msg" id="err" role="alert">${esc(waitMsg())}</div>
      <button class="btn primary block">🔓 ${esc(t('Log in'))}</button>
    </form>
    <div class="links">
      <button class="link-btn" id="lnkForgot">${esc(t('Forgot password? Use recovery code'))}</button>
      <button class="link-btn" id="lnkSignup">${esc(t('Create a new account'))}</button>
    </div>`);
  const f = $('#f'); pwToggle(f);
  $('#lnkForgot').onclick = () => lockRecover(normPhone(f.cc.value, f.phone.value) || '');
  $('#lnkSignup').onclick = () => lockSignup();
  f.onsubmit = async e => {
    e.preventDefault();
    const w = waitMsg(); if (w) { $('#err').textContent = w; return; }
    const ph = normPhone(f.cc.value, f.phone.value);
    if (!ph) { $('#err').textContent = t('Please enter a valid mobile number.'); return; }
    if (!f.pw.value) { $('#err').textContent = t('Please type your password.'); return; }
    await busy(f.querySelector('button.primary'), t('Logging in…'), async () => {
      try {
        const r = await logIn(ph, f.pw.value);
        resetAttempts();
        if (r.code) showRecoveryCode(r.code, () => startApp()); else startApp();
      } catch (ex) {
        if (ex instanceof UserError) failAttempt();
        S.dataKey = null; S.data = null;
        $('#err').textContent = waitMsg() || accountError(ex);
      }
    });
  };
}

function showRecoveryCode(code, onDone, inModal = false) {
  const html = `
    <h3 style="text-align:center">📝 ${esc(t('Your recovery code'))}</h3>
    <p>${th('If you ever forget your password, this code is the **only way** to open your accounts. Please write it on paper and keep it somewhere safe.')}</p>
    <div class="recovery-code">${esc(code)}</div>
    <p class="small muted">${esc(t('Nobody else – not even the app maker – can recover your data without your password or this code.'))}</p>
    <label class="check"><input type="checkbox" id="rcOk"> ${esc(t('I have written down my recovery code'))}</label>
    <button class="btn primary block" id="rcDone" disabled>${esc(t('Continue'))}</button>`;
  const wire = (root, close) => {
    const ok = $('#rcOk', root), btn = $('#rcDone', root);
    ok.onchange = () => { btn.disabled = !ok.checked; };
    btn.onclick = () => { close?.(); onDone?.(); };
  };
  if (inModal) modal(html, wire);
  else { lockScreen = () => showRecoveryCode(code, onDone); L.innerHTML = frame(html); wire(L); }
}

function getAttempts() { try { return JSON.parse(localStorage.getItem(ATTEMPT_KEY)) || { n: 0, until: 0 }; } catch { return { n: 0, until: 0 }; } }
function failAttempt() {
  const a = getAttempts(); a.n++;
  if (a.n >= 5) a.until = Date.now() + Math.min(15 * 60e3, 30e3 * 2 ** (a.n - 5));
  localStorage.setItem(ATTEMPT_KEY, JSON.stringify(a));
  return a;
}
const resetAttempts = () => localStorage.removeItem(ATTEMPT_KEY);
function waitMsg() {
  const a = getAttempts(), s = Math.ceil((a.until - Date.now()) / 1000);
  if (s <= 0) return '';
  return s > 90 ? t('Too many wrong tries. Please wait {n} minutes and try again.', { n: Math.ceil(s / 60) })
    : t('Too many wrong tries. Please wait {n} seconds and try again.', { n: s });
}

/** This device already has a locked copy: open it with the password (works without internet). */
function lockUnlock(msg = '') {
  lockScreen = () => lockUnlock(msg);
  const v = readVault(), phone = v?.acct?.phone;
  L.innerHTML = frame(`
    <p class="sub">${esc(t('Welcome back! Enter your password to open your accounts.'))}</p>
    ${phone ? `<p class="sub" style="margin-top:-12px">👤 ${esc(maskPhone(phone))}</p>` : ''}
    ${!phone && cloudReady() ? `<div class="alert info"><span class="ico">📱</span><div><b>${esc(t('Home Accounts now uses your mobile number'))}</b>
      <span class="small">${esc(t('This device has accounts saved from before. Open them with your password, and next you will add your mobile number – everything is kept and moved into your new account.'))}</span></div></div>` : ''}
    ${msg ? `<div class="alert info"><span class="ico">ℹ️</span><div>${esc(msg)}</div></div>` : ''}
    <form id="f">
      <label class="field"><span>${esc(t('Password'))}</span><input class="input" type="password" name="pw" autocomplete="current-password" autofocus></label>
      <label class="check"><input type="checkbox" data-showpw> ${esc(t('Show password'))}</label>
      <div class="error-msg" id="err" role="alert">${esc(waitMsg())}</div>
      <button class="btn primary block">🔓 ${esc(t('Open my accounts'))}</button>
    </form>
    <div class="links">
      <button class="link-btn" id="lnkForgot">${esc(t('Forgot password? Use recovery code'))}</button>
      ${phone && cloudReady() ? `<button class="link-btn" id="lnkOther">${esc(t('Log in with a different account'))}</button>` : ''}
      ${!phone && cloudReady() ? `<button class="link-btn" id="lnkPhone">📱 ${esc(t('I already have an account – log in with my mobile number'))}</button>` : ''}
      <button class="link-btn" id="lnkRestore">${esc(t('Restore from a backup file'))}</button>
    </div>`);
  const f = $('#f'); pwToggle(f);
  if (!isTouch()) f.pw.focus();
  $('#lnkForgot').onclick = () => lockRecover(phone || '');
  $('#lnkOther')?.addEventListener('click', async () => {
    if (await confirmBox(t('This removes the accounts of {p} from this device (they stay safe in the cloud if they were synced). Continue?', { p: maskPhone(phone) }), t('Yes, continue'), true)) {
      localStorage.removeItem(VAULT_KEY); resetAttempts(); lockLogin();
    }
  });
  $('#lnkPhone')?.addEventListener('click', async () => {
    if (await confirmBox(t('The accounts saved on this device from before will be removed from this device. If you want to keep them, open them with your password instead – they are then moved into your account. Remove them and log in with a mobile number?'), t('Remove and log in'), true)) {
      localStorage.removeItem(VAULT_KEY); resetAttempts(); lockLogin();
    }
  });
  $('#lnkRestore').onclick = async () => { if (await restoreFromFile()) showLock(t('Backup loaded. Enter the password you used when the backup was made.')); };
  f.onsubmit = async e => {
    e.preventDefault();
    const w = waitMsg(); if (w) { $('#err').textContent = w; return; }
    if (!f.pw.value) { $('#err').textContent = t('Please type your password.'); return; }
    await busy(f.querySelector('button.primary'), t('Opening…'), async () => {
      let raw;
      try { raw = await unwrapRaw(f.pw.value, v.pw); }
      catch {
        // The password may have been changed on another device: check with the cloud.
        if (phone && cloudReady()) {
          try { const r = await logIn(phone, f.pw.value); resetAttempts(); if (r.code) showRecoveryCode(r.code, () => startApp()); else startApp(); return; }
          catch (ex) { S.dataKey = null; S.data = null; if (!(ex instanceof UserError) && ex?.net === undefined) { /* fall through to the usual message */ } }
        }
        const a = failAttempt();
        $('#err').textContent = waitMsg() || t('That password is not correct. Check that Caps Lock is off, tick "Show password" to see what you typed, and try again.')
          + (a.n >= 3 ? ' ' + t('({n} tries left before you must wait.)', { n: Math.max(0, 5 - a.n) }) : '');
        f.pw.focus(); f.pw.select(); // keep what was typed so it can be checked and corrected
        return;
      }
      resetAttempts();
      await enterWithRaw(raw, v, f.pw.value);
    });
  };
}

function lockRecover(phone = '') {
  lockScreen = () => lockRecover(phone);
  const v = readVault();
  const legacy = v && !v.acct; // an older copy without an account: recover it on this device only
  L.innerHTML = frame(`
    <p class="sub">${esc(legacy ? t('Type the recovery code you wrote down when you set up the app, then choose a new password.')
      : t('Type your mobile number and the recovery code you wrote down when you created your account, then choose a new password.'))}</p>
    <form id="f" autocomplete="off">
      ${legacy ? '' : phoneField(phone)}
      <label class="field"><span>${esc(t('Recovery code'))}</span><input class="input" name="code" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" style="text-transform:uppercase" autocapitalize="characters"></label>
      <label class="field"><span>${esc(t('New password'))}</span><input class="input" type="password" name="p1" autocomplete="new-password"></label>
      <label class="field"><span>${esc(t('Type the new password again'))}</span><input class="input" type="password" name="p2" autocomplete="new-password"></label>
      <label class="check"><input type="checkbox" data-showpw> ${esc(t('Show password'))}</label>
      <div class="error-msg" id="err" role="alert"></div>
      <button class="btn primary block">${esc(t('Reset password'))}</button>
    </form>
    <div class="links"><button class="link-btn" id="lnkBack">← ${esc(t('Back'))}</button></div>`);
  const f = $('#f'); pwToggle(f);
  $('#lnkBack').onclick = () => showLock();
  f.onsubmit = async e => {
    e.preventDefault();
    const w = waitMsg(); if (w) { $('#err').textContent = w; return; }
    const err = checkNewPassword(f.p1.value, f.p2.value);
    if (err) { $('#err').textContent = err; return; }
    await busy(f.querySelector('button.primary'), t('Checking…'), async () => {
      if (legacy) {
        let raw;
        try { if (!v.rc) throw 0; raw = await unwrapRaw(normCode(f.code.value), v.rc); }
        catch { failAttempt(); $('#err').textContent = waitMsg() || t('That recovery code is not correct. Please check it and try again.'); return; }
        resetAttempts();
        v.pw = await wrapRaw(f.p1.value, raw);
        localStorage.setItem(VAULT_KEY, JSON.stringify(v));
        await enterWithRaw(raw, v, f.p1.value);
        toast(t('✅ Password changed'), t('Use your new password from now on.'));
        return;
      }
      const ph = normPhone(f.cc.value, f.phone.value);
      if (!ph) { $('#err').textContent = t('Please enter a valid mobile number.'); return; }
      try {
        const r = await recoverAccount(ph, f.code.value, f.p1.value);
        resetAttempts();
        const go = () => { startApp(); toast(t('✅ Password changed'), t('Use your new password from now on, on all your devices.')); };
        if (r.code) showRecoveryCode(r.code, go); else go();
      } catch (ex) {
        if (ex instanceof UserError) failAttempt();
        S.dataKey = null; S.data = null;
        $('#err').textContent = waitMsg() || accountError(ex);
      }
    });
  };
}

/** An older copy (made before accounts existed) must be moved into an account once. */
function lockMigrate(password) {
  lockScreen = () => lockMigrate(password);
  L.innerHTML = frame(`
    <h3 style="text-align:center;margin:4px 0 6px">${esc(t('Create your account'))}</h3>
    <p class="sub">${esc(t('Home Accounts now uses accounts, so you can open your accounts on any device. Add your mobile number once – everything you already recorded is kept and moved into your account.'))}</p>
    <form id="f" autocomplete="off">
      <label class="field"><span>${esc(t('Your name'))}</span><input class="input" name="name" maxlength="40" value="${esc(S.data.settings.name || '')}"></label>
      ${phoneField()}
      <p class="small muted">${esc(t('Your password stays the same.'))}</p>
      <div class="error-msg" id="err" role="alert"></div>
      <button class="btn primary block">🔐 ${esc(t('Create my account'))}</button>
    </form>`);
  const f = $('#f');
  f.onsubmit = async e => {
    e.preventDefault();
    const phone = normPhone(f.cc.value, f.phone.value);
    if (!phone) { $('#err').textContent = t('Please enter a valid mobile number.'); return; }
    await busy(f.querySelector('button.primary'), t('Creating your account…'), async () => {
      const keep = { key: S.dataKey, vault: S.vault, data: S.data };
      try { const code = await createAccount(phone, password, f.name.value.trim(), keep.data.settings.cur, keep.data); showRecoveryCode(code, () => startApp()); }
      catch (ex) { Object.assign(S, { dataKey: keep.key, vault: keep.vault, data: JSON.parse(JSON.stringify(keep.data)) }); $('#err').textContent = accountError(ex); }
    });
  };
}

async function restoreFromFile() {
  const file = await pickFile('.json,application/json');
  if (!file) return false;
  let v;
  try { v = JSON.parse(await file.text()); } catch { v = null; }
  if (!validVault(v)) { infoBox(t('Not a backup file'), t('This file is not a Home Accounts backup. Please choose the file that starts with "home-accounts-backup".')); return false; }
  if (readVault() && !(await confirmBox(t('Restoring will REPLACE all accounts currently on this device with the ones in the backup file. Continue?'), t('Yes, restore backup'), true))) return false;
  localStorage.setItem(VAULT_KEY, JSON.stringify(v));
  resetAttempts();
  return true;
}

async function enterWithRaw(raw, v, password) {
  const key = await importDataKey(raw); raw.fill(0);
  let data;
  try { data = JSON.parse(td.decode(await unseal(key, v))); }
  catch { infoBox(t('Could not open'), t('The saved data seems damaged. Please restore from a backup file.')); return; }
  S.dataKey = key; S.vault = v; S.data = migrate(data);
  if (!S.data.account && cloudReady() && password) return lockMigrate(password); // accounts are required
  startApp();
}

/* ---------------------------------------------------------------------
   App shell
   --------------------------------------------------------------------- */
const TITLES = { home: 'Home Accounts', ledger: 'Daily Ledger', planner: 'Planner', income: 'Income', reports: 'Reports', settings: 'Settings' };
function startApp() {
  L.classList.add('hidden'); L.innerHTML = '';
  $('#app').classList.remove('hidden');
  const tk = todayKey();
  S.ui = { view: 'home', date: tk, filter: 'all', q: '', month: mkey(tk), year: pkey(tk).getFullYear(), planMonth: null };
  paintShell();
  const alerts = computeAlerts();
  S.shown = new Set(alerts.map(a => a.id)); // already listed on Home – don't pop them again
  updateBadge(alerts);
  bump(); armAutoLock();
  go('home');
  startSync();
  if (pendingInvite) { const inv = pendingInvite; pendingInvite = null; if (!shared()) { go('settings'); joinModal(inv); } }
}
async function lockApp(msg) { await flush(); hardLock(msg); }
function hardLock(msg) {
  clearTimeout(saveTimer); saveTimer = null; clearTimeout(alertTimer);
  S.dataKey = null; S.data = null; S.vault = null; S.ui = {};
  stopSync();
  $('#view').innerHTML = ''; $('#modalHost').innerHTML = ''; $('#toastHost').innerHTML = '';
  clearInterval(lockTimer);
  showLock(msg);
}
function go(view) {
  S.ui.view = view;
  $$('.bottom-nav [data-nav]').forEach(b => { if (b.dataset.nav === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  $('#topTitle').textContent = t(TITLES[view]);
  render();
  window.scrollTo(0, 0);
}
function render() {
  const v = $('#view');
  v.innerHTML = VIEWS[S.ui.view]();
  AFTER[S.ui.view]?.(v);
}

$$('.bottom-nav [data-nav]').forEach(b => { b.onclick = () => { if (b.dataset.nav === 'planner') S.ui.planMonth = null; go(b.dataset.nav); }; });
$('#btnLock').onclick = () => lockApp(t('Your accounts are locked.'));
$('#btnPrivacy').onclick = () => { writePrefs({ privacy: !readPrefs().privacy }); applyPrefs(); };
$('#btnLang').onclick = () => setLang(LANG === 'ta' ? 'en' : 'ta');
$('#btnSync').onclick = () => { go('settings'); $('#familyCard')?.scrollIntoView({ block: 'start' }); syncNow({ members: true }); };

// Auto-lock after inactivity
let lastAct = Date.now(), lockTimer = null;
const bump = () => { lastAct = Date.now(); };
['pointerdown', 'keydown', 'wheel', 'touchstart', 'input'].forEach(ev => document.addEventListener(ev, bump, { passive: true }));
function checkAutoLock() {
  const m = S.data?.settings.autoLock;
  if (S.dataKey && m > 0 && Date.now() - lastAct > m * 60e3) lockApp(t('Locked automatically to keep your accounts private.'));
}
function armAutoLock() { clearInterval(lockTimer); lockTimer = setInterval(checkAutoLock, 10e3); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkAutoLock(); else if (saveTimer) flush(); });

// Chart tooltips
const tip = $('#tooltip');
function tipAt(e) {
  const tg = e.target.closest?.('[data-tip]');
  if (!tg) { tip.classList.add('hidden'); return; }
  tip.textContent = document.body.classList.contains('privacy') ? t('Amounts hidden') : tg.dataset.tip;
  tip.classList.remove('hidden');
  const r = tip.getBoundingClientRect();
  tip.style.left = `${Math.max(8, Math.min(window.innerWidth - r.width - 8, e.clientX + 12))}px`;
  tip.style.top = `${Math.max(8, e.clientY - r.height - 12)}px`;
}
document.addEventListener('pointermove', tipAt);
document.addEventListener('pointerdown', tipAt);
window.addEventListener('scroll', () => tip.classList.add('hidden'), { passive: true });

// Delegated click handling inside the main view
$('#view').addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && ACTIONS[el.dataset.act]) ACTIONS[el.dataset.act](el, e);
});
$('#view').addEventListener('change', e => {
  const sel = e.target.closest('[data-unit-for]');
  if (sel) changeUnit(sel.dataset.unitFor, sel.value);
});

/* ---------------------------------------------------------------------
   Install as an app (phones & computers) – only when served from a web address
   --------------------------------------------------------------------- */
const isWeb = /^https?:$/.test(location.protocol);
let installEvt = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (isWeb) {
  const link = document.createElement('link');
  link.rel = 'manifest'; link.href = 'manifest.webmanifest';
  document.head.appendChild(link);
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => {
            if (w.state !== 'activated' || !navigator.serviceWorker.controller) return;
            // A newer version is ready. Nothing is open yet on the login screen, so switch to it straight away.
            if (!S.dataKey) location.reload();
            else toast(t('✨ App updated'), t('Close and reopen the app to use the new version.'));
          });
        });
      }).catch(() => { /* offline use simply won't be available */ });
    });
  }
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (S.ui?.view === 'settings') render(); });
window.addEventListener('appinstalled', () => { installEvt = null; toast(t('✅ App installed'), t('Open it from your home screen or app list.')); });

/* ---------------------------------------------------------------------
   Shared bits for views
   --------------------------------------------------------------------- */
const monthBar = (mk, act) => `
  <div class="date-bar">
    <button class="nav-arrow" data-act="${act}" data-d="-1" aria-label="${esc(t('Previous month'))}">◀</button>
    <div class="date-main"><div class="d1">${esc(fmtMonth(mk))}</div></div>
    <button class="nav-arrow" data-act="${act}" data-d="1" aria-label="${esc(t('Next month'))}">▶</button>
  </div>`;
const alertHtml = a => `<div class="alert ${a.lvl}"><span class="ico" aria-hidden="true">${esc(a.ico)}</span>
  <div style="flex:1"><b>${esc(a.t)}</b><span class="small">${esc(a.m)}</span>
  ${a.act === 'backup' ? `<div><button class="btn sm" data-act="backup" style="margin-top:8px">💾 ${esc(t('Make a backup now'))}</button></div>` : ''}
  ${a.act === 'planner' ? `<div><button class="btn sm" data-act="openPlan" data-m="${esc(a.mk)}" style="margin-top:8px">📅 ${esc(t('Open the planner'))}</button></div>` : ''}</div></div>`;
function progressHtml(spent, budget) {
  const p = budget > 0 ? spent / budget : 0;
  return `<div class="progress ${p >= 1 ? 'over' : p >= 0.8 ? 'warn' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(Math.min(p, 1) * 100)}">
    <div style="width:${Math.min(100, p * 100)}%"></div></div>`;
}
const rowBtn = 'style="width:100%;background:none;border:0;border-bottom:1px solid var(--border);text-align:left"';

/* ---------------------------------------------------------------------
   HOME
   --------------------------------------------------------------------- */
function viewHome() {
  const tk = todayKey(), mk = mkey(tk), st = monthStats(mk), set = S.data.settings;
  const h = new Date().getHours();
  const greet = t(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');
  const savings = st.income - st.expense;
  const alerts = computeAlerts(); updateBadge(alerts);
  const top = Object.values(st.byItem).sort((a, b) => b.amt - a.amt).slice(0, 5);
  const days = []; for (let i = 0; i < 7; i++) days.push(addDays(tk, -i));
  const maxDay = Math.max(...Object.values(st.byDay), 0);
  const bigDay = Object.entries(st.byDay).sort((a, b) => b[1] - a[1])[0];

  return `
  <h2>${esc(greet)}${set.name ? ', ' + esc(set.name.split(' ')[0]) : ''} 👋</h2>
  <div class="home-top">
  <div class="hero">
    <div class="k">${esc(t('Spent today'))} · ${esc(fmtShort(tk))}</div>
    <div class="v">${M(dayTotal(tk))}</div>
    <div class="row wrap"><button class="btn" data-act="openDay" data-date="${tk}">✏️ ${esc(t("Add today's expenses"))}</button>
    <button class="btn" data-act="voice">🎤 ${esc(t('Speak'))}</button></div>
  </div>
  <div>
  <h3>${esc(fmtMonth(mk))}</h3>
  <div class="grid-2 stats" style="margin-bottom:14px">
    <div class="stat"><div class="k">💰 ${esc(t('Income'))}</div><div class="v">${M(st.income)}</div></div>
    <div class="stat"><div class="k">🧾 ${esc(t('Expenses'))}</div><div class="v">${M(st.expense)}</div></div>
    <div class="stat"><div class="k">🏦 ${esc(t('Savings'))}</div><div class="v ${savings >= 0 ? 'good' : 'bad'}">${M(savings)}</div></div>
    <div class="stat"><div class="k">📊 ${esc(t('Saved'))}</div><div class="v ${savings >= 0 ? 'good' : 'bad'}">${st.income > 0 ? `<span class="money">${pct(savings / st.income * 100)}</span>` : '—'}</div>
      ${st.income > 0 ? '' : `<button class="link-btn small" data-act="nav" data-to="income" style="padding:0">${esc(t('Add income'))}</button>`}</div>
  </div>
  </div>
  </div>

  <div class="cards-2">
  <div class="card">
    <h3>🎯 ${esc(t('Monthly budget'))}</h3>
    ${set.monthlyBudget > 0 ? `
      <div class="row wrap" style="margin-bottom:8px"><span>${th('{a} of {b}', { a: M(st.expense), b: M(set.monthlyBudget) })}</span><span class="spacer"></span>
      <b>${st.expense <= set.monthlyBudget ? th('{a} left', { a: M(set.monthlyBudget - st.expense) }) : `<span style="color:var(--danger)">${th('{a} over', { a: M(st.expense - set.monthlyBudget) })}</span>`}</b></div>
      ${progressHtml(st.expense, set.monthlyBudget)}`
      : `<p class="muted" style="margin:0 0 10px">${esc(t('Set a monthly spending limit and the app will warn you before you cross it.'))}</p>
      <button class="btn" data-act="nav" data-to="settings">${esc(t('Set my budget'))}</button>`}
  </div>

  ${homePlanCard(mk, st)}

  <div class="card">
    <h3>🔔 ${esc(t('Warnings & tips'))}</h3>
    ${alerts.length ? alerts.map(alertHtml).join('') : `<div class="empty">✅ ${esc(t('All good! No warnings right now.'))}</div>`}
  </div>

  <div class="card">
    <h3>🔥 ${esc(t('Highest spends this month'))}</h3>
    ${top.length ? top.map((it, i) => `
      <div class="list-row"><span class="emo" aria-hidden="true">${esc(it.icon || '🛍️')}</span>
        <div class="main"><div class="t">${i + 1}. ${esc(nm(it.name))}</div><div class="small muted">${esc(t('Bought {q}', { q: qtyMapLabel(it.qty) }))} · ${st.expense ? esc(t('{p} of spending', { p: pct(it.amt / st.expense * 100) })) : ''}</div></div>
        <div class="amt">${M(it.amt)}</div></div>`).join('')
      : `<div class="empty">${esc(t('No spending recorded this month yet.'))}</div>`}
    ${bigDay ? `<p class="small muted" style="margin:10px 0 0">${th('Biggest spending day: **{d}** – {a}', { d: esc(fmtShort(bigDay[0])), a: M(bigDay[1]) })}</p>` : ''}
  </div>

  <div class="card">
    <h3>📅 ${esc(t('Last 7 days'))}</h3>
    ${days.map(k => { const v = dayTotal(k); return `
      <button class="list-row" data-act="openDay" data-date="${k}" ${rowBtn}>
        <div class="main"><div class="t">${k === tk ? esc(t('Today')) : esc(fmtShort(k))}</div>
        ${v > 0 && maxDay > 0 ? `<div style="height:8px;background:var(--surface-2);border-radius:4px;margin-top:6px;overflow:hidden"><div style="height:100%;width:${Math.min(100, v / Math.max(maxDay, v) * 100)}%;background:var(--series-1);border-radius:0 4px 4px 0"></div></div>` : ''}</div>
        <div class="amt">${v > 0 ? M(v) : '<span class="muted">—</span>'}</div><span aria-hidden="true">›</span></button>`; }).join('')}
  </div>
  </div>`;
}

/* ---------------------------------------------------------------------
   DAILY LEDGER
   --------------------------------------------------------------------- */
function entriesForDate(k) {
  const lines = S.data.ledger[k]?.lines || {};
  const ids = new Set(S.data.items.map(i => i.id));
  const me = myId();
  const out = S.data.items.map(it => lines[it.id] ? { ...lines[it.id], id: it.id, by: me }
    : { id: it.id, name: it.name, icon: it.icon, cat: it.cat, price: it.price, unit: it.unit, qUnit: it.qUnit || it.unit, qty: 0, by: me });
  // Other lines: one-time expenses ("x_…"), and family members' entries ("itemId@memberId")
  for (const [id, l] of Object.entries(lines)) {
    if (ids.has(id)) continue;
    const [lineId, by] = id.split('@');
    out.push({ ...l, id, custom: !ids.has(lineId), by: by || me });
  }
  return out;
}
const entryFor = (k, id) => entriesForDate(k).find(e => e.id === id);
function dayObj(k) { return (S.data.ledger[k] ||= { lines: {}, note: '' }); }
function cleanupDay(k) {
  const d = S.data.ledger[k];
  if (d && !Object.keys(d.lines).length && !d.note && !(d.others && Object.keys(d.others).length)) delete S.data.ledger[k];
}

function rowHtml(e) {
  const on = e.qty > 0, n = nm(e.name);
  const others = shared() && e.by && e.by !== myId(), lock = !canEditBy(e.by) ? 'disabled' : '';
  return `<div class="item-row ${on ? 'on' : ''} ${others ? 'family' : ''}" data-row="${esc(e.id)}">
    <div class="emo" aria-hidden="true">${esc(e.icon || '🛍️')}</div>
    <div>
      <div class="nm">${esc(n)}</div>${sub(e.name)}
      ${others ? `<div class="by-tag">👤 ${esc(t('Added by {n}', { n: memberName(e.by) }))}${lock ? ' 🔒' : ''}</div>` : ''}
      <button class="pr" data-act="editPrice" data-id="${esc(e.id)}" title="${esc(t('Change price'))}" ${lock}>${e.price > 0 ? priceLabel(e.price, e.unit) : `<b>${esc(t('Tap to set price'))}</b>`}${lock ? '' : ' ✎'}</button>
      ${on ? `<div class="lt">${esc(qtyLabel(e.qty, e.qUnit))} × ${priceLabel(e.price, e.unit)} = ${M(lineAmt(e))}</div>` : ''}
    </div>
    <div class="ctrl">
      <div class="qty">
        <button data-act="minus" data-id="${esc(e.id)}" aria-label="${esc(t('Less {i}', { i: n }))}" ${on && !lock ? '' : 'disabled'}>−</button>
        <button class="q" data-act="typeQty" data-id="${esc(e.id)}" aria-label="${esc(t('Quantity of {i}: {q}. Tap to type.', { i: n, q: qtyLabel(e.qty, e.qUnit) }))}" ${lock}>${esc(fmtQty(e.qty))}</button>
        <button class="plus" data-act="plus" data-id="${esc(e.id)}" aria-label="${esc(t('More {i}', { i: n }))}" ${lock}>+</button>
      </div>
      <select class="unit-sel" data-unit-for="${esc(e.id)}" aria-label="${esc(t('Unit for {i}', { i: n }))}" ${lock}>${unitOptions(e.qUnit)}</select>
    </div>
  </div>`;
}

function ledgerListHtml() {
  const k = S.ui.date, q = S.ui.q.trim().toLowerCase(), f = S.ui.filter;
  let list = entriesForDate(k);
  if (q) list = list.filter(e => e.name.toLowerCase().includes(q) || nm(e.name).toLowerCase().includes(q));
  if (f === 'selected') list = list.filter(e => e.qty > 0);
  else if (f !== 'all') list = list.filter(e => e.cat === f);
  if (!list.length) {
    return `<div class="empty">${f === 'selected' ? th('Nothing selected for this day yet. Tap **+** next to an item to add it.') : esc(t('No items found.'))}<br><br>
      <button class="btn" data-act="newItem">➕ ${esc(t('Create a new item'))}${q ? ` "${esc(S.ui.q.trim())}"` : ''}</button></div>`;
  }
  let html = '';
  for (const c of S.data.categories) {
    const rows = list.filter(e => (catInfo(e.cat)?.id) === c.id);
    if (!rows.length) continue;
    html += `<div class="cat-head"><span aria-hidden="true">${esc(c.icon)}</span>${esc(nm(c.name))}</div>` + rows.map(rowHtml).join('');
  }
  return html;
}

function viewLedger() {
  const k = S.ui.date, tk = todayKey(), sel = entriesForDate(k).filter(e => e.qty > 0).length;
  const note = S.data.ledger[k]?.note || '';
  return `
  <div class="date-bar">
    <button class="nav-arrow" data-act="day" data-d="-1" aria-label="${esc(t('Previous day'))}">◀</button>
    <div class="date-main">
      <div class="d1">${k === tk ? esc(t('Today')) : k === addDays(tk, -1) ? esc(t('Yesterday')) : ''}</div>
      <div>${esc(fmtDate(k))}</div>
      <input type="date" id="datePick" value="${k}" aria-label="${esc(t('Choose a date'))}">
    </div>
    <button class="nav-arrow" data-act="day" data-d="1" aria-label="${esc(t('Next day'))}">▶</button>
  </div>
  ${k !== tk ? `<div style="text-align:center;margin:-4px 0 10px"><button class="btn sm" data-act="openDay" data-date="${tk}">${esc(t('Go to today'))}</button></div>` : ''}

  <div class="ledger-total" aria-live="polite">
    <div style="flex:1"><div class="small">${esc(t('Total spent on this day'))}</div><div class="amt" id="dayTotal">${M(dayTotal(k))}</div></div>
    <div class="small" style="text-align:right" id="dayCountWrap">${esc(plural(sel, '{n} item', '{n} items'))}</div>
  </div>
  <button class="btn block voice-btn" data-act="voice">🎤 ${esc(t('Speak your expenses'))}</button>

  <input class="input" id="search" type="search" placeholder="🔍 ${esc(t('Search items… (e.g. milk)'))}" value="${esc(S.ui.q)}" style="margin-bottom:10px" aria-label="${esc(t('Search items'))}">
  <div class="chips" role="toolbar" aria-label="${esc(t('Show'))}">
    <button class="chip" data-act="filter" data-f="all" aria-pressed="${S.ui.filter === 'all'}">${esc(t('All items'))}</button>
    <button class="chip" data-act="filter" data-f="selected" aria-pressed="${S.ui.filter === 'selected'}">✅ ${esc(t('Bought today'))} (<span id="selCount">${sel}</span>)</button>
    ${S.data.categories.map(c => `<button class="chip" data-act="filter" data-f="${esc(c.id)}" aria-pressed="${S.ui.filter === c.id}">${esc(c.icon)} ${esc(nm(c.name))}</button>`).join('')}
  </div>

  <div id="ledgerList">${ledgerListHtml()}</div>

  <div class="grid-2" style="margin-top:14px">
    <button class="btn" data-act="customExpense">➕ ${esc(t('Other expense (one time)'))}</button>
    <button class="btn" data-act="newItem">🆕 ${esc(t('Add new item to list'))}</button>
  </div>
  <button class="btn block" data-act="repeatDay" style="margin-top:10px">🔁 ${esc(t('Copy items from an earlier day'))}</button>

  ${Object.entries(S.data.ledger[k]?.others || {}).map(([by, tx]) => `<div class="family-note"><b>👤 ${esc(memberName(by))}:</b> ${esc(tx)}</div>`).join('')}
  <label class="field" style="margin-top:16px"><span>📝 ${esc(t('Notes for this day'))}</span>
    <textarea class="input" id="dayNote" maxlength="500" placeholder="${esc(t('e.g. Guests came for dinner'))}">${esc(note)}</textarea></label>`;
}
const AFTER = {
  ledger(v) {
    $('#datePick', v).onchange = e => { if (e.target.value) { S.ui.date = e.target.value; render(); } };
    let st;
    $('#search', v).oninput = e => { S.ui.q = e.target.value; clearTimeout(st); st = setTimeout(() => { $('#ledgerList').innerHTML = ledgerListHtml(); }, 120); };
    let nt;
    $('#dayNote', v).oninput = e => {
      clearTimeout(nt);
      nt = setTimeout(() => { const k = S.ui.date; dayObj(k).note = e.target.value.trim(); cleanupDay(k); persist(); }, 400);
    };
  },
  income() {},
  settings(v) { wireSettings(v); },
};

function refreshLedgerParts(id) {
  const k = S.ui.date;
  const row = $(`[data-row="${CSS.escape(id)}"]`);
  const e = entryFor(k, id);
  if (row) { if (e) row.outerHTML = rowHtml(e); else row.remove(); }
  const sel = entriesForDate(k).filter(x => x.qty > 0).length;
  $('#dayTotal').innerHTML = M(dayTotal(k));
  $('#dayCountWrap').textContent = plural(sel, '{n} item', '{n} items');
  $('#selCount').textContent = sel;
}
function setQty(id, q) {
  const k = S.ui.date, e = entryFor(k, id);
  if (!e) return;
  q = Math.max(0, Math.round(q * 1000) / 1000);
  const day = dayObj(k);
  if (q === 0) delete day.lines[id];
  else day.lines[id] = { name: e.name, icon: e.icon, cat: e.cat, price: e.price, unit: e.unit, qUnit: e.qUnit, qty: q };
  cleanupDay(k); persist();
  refreshLedgerParts(id);
  scheduleAlertCheck();
}
const stepOf = e => unitOf(e.qUnit).step;

/** The user picked a different unit in a row's dropdown. */
function changeUnit(id, u) {
  const k = S.ui.date, e = entryFor(k, id); if (!e || !UNITS[u]) return;
  if (!canEditBy(e.by)) { refreshLedgerParts(id); return notAllowed(e.by); }
  if (sameDim(u, e.unit)) { // e.g. kg -> g: the price converts automatically
    const line = S.data.ledger[k]?.lines[id];
    if (line) line.qUnit = u;
    const item = S.data.items.find(i => i.id === id);
    if (item) item.qUnit = u; // remember for next time
    persist(); refreshLedgerParts(id); scheduleAlertCheck();
  } else { // e.g. kg -> packet: we need the price of one packet
    priceModal(id, { unit: u });
  }
}

/** Change the price (and the unit the price is for). opts.unit preselects a unit; opts.add adds one after saving. */
function priceModal(id, opts = {}) {
  const k = S.ui.date, e = entryFor(k, id); if (!e) return;
  const item = S.data.items.find(i => i.id === id);
  const unit = opts.unit || e.unit;
  const unitChanged = unit !== e.unit;
  modal(`<h3>${esc(e.icon)} ${esc(nm(e.name))}</h3>
    ${unitChanged ? `<p class="small">${th('You are buying **{i}** by **{u}**. What is the price for 1 {u}?', { i: esc(nm(e.name)), u: esc(ul(unit)) })}</p>` : ''}
    <form id="mf">
      ${e.custom ? `<label class="field"><span>${esc(t('Name'))}</span><input class="input" name="name" value="${esc(e.name)}" maxlength="60"></label>` : ''}
      <div class="field"><span style="font-weight:600;display:block;margin-bottom:6px">${esc(t('Price (on {d})', { d: fmtShort(k) }))}</span>
        <div class="row"><input class="input" name="price" inputmode="decimal" value="${unitChanged ? '' : e.price || ''}" placeholder="0" aria-label="${esc(t('Price'))}" style="flex:1">
        <span class="muted">${esc(t('for 1'))}</span>
        <select class="input" name="unit" style="width:auto;flex:0 0 auto" aria-label="${esc(t('Price is for one'))}">${unitOptions(unit)}</select></div></div>
      ${item && canEditBy(item.by) ? `<label class="check"><input type="checkbox" name="usual" ${item.price && !unitChanged ? '' : 'checked'}> ${esc(t('Also use this as the usual price next time'))}</label>` : ''}
      <div class="error-msg" id="merr"></div>
      <div class="actions">
        ${e.custom ? `<button type="button" class="btn danger" data-del>🗑 ${esc(t('Delete'))}</button>` : `<button type="button" class="btn" data-close>${esc(t('Cancel'))}</button>`}
        <button class="btn primary">${esc(t('Save'))}</button></div>
    </form>`, (box, close) => {
    const f = $('#mf', box);
    $('[data-del]', box)?.addEventListener('click', () => { close(); setQty(id, 0); });
    f.onsubmit = ev => {
      ev.preventDefault();
      const p = num(f.price.value), u = f.unit.value;
      if (!(p >= 0) || f.price.value.trim() === '') { $('#merr', box).textContent = t('Please enter the price.'); return; }
      const fit = qu => (sameDim(qu, u) ? qu : u); // keep the buying unit if it still converts
      if (item && f.usual?.checked) Object.assign(item, { price: p, unit: u, qUnit: fit(item.qUnit || u) });
      const day = dayObj(k), line = day.lines[id];
      if (e.custom) {
        const n = f.name.value.trim(); if (!n) { $('#merr', box).textContent = t('Please enter a name.'); return; }
        day.lines[id] = { ...line, name: n, price: p, unit: u, qUnit: fit(line.qUnit || u) };
      } else if (line) Object.assign(line, { price: p, unit: u, qUnit: fit(opts.unit || line.qUnit || u) });
      else if (p > 0 && (opts.add || !f.usual?.checked)) {
        const qu = fit(opts.unit || e.qUnit || u);
        day.lines[id] = { name: e.name, icon: e.icon, cat: e.cat, price: p, unit: u, qUnit: qu, qty: unitOf(qu).step };
      }
      if (item && opts.unit) item.qUnit = fit(opts.unit);
      cleanupDay(k); persist(); close();
      refreshLedgerParts(id); scheduleAlertCheck();
    };
  }, () => refreshLedgerParts(id)); // on cancel, put the unit dropdown back
}
function qtyModal(id) {
  const e = entryFor(S.ui.date, id); if (!e) return;
  const label = e.qUnit && e.qUnit !== 'each' ? t('Quantity (in {u})', { u: ul(e.qUnit) }) : t('Quantity');
  modal(`<h3>${esc(e.icon)} ${esc(t('How much {i}?', { i: nm(e.name) }))}</h3>
    <form id="mf">
      <label class="field"><span>${esc(label)}</span><input class="input" name="q" inputmode="decimal" value="${e.qty || ''}" placeholder="${esc(t('e.g. 2 or 1.5'))}" autofocus></label>
      <p class="small muted">${th('Price: {p}. To buy in another unit (kg, g, pcs…), use the unit box under the + button.', { p: priceLabel(e.price, e.unit) })}</p>
      <div class="error-msg" id="merr"></div>
      <div class="actions"><button type="button" class="btn" data-close>${esc(t('Cancel'))}</button><button class="btn primary">${esc(t('Save'))}</button></div>
    </form>`, (box, close) => {
    const f = $('#mf', box);
    f.onsubmit = ev => {
      ev.preventDefault();
      const q = f.q.value.trim() === '' ? 0 : num(f.q.value);
      if (!(q >= 0) || q > 100000) { $('#merr', box).textContent = t('Please enter a valid number.'); return; }
      close();
      if (q > 0 && !(e.price > 0)) { priceModal(id); }
      setQty(id, q);
    };
  });
}

const catOptions = sel => S.data.categories.map(c => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.icon)} ${esc(nm(c.name))}</option>`).join('');
const emojiPicker = sel => `<div class="emoji-pick" role="group" aria-label="${esc(t('Choose a picture'))}">${EMOJIS.map(x => `<button type="button" data-emo="${x}" aria-pressed="${x === sel}">${x}</button>`).join('')}</div>`;
function wireEmoji(box, initial) {
  let chosen = initial;
  $$('[data-emo]', box).forEach(b => { b.onclick = () => { chosen = b.dataset.emo; $$('[data-emo]', box).forEach(x => x.setAttribute('aria-pressed', String(x === b))); }; });
  return () => chosen;
}

function customExpenseModal() {
  const k = S.ui.date;
  modal(`<h3>➕ ${esc(t('Other expense'))}</h3><p class="small muted">${esc(t("For something you don't buy often. It is added to {d}.", { d: fmtShort(k) }))}</p>
    <form id="mf">
      <label class="field"><span>${esc(t('What did you spend on?'))}</span><input class="input" name="name" maxlength="60" placeholder="${esc(t('e.g. Plumber'))}"></label>
      <label class="field"><span>${esc(t('Amount'))}</span><input class="input" name="amt" inputmode="decimal" placeholder="0"></label>
      <label class="field"><span>${esc(t('Type of expense'))}</span><select class="input" name="cat">${catOptions('other')}</select></label>
      <label class="check"><input type="checkbox" name="save"> ${esc(t('Save it in my items list for next time'))}</label>
      <div class="error-msg" id="merr"></div>
      <div class="actions"><button type="button" class="btn" data-close>${esc(t('Cancel'))}</button><button class="btn primary">${esc(t('Add'))}</button></div>
    </form>`, (box, close) => {
    const f = $('#mf', box);
    f.onsubmit = ev => {
      ev.preventDefault();
      const name = f.name.value.trim(), amt = num(f.amt.value), cat = f.cat.value, icon = catInfo(cat).icon;
      if (!name) { $('#merr', box).textContent = t('Please write what you spent on.'); return; }
      if (!(amt > 0)) { $('#merr', box).textContent = t('Please enter the amount.'); return; }
      let id = 'x_' + uid();
      if (f.save.checked) { id = uid(); S.data.items.push({ id, name, price: amt, cat, icon, unit: 'each', qUnit: 'each', by: myId() }); }
      dayObj(k).lines[id] = { name, icon, cat, price: amt, unit: 'each', qUnit: 'each', qty: 1 };
      persist(); close(); render(); scheduleAlertCheck();
      toast(t('✅ Added'), `${name} – ${money(amt)}`);
    };
  });
}

function itemModal(item, presetName = '') {
  if (item && !canEditBy(item.by)) return notAllowed(item.by);
  const isNew = !item;
  item = item || { name: presetName, price: '', cat: S.ui.filter && catInfo(S.ui.filter)?.id === S.ui.filter ? S.ui.filter : 'groc', icon: '🛒' };
  modal(`<h3>${isNew ? '🆕 ' + esc(t('New item')) : '✏️ ' + esc(t('Edit item'))}</h3>
    <form id="mf">
      <label class="field"><span>${esc(t('Item name'))}</span><input class="input" name="name" maxlength="60" value="${esc(item.name)}" placeholder="${esc(t('e.g. Milk'))}"></label>
      ${!isNew && LANG === 'ta' && I18N.names[item.name] ? `<p class="small muted" style="margin:-8px 0 12px">${esc(t('Shown in Tamil as: {n}', { n: nm(item.name) }))}</p>` : ''}
      <div class="field"><span style="font-weight:600;display:block;margin-bottom:6px">${esc(t('Usual price'))}</span>
        <div class="row"><input class="input" name="price" inputmode="decimal" value="${esc(item.price)}" placeholder="0" aria-label="${esc(t('Usual price'))}" style="flex:1">
        <span class="muted">${esc(t('for 1'))}</span>
        <select class="input" name="unit" style="width:auto;flex:0 0 auto" aria-label="${esc(t('Price is for one'))}">${unitOptions(item.unit || 'kg')}</select></div>
        <p class="small muted" style="margin:6px 0 0">${esc(t('Choose how you usually buy it: kg, g, L, ml, pcs, dozen, packet… You can still pick another unit on the ledger page.'))}</p></div>
      <label class="field"><span>${esc(t('Type of expense'))}</span><select class="input" name="cat">${catOptions(item.cat)}</select></label>
      <label class="field"><span>${esc(t('Picture'))}</span></label>${emojiPicker(item.icon)}
      <div class="error-msg" id="merr"></div>
      <div class="actions">
        ${isNew ? `<button type="button" class="btn" data-close>${esc(t('Cancel'))}</button>` : `<button type="button" class="btn danger" data-del>🗑 ${esc(t('Delete'))}</button>`}
        <button class="btn primary">${esc(t('Save'))}</button></div>
    </form>`, (box, close) => {
    const f = $('#mf', box), getEmo = wireEmoji(box, item.icon);
    $('[data-del]', box)?.addEventListener('click', async () => {
      close();
      if (await confirmBox(t('Delete "{i}" from your list? Past days where you bought it will not change.', { i: nm(item.name) }), t('Delete'), true)) {
        S.data.items = S.data.items.filter(i => i.id !== item.id); persist(); render();
      }
    });
    f.onsubmit = ev => {
      ev.preventDefault();
      const name = f.name.value.trim(), price = f.price.value.trim() === '' ? 0 : num(f.price.value);
      if (!name) { $('#merr', box).textContent = t('Please enter the item name.'); return; }
      if (!(price >= 0)) { $('#merr', box).textContent = t('Please enter a valid price.'); return; }
      if (isNew && S.data.items.some(i => i.name.toLowerCase() === name.toLowerCase() || nm(i.name) === name)) { $('#merr', box).textContent = t('This item is already in your list.'); return; }
      const unit = f.unit.value;
      if (isNew) S.data.items.push({ id: uid(), name, price, cat: f.cat.value, icon: getEmo(), unit, qUnit: unit, by: myId() });
      else Object.assign(item, { name, price, cat: f.cat.value, icon: getEmo(), unit, qUnit: sameDim(item.qUnit, unit) ? item.qUnit : unit });
      persist(); close(); render();
      toast(t('✅ Saved'), nm(name));
    };
  });
}

async function repeatDayFlow() {
  const k = S.ui.date;
  const prevDays = Object.keys(S.data.ledger).filter(d => d < k && Object.keys(S.data.ledger[d].lines).length).sort().reverse().slice(0, 10);
  if (!prevDays.length) { infoBox(t('Nothing to copy'), t('There are no earlier days with expenses yet.')); return; }
  modal(`<h3>🔁 ${esc(t('Copy items from…'))}</h3><p class="small muted">${esc(t('Items already added for {d} will not be changed.', { d: fmtShort(k) }))}</p>
    ${prevDays.map(d => `<button class="list-row" data-pick="${d}" ${rowBtn}>
      <div class="main"><div class="t">${esc(fmtShort(d))}</div><div class="small muted">${esc(Object.values(S.data.ledger[d].lines).map(l => nm(l.name)).slice(0, 4).join(', '))}${Object.keys(S.data.ledger[d].lines).length > 4 ? '…' : ''}</div></div>
      <div class="amt">${M(dayTotal(d))}</div></button>`).join('')}
    <div class="actions"><button class="btn" data-close>${esc(t('Cancel'))}</button></div>`, (box, close) => {
    $$('[data-pick]', box).forEach(b => { b.onclick = () => {
      const src = S.data.ledger[b.dataset.pick].lines, day = dayObj(k); let n = 0;
      for (const [id, l] of Object.entries(src)) {
        const lineId = id.split('@')[0]; // a family member's entry is copied as yours
        const nid = lineId.startsWith('x_') ? 'x_' + uid() : lineId;
        if (!day.lines[nid]) {
          const item = S.data.items.find(i => i.id === lineId);
          // use today's usual price if it is for the same unit
          day.lines[nid] = item?.price && item.unit === l.unit ? { ...l, price: item.price } : { ...l }; n++;
        }
      }
      cleanupDay(k); persist(); close(); S.ui.filter = 'selected'; render(); scheduleAlertCheck();
      toast(t('✅ Copied'), plural(n, '{n} item added. Use + and − to adjust.', '{n} items added. Use + and − to adjust.'));
    }; });
  });
}

/* ---------------------------------------------------------------------
   INCOME
   --------------------------------------------------------------------- */
function viewIncome() {
  const mk = S.ui.month, list = S.data.income.filter(i => i.date.startsWith(mk)).sort((a, b) => b.date.localeCompare(a.date));
  const total = list.reduce((s, i) => s + i.amount, 0), st = monthStats(mk);
  return `${monthBar(mk, 'month')}
  <div class="hero"><div class="k">${esc(t('Income in {m}', { m: fmtMonth(mk) }))}</div><div class="v">${M(total)}</div>
    <button class="btn" data-act="addIncome">➕ ${esc(t('Add income'))}</button></div>
  <div class="grid-2" style="margin-bottom:14px">
    <div class="stat"><div class="k">🧾 ${esc(t('Spent'))}</div><div class="v">${M(st.expense)}</div></div>
    <div class="stat"><div class="k">🏦 ${esc(t('Left / saved'))}</div><div class="v ${total - st.expense >= 0 ? 'good' : 'bad'}">${M(total - st.expense)}</div></div>
  </div>
  <div class="card"><h3>${esc(t('Income entries'))}</h3>
    ${list.length ? list.map(i => `
      <button class="list-row" data-act="editIncome" data-id="${esc(i.id)}" ${rowBtn}>
        <span class="emo" aria-hidden="true">💵</span>
        <div class="main"><div class="t">${esc(nm(i.source))}</div><div class="small muted">${esc(fmtShort(i.date))}${i.note ? ' · ' + esc(i.note) : ''}${shared() && i.by && i.by !== myId() ? ' · 👤 ' + esc(memberName(i.by)) : ''}</div></div>
        <div class="amt" style="color:var(--accent)">${M(i.amount)}</div><span aria-hidden="true">✎</span></button>`).join('')
      : `<div class="empty">${esc(t('No income added for this month.'))}<br>${th('Tap **Add income** to record salary, pension, business income, etc.')}</div>`}
  </div>`;
}
function incomeModal(entry) {
  if (entry && !canEditBy(entry.by)) return notAllowed(entry.by);
  const isNew = !entry;
  const tk = todayKey();
  entry = entry || { date: mkey(tk) === S.ui.month ? tk : S.ui.month + '-01', source: 'Salary', amount: '', note: '' };
  modal(`<h3>${isNew ? '➕ ' + esc(t('Add income')) : '✏️ ' + esc(t('Edit income'))}</h3>
    <form id="mf">
      <label class="field"><span>${esc(t('Date received'))}</span><input class="input" type="date" name="date" value="${esc(entry.date)}"></label>
      <label class="field"><span>${esc(t('Source'))}</span><select class="input" name="source">${INCOME_SOURCES.map(s => `<option value="${esc(s)}" ${s === entry.source ? 'selected' : ''}>${esc(nm(s))}</option>`).join('')}</select></label>
      <label class="field"><span>${esc(t('Amount'))}</span><input class="input" name="amount" inputmode="decimal" value="${esc(entry.amount)}" placeholder="0"></label>
      <label class="field"><span>${esc(t('Note (optional)'))}</span><input class="input" name="note" maxlength="80" value="${esc(entry.note)}"></label>
      <div class="error-msg" id="merr"></div>
      <div class="actions">
        ${isNew ? `<button type="button" class="btn" data-close>${esc(t('Cancel'))}</button>` : `<button type="button" class="btn danger" data-del>🗑 ${esc(t('Delete'))}</button>`}
        <button class="btn primary">${esc(t('Save'))}</button></div>
    </form>`, (box, close) => {
    const f = $('#mf', box);
    $('[data-del]', box)?.addEventListener('click', async () => {
      close();
      if (await confirmBox(t('Delete this income of {a}?', { a: money(entry.amount) }), t('Delete'), true)) {
        S.data.income = S.data.income.filter(i => i.id !== entry.id); persist(); render(); scheduleAlertCheck();
      }
    });
    f.onsubmit = ev => {
      ev.preventDefault();
      const amount = num(f.amount.value);
      if (!f.date.value) { $('#merr', box).textContent = t('Please choose a date.'); return; }
      if (!(amount > 0)) { $('#merr', box).textContent = t('Please enter the amount.'); return; }
      const rec = { date: f.date.value, source: f.source.value, amount: round2(amount), note: f.note.value.trim() };
      if (isNew) S.data.income.push({ id: uid(), ...rec, by: myId() }); else Object.assign(entry, rec);
      S.ui.month = mkey(rec.date);
      persist(); close(); render(); scheduleAlertCheck();
      toast(t('✅ Income saved'), `${nm(rec.source)} – ${money(rec.amount)}`);
    };
  });
}

/* ---------------------------------------------------------------------
   REPORTS
   --------------------------------------------------------------------- */
function niceMax(m) {
  const e = 10 ** Math.floor(Math.log10(m));
  for (const f of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (f * e >= m) return f * e;
  return 10 * e;
}
function barPath(x, y, w, h) { // rounded top only, flat on the baseline
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
/** groups: [{label, showLabel, values:[..], tip}] */
function colChart(groups, label) {
  const W = 400, H = 200, Lp = 46, R = 6, T = 10, B = 24, pw = W - Lp - R, ph = H - T - B;
  const max = niceMax(Math.max(1, ...groups.flatMap(g => g.values)));
  const n = groups.length, gw = pw / n, ns = groups[0]?.values.length || 1;
  const bw = Math.max(2, Math.min(30, (gw * 0.72 - (ns - 1) * 2) / ns));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">`;
  for (let i = 0; i <= 4; i++) {
    const y = T + ph - ph * i / 4;
    s += `<line class="gridline" x1="${Lp}" x2="${W - R}" y1="${y}" y2="${y}"/><text x="${Lp - 6}" y="${y + 4}" text-anchor="end">${esc(compact(max * i / 4))}</text>`;
  }
  groups.forEach((g, i) => {
    const gx = Lp + gw * i + (gw - (bw * ns + (ns - 1) * 2)) / 2;
    g.values.forEach((v, j) => {
      const h = ph * v / max;
      if (h > 0) s += `<path class="bar${j + 1}" d="${barPath(gx + j * (bw + 2), T + ph - h, bw, h)}"/>`;
    });
    if (g.showLabel) s += `<text x="${Lp + gw * i + gw / 2}" y="${H - 6}" text-anchor="middle">${esc(g.label)}</text>`;
    s += `<rect class="hit" x="${Lp + gw * i}" y="${T}" width="${gw}" height="${ph}" data-tip="${esc(g.tip)}"/>`;
  });
  return `<div class="chart-wrap money">${s}</div>`;
}
function viewReports() {
  const mk = S.ui.month, st = monthStats(mk), dim = daysInMonth(mk);
  const tk = todayKey(), daysSoFar = mk === mkey(tk) ? pkey(tk).getDate() : mk < mkey(tk) ? dim : 0;
  const cats = Object.entries(st.byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0]?.[1] || 1;
  const items = Object.values(st.byItem).sort((a, b) => b.amt - a.amt);
  const topDays = Object.entries(st.byDay).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const daily = [];
  for (let d = 1; d <= dim; d++) {
    const k = `${mk}-${pad(d)}`, v = st.byDay[k] || 0;
    daily.push({ label: String(d), showLabel: d === 1 || d % 5 === 0, values: [v], tip: `${fmtShort(k)}: ${money(v)}` });
  }
  const six = [];
  for (let i = 5; i >= 0; i--) {
    const m = addMonths(mk, -i), s = monthStats(m);
    six.push({ m, label: fmtMonthShort(m), showLabel: true, values: [s.income, s.expense], s,
      tip: t('{m} – Income: {a}, Expenses: {b}, Saved: {c}', { m: fmtMonth(m), a: money(s.income), b: money(s.expense), c: money(s.income - s.expense) }) });
  }
  const savings = st.income - st.expense;

  return `${monthBar(mk, 'month')}
  <div class="grid-2 stats" style="margin-bottom:14px">
    <div class="stat"><div class="k">💰 ${esc(t('Income'))}</div><div class="v">${M(st.income)}</div></div>
    <div class="stat"><div class="k">🧾 ${esc(t('Expenses'))}</div><div class="v">${M(st.expense)}</div></div>
    <div class="stat"><div class="k">🏦 ${esc(t('Savings'))}</div><div class="v ${savings >= 0 ? 'good' : 'bad'}">${M(savings)}</div></div>
    <div class="stat"><div class="k">📆 ${esc(t('Average per day'))}</div><div class="v">${M(daysSoFar ? st.expense / daysSoFar : 0)}</div></div>
  </div>

  <div class="cards-2">
  <div class="card"><h3>${esc(t('Where the money went'))}</h3>
    ${cats.length ? cats.map(([id, v]) => { const c = catInfo(id); return `
      <div class="hbar" data-tip="${esc(`${nm(c.name)}: ${money(v)} (${pct(v / st.expense * 100)})`)}">
        <div class="lab">${esc(c.icon)} ${esc(nm(c.name))}</div>
        <div class="track money"><div class="fill" style="width:${v / maxCat * 100}%"></div></div>
        <div class="val">${M(v)} <span class="muted small">${pct(v / st.expense * 100)}</span></div></div>`; }).join('')
      : `<div class="empty">${esc(t('No expenses recorded in this month.'))}</div>`}
  </div>

  <div class="card"><h3>${esc(t('Spending each day'))}</h3>
    ${st.expense ? colChart(daily, t('Daily spending in {m}', { m: fmtMonth(mk) })) +
      `<details class="tv"><summary>${esc(t('Show as a table'))}</summary><table class="tbl"><tr><th>${esc(t('Date'))}</th><th class="r">${esc(t('Spent'))}</th></tr>
        ${Object.entries(st.byDay).sort().map(([k, v]) => `<tr><td>${esc(fmtShort(k))}</td><td class="r">${M(v)}</td></tr>`).join('')}</table></details>`
      : `<div class="empty">${esc(t('No expenses recorded in this month.'))}</div>`}
    ${topDays.length ? `<p class="small" style="margin:12px 0 4px"><b>${esc(t('Highest spending days:'))}</b></p>
      ${topDays.map(([k, v]) => `<button class="list-row" data-act="openDay" data-date="${k}" ${rowBtn}><div class="main"><div class="t">${esc(fmtShort(k))}</div></div><div class="amt">${M(v)}</div><span aria-hidden="true">›</span></button>`).join('')}` : ''}
  </div>

  ${shared() ? byPersonCard(mk, st) : ''}

  <div class="card"><h3>${esc(t('Items bought'))}</h3>
    ${items.length ? `<div class="tbl-wrap"><table class="tbl"><tr><th>${esc(t('Item'))}</th><th class="r">${esc(t('Qty'))}</th><th class="r">${esc(t('Amount'))}</th></tr>
      ${items.map(it => `<tr><td>${esc(it.icon || '')} ${esc(nm(it.name))}</td><td class="r num">${esc(qtyMapLabel(it.qty))}</td><td class="r">${M(it.amt)}</td></tr>`).join('')}
      <tr><th>${esc(t('Total'))}</th><th></th><th class="r">${M(st.expense)}</th></tr></table></div>`
      : `<div class="empty">${esc(t('No items bought in this month.'))}</div>`}
  </div>

  <div class="card"><h3>${esc(t('Last 6 months – income and expenses'))}</h3>
    <div class="legend"><span><i style="background:var(--series-1)"></i>${esc(t('Income'))}</span><span><i style="background:var(--series-2)"></i>${esc(t('Expenses'))}</span></div>
    ${colChart(six, t('Income and expenses for the last 6 months'))}
    <details class="tv"><summary>${esc(t('Show as a table'))}</summary><div class="tbl-wrap"><table class="tbl"><tr><th>${esc(t('Month'))}</th><th class="r">${esc(t('Income'))}</th><th class="r">${esc(t('Expenses'))}</th><th class="r">${esc(t('Saved'))}</th></tr>
      ${six.map(x => `<tr><td>${esc(fmtMonth(x.m))}</td><td class="r">${M(x.s.income)}</td><td class="r">${M(x.s.expense)}</td><td class="r">${M(x.s.income - x.s.expense)}</td></tr>`).join('')}</table></div></details>
  </div>
  </div>

  <div class="card"><h3>${esc(t('Save or print'))}</h3>
    <div class="grid-2">
      <button class="btn" data-act="print">🖨️ ${esc(t('Print this report'))}</button>
      <button class="btn" data-act="csv">📄 ${esc(t('Export to Excel (CSV)'))}</button>
    </div>
    <p class="small muted" style="margin:10px 0 0">${th('Note: printed pages and exported Excel files are **not** password protected. Keep them safe or delete them after use.')}</p>
  </div>`;
}
async function exportCsv() {
  const mk = S.ui.month;
  if (!(await confirmBox(t('The Excel (CSV) file will NOT be password protected – anyone who opens the file can read it. Continue?'), t('Yes, export')))) return;
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['Date', 'Type', 'Item / Source', 'Category', 'Price', 'Price per', 'Quantity', 'Unit', 'Amount', 'Note'].map(h => q(t(h))).join(',')];
  for (const k of Object.keys(S.data.ledger).filter(d => d.startsWith(mk)).sort()) {
    const d = S.data.ledger[k];
    for (const l of Object.values(d.lines)) rows.push([k, t('Expense'), nm(l.name), nm(catInfo(l.cat).name), l.price, ul(l.unit), l.qty, ul(l.qUnit || l.unit), lineAmt(l), ''].map(q).join(','));
  }
  for (const i of S.data.income.filter(x => x.date.startsWith(mk)).sort((a, b) => a.date.localeCompare(b.date)))
    rows.push([i.date, t('Income'), nm(i.source), '', '', '', '', '', i.amount, i.note].map(q).join(','));
  download(`home-accounts-${mk}.csv`, '﻿' + rows.join('\r\n'), 'text/csv;charset=utf-8');
}

/* ---------------------------------------------------------------------
   SETTINGS
   --------------------------------------------------------------------- */
function installCard() {
  let body;
  if (isStandalone()) body = `<div class="alert good"><span class="ico">✅</span><div class="small">${esc(t('Installed – you are using Home Accounts as an app.'))}</div></div>`;
  else if (installEvt) body = `<p class="small muted">${esc(t('Add Home Accounts to your home screen or desktop. It opens like an app and works without internet.'))}</p>
    <button class="btn primary block" data-act="install">📲 ${esc(t('Install the app'))}</button>`;
  else if (isWeb && isIOS()) body = `<p class="small">${th('On iPhone / iPad: tap the **Share** button ⬆️ at the bottom of Safari, then **Add to Home Screen**.')}</p>`;
  else if (isWeb) body = `<p class="small">${th('Open your browser menu (⋮ or ⋯) and choose **Install app** or **Add to Home screen**.')}</p>`;
  else body = `<p class="small muted">${esc(t('This copy is opened from a file on this computer. To install the app on a phone, open it from its web address (see the README file).'))}</p>`;
  return `<div class="card"><h3>📲 ${esc(t('Use on phone & computer'))}</h3>${body}
    <p class="small muted" style="margin:10px 0 0">${esc(t('Each phone or computer keeps its own locked copy. To move your accounts, make a backup on one and restore it on the other.'))}</p></div>`;
}
function viewSettings() {
  const s = S.data.settings, p = readPrefs();
  const fs = p.fontScale || 1, thm = p.theme || 'auto';
  const canShare = !!(navigator.canShare && window.File && navigator.canShare({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] }));
  return `
  <div class="cards-2">
  <div class="card"><h3>🌐 ${esc(t('Language'))} / மொழி</h3>${langSwitch()}
    <p class="small muted" style="margin:8px 0 0">${esc(t('Item names you typed yourself stay as you typed them.'))}</p></div>

  <div class="card" id="accountCard"><h3>👤 ${esc(t('Your account'))}</h3>
    ${S.data.account ? `<p class="small" style="margin-top:0">${th('Mobile number: **{p}**', { p: esc(showPhone(S.data.account.phone)) })}<br>
      <span class="muted">${esc(t('Log in with this number and your password on any phone or computer to see the same accounts.'))}</span></p>` : ''}
    <label class="field"><span>${esc(t('Your name'))}</span><input class="input" data-set="name" value="${esc(s.name)}" maxlength="40"></label>
    <label class="field"><span>${esc(t('Currency'))}</span><select class="input" data-set="cur" ${canManage() ? '' : 'disabled'}>${curOptions(s.cur)}</select></label>
    ${S.data.account ? `<button class="btn block" data-act="signOut">🚪 ${esc(t('Sign out of this device'))}</button>` : ''}
  </div>
  </div>

  ${familyCard()}

  <div class="card"><h3>🎯 ${esc(t('Budgets (spending limits)'))}</h3>
    ${canManage() ? '' : `<p class="small muted">🔒 ${esc(t('Only the owner or an editor can change the shared budgets and currency.'))}</p>`}
    <label class="field"><span>${esc(t('Monthly budget for the whole home'))}</span><input class="input" data-set="monthlyBudget" inputmode="decimal" value="${s.monthlyBudget || ''}" placeholder="${esc(t('e.g. 20000 (leave empty for none)'))}" ${canManage() ? '' : 'disabled'}></label>
    <p class="small muted">${esc(t('You can also set a limit for each type of expense. You will be warned at 80% and when it is crossed.'))}</p>
    ${S.data.categories.map(c => `
      <div class="list-row"><span class="emo" aria-hidden="true">${esc(c.icon)}</span>
        <div class="main"><div class="t">${esc(nm(c.name))}</div></div>
        <input class="input" style="max-width:140px;min-height:44px" inputmode="decimal" data-catbudget="${esc(c.id)}" value="${c.budget || ''}" placeholder="${esc(t('No limit'))}" ${canEditBy(c.by) ? '' : 'disabled'} aria-label="${esc(t('Budget for {c}', { c: nm(c.name) }))}">
        <button class="btn sm" data-act="editCat" data-id="${esc(c.id)}" aria-label="${esc(t('Edit {c}', { c: nm(c.name) }))}">✎</button></div>`).join('')}
    <button class="btn block" data-act="newCat" style="margin-top:10px">➕ ${esc(t('Add a new type of expense'))}</button>
  </div>

  <div class="card"><h3>🛍️ ${esc(t('My items list'))}</h3>
    <p class="small muted">${esc(t('These items appear on every ledger page. Tap one to change its name, usual price or picture.'))}</p>
    ${S.data.categories.map(c => { const its = S.data.items.filter(i => catInfo(i.cat).id === c.id); return its.length ? `
      <div class="cat-head">${esc(c.icon)} ${esc(nm(c.name))}</div>
      ${its.map(i => `<button class="list-row" data-act="editItem" data-id="${esc(i.id)}" ${rowBtn}>
        <span class="emo" aria-hidden="true">${esc(i.icon)}</span><div class="main"><div class="t">${esc(nm(i.name))}</div>${sub(i.name)}</div>
        <div class="amt">${i.price ? priceLabel(i.price, i.unit) : `<span class="muted small">${esc(t('no price'))}</span>`}</div><span aria-hidden="true">✎</span></button>`).join('')}` : ''; }).join('')}
    <button class="btn primary block" data-act="newItem" style="margin-top:12px">🆕 ${esc(t('Add new item'))}</button>
  </div>

  <div class="cards-2">
  <div class="card"><h3>🔤 ${esc(t('Display'))}</h3>
    <div class="field"><span style="font-weight:600;display:block;margin-bottom:6px">${esc(t('Text size'))}</span>
      <div class="grid-3">${[[1, 'Normal'], [1.15, 'Large'], [1.3, 'Extra large']].map(([v, l]) => `<button class="chip" data-act="font" data-v="${v}" aria-pressed="${fs === v}" style="font-size:${v}rem">${esc(t(l))}</button>`).join('')}</div></div>
    <div class="field" style="margin:0"><span style="font-weight:600;display:block;margin-bottom:6px">${esc(t('Colours'))}</span>
      <div class="grid-3">${[['auto', '🖥️', 'Automatic'], ['light', '☀️', 'Light'], ['dark', '🌙', 'Dark']].map(([v, i, l]) => `<button class="chip" data-act="theme" data-v="${v}" aria-pressed="${thm === v}">${i} ${esc(t(l))}</button>`).join('')}</div></div>
  </div>

  <div class="card"><h3>🎤 ${esc(t('Voice entry'))}</h3>
    <label class="field"><span>${esc(t('Language I speak in'))}</span>
      <select class="input" data-set="voiceLang">${VOICE_LANGS.map(([v, l]) => `<option value="${v}" ${s.voiceLang === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    <label class="check" style="margin-bottom:4px"><input type="checkbox" data-set="voiceCloudOk" ${s.voiceCloudOk ? 'checked' : ''}> ${esc(t('Allow online voice typing'))}</label>
    <p class="small muted" style="margin:0">${esc(t("When this device cannot turn speech into text by itself, the browser sends what you say to {c}'s speech service. Untick to never send your voice – you can always type instead.", { c: speechCompany() }))}</p>
  </div>
  </div>

  ${installCard()}

  <div class="cards-2">
  <div class="card"><h3>🔐 ${esc(t('Privacy & security'))}</h3>
    <div class="alert good"><span class="ico">🛡️</span><div class="small">${th('Your accounts are **encrypted** with your password (AES-256) and saved only on this device. Nothing is sent over the internet.')}</div></div>
    <label class="field"><span>${esc(t('Lock automatically when not used for'))}</span>
      <select class="input" data-set="autoLock">${[[1, '1 minute'], [3, '3 minutes'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes'], [0, 'Never (not recommended)']].map(([v, l]) => `<option value="${v}" ${s.autoLock === v ? 'selected' : ''}>${esc(t(l))}</option>`).join('')}</select></label>
    <div class="grid-2">
      <button class="btn" data-act="changePw">🔑 ${esc(t('Change password'))}</button>
      <button class="btn" data-act="newCode">📝 ${esc(t('New recovery code'))}</button>
    </div>
  </div>

  <div class="card"><h3>💾 ${esc(t('Backup'))}</h3>
    <p class="small muted">${th('A backup file keeps your accounts safe if this device is lost or the browser is cleared. The backup is **locked with your current password**. Keep a copy on a pen drive, Google Drive or another safe place.')}</p>
    <p class="small">${th('Last backup: **{d}**', { d: s.lastBackup ? esc(new Date(s.lastBackup).toLocaleString(DLOC())) : esc(t('Never')) })}</p>
    <div class="grid-2">
      <button class="btn primary" data-act="backup">💾 ${esc(t('Make a backup'))}</button>
      <button class="btn" data-act="restore">📂 ${esc(t('Restore a backup'))}</button>
    </div>
    ${canShare ? `<button class="btn block" data-act="shareBackup" style="margin-top:10px">📤 ${esc(t('Send backup (WhatsApp, Drive, email…)'))}</button>` : ''}
  </div>
  </div>

  <div class="card"><h3>⚠️ ${esc(t('Erase'))}</h3>
    <p class="small muted">${esc(t('Removes all accounts from this device permanently. Make a backup first if you may need them again.'))}</p>
    <button class="btn danger block" data-act="erase">🗑️ ${esc(t('Erase everything on this device'))}</button>
    ${S.data.account ? `<button class="btn danger block" data-act="deleteAccount" style="margin-top:10px">❌ ${esc(t('Delete my account'))}</button>` : ''}
  </div>
  <p class="small muted" style="text-align:center">${esc(t('Home Accounts · works offline · your data stays with you'))}</p>`;
}
function wireSettings(v) {
  $$('[data-set]', v).forEach(inp => {
    inp.onchange = () => {
      const k = inp.dataset.set, s = S.data.settings;
      if (k === 'name') s.name = inp.value.trim();
      else if (k === 'cur') s.cur = inp.value;
      else if (k === 'autoLock') s.autoLock = Number(inp.value);
      else if (k === 'voiceLang') s.voiceLang = inp.value;
      else if (k === 'voiceCloudOk') s.voiceCloudOk = inp.checked;
      else if (k === 'monthlyBudget') {
        const n = inp.value.trim() === '' ? 0 : num(inp.value);
        if (!(n >= 0)) { toast(t('Please enter a valid amount'), '', 'warning'); inp.value = s.monthlyBudget || ''; return; }
        s.monthlyBudget = round2(n);
      }
      persist(); toast(t('✅ Saved')); scheduleAlertCheck();
      if (k === 'cur') render();
    };
  });
  $$('[data-catbudget]', v).forEach(inp => {
    inp.onchange = () => {
      const c = S.data.categories.find(x => x.id === inp.dataset.catbudget);
      const n = inp.value.trim() === '' ? 0 : num(inp.value);
      if (!(n >= 0)) { toast(t('Please enter a valid amount'), '', 'warning'); inp.value = c.budget || ''; return; }
      c.budget = round2(n); persist(); toast(t('✅ Budget saved'), nm(c.name)); scheduleAlertCheck();
    };
  });
}
function catModal(cat) {
  if (cat && !canEditBy(cat.by)) return notAllowed(cat.by);
  const isNew = !cat;
  cat = cat || { name: '', icon: '📦', budget: 0 };
  modal(`<h3>${isNew ? '➕ ' + esc(t('New type of expense')) : '✏️ ' + esc(t('Edit type of expense'))}</h3>
    <form id="mf">
      <label class="field"><span>${esc(t('Name'))}</span><input class="input" name="name" maxlength="40" value="${esc(cat.name)}" placeholder="${esc(t('e.g. Pets'))}"></label>
      <label class="field"><span>${esc(t('Picture'))}</span></label>${emojiPicker(cat.icon)}
      <div class="error-msg" id="merr"></div>
      <div class="actions">
        ${isNew || cat.id === 'other' ? `<button type="button" class="btn" data-close>${esc(t('Cancel'))}</button>` : `<button type="button" class="btn danger" data-del>🗑 ${esc(t('Delete'))}</button>`}
        <button class="btn primary">${esc(t('Save'))}</button></div>
    </form>`, (box, close) => {
    const f = $('#mf', box), getEmo = wireEmoji(box, cat.icon);
    $('[data-del]', box)?.addEventListener('click', async () => {
      close();
      if (await confirmBox(t('Delete "{c}"? Its items will move to "Others".', { c: nm(cat.name) }), t('Delete'), true)) {
        S.data.items.forEach(i => { if (i.cat === cat.id) i.cat = 'other'; });
        S.data.categories = S.data.categories.filter(c => c.id !== cat.id);
        persist(); render();
      }
    });
    f.onsubmit = ev => {
      ev.preventDefault();
      const name = f.name.value.trim();
      if (!name) { $('#merr', box).textContent = t('Please enter a name.'); return; }
      if (isNew) S.data.categories.splice(S.data.categories.length - 1, 0, { id: 'c_' + uid(), name, icon: getEmo(), budget: 0, by: myId() });
      else Object.assign(cat, { name, icon: getEmo() });
      persist(); close(); render();
    };
  });
}
function changePwModal() {
  modal(`<h3>🔑 ${esc(t('Change password'))}</h3>
    <form id="mf" autocomplete="off">
      <label class="field"><span>${esc(t('Current password'))}</span><input class="input" type="password" name="old" autocomplete="current-password"></label>
      <label class="field"><span>${esc(t('New password'))}</span><input class="input" type="password" name="p1" autocomplete="new-password"></label>
      <label class="field"><span>${esc(t('Type the new password again'))}</span><input class="input" type="password" name="p2" autocomplete="new-password"></label>
      <label class="check"><input type="checkbox" data-showpw> ${esc(t('Show passwords'))}</label>
      <div class="error-msg" id="merr"></div>
      <div class="actions"><button type="button" class="btn" data-close>${esc(t('Cancel'))}</button><button class="btn primary">${esc(t('Change'))}</button></div>
    </form>`, (box, close) => {
    const f = $('#mf', box); pwToggle(f);
    f.onsubmit = async ev => {
      ev.preventDefault();
      const err = checkNewPassword(f.p1.value, f.p2.value);
      if (err) { $('#merr', box).textContent = err; return; }
      await busy(f.querySelector('button.primary'), t('Please wait…'), async () => {
        let raw;
        try { raw = await unwrapRaw(f.old.value, S.vault.pw); } catch { $('#merr', box).textContent = t('The current password is wrong.'); return; }
        const pw = await wrapRaw(f.p1.value, raw); raw.fill(0);
        if (S.data.account) { // change it for the account too, so every device uses the new password
          try {
            await authed('/auth/v1/user', { password: await authSecret(S.data.account.phone, f.p1.value) }, 'PUT');
            await rpc('ha_profile_update', { p_pw_wrap: JSON.stringify(pw) });
          } catch (e) { $('#merr', box).textContent = accountError(e); return; }
        }
        S.vault.pw = pw;
        await flush(); close();
        toast(t('✅ Password changed'), S.data.account ? t('Use the new password on all your devices from now on.') : t('Old backups still open with the old password. Make a new backup now.'));
      });
    };
  });
}
function newCodeModal() {
  modal(`<h3>📝 ${esc(t('New recovery code'))}</h3><p class="small">${esc(t('Your old recovery code will stop working. Enter your password to continue.'))}</p>
    <form id="mf"><label class="field"><span>${esc(t('Password'))}</span><input class="input" type="password" name="pw" autocomplete="current-password"></label>
      <div class="error-msg" id="merr"></div>
      <div class="actions"><button type="button" class="btn" data-close>${esc(t('Cancel'))}</button><button class="btn primary">${esc(t('Continue'))}</button></div></form>`, (box, close) => {
    const f = $('#mf', box);
    f.onsubmit = async ev => {
      ev.preventDefault();
      await busy(f.querySelector('button.primary'), t('Please wait…'), async () => {
        let raw;
        try { raw = await unwrapRaw(f.pw.value, S.vault.pw); } catch { $('#merr', box).textContent = t('Wrong password.'); return; }
        const code = newRecoveryCode();
        const rc = await wrapRaw(normCode(code), raw); raw.fill(0);
        if (S.data.account) {
          try { await rpc('ha_profile_update', { p_rc_wrap: JSON.stringify(rc), p_rc_verifier: await sha256hex(await rcProof(S.data.account.phone, code)) }); }
          catch (e) { $('#merr', box).textContent = accountError(e); return; }
        }
        S.vault.rc = rc;
        await flush(); close();
        showRecoveryCode(code, () => toast(t('✅ New recovery code saved')), true);
      });
    };
  });
}
const backupName = () => `home-accounts-backup-${todayKey()}.json`;
async function makeBackup() {
  S.data.settings.lastBackup = new Date().toISOString();
  await flush();
  download(backupName(), JSON.stringify(S.vault), 'application/json');
  toast(t('💾 Backup saved'), t('Find it in your Downloads folder. Copy it to a pen drive or another safe place.'));
  updateBadge(); if (S.ui.view === 'settings' || S.ui.view === 'home') render();
}
async function shareBackup() {
  S.data.settings.lastBackup = new Date().toISOString();
  await flush();
  const file = new File([JSON.stringify(S.vault)], backupName(), { type: 'application/json' });
  try {
    await navigator.share({ files: [file], title: t('Home Accounts backup') });
    toast(t('💾 Backup sent'), t('It is locked with your password, so only you can open it.'));
  } catch (e) { if (e?.name !== 'AbortError') toast(t('Could not share'), t('Use "Make a backup" instead.'), 'warning'); }
  updateBadge(); render();
}
async function restoreInApp() {
  if (await restoreFromFile()) hardLock(t('Backup restored. Enter the password that was used when the backup was made.'));
}
function deleteAccountModal() {
  modal(`<h3>🗑️ ${esc(t('Delete my account?'))}</h3>
    <p>${th('Your account, your sign-in and everything you recorded will be **permanently deleted** from the cloud and from this device. A family book you started is deleted for everyone in it. This cannot be undone.')}</p>
    <p class="small muted">${esc(t('Tip: make a backup first if you may want your accounts again.'))}</p>
    <form id="mf"><label class="field"><span>${th('Type **DELETE** to confirm')}</span><input class="input" name="c" autocomplete="off" autocapitalize="characters"></label>
    <div class="error-msg" id="merr"></div>
    <div class="actions"><button type="button" class="btn" data-close>${esc(t('Cancel'))}</button><button class="btn danger">${esc(t('Delete my account'))}</button></div></form>`, (box, close) => {
    const f = $('#mf', box);
    f.onsubmit = async ev => {
      ev.preventDefault();
      if (f.c.value.trim().toUpperCase() !== 'DELETE') { f.c.focus(); return; }
      await busy(f.querySelector('button.danger'), t('Please wait…'), async () => {
        try { await rpc('ha_delete_account', {}); } catch (e) { $('#merr', box).textContent = accountError(e); return; }
        close();
        localStorage.removeItem(VAULT_KEY); localStorage.removeItem(ATTEMPT_KEY);
        writePrefs({ privacy: false });
        hardLock(t('Your account has been deleted.'));
      });
    };
  });
}
async function eraseAll() {
  modal(`<h3>🗑️ ${esc(t('Erase everything?'))}</h3><p>${th('All income, expenses and items on this device will be **permanently deleted**. This cannot be undone.')}</p>
    ${S.data.account ? `<p class="small">${esc(t('Your account in the cloud is not affected – to remove that too, use "Delete my account".'))}</p>` : ''}
    <form id="mf"><label class="field"><span>${th('Type **DELETE** to confirm')}</span><input class="input" name="c" autocomplete="off" autocapitalize="characters"></label>
    <div class="actions"><button type="button" class="btn" data-close>${esc(t('Cancel'))}</button><button class="btn danger">${esc(t('Erase'))}</button></div></form>`, (box, close) => {
    const f = $('#mf', box);
    f.onsubmit = ev => {
      ev.preventDefault();
      if (f.c.value.trim().toUpperCase() !== 'DELETE') { f.c.focus(); return; }
      close();
      localStorage.removeItem(VAULT_KEY); localStorage.removeItem(ATTEMPT_KEY);
      writePrefs({ privacy: false });
      hardLock();
    };
  });
}

/* ---------------------------------------------------------------------
   VOICE ENTRY – speak (or type) a sentence, get a list of expenses
   English: "2 kg rice, 1 litre milk, bread 45 rupees, plumber 500"
   Tamil:   "2 கிலோ அரிசி, 1 லிட்டர் பால், பிரெட் 45 ரூபாய்"
   --------------------------------------------------------------------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const speechCompany = () => (/Edg\//.test(navigator.userAgent) ? 'Microsoft' : isIOS() ? 'Apple' : 'Google');
const VOICE_LANGS = [['ta-IN', 'தமிழ் (Tamil)'], ['en-IN', 'English (India)'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['en-AU', 'English (Australia)'],
  ['en-CA', 'English (Canada)'], ['en-SG', 'English (Singapore)'], ['en-ZA', 'English (South Africa)'], ['en-NG', 'English (Nigeria)'], ['en-KE', 'English (Kenya)']];
const NUM_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40,
  fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALE_WORDS = { hundred: 100, thousand: 1000, lakh: 1e5, lac: 1e5, million: 1e6, 'ஆயிரம்': 1000, 'லட்சம்': 1e5 };
// Tamil number words (exact words; recognisers usually give digits, but people also say these)
const TA_NUM = { 'ஒன்று': 1, 'ஒண்ணு': 1, 'ஒரு': 1, 'ஓர்': 1, 'இரண்டு': 2, 'ரெண்டு': 2, 'மூன்று': 3, 'மூணு': 3, 'நான்கு': 4, 'நாலு': 4,
  'ஐந்து': 5, 'அஞ்சு': 5, 'ஆறு': 6, 'ஏழு': 7, 'எட்டு': 8, 'ஒன்பது': 9, 'பத்து': 10, 'பதினொன்று': 11, 'பன்னிரண்டு': 12, 'பதினைந்து': 15,
  'இருபது': 20, 'இருபத்தி': 20, 'இருபத்து': 20, 'முப்பது': 30, 'முப்பத்தி': 30, 'நாற்பது': 40, 'நாற்பத்தி': 40, 'ஐம்பது': 50, 'ஐம்பத்தி': 50,
  'அறுபது': 60, 'எழுபது': 70, 'எண்பது': 80, 'தொண்ணூறு': 90, 'நூறு': 100, 'நூற்றி': 100, 'நூத்தி': 100, 'நூற்று': 100, 'இருநூறு': 200,
  'முன்னூறு': 300, 'முந்நூறு': 300, 'நானூறு': 400, 'ஐநூறு': 500, 'அறுநூறு': 600, 'எழுநூறு': 700, 'எண்ணூறு': 800, 'தொள்ளாயிரம்': 900 };
const TA_FRAC = { 'அரை': 0.5, 'கால்': 0.25, 'முக்கால்': 0.75, 'ஒன்றரை': 1.5, 'ஒண்ணரை': 1.5, 'இரண்டரை': 2.5, 'ரெண்டரை': 2.5, 'மூன்றரை': 3.5 };
const UNIT_WORDS = { kg: 'kg', kilo: 'kg', kilogram: 'kg', g: 'g', gm: 'g', gram: 'g', gramme: 'g', l: 'L', lt: 'L', ltr: 'L', litre: 'L', liter: 'L',
  ml: 'ml', millilitre: 'ml', milliliter: 'ml', pc: 'pcs', piece: 'pcs', no: 'pcs', dozen: 'dozen', packet: 'packet', pack: 'packet', pkt: 'packet',
  bottle: 'bottle', box: 'box', bundle: 'bundle', metre: 'metre', meter: 'metre', mtr: 'metre' };
const TA_UNITS = { 'கிலோ': 'kg', 'கேஜி': 'kg', 'கிராம்': 'g', 'லிட்டர்': 'L', 'லீட்டர்': 'L', 'மில்லி': 'ml', 'எண்ணம்': 'pcs', 'பீஸ்': 'pcs',
  'டஜன்': 'dozen', 'பாக்கெட்': 'packet', 'பாக்கட்': 'packet', 'பாட்டில்': 'bottle', 'பெட்டி': 'box', 'டப்பா': 'box', 'கட்டு': 'bundle', 'மீட்டர்': 'metre' };
const PRICE_BEFORE = new Set(['rs', 'rupee', 'for', 'at', 'cost', 'price', 'paid', 'worth', 'pay', 'spent', 'spend', 'விலை']);
const PRICE_AFTER = new Set(['rs', 'rupee', 'buck', 'dollar', 'pound', 'euro', 'dirham', 'riyal', 'taka', 'ringgit', 'shilling', 'naira', 'only', 'ரூ']);
const TA_PRICE_AFTER = { 'ரூபாய்': 1, 'ரூபா': 1, 'ரூவா': 1 };
const SEPS = new Set([',', 'and', 'then', 'also', 'plus', 'next', 'மற்றும்', 'அப்புறம்', 'அப்பறம்', 'பிறகு', 'அடுத்து', 'அப்புறமா']);
const FILLER = new Set(['a', 'an', 'the', 'of', 'i', 'we', 'my', 'our', 'me', 's', 'bought', 'buy', 'purchased', 'purchase', 'got', 'get', 'on', 'to',
  'some', 'today', 'total', 'amount', 'with', 'it', 'was', 'is', 'were', 'about', 'around', 'approximately', 'per', 'each', 'in', 'from', 'gave',
  'given', 'give', 'um', 'uh', 'okay', 'ok', 'so', 'yes', 'no', 'please', 'add', 'that', 'this', 'there', 'just', 'more', 'cost', 'costs',
  'நான்', 'நாங்கள்', 'இன்று', 'இன்னைக்கு', 'இன்றைக்கு', 'அது', 'இது', 'செலவு', 'மொத்தம்', 'சுமார்', 'கிட்டத்தட்ட']);
const TA_FILLER_PREFIX = ['வாங்க', 'வாங்கி', 'கொடுத்', 'செலவ', 'செஞ்ச', 'செய்த'];
const KEY_STOP = new Set(['bill', 'fee', 'item', 'visit', 'and', 'the', 'for', 'powder', 'out', 'home', 'cleaner', 'கட்டணம்', 'பொருட்கள்', 'சமையல்']);
// Extra words people say for the standard items (only used while the item keeps its standard name)
const ALIASES = {
  'Rice': ['chawal', 'அரிசி', 'சாதம்'], 'Wheat Flour / Atta': ['flour', 'wheat', 'கோதுமை', 'மாவு', 'ஆட்டா'], 'Cooking Oil': ['oil', 'tel', 'எண்ணெய்', 'எண்ணை', 'ஆயில்'],
  'Sugar': ['chini', 'sakkar', 'சர்க்கரை', 'சீனி'], 'Dal / Pulses': ['dhal', 'daal', 'lentil', 'பருப்பு'],
  'Tea / Coffee Powder': ['tea', 'coffee', 'chai', 'tea powder', 'coffee powder', 'டீ', 'தேயிலை', 'காபி', 'காப்பி'],
  'Salt & Spices': ['salt', 'spice', 'masala', 'namak', 'உப்பு', 'மசாலா'], 'Bread': ['ரொட்டி', 'பிரெட்', 'பிரட்'], 'Eggs': ['anda', 'முட்டை'],
  'Vegetables': ['vegetable', 'veggie', 'sabzi', 'sabji', 'காய்கறி'], 'Onions': ['pyaz', 'pyaaz', 'kanda', 'வெங்காயம்'], 'Tomatoes': ['tamatar', 'தக்காளி'],
  'Potatoes': ['aloo', 'alu', 'உருளைக்கிழங்கு', 'உருளை'], 'Fruits': ['fruit', 'பழங்கள்', 'பழம்'], 'Bananas': ['வாழைப்பழம்', 'வாழை'],
  'Milk': ['doodh', 'dudh', 'பால்'], 'Curd / Yogurt': ['curd', 'yogurt', 'yoghurt', 'dahi', 'தயிர்'], 'Butter / Ghee': ['butter', 'ghee', 'வெண்ணெய்', 'நெய்'],
  'Bathing Soap': ['soap', 'சோப்பு', 'சோப்'], 'Washing Detergent': ['detergent', 'washing powder', 'surf', 'சலவை', 'டிடர்ஜென்ட்'],
  'Dish Wash': ['dishwash', 'vim', 'dish soap', 'பாத்திரம்', 'விம்'], 'Toilet Cleaner': ['harpic', 'கழிவறை', 'டாய்லெட்', 'ஹார்பிக்'],
  'Electricity Bill': ['electricity', 'current bill', 'power bill', 'eb bill', 'light bill', 'மின்சாரம்', 'மின்சார', 'கரண்ட்', 'கரண்ட் பில்', 'இபி'],
  'Water Bill': ['water', 'தண்ணீர்', 'தண்ணி'], 'Cooking Gas Cylinder': ['gas', 'cylinder', 'lpg', 'gas cylinder', 'கேஸ்', 'சிலிண்டர்', 'எரிவாயு'],
  'Mobile Recharge': ['recharge', 'phone recharge', 'mobile', 'ரீசார்ஜ்', 'மொபைல்'], 'Internet / Wi-Fi': ['wifi', 'internet', 'broadband', 'இன்டர்நெட்', 'வைஃபை', 'வைபை', 'இணையம்'],
  'TV / Cable': ['cable', 'tv', 'dth', 'டிவி', 'கேபிள்'],
  'Bus / Auto Fare': ['bus', 'auto', 'rickshaw', 'auto rickshaw', 'bus fare', 'auto fare', 'taxi', 'cab', 'பஸ்', 'பேருந்து', 'ஆட்டோ', 'டாக்ஸி'],
  'Petrol': ['fuel', 'diesel', 'பெட்ரோல்', 'டீசல்'], 'Medicines': ['medicine', 'tablet', 'medical', 'மருந்து', 'மாத்திரை'],
  'Doctor Visit': ['doctor', 'clinic', 'hospital', 'டாக்டர்', 'மருத்துவர்', 'ஆஸ்பத்திரி', 'மருத்துவமனை'],
  'Stationery': ['notebook', 'pen', 'pencil', 'நோட்டு', 'பேனா', 'பென்சில்'], 'School / Tuition Fees': ['school fees', 'tuition', 'school', 'பள்ளி', 'ஸ்கூல்', 'டியூஷன்'],
  'Clothes': ['துணி', 'டிரஸ்', 'உடை'], 'Haircut / Salon': ['haircut', 'salon', 'parlour', 'parlor', 'barber', 'சலூன்', 'பார்லர்', 'முடி வெட்ட'],
  'Snacks': ['snack', 'chips', 'biscuit', 'ஸ்நாக்ஸ்', 'பிஸ்கட்', 'சிப்ஸ்', 'தின்பண்டம்'], 'Eating Out': ['restaurant', 'hotel', 'eating out', 'outside food', 'ஹோட்டல்', 'உணவகம்'],
  'Gifts': ['gift', 'பரிசு', 'கிஃப்ட்'], 'Pooja / Prayer Items': ['pooja', 'puja', 'flowers', 'temple', 'பூஜை', 'கோவில்'], 'Home Repairs': ['repair', 'repairs', 'பழுது', 'ரிப்பேர்'],
};

const TA_RE = /[஀-௿]/;
const dropVirama = w => w.replace(/்$/, ''); // பால் -> பால so that பாலும், பாலுக்கு also match
/** Does a spoken word match a key word? Tamil words may carry endings: அரிசிக்கு = அரிசி + க்கு. */
function wordEq(tok, key) {
  if (tok === key) return true;
  if (!TA_RE.test(key)) return false;
  const s = dropVirama(key);
  return s.length >= 3 && tok.startsWith(s);
}
function taFind(map, tok) {
  if (!tok || !TA_RE.test(tok)) return null;
  if (map[tok] != null) return map[tok];
  let best = null, bl = 0;
  for (const k of Object.keys(map)) if (wordEq(tok, k) && k.length > bl) { best = map[k]; bl = k.length; }
  return best;
}
/** "tomatoes" -> "tomato", "kgs" -> "kg" (used only for comparing words) */
function sing(w) {
  if (TA_RE.test(w)) return w;
  if (/^(kgs|gms|pcs|mls|nos|lts)$/.test(w)) return w.slice(0, -1);
  if (w.length <= 3 || /ss$/.test(w)) return w;
  if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
  if (/oes$/.test(w)) return w.slice(0, -2);
  if (/(s|x|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}
const isNum = tk => /^\d+(\.\d+)?$/.test(tk);
const unitWord = tk => (tk ? UNIT_WORDS[tk] || UNIT_WORDS[sing(tk)] || taFind(TA_UNITS, tk) || null : null);
const isPriceAfter = tk => !!tk && (PRICE_AFTER.has(sing(tk)) || !!taFind(TA_PRICE_AFTER, tk));
const isPriceBefore = tk => !!tk && PRICE_BEFORE.has(sing(tk));
const isFiller = tk => FILLER.has(tk) || FILLER.has(sing(tk)) || TA_FILLER_PREFIX.some(p => tk.startsWith(p));

function tokenize(s) {
  s = String(s).toLowerCase()
    .replace(/[₹$£€৳₦]/g, ' rs ')
    .replace(/\brs\.\s*/g, ' rs ')
    .replace(/ரூ\.\s*/g, ' ரூ ')
    .replace(/\/-/g, ' ')
    .replace(/½/g, ' 0.5 ').replace(/¼/g, ' 0.25 ').replace(/¾/g, ' 0.75 ')
    .replace(/(\d+)\s*\/\s*(\d+)/g, (m, a, b) => (+b ? ` ${+(a / b).toFixed(3)} ` : ' '))
    .replace(/(\d),(?=\d)/g, '$1')
    .replace(/&/g, ' and ')
    .replace(/(\d)([a-z஀-௿])/g, '$1 $2').replace(/([a-z஀-௿])(\d)/g, '$1 $2')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' , ')
    .replace(/[,;:!?\n]+/g, ' , ')
    .replace(/[^\p{L}\p{M}\p{N}.,\s]+/gu, ' ');
  return s.split(/\s+/).filter(Boolean);
}
/** "two and a half" -> "2.5", "one hundred and fifty" -> "150", "நூற்றி ஐம்பது" -> "150", "அரை" -> "0.5" */
function wordsToNums(toks) {
  const out = [];
  for (let i = 0; i < toks.length;) {
    const tk = toks[i];
    if (tk === 'half') { out.push('0.5'); i++; continue; }
    if (tk === 'quarter') { out.push('0.25'); i++; continue; }
    if (TA_FRAC[tk] != null) { out.push(String(TA_FRAC[tk])); i++; continue; }
    if (TA_NUM[tk] != null) { // Tamil numbers add up: நூற்றி ஐம்பது = 100 + 50; ஆயிரம் multiplies
      let total = 0, cur = 0, j = i;
      while (j < toks.length && (TA_NUM[toks[j]] != null || toks[j] === 'ஆயிரம்')) {
        if (toks[j] === 'ஆயிரம்') { total += (cur || 1) * 1000; cur = 0; } else cur += TA_NUM[toks[j]];
        j++;
      }
      out.push(String(total + cur)); i = j; continue;
    }
    const startsNum = NUM_WORDS[tk] != null || ((tk === 'a' || tk === 'an') && SCALE_WORDS[toks[i + 1]]);
    if (startsNum) {
      let total = 0, cur = 0, j = i, lastScale = false;
      if (tk === 'a' || tk === 'an') { cur = 1; j++; }
      while (j < toks.length) {
        const w = toks[j];
        if (NUM_WORDS[w] != null) { cur += NUM_WORDS[w]; lastScale = false; j++; }
        else if (w === 'hundred') { cur = (cur || 1) * 100; lastScale = true; j++; }
        else if (SCALE_WORDS[w]) { total += (cur || 1) * SCALE_WORDS[w]; cur = 0; lastScale = true; j++; }
        else if (w === 'and' && lastScale && NUM_WORDS[toks[j + 1]] != null) j++;
        else break;
      }
      out.push(String(total + cur)); i = j; continue;
    }
    if (isNum(tk) && SCALE_WORDS[toks[i + 1]]) { // "2 thousand 500", "2 ஆயிரம்"
      let v = +tk * SCALE_WORDS[toks[i + 1]]; i += 2;
      if (isNum(toks[i] || '') && +toks[i] < SCALE_WORDS[toks[i - 1]]) { v += +toks[i]; i++; }
      out.push(String(v)); continue;
    }
    out.push(tk); i++;
  }
  const res = []; // "2 and a half" / "2 and half"
  for (let k = 0; k < out.length; k++) {
    if (isNum(out[k]) && out[k + 1] === 'and' && out[k + 2] === 'a' && out[k + 3] === '0.5') { res.push(String(+out[k] + 0.5)); k += 3; continue; }
    if (isNum(out[k]) && out[k + 1] === 'and' && out[k + 2] === '0.5') { res.push(String(+out[k] + 0.5)); k += 2; continue; }
    res.push(out[k]);
  }
  return res;
}
/** Word sequences that point to each item in the user's list, longest first (English and Tamil). */
function buildKeys() {
  const keys = [], words = {};
  const add = (toks, item, prio) => { const tt = toks.filter(x => x !== ',').map(sing); if (tt.length) keys.push({ t: tt, item, prio }); };
  for (const it of S.data.items) {
    const names = [it.name];
    if (I18N.names[it.name]) names.push(I18N.names[it.name]);
    const parts = names.flatMap(n => [n, ...n.split('/')]).map(p => tokenize(p).filter(x => x !== ','));
    parts.forEach(p => add(p, it, 2));
    (ALIASES[it.name] || []).forEach(a => add(tokenize(a), it, 2));
    new Set(parts.flat().map(sing)).forEach(w => {
      if ((w.length >= 3 || TA_RE.test(w)) && !KEY_STOP.has(w) && !unitWord(w) && !isNum(w) && !FILLER.has(w)) (words[w] ||= new Set()).add(it);
    });
  }
  for (const [w, set] of Object.entries(words)) if (set.size === 1) add([w], [...set][0], 1); // a single word that is unique, e.g. "oil"
  return keys.sort((a, b) => b.t.length - a.t.length || b.prio - a.prio || b.t[0].length - a.t[0].length);
}
function findMatches(toks, keys) {
  const st = toks.map(sing), m = [];
  for (let i = 0; i < st.length;) {
    const hit = keys.find(k => i + k.t.length <= st.length && k.t.every((w, j) => wordEq(st[i + j], w)));
    if (hit) { m.push({ s: i, e: i + hit.t.length, item: hit.item }); i += hit.t.length; } else i++;
  }
  return m;
}
/** Reads quantity, unit, amount and leftover words from one piece of the sentence. */
function parseSeg(seg, ms) {
  const T = seg.map(x => x.t);
  const mi = seg.find(x => x.m >= 0)?.m;
  const item = mi != null ? ms[mi].item : null;
  let qty = null, unit = null, amount = null;
  const loose = [], words = [];
  for (let i = 0; i < T.length; i++) {
    if (seg[i].m >= 0) continue;
    const tk = T[i];
    const nx = i + 1 < T.length && seg[i + 1].m < 0 ? T[i + 1] : null;
    const pv = i > 0 && seg[i - 1].m < 0 ? T[i - 1] : null;
    let n = isNum(tk) ? +tk : null;
    if (n == null && (tk === 'a' || tk === 'an') && unitWord(nx) && !(pv && isNum(pv))) n = 1; // "a dozen", "a kg"
    if (n != null) {
      const u = unitWord(nx);
      if (u) { if (qty == null) { qty = n; unit = u; } else loose.push(n); i++; continue; }
      if (isPriceAfter(nx)) { amount = (amount || 0) + n; i++; continue; }
      if (isPriceBefore(pv)) { amount = (amount || 0) + n; continue; }
      loose.push(n); continue;
    }
    const u = unitWord(tk);
    if (u) { // a unit with no number in front: "dozen eggs", "packet of bread"
      if (qty == null && !(pv && isNum(pv)) && ['dozen', 'packet', 'bottle', 'box', 'bundle'].includes(u)) { qty = 1; unit = u; }
      continue;
    }
    if (isFiller(tk) || isPriceBefore(tk) || isPriceAfter(tk) || SEPS.has(tk)) continue;
    words.push(tk);
  }
  if (loose.length) {
    if (item) {
      if (qty == null && amount == null) {
        if (loose.length >= 2) { qty = loose[0]; amount = loose[loose.length - 1]; }
        else if (loose[0] <= 20) qty = loose[0];   // "eggs 6", "milk 2"
        else amount = loose[0];                    // "bread 45", "electricity bill 1850"
      } else if (qty == null) qty = loose[0];
      else if (amount == null) amount = loose[loose.length - 1];
    } else if (qty == null && loose.length >= 2) { qty = loose[0]; amount ??= loose[loose.length - 1]; }
    else amount ??= loose[loose.length - 1];
  }
  return { item, words, qty, unit, amount };
}
/** Turns one parsed piece into an editable entry with a worked-out amount where possible. */
function finalizeEntry(p) {
  const it = p.item;
  let qty = p.qty, qUnit = p.unit, amount = p.amount;
  if (qty == null && amount != null) { qty = 1; qUnit = 'each'; } // only the money was said
  if (qty == null) qty = 1;
  qUnit ||= it ? (it.qUnit || it.unit) : 'each';
  const base = it && sameDim(qUnit, it.unit) ? it.unit : qUnit;
  let unitPrice = null;
  if (amount != null && qty > 0) unitPrice = amount / (qty * conv(qUnit, base));
  else if (it && it.price > 0 && base === it.unit) { unitPrice = it.price; amount = qty * conv(qUnit, base) * it.price; }
  const n = p.words.join(' ');
  return { on: true, item: it, name: it ? it.name : (n ? n[0].toUpperCase() + n.slice(1) : t('Other expense')), icon: it ? it.icon : '🧾',
    cat: it ? it.cat : 'other', qty: Math.round(qty * 1000) / 1000, qUnit, amount: amount != null ? round2(amount) : null, base, unitPrice };
}
function parseExpenses(text) {
  const toks = wordsToNums(tokenize(text));
  const ms = findMatches(toks, buildKeys());
  const owner = new Array(toks.length).fill(-1);
  ms.forEach((m, mi) => { for (let i = m.s; i < m.e; i++) owner[i] = mi; });
  // 1) split at pauses / commas / "and" (but never inside an item name like "salt and spices")
  const segs = []; let cur = [];
  toks.forEach((tk, i) => { if (owner[i] < 0 && SEPS.has(tk)) { if (cur.length) segs.push(cur); cur = []; } else cur.push({ t: tk, m: owner[i] }); });
  if (cur.length) segs.push(cur);
  // 2) does the speaker say the quantity before the item ("2 kg rice") or after it ("rice 2 kg")?
  let prefix = true;
  for (const s of segs) {
    const fi = s.findIndex(x => x.m >= 0); if (fi < 0) continue;
    const before = s.slice(0, fi).some(x => isNum(x.t) || unitWord(x.t));
    const after = s.slice(fi).some(x => x.m < 0 && isNum(x.t));
    prefix = before || !after; break;
  }
  // 3) a piece that still names several items is cut between them
  const parts = [];
  for (const s of segs) {
    const starts = []; s.forEach((x, i) => { if (x.m >= 0 && (i === 0 || s[i - 1].m !== x.m)) starts.push(i); });
    if (starts.length < 2) { parts.push(s); continue; }
    let from = 0;
    starts.slice(1).forEach((st, k) => {
      let j = st;
      if (prefix) {
        const prevEnd = s.findIndex((x, i) => i > starts[k] && x.m !== s[starts[k]].m);
        while (j - 1 >= Math.max(prevEnd, from + 1) && s[j - 1].m < 0 && (isNum(s[j - 1].t) || unitWord(s[j - 1].t) || ['a', 'an', 'of'].includes(s[j - 1].t))) j--;
      }
      parts.push(s.slice(from, j)); from = j;
    });
    parts.push(s.slice(from));
  }
  // 4) read each piece; pieces with only numbers fill in the item before (or after) them
  const out = []; let pending = null;
  for (const p of parts) {
    const r = parseSeg(p, ms);
    if (!r.item && !r.words.length) {
      if (r.qty == null && r.amount == null) continue;
      const prev = out[out.length - 1];
      if (prev && ((r.qty != null && prev.qty == null) || (r.amount != null && prev.amount == null))) {
        if (prev.qty == null && r.qty != null) { prev.qty = r.qty; prev.unit = r.unit; }
        if (prev.amount == null && r.amount != null) prev.amount = r.amount;
      } else pending = r;
      continue;
    }
    if (!r.item && r.amount == null && r.qty == null) continue; // just chatter
    if (pending && r.item) {
      if (r.qty == null && pending.qty != null) { r.qty = pending.qty; r.unit = pending.unit; }
      if (r.amount == null && pending.amount != null) r.amount = pending.amount;
    }
    pending = null;
    out.push(r);
  }
  return out.map(finalizeEntry);
}
/** Adds the checked entries to the day's ledger page. Same item already there? The quantity is added on. */
function addVoiceEntries(ents, k) {
  const day = dayObj(k); let n = 0, total = 0;
  for (const e of ents) {
    if (!e.on || !(e.qty > 0) || !(e.amount > 0)) continue;
    const base = e.item && sameDim(e.qUnit, e.item.unit) ? e.item.unit : e.qUnit;
    const price = +(e.amount / (e.qty * conv(e.qUnit, base))).toFixed(6);
    const ex = e.item && day.lines[e.item.id];
    if (e.item && !ex) day.lines[e.item.id] = { name: e.item.name, icon: e.item.icon, cat: e.item.cat, price, unit: base, qUnit: e.qUnit, qty: e.qty };
    else if (ex && ex.unit === base && sameDim(ex.qUnit, e.qUnit)) {
      const amt = lineAmt(ex) + e.amount;
      ex.qty = Math.round((ex.qty + e.qty * conv(e.qUnit, ex.qUnit)) * 1000) / 1000;
      ex.price = +(amt / (ex.qty * conv(ex.qUnit, ex.unit))).toFixed(6);
    } else day.lines['x_' + uid()] = { name: e.item ? e.item.name : e.name.trim() || t('Other expense'), icon: e.icon, cat: e.cat, price, unit: base, qUnit: e.qUnit, qty: e.qty };
    if (e.item && sameDim(e.qUnit, e.item.unit)) e.item.qUnit = e.qUnit; // remember how it is usually bought
    n++; total += e.amount;
  }
  cleanupDay(k); persist();
  return { n, total };
}

async function detectVoiceMode(lang) {
  if (!SR) return 'none';
  try { // on-device speech recognition (newer Chrome): nothing leaves the device
    if (typeof SR.available === 'function') {
      const a = await SR.available({ langs: [lang], processLocally: true });
      if (a === 'available') return 'local';
      if (a === 'downloadable' || a === 'downloading') return 'download';
    }
  } catch { /* not supported */ }
  return 'cloud';
}
const VOICE_ERRORS = {
  'not-allowed': 'The microphone is blocked. Click the 🔒 or ⓘ icon at the left of the address bar, set Microphone to Allow, then try again.',
  'service-not-allowed': 'This browser does not allow voice typing here. Please type your expenses below instead.',
  'audio-capture': 'No microphone was found. Please connect a microphone, or type below.',
  'network': 'Voice typing needs an internet connection in this browser. Please connect, or type your expenses below.',
  'no-speech': "I didn't hear anything. Tap the microphone and try again, speaking a little louder.",
  'language-not-supported': 'This voice language is not supported. Change it in Settings → Voice entry.',
};

function voiceModal() {
  const k = S.ui.date, set = S.data.settings;
  let lang = set.voiceLang || (LANG === 'ta' ? 'ta-IN' : 'en-IN');
  let rec = null, finals = [], interim = '', silenceT = null, lastErr = null, cancelled = false, closed = false, ents = [];
  let mode = 'checking', modeP;
  const checkMode = () => { mode = 'checking'; modeP = detectVoiceMode(lang).then(m => { mode = m; return m; }); };
  checkMode();
  const body = () => $('#vBody');
  const example = () => (lang.startsWith('ta') ? '2 கிலோ அரிசி, 1 லிட்டர் பால், பிரெட் 45 ரூபாய், பிளம்பர் 500' : '2 kg rice, 1 litre milk, bread 45 rupees, plumber 500');

  const close = modal(`<h3>🎤 ${esc(t('Speak your expenses'))}</h3>
    <p class="small muted" style="margin-top:-6px">${th('Adding to **{d}**', { d: esc(fmtDate(k)) })}</p>
    <div id="vBody"></div>`, () => showStart(), () => { closed = true; clearTimeout(silenceT); try { rec?.abort(); } catch { /* ignore */ } });

  function showStart(msg = '', text = '') {
    if (!body()) return;
    body().innerHTML = `
      ${SR ? `<div class="lang-switch" role="group" aria-label="${esc(t('I will speak in'))}">
          <span class="small muted">${esc(t('I will speak in'))}:</span>
          <button type="button" class="chip" data-vl="ta-IN" aria-pressed="${lang === 'ta-IN'}">தமிழ்</button>
          <button type="button" class="chip" data-vl="en" aria-pressed="${lang.startsWith('en')}">English</button></div>
        <button class="mic" id="vMic" autofocus aria-label="${esc(t('Start speaking'))}">🎤</button>
        <p style="text-align:center;margin:6px 0 0"><b>${esc(t('Tap the microphone and speak'))}</b></p>
        <p class="small muted" style="text-align:center;margin:4px 0 12px">${esc(t('Say each item with its quantity or price. Pause between items.'))}<br>
          ${esc(t('For example:'))} <i>“${esc(example())}”</i></p>`
      : `<div class="alert info"><span class="ico" aria-hidden="true">ℹ️</span><div class="small">${esc(t('Voice is not available in this browser. Please use Google Chrome, Microsoft Edge or Safari – or simply type your expenses below.'))}</div></div>`}
      ${msg ? `<div class="alert warning"><span class="ico" aria-hidden="true">⚠️</span><div class="small">${esc(msg)}</div></div>` : ''}
      <label class="field"><span>${esc(SR ? t('Or type them here') : t('Type your expenses'))}</span>
        <textarea class="input" id="vText" placeholder="${esc(example())}">${esc(text)}</textarea></label>
      <div class="actions"><button type="button" class="btn" id="vCancel">${esc(t('Cancel'))}</button><button type="button" class="btn primary" id="vGo">📝 ${esc(t('Make the list'))}</button></div>`;
    $('#vMic')?.addEventListener('click', onMic);
    $$('[data-vl]', body()).forEach(b => { b.onclick = () => {
      lang = b.dataset.vl === 'ta-IN' ? 'ta-IN' : (set.voiceLang?.startsWith('en') ? set.voiceLang : 'en-IN');
      set.voiceLang = lang; persist(); checkMode(); showStart('', $('#vText')?.value || '');
    }; });
    $('#vCancel').onclick = () => close();
    $('#vGo').onclick = () => { const tx = $('#vText').value.trim(); if (!tx) { $('#vText').focus(); return; } showReview(tx); };
  }

  async function onMic() {
    if (mode === 'checking') await modeP;
    if (mode === 'download') { // one-time download of the on-device voice pack
      body().innerHTML = `<p style="text-align:center;padding:30px 0">⏳ ${esc(t('Getting voice ready on this device (one time only)…'))}</p>`;
      try { mode = (await SR.install({ langs: [lang], processLocally: true })) ? 'local' : 'cloud'; } catch { mode = 'cloud'; }
    }
    if (closed) return;
    if (mode === 'cloud' && !set.voiceCloudOk) return showConsent();
    startRec();
  }

  function showConsent() {
    body().innerHTML = `
      <div class="alert warning"><span class="ico" aria-hidden="true">🔐</span><div><b>${esc(t('Before you use voice'))}</b>
        <span class="small">${esc(t("On this device, voice typing works by sending what you say over the internet to {c}'s speech service, which turns it into text. Your saved accounts stay locked on this device – only your voice, while the microphone is on, is sent.", { c: speechCompany() }))}</span></div></div>
      <p class="small">${esc(t('For full privacy you can type your expenses instead – the app understands typed sentences in exactly the same way.'))}</p>
      <div class="actions"><button type="button" class="btn" id="vNo">⌨️ ${esc(t('Type instead'))}</button><button type="button" class="btn primary" id="vYes">🎤 ${esc(t('Allow voice'))}</button></div>`;
    $('#vNo').onclick = () => showStart();
    $('#vYes').onclick = () => { set.voiceCloudOk = true; persist(); startRec(); };
    $('#vYes').focus();
  }

  function paint() {
    const el = $('#vLive'); if (!el) return;
    const said = finals.join(', ');
    el.innerHTML = said || interim ? `${esc(said)} <span class="interim">${esc(interim)}</span>` : `<span class="muted">${esc(t('Waiting for you to speak…'))}</span>`;
  }
  const armSilence = ms => { clearTimeout(silenceT); silenceT = setTimeout(() => { try { rec?.stop(); } catch { /* ignore */ } }, ms); };

  function startRec() {
    finals = []; interim = ''; lastErr = null; cancelled = false;
    try { rec = new SR(); } catch { return showStart(t('Could not start voice typing. Please type below.')); }
    rec.lang = lang; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    if (mode === 'local') { try { rec.processLocally = true; } catch { /* older browsers */ } }
    rec.onresult = ev => {
      interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) { const tx = r[0].transcript.trim(); if (tx) finals.push(tx); } else interim += r[0].transcript;
      }
      paint(); armSilence(5000); // stop by itself after 5 seconds of quiet
    };
    rec.onerror = ev => { lastErr = ev.error; };
    rec.onend = () => {
      clearTimeout(silenceT); rec = null;
      if (closed) return;
      const text = [...finals, interim.trim()].filter(Boolean).join(', ');
      if (cancelled) return showStart();
      if (text) showReview(text);
      else showStart(t(VOICE_ERRORS[lastErr] || VOICE_ERRORS['no-speech']));
    };
    body().innerHTML = `
      <button class="mic live" id="vStop" aria-label="${esc(t('Stop listening'))}">🎤</button>
      <p style="text-align:center;margin:6px 0 0" aria-live="polite"><b>${esc(t('Listening… speak now'))}</b></p>
      <p class="small muted" style="text-align:center;margin:2px 0 8px">${th('Pause between items. Tap **Done** when you finish.')}${mode === 'local' ? '<br>🛡️ ' + esc(t('Your voice stays on this device.')) : ''}</p>
      <div class="v-transcript" id="vLive"></div>
      <div class="actions"><button type="button" class="btn" id="vStopCancel">${esc(t('Cancel'))}</button><button type="button" class="btn primary" id="vDone">✅ ${esc(t('Done'))}</button></div>`;
    paint();
    $('#vStop').onclick = $('#vDone').onclick = () => { try { rec?.stop(); } catch { /* ignore */ } };
    $('#vStopCancel').onclick = () => { cancelled = true; try { rec?.abort(); } catch { showStart(); } };
    try { rec.start(); } catch { rec = null; return showStart(t('Could not start the microphone. Please type below.')); }
    armSilence(10000);
  }

  const need = e => e.on && (!(e.qty > 0) || !(e.amount > 0));
  const vRow = (e, i) => `
    <div class="v-row ${need(e) ? 'need' : ''} ${e.on ? '' : 'off'}" data-i="${i}">
      <div class="v-top"><input type="checkbox" data-v="on" ${e.on ? 'checked' : ''} aria-label="${esc(t('Include {i}', { i: nm(e.name) }))}">
        <span class="emo" aria-hidden="true">${esc(e.icon)}</span>
        ${e.item ? `<div style="flex:1"><b>${esc(nm(e.name))}</b>${sub(e.name)}</div>` : `<input class="input" data-v="name" value="${esc(e.name)}" aria-label="${esc(t('What was it for'))}" style="flex:1;min-height:42px">`}</div>
      <div class="v-fields">
        <input class="input" data-v="qty" inputmode="decimal" value="${e.qty ?? ''}" aria-label="${esc(t('Quantity'))}">
        <select class="input" data-v="unit" aria-label="${esc(t('Unit'))}">${unitOptions(e.qUnit)}</select>
        <span aria-hidden="true">=</span>
        <input class="input" data-v="amt" inputmode="decimal" value="${e.amount ?? ''}" placeholder="${esc(t('Amount'))}" aria-label="${esc(t('Amount'))}">
      </div>
      <div class="small v-need">${need(e) ? esc(t('Please type the amount')) : ''}</div>
    </div>`;
  function updateAdd() {
    const btn = $('#vAdd'); if (!btn) return;
    const ok = ents.filter(e => e.on && !need(e)), bad = ents.some(need);
    btn.disabled = bad || !ok.length;
    btn.innerHTML = bad ? esc(t('Fill in the red boxes')) : ok.length
      ? `<span>✅ ${th(ok.length === 1 ? 'Add {n} item ({a})' : 'Add {n} items ({a})', { n: ok.length, a: M(ok.reduce((s, e) => s + e.amount, 0)) })}</span>` : esc(t('Nothing ticked'));
  }
  function showReview(text) {
    ents = parseExpenses(text);
    body().innerHTML = `
      <p class="small muted" style="margin:0 0 4px">${esc(t('I heard:'))}</p>
      <div class="v-transcript">“${esc(text)}”</div>
      ${ents.length ? `<p style="margin:12px 0 8px"><b>${esc(t('Please check this list.'))}</b> <span class="small muted">${esc(t('Untick anything wrong, or change a number.'))}</span></p>
        <div id="vList">${ents.map(vRow).join('')}</div>`
      : `<div class="alert warning"><span class="ico" aria-hidden="true">🤔</span><div class="small">${esc(t('I could not find any expenses in that. Try saying the item and the quantity or amount, like "rice 2 kg" or "plumber 500 rupees".'))}</div></div>`}
      <div class="actions"><button type="button" class="btn" id="vAgain">${SR ? '🎤 ' + esc(t('Try again')) : '✏️ ' + esc(t('Change'))}</button>
        ${ents.length ? '<button type="button" class="btn primary" id="vAdd"></button>' : ''}</div>`;
    $('#vAgain').onclick = () => showStart('', text);
    const list = $('#vList');
    if (list) {
      const onEdit = ev => {
        const row = ev.target.closest('.v-row'), e = ents[row.dataset.i], f = ev.target.dataset.v;
        if (f === 'on') { e.on = ev.target.checked; row.classList.toggle('off', !e.on); }
        else if (f === 'name') e.name = ev.target.value;
        else if (f === 'amt') {
          const a = num(ev.target.value); e.amount = a >= 0 ? a : null;
          if (e.amount != null && e.qty > 0) e.unitPrice = e.amount / (e.qty * conv(e.qUnit, e.base));
        } else if (f === 'qty' || f === 'unit') {
          if (f === 'qty') { const q = num(ev.target.value); e.qty = q >= 0 ? q : null; }
          else {
            const u = ev.target.value;
            const nb = e.item && sameDim(u, e.item.unit) ? e.item.unit : u;
            if (nb !== e.base) {
              e.unitPrice = e.item && nb === e.item.unit && e.item.price > 0 ? e.item.price
                : e.amount != null && e.qty > 0 ? e.amount / (e.qty * conv(u, nb)) : null;
              e.base = nb;
            }
            e.qUnit = u;
          }
          if (e.unitPrice != null && e.qty > 0) { e.amount = round2(e.qty * conv(e.qUnit, e.base) * e.unitPrice); row.querySelector('[data-v=amt]').value = e.amount; }
        }
        row.classList.toggle('need', need(e));
        row.querySelector('.v-need').textContent = need(e) ? t('Please type the amount') : '';
        updateAdd();
      };
      list.addEventListener('input', onEdit);
      list.addEventListener('change', onEdit);
      updateAdd();
      $('#vAdd').onclick = () => {
        const { n, total } = addVoiceEntries(ents, k);
        close();
        S.ui.date = k; S.ui.filter = 'selected'; S.ui.q = '';
        if (S.ui.view === 'ledger') render(); else go('ledger');
        scheduleAlertCheck();
        toast(plural(n, '✅ {n} item added', '✅ {n} items added'), t('{a} added to {d}.', { a: money(total), d: fmtShort(k) }));
      };
      if (!isTouch()) $('#vAdd').focus();
    }
  }
}

/* ---------------------------------------------------------------------
   PLANNER – a year of months, and a pre-plan for each month:
   a planned amount for each type of expense, planned payments with due
   dates (school fees, rent, festivals…), expected income and notes.
   Planned payments count towards their type's plan.
   --------------------------------------------------------------------- */
function planOf(mk, create) {
  const p = S.data.plans[mk];
  if (p || !create) return p;
  return (S.data.plans[mk] = { income: 0, cats: {}, note: '', items: {} });
}
const planItems = mk => Object.entries(planOf(mk)?.items || {}).map(([id, it]) => ({ id, ...it }));
const itemsSum = (mk, catId) => planItems(mk).filter(i => catInfo(i.cat).id === catId).reduce((s, i) => s + (+i.amount || 0), 0);
/** Planned amount for a type of expense = what was typed, or more if its planned payments add up to more. */
const planForCat = (mk, catId) => Math.max(+planOf(mk)?.cats?.[catId] || 0, itemsSum(mk, catId));
const plannedTotal = mk => (planOf(mk) ? round2(S.data.categories.reduce((s, c) => s + planForCat(mk, c.id), 0)) : 0);
function cleanupPlan(mk) {
  const p = S.data.plans[mk];
  if (p && !(p.income > 0) && !p.note && !Object.values(p.cats || {}).some(v => v > 0) && !Object.keys(p.items || {}).length) delete S.data.plans[mk];
}
const dueKey = (mk, it) => (it.day ? `${mk}-${pad(Math.min(it.day, daysInMonth(mk)))}` : null);
function dueTag(mk, it) {
  if (it.done) return `<span class="due paid">✓ ${esc(t('Paid'))}</span>`;
  const dk = dueKey(mk, it); if (!dk) return '';
  const diff = Math.round((pkey(dk) - pkey(todayKey())) / 864e5);
  if (diff < 0) return `<span class="due late">⏰ ${esc(t('Overdue – was due {d}', { d: fmtShort(dk) }))}</span>`;
  if (diff <= 3) return `<span class="due soon">📌 ${esc(diff === 0 ? t('Due today') : diff === 1 ? t('Due tomorrow') : t('Due in {n} days', { n: diff }))}</span>`;
  return `<span class="due">${esc(t('Due {d}', { d: fmtShort(dk) }))}</span>`;
}

function homePlanCard(mk, st) {
  const pt = plannedTotal(mk);
  if (!pt && !planItems(mk).length) return `<div class="card"><h3>📅 ${esc(t("This month's plan"))}</h3>
    <p class="muted" style="margin:0 0 10px">${esc(t('Plan your month: school fees, rent, festivals and a spending amount for each type of expense.'))}</p>
    <button class="btn" data-act="openPlan" data-m="${mk}">📅 ${esc(t('Plan this month'))}</button></div>`;
  const next = planItems(mk).filter(i => !i.done).sort((a, b) => (a.day || 99) - (b.day || 99))[0];
  return `<div class="card"><h3>📅 ${esc(t("This month's plan"))}</h3>
    <div class="row wrap" style="margin-bottom:8px"><span>${th('Spent {a} of planned {b}', { a: M(st.expense), b: M(pt) })}</span></div>
    ${progressHtml(st.expense, pt)}
    ${next ? `<p class="small" style="margin:10px 0 0">${th('Next payment: **{i}** – {a}', { i: esc(next.name), a: M(next.amount) })} ${dueTag(mk, next)}</p>` : ''}
    <button class="btn sm" data-act="openPlan" data-m="${mk}" style="margin-top:10px">📅 ${esc(t('Open the planner'))}</button></div>`;
}

function viewPlanner() { return S.ui.planMonth ? viewPlanMonth(S.ui.planMonth) : viewPlanYear(S.ui.year); }

function viewPlanYear(y) {
  const tk = todayKey(), nowMk = mkey(tk);
  let yPlan = 0, ySpent = 0, yInc = 0;
  const cards = [];
  for (let m = 1; m <= 12; m++) {
    const mk = `${y}-${pad(m)}`, st = monthStats(mk), pt = plannedTotal(mk), items = planItems(mk);
    yPlan += pt; ySpent += st.expense; yInc += st.income;
    const open = items.filter(i => !i.done), late = open.filter(i => i.day && dueKey(mk, i) < tk).length;
    const over = pt > 0 && st.expense > pt;
    cards.push(`<button class="month-card ${mk === nowMk ? 'now' : mk < nowMk ? 'past' : ''}" data-act="openPlan" data-m="${mk}" aria-label="${esc(fmtMonth(mk))}">
      <div class="mc-name"><span>${esc(pkey(mk + '-01').toLocaleDateString(DLOC(), { month: 'long' }))}</span>${mk === nowMk ? `<span class="small" style="color:var(--accent)">● ${esc(t('Now'))}</span>` : ''}</div>
      <div class="mc-row"><span>${esc(t('Planned'))}</span><b>${pt ? M(pt) : '—'}</b></div>
      <div class="mc-row"><span>${esc(t('Spent'))}</span><b>${st.expense ? M(st.expense) : '—'}</b></div>
      ${pt ? progressHtml(st.expense, pt) : ''}
      <div class="mc-tag ${late || over ? 'warn' : ''}">${late ? '⏰ ' + esc(plural(late, '{n} payment overdue', '{n} payments overdue'))
        : over ? '⚠️ ' + esc(t('Over the plan'))
        : items.length ? '📝 ' + esc(plural(open.length, '{n} payment to make', '{n} payments to make')) : pt ? '' : esc(t('Not planned yet'))}</div>
    </button>`);
  }
  return `
  <div class="date-bar">
    <button class="nav-arrow" data-act="planYear" data-d="-1" aria-label="${esc(t('Previous year'))}">◀</button>
    <div class="date-main"><div class="d1">${y}</div><div class="small muted">${esc(t('Yearly planner'))}</div></div>
    <button class="nav-arrow" data-act="planYear" data-d="1" aria-label="${esc(t('Next year'))}">▶</button>
  </div>
  <div class="grid-2 stats" style="margin-bottom:14px">
    <div class="stat"><div class="k">📅 ${esc(t('Planned for the year'))}</div><div class="v">${M(yPlan)}</div></div>
    <div class="stat"><div class="k">🧾 ${esc(t('Spent'))}</div><div class="v">${M(ySpent)}</div></div>
    <div class="stat"><div class="k">💰 ${esc(t('Income'))}</div><div class="v">${M(yInc)}</div></div>
    <div class="stat"><div class="k">🏦 ${esc(t('Saved'))}</div><div class="v ${yInc - ySpent >= 0 ? 'good' : 'bad'}">${M(yInc - ySpent)}</div></div>
  </div>
  <h3>${esc(t('Tap a month to plan it'))}</h3>
  <div class="month-grid">${cards.join('')}</div>`;
}

function viewPlanMonth(mk) {
  const p = planOf(mk) || { income: 0, cats: {}, note: '', items: {} }, st = monthStats(mk);
  const pt = plannedTotal(mk), tk = todayKey(), dim = daysInMonth(mk);
  const left = mk === mkey(tk) ? dim - pkey(tk).getDate() + 1 : mk > mkey(tk) ? dim : 0;
  const items = planItems(mk).sort((a, b) => (a.done - b.done) || ((a.day || 99) - (b.day || 99)));
  const manage = canManage(), dis = manage ? '' : 'disabled';
  const expInc = +p.income || 0;
  return `
  <button class="btn sm" data-act="planBack" style="margin-bottom:10px">← ${esc(t('All months of {y}', { y: mk.slice(0, 4) }))}</button>
  ${monthBar(mk, 'planMonthNav')}
  <div class="grid-2 stats" style="margin-bottom:14px">
    <div class="stat"><div class="k">📅 ${esc(t('Planned spending'))}</div><div class="v">${M(pt)}</div></div>
    <div class="stat"><div class="k">🧾 ${esc(t('Spent so far'))}</div><div class="v ${pt && st.expense > pt ? 'bad' : ''}">${M(st.expense)}</div></div>
    <div class="stat"><div class="k">💰 ${esc(t('Expected income'))}</div><div class="v">${M(expInc)}</div></div>
    <div class="stat"><div class="k">🏦 ${esc(t('Expected savings'))}</div><div class="v ${expInc - pt >= 0 ? 'good' : 'bad'}">${expInc ? M(expInc - pt) : '—'}</div></div>
  </div>
  ${pt ? `<div class="card">${progressHtml(st.expense, pt)}
    <p class="small" style="margin:8px 0 0">${st.expense <= pt
      ? th('**{a}** left of the plan.', { a: M(pt - st.expense) }) + (left > 0 ? ' ' + th('About **{d}** per day for the remaining {n} days.', { d: M((pt - st.expense) / left), n: left }) : '')
      : `<span style="color:var(--danger)">${th('**{a}** more than planned.', { a: M(st.expense - pt) })}</span>`}</p></div>` : ''}

  <div class="cards-2">
  <div class="card"><h3>📝 ${esc(t('Planned payments & purchases'))}</h3>
    <p class="small muted" style="margin-top:0">${esc(t('Things to pay or buy this month, like school fees, rent, a gas cylinder or festival shopping. Tick them when paid – they are added to the daily ledger.'))}</p>
    ${items.length ? items.map(it => `<div class="plan-item ${it.done ? 'done' : ''}">
        <input type="checkbox" data-plantick="${esc(it.id)}" ${it.done ? 'checked' : ''} ${canEditBy(it.by) ? '' : 'disabled'} aria-label="${esc(t('Paid: {i}', { i: it.name }))}">
        <button class="main" data-act="planItem" data-id="${esc(it.id)}">
          <div class="t">${esc(catInfo(it.cat).icon)} ${esc(it.name)}</div>
          <div>${dueTag(mk, it)}${shared() && it.by && it.by !== myId() ? ` <span class="small muted">· 👤 ${esc(memberName(it.by))}</span>` : ''}</div>
        </button>
        <div class="amt">${M(it.amount)}</div></div>`).join('')
      : `<div class="empty">${esc(t('No payments planned yet.'))}</div>`}
    <button class="btn primary block" data-act="planAdd" style="margin-top:10px">➕ ${esc(t('Add a planned payment'))}</button>
  </div>

  <div class="card"><h3>🎯 ${esc(t('Plan for each type of expense'))}</h3>
    ${manage ? '' : `<p class="small muted">🔒 ${esc(t('Only the owner or an editor can change the month plan.'))}</p>`}
    ${S.data.categories.map(c => { const typed = +p.cats?.[c.id] || 0, inItems = itemsSum(mk, c.id), plan = planForCat(mk, c.id), spent = st.byCat[c.id] || 0; return `
      <div class="plan-cat"><span class="emo" aria-hidden="true" style="font-size:1.4rem">${esc(c.icon)}</span>
        <div style="min-width:0"><div class="t" style="font-weight:600">${esc(nm(c.name))}</div>
          <div class="small muted">${spent || plan ? th('Spent {a}', { a: M(spent) }) : ''}${inItems > typed ? ' · ' + th('includes {a} planned payments', { a: M(inItems) }) : ''}</div>
          ${plan ? progressHtml(spent, plan) : ''}</div>
        <input class="input" inputmode="decimal" data-plancat="${esc(c.id)}" value="${typed || ''}" placeholder="${inItems ? esc(String(inItems)) : '0'}" aria-label="${esc(t('Plan for {c}', { c: nm(c.name) }))}" ${dis}>
      </div>`; }).join('')}
    <div class="grid-2" style="margin-top:12px">
      <button class="btn" data-act="planCopy" ${dis}>📋 ${esc(t("Copy last month's plan"))}</button>
      <button class="btn" data-act="planFill" ${dis}>🎯 ${esc(t('Use my usual budgets'))}</button>
    </div>
  </div>
  </div>

  <div class="cards-2">
  <div class="card"><h3>💰 ${esc(t('Expected income'))}</h3>
    <label class="field"><span>${esc(t('Income I expect this month'))}</span><input class="input" inputmode="decimal" data-planinc value="${expInc || ''}" placeholder="0" ${dis}></label>
    <p class="small muted" style="margin:0">${th('Received so far: {a}', { a: M(st.income) })}</p>
  </div>
  <div class="card"><h3>🗒️ ${esc(t('Notes for this month'))}</h3>
    <textarea class="input" data-plannote maxlength="1000" placeholder="${esc(t('e.g. Diwali on the 8th, cousin\'s wedding, car service'))}" ${dis}>${esc(p.note || '')}</textarea>
  </div>
  </div>`;
}

function wirePlanner(v) {
  const mk = S.ui.planMonth; if (!mk) return;
  const saved = () => { cleanupPlan(mk); persist(); scheduleAlertCheck(); };
  $$('[data-plancat]', v).forEach(inp => { inp.onchange = () => {
    const n = inp.value.trim() === '' ? 0 : num(inp.value);
    if (!(n >= 0)) { toast(t('Please enter a valid amount'), '', 'warning'); return; }
    const p = planOf(mk, true); if (n > 0) p.cats[inp.dataset.plancat] = round2(n); else delete p.cats[inp.dataset.plancat];
    saved(); render();
  }; });
  const inc = $('[data-planinc]', v);
  if (inc) inc.onchange = () => {
    const n = inc.value.trim() === '' ? 0 : num(inc.value);
    if (!(n >= 0)) { toast(t('Please enter a valid amount'), '', 'warning'); return; }
    planOf(mk, true).income = round2(n); saved(); render();
  };
  const note = $('[data-plannote]', v); let nt;
  if (note) note.oninput = () => { clearTimeout(nt); nt = setTimeout(() => { planOf(mk, true).note = note.value.trim(); saved(); }, 500); };
  $$('[data-plantick]', v).forEach(cb => { cb.onchange = () => togglePaid(mk, cb.dataset.plantick, cb.checked); });
}

/** Tick = paid: the payment is added to the daily ledger (on its due date, or today). Untick removes it again. */
function togglePaid(mk, id, paid) {
  const it = planOf(mk)?.items?.[id]; if (!it) return;
  if (!canEditBy(it.by)) { render(); return notAllowed(it.by); }
  if (paid && !it.done) {
    const tk = todayKey(), dk = dueKey(mk, it);
    const date = dk && dk <= tk ? dk : (mkey(tk) === mk ? tk : dk || `${mk}-01`);
    const key = 'x_' + uid(), c = catInfo(it.cat);
    dayObj(date).lines[key] = { name: it.name, icon: c.icon, cat: c.id, price: +it.amount, unit: 'each', qUnit: 'each', qty: 1 };
    Object.assign(it, { done: true, ldate: date, lkey: key });
    toast(t('✅ Paid'), t('{a} added to the ledger for {d}.', { a: money(it.amount), d: fmtShort(date) }));
  } else if (!paid && it.done) {
    const day = S.data.ledger[it.ldate];
    if (day) { const k = Object.keys(day.lines).find(x => x === it.lkey || x.startsWith(it.lkey + '@')); if (k) delete day.lines[k]; cleanupDay(it.ldate); }
    Object.assign(it, { done: false, ldate: '', lkey: '' });
  }
  persist(); render(); scheduleAlertCheck();
}

function planItemModal(mk, id) {
  const p = planOf(mk), existing = id ? p?.items?.[id] : null;
  if (existing && !canEditBy(existing.by)) return notAllowed(existing.by);
  const it = existing || { name: '', amount: '', cat: 'other', day: 0 };
  const dim = daysInMonth(mk);
  modal(`<h3>${existing ? '✏️ ' + esc(t('Edit planned payment')) : '➕ ' + esc(t('Add a planned payment'))}</h3>
    <p class="small muted" style="margin-top:-6px">${esc(fmtMonth(mk))}</p>
    <form id="mf">
      <label class="field"><span>${esc(t('What is it for?'))}</span><input class="input" name="name" maxlength="60" value="${esc(it.name)}" placeholder="${esc(t('e.g. School fees'))}"></label>
      <label class="field"><span>${esc(t('Amount'))}</span><input class="input" name="amount" inputmode="decimal" value="${esc(it.amount)}" placeholder="0"></label>
      <label class="field"><span>${esc(t('Type of expense'))}</span><select class="input" name="cat">${catOptions(catInfo(it.cat).id)}</select></label>
      <label class="field"><span>${esc(t('Due date'))}</span><select class="input" name="day">
        <option value="0">${esc(t('No fixed date'))}</option>
        ${Array.from({ length: dim }, (_, i) => i + 1).map(d => `<option value="${d}" ${+it.day === d ? 'selected' : ''}>${esc(fmtShort(`${mk}-${pad(d)}`))}</option>`).join('')}
      </select></label>
      <div class="error-msg" id="merr"></div>
      <div class="actions">
        ${existing ? `<button type="button" class="btn danger" data-del>🗑 ${esc(t('Delete'))}</button>` : `<button type="button" class="btn" data-close>${esc(t('Cancel'))}</button>`}
        <button class="btn primary">${esc(t('Save'))}</button></div>
    </form>`, (box, close) => {
    const f = $('#mf', box);
    $('[data-del]', box)?.addEventListener('click', async () => {
      close();
      if (await confirmBox(t('Delete the planned payment "{i}"?', { i: it.name }), t('Delete'), true)) {
        if (existing.done) togglePaid(mk, id, false);
        delete planOf(mk).items[id]; cleanupPlan(mk); persist(); render(); scheduleAlertCheck();
      }
    });
    f.onsubmit = ev => {
      ev.preventDefault();
      const name = f.name.value.trim(), amount = num(f.amount.value);
      if (!name) { $('#merr', box).textContent = t('Please write what it is for.'); return; }
      if (!(amount > 0)) { $('#merr', box).textContent = t('Please enter the amount.'); return; }
      const rec = { name, amount: round2(amount), cat: f.cat.value, day: +f.day.value || 0 };
      const pl = planOf(mk, true);
      if (existing) Object.assign(existing, rec);
      else pl.items[uid()] = { ...rec, done: false, ldate: '', lkey: '', by: myId() };
      persist(); close(); render(); scheduleAlertCheck();
      toast(t('✅ Saved'), `${name} – ${money(amount)}`);
    };
  });
}
async function copyPlan(mk) {
  const prev = planOf(addMonths(mk, -1));
  if (!prev) return infoBox(t('Nothing to copy'), t('Last month has no plan yet.'));
  const cur = planOf(mk);
  if (cur && (Object.keys(cur.cats || {}).length || Object.keys(cur.items || {}).length) &&
      !(await confirmBox(t("Add last month's plan to this month? Amounts you already typed for a type of expense will be replaced."), t('Yes, copy')))) return;
  const p = planOf(mk, true);
  Object.assign(p.cats, prev.cats || {});
  if (!(p.income > 0)) p.income = prev.income || 0;
  for (const it of Object.values(prev.items || {})) {
    if (Object.values(p.items).some(x => x.name === it.name && x.amount === it.amount)) continue;
    p.items[uid()] = { name: it.name, amount: it.amount, cat: it.cat, day: it.day, done: false, ldate: '', lkey: '', by: myId() };
  }
  persist(); render(); scheduleAlertCheck();
  toast(t('✅ Copied'), t("Last month's plan was added. Change anything you need."));
}
function fillFromBudgets(mk) {
  const withBudget = S.data.categories.filter(c => c.budget > 0);
  if (!withBudget.length) return infoBox(t('No usual budgets yet'), t('Set budgets for each type of expense in Settings first.'));
  const p = planOf(mk, true);
  for (const c of withBudget) p.cats[c.id] = c.budget;
  persist(); render(); scheduleAlertCheck();
  toast(t('✅ Saved'), t('Your usual budgets were filled in.'));
}

/* ---------------------------------------------------------------------
   FAMILY SHARING – live sync through the family's own Supabase project.
   Each record is encrypted with the family key (AES-256-GCM) on this device
   before it is sent; the cloud only ever stores scrambled text.
   Record ids:  T|item  C|category  S|main  I|income  L|date|line|author  N|date|author
   --------------------------------------------------------------------- */
const SYNC = { key: null, at: null, atExp: 0, timer: null, soon: null, busy: false, again: false, status: '', err: '', membersAt: 0, deniedShown: false, refreshing: null, pendingRender: false };
const sy = () => S.data?.sync;
const shared = () => !!sy()?.book;
const myId = () => sy()?.me;
const myRole = () => (shared() ? sy().role : 'owner');
const canManage = () => myRole() === 'owner' || myRole() === 'editor';
/** The device that started the family book (older set-ups: the owner) */
const isCreator = () => shared() && (sy().creator ?? sy().role === 'owner');
const canEditBy = by => !shared() || canManage() || !by || by === myId();
const memberName = id => {
  if (!id || id === myId()) return t('You');
  const m = sy()?.members?.[id];
  if (m?.role === 'owner' && sy().role === 'owner' && m.name === sy().name) return t('your other device');
  return m?.name || t('Family member');
};
const roleLabel = r => t(r === 'owner' ? 'Owner' : r === 'editor' ? 'Can add & edit everything' : 'Can add & edit own expenses');
function notAllowed(by) {
  toast(t('🔒 Not allowed'), by && by !== myId()
    ? t('This was added by {n}. Only the owner or an editor can change it.', { n: memberName(by) })
    : t('Only the owner or an editor can change this.'), 'warning');
}
const b64u = s => b64(te.encode(s)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => td.decode(unb64(s.replace(/-/g, '+').replace(/_/g, '/')));
async function sealRec(obj) { const b = await seal(SYNC.key, te.encode(JSON.stringify(obj))); return `${b.iv}.${b.ct}`; }
async function openRec(blob) {
  try { const [iv, ct] = String(blob).split('.'); return JSON.parse(td.decode(await unseal(SYNC.key, { iv, ct }))); } catch { return null; }
}
/** Short fingerprint of a record, to notice what changed since the last sync */
function hashRec(o) {
  if (o == null) return '-';
  const s = JSON.stringify(o); let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + s.length.toString(36);
}
/** Everything that is shared, as separate records. (Item "last used unit" stays on each device.) */
function recordsOf(d) {
  const m = new Map(), me = d.sync?.me;
  for (const it of d.items) m.set(`T|${it.id}`, { name: it.name, price: it.price, cat: it.cat, icon: it.icon, unit: it.unit });
  for (const c of d.categories) m.set(`C|${c.id}`, { name: c.name, icon: c.icon, budget: c.budget || 0 });
  m.set('S|main', { cur: d.settings.cur, monthlyBudget: d.settings.monthlyBudget || 0 });
  for (const i of d.income) m.set(`I|${i.id}`, { date: i.date, source: i.source, amount: i.amount, note: i.note || '' });
  for (const [date, day] of Object.entries(d.ledger)) {
    for (const [k, l] of Object.entries(day.lines)) {
      const [lineId, by] = k.split('@');
      m.set(`L|${date}|${lineId}|${by || me}`, { name: l.name, icon: l.icon, cat: l.cat, price: l.price, unit: l.unit, qUnit: l.qUnit || l.unit, qty: l.qty });
    }
    if (day.note) m.set(`N|${date}|${me}`, { text: day.note });
  }
  for (const [mk, p] of Object.entries(d.plans || {})) {
    if (p.income > 0 || p.note || Object.keys(p.cats || {}).length) m.set(`P|${mk}`, { income: p.income || 0, cats: p.cats || {}, note: p.note || '' });
    for (const [id, it] of Object.entries(p.items || {}))
      m.set(`Q|${mk}|${id}`, { name: it.name, amount: it.amount, cat: it.cat, day: it.day || 0, done: !!it.done, ldate: it.ldate || '', lkey: it.lkey || '' });
  }
  return m;
}
/** Puts one record received from the family into this device's data. */
function applyRecord(id, author, deleted, v) {
  const d = S.data, me = myId(), p = id.split('|'), kind = p[0];
  if (kind === 'T') {
    const i = d.items.findIndex(x => x.id === p[1]);
    if (deleted) { if (i >= 0) d.items.splice(i, 1); return; }
    const prev = d.items[i];
    const it = { id: p[1], name: v.name, price: v.price, cat: v.cat, icon: v.icon, unit: v.unit, qUnit: prev && sameDim(prev.qUnit, v.unit) ? prev.qUnit : v.unit, by: author };
    if (i >= 0) d.items[i] = it; else d.items.push(it);
  } else if (kind === 'C') {
    const i = d.categories.findIndex(c => c.id === p[1]);
    if (deleted) { if (i >= 0 && p[1] !== 'other') d.categories.splice(i, 1); return; }
    const c = { id: p[1], name: v.name, icon: v.icon, budget: v.budget || 0, by: author };
    if (i >= 0) d.categories[i] = c;
    else { const o = d.categories.findIndex(x => x.id === 'other'); if (o >= 0 && p[1] !== 'other') d.categories.splice(o, 0, c); else d.categories.push(c); }
  } else if (kind === 'S') {
    if (!deleted) { d.settings.cur = v.cur; d.settings.monthlyBudget = v.monthlyBudget || 0; }
  } else if (kind === 'I') {
    const i = d.income.findIndex(x => x.id === p[1]);
    if (deleted) { if (i >= 0) d.income.splice(i, 1); return; }
    const rec = { id: p[1], date: v.date, source: v.source, amount: v.amount, note: v.note || '', by: author };
    if (i >= 0) d.income[i] = rec; else d.income.push(rec);
  } else if (kind === 'L') {
    const [, date, lineId, by] = p;
    if (by !== author) return; // ignore anything not written by the person it claims to be from
    const key = by === me ? lineId : `${lineId}@${by}`;
    const day = (d.ledger[date] ||= { lines: {}, note: '' });
    if (deleted) delete day.lines[key];
    else day.lines[key] = { name: v.name, icon: v.icon, cat: v.cat, price: v.price, unit: v.unit, qUnit: v.qUnit || v.unit, qty: v.qty };
    cleanupDay(date);
  } else if (kind === 'P' || kind === 'Q') {
    const mk = p[1], plan = (d.plans[mk] ||= { income: 0, cats: {}, note: '', items: {} });
    plan.items ||= {};
    if (kind === 'P') {
      if (deleted) Object.assign(plan, { income: 0, cats: {}, note: '' });
      else Object.assign(plan, { income: v.income || 0, cats: { ...(v.cats || {}) }, note: v.note || '', pby: author });
    } else if (deleted) delete plan.items[p[2]];
    else plan.items[p[2]] = { name: v.name, amount: v.amount, cat: v.cat, day: v.day || 0, done: !!v.done, ldate: v.ldate || '', lkey: v.lkey || '', by: author };
    cleanupPlan(mk);
  } else if (kind === 'N') {
    const [, date, by] = p;
    if (by !== author) return;
    const day = (d.ledger[date] ||= { lines: {}, note: '' });
    if (by === me) day.note = deleted ? '' : v.text;
    else {
      day.others ||= {};
      if (deleted) delete day.others[by]; else day.others[by] = v.text;
      if (!Object.keys(day.others).length) delete day.others;
    }
    cleanupDay(date);
  }
}

// ---- Talking to Supabase (auth + database functions)
const cleanUrl = u => String(u || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
async function sbFetch(cfg, path, body, token, method = 'POST') {
  let r;
  try {
    r = await fetch(cleanUrl(cfg.url) + path, {
      method, body: JSON.stringify(body ?? {}),
      headers: { apikey: cfg.anon, Authorization: `Bearer ${token || cfg.anon}`, 'Content-Type': 'application/json' },
    });
  } catch { const e = new Error(t('No internet connection.')); e.net = true; throw e; }
  let j = null; try { j = await r.json(); } catch { /* empty body */ }
  if (!r.ok) {
    const e = new Error(j?.message || j?.msg || j?.error_description || `HTTP ${r.status}`);
    e.status = r.status; e.code = j?.error_code || (typeof j?.code === 'string' ? j.code : undefined); throw e;
  }
  return j;
}
const tokenInfo = j => ({ at: j.access_token, rt: j.refresh_token, exp: j.expires_at ? j.expires_at * 1000 : Date.now() + (j.expires_in || 3600) * 1000, uid: j.user?.id });
/** Signed-in call to the auth service (e.g. change the sign-in password). */
async function authed(path, body, method = 'POST') {
  const cfg = sy();
  if (!SYNC.at || Date.now() > SYNC.atExp - 60e3) await refreshToken(cfg);
  return sbFetch(cfg, path, body, SYNC.at, method);
}
function refreshToken(cfg) {
  return (SYNC.refreshing ||= (async () => {
    try {
      const j = await sbFetch(cfg, '/auth/v1/token?grant_type=refresh_token', { refresh_token: cfg.rt });
      const a = tokenInfo(j);
      SYNC.at = a.at; SYNC.atExp = a.exp; cfg.rt = a.rt;
      if (cfg === sy()) persist(true);
    } catch (e) { if (e.status === 400 || e.status === 401) e.auth = true; throw e; }
    finally { SYNC.refreshing = null; }
  })());
}
async function rpc(fn, args, cfg = sy()) {
  if (!SYNC.at || Date.now() > SYNC.atExp - 60e3) await refreshToken(cfg);
  try { return await sbFetch(cfg, `/rest/v1/rpc/${fn}`, args, SYNC.at); }
  catch (e) {
    if (e.status !== 401) throw e;
    SYNC.at = null; await refreshToken(cfg);
    return sbFetch(cfg, `/rest/v1/rpc/${fn}`, args, SYNC.at);
  }
}
function setupError(e) {
  if (e.net) return t('No internet connection.');
  if (/anonymous/i.test(e.message || '') || e.code === 'anonymous_provider_disabled')
    return t('In Supabase, turn on "Allow anonymous sign-ins" (Authentication → Sign In / Providers), then try again.');
  if (e.status === 401 || /api key/i.test(e.message || '')) return t('The key is not correct. Copy the "anon" / "publishable" key from Supabase again.');
  if (e.status === 404 || e.code === 'PGRST202') return t('The family tables are missing. Run the file family-sharing-setup.sql in the Supabase SQL Editor first.');
  if (/invite not valid/.test(e.message || '')) return t('This invite has already been used or has expired. Please ask for a new one.');
  return e.message || String(e);
}

// ---- The sync cycle: get the family's changes, then send ours
async function syncPull(force) {
  const s = sy(); let changed = false;
  for (let round = 0; round < 100; round++) {
    const rows = await rpc('ha_pull', { p_book: s.book, p_since: Math.max(0, (s.cursor || 0) - 25), p_limit: 500 });
    if (sy() !== s) throw new Error('stopped');
    const cur = recordsOf(S.data), applied = [];
    let max = s.cursor || 0;
    for (const r of rows) {
      const seq = +r.seq; if (seq > max) max = seq;
      const base = s.snap[r.id];
      if (base && base[1] === seq) continue; // we already have this version
      if (!force && hashRec(cur.get(r.id)) !== (base ? base[0] : '-')) continue; // also changed here: ours is sent next
      const v = r.deleted ? null : await openRec(r.blob);
      if (!r.deleted && !v) continue; // cannot be read with our family key
      applyRecord(r.id, r.author, r.deleted, v);
      applied.push([r.id, seq]); changed = true;
    }
    if (applied.length) { const after = recordsOf(S.data); for (const [id, seq] of applied) s.snap[id] = [hashRec(after.get(id)), seq]; }
    s.cursor = max;
    if (rows.length < 500) break;
  }
  return changed;
}
async function syncPush() {
  const s = sy(), cur = recordsOf(S.data), out = [];
  for (const [id, rec] of cur) { const h = hashRec(rec); if ((s.snap[id]?.[0] ?? '-') !== h) out.push([id, h, rec]); }
  for (const id of Object.keys(s.snap)) if (s.snap[id][0] !== '-' && !cur.has(id)) out.push([id, '-', null]);
  const rejected = [];
  for (let i = 0; i < out.length; i += 200) {
    const part = out.slice(i, i + 200), rows = [];
    for (const [id, , rec] of part) rows.push(rec ? { id, blob: await sealRec(rec), deleted: false } : { id, blob: null, deleted: true });
    const res = await rpc('ha_push', { p_book: s.book, p_rows: rows });
    if (sy() !== s) throw new Error('stopped');
    const hs = Object.fromEntries(part.map(([id, h]) => [id, h]));
    for (const o of res?.ok || []) s.snap[o.id] = [hs[o.id], +o.seq];
    rejected.push(...(res?.rejected || []));
  }
  if (rejected.length) await restoreRejected(rejected);
  return rejected.length > 0;
}
/** A change was not allowed (e.g. editing someone else's entry): put back the family's version. */
async function restoreRejected(ids) {
  const s = sy();
  const rows = await rpc('ha_get', { p_book: s.book, p_ids: ids });
  for (const r of rows) { const v = r.deleted ? null : await openRec(r.blob); if (r.deleted || v) applyRecord(r.id, r.author, r.deleted, v); }
  const after = recordsOf(S.data), seen = new Set(rows.map(r => r.id));
  for (const r of rows) s.snap[r.id] = [hashRec(after.get(r.id)), +r.seq];
  for (const id of ids) if (!seen.has(id)) s.snap[id] = [hashRec(after.get(id)), 0]; // stop retrying
  if (!SYNC.deniedShown) {
    SYNC.deniedShown = true;
    toast(t('🔒 Some changes were not saved'), t('Only the owner or an editor can change entries added by others or the shared settings.'), 'warning');
  }
}
async function refreshMembers() {
  const s = sy();
  const rows = await rpc('ha_members_list', { p_book: s.book });
  const mem = {};
  for (const r of rows) { const n = r.name_enc ? await openRec(r.name_enc) : null; mem[r.user_id] = { name: n?.n || '', role: r.role, status: r.status }; }
  if (sy() !== s) return;
  s.members = mem; SYNC.membersAt = Date.now();
  const mine = mem[s.me];
  if (mine && mine.role !== s.role) { s.role = mine.role; softRender(); }
  if (mine?.name) { s.name ||= mine.name; S.data.settings.name ||= mine.name; } // first log-in on a new device
}
/** Did this account join or leave a family on another device? Then follow it here: start again from the cloud. */
async function checkKeyring() {
  const s = sy(); if (!S.data.account) return false;
  const prof = await rpc('ha_profile_get', {});
  if (!prof?.keyring || sy() !== s) return false;
  const kr = await openStr(S.dataKey, prof.keyring);
  if (kr.book === s.book) return false;
  const d = S.data;
  Object.assign(d, { items: [], categories: [], ledger: {}, income: [], plans: {} });
  migrate(d);
  Object.assign(s, { book: kr.book, fk: kr.fk, creator: !!kr.creator, role: 'member', cursor: 0, snap: {}, members: {}, fresh: true });
  SYNC.key = await importDataKey(unb64(kr.fk));
  return true;
}
async function syncNow(opts = {}) {
  if (!shared() || !S.dataKey) return;
  if (SYNC.busy) { SYNC.again = true; return; }
  SYNC.busy = true; setSyncStatus('busy');
  const s = sy();
  try {
    if (!SYNC.key) SYNC.key = await importDataKey(unb64(s.fk));
    const due = opts.members || Date.now() - SYNC.membersAt > 60e3;
    if (due && !opts.force && !s.fresh) await checkKeyring();
    let changed = await syncPull(!!opts.force || !!s.fresh);
    if (s.fresh) { delete s.fresh; changed = true; opts.members = true; }
    if (opts.afterPull) changed = opts.afterPull() || changed;
    const rejected = await syncPush();
    if (due || opts.members) await refreshMembers();
    s.lastSync = new Date().toISOString();
    persist(true);
    setSyncStatus('ok');
    if (changed || rejected) softRender();
  } catch (e) {
    if (e.message === 'stopped') return;
    if ((e.code === '42501' || e.status === 403) && S.data?.account && !opts.retried) {
      // no longer in this book: maybe this account moved to another family book on another device
      let moved = false;
      try { moved = await checkKeyring(); } catch { /* ignore */ }
      if (moved) { SYNC.busy = false; return syncNow({ ...opts, retried: true }); }
    }
    if (e.code === '42501' || e.status === 403) setSyncStatus('removed', e.message);
    else if (e.auth) setSyncStatus('signedout', e.message);
    else if (e.net) setSyncStatus('offline');
    else setSyncStatus('error', e.message);
    if (opts.throwErrors) throw e;
  } finally {
    SYNC.busy = false;
    if (SYNC.again) { SYNC.again = false; syncSoon(); }
  }
}
function syncSoon() { if (!shared() || !S.dataKey) return; clearTimeout(SYNC.soon); SYNC.soon = setTimeout(() => syncNow(), 1500); }
function startSync() {
  stopSync(true); // keep a sign-in that is still valid
  if (!shared()) return;
  SYNC.timer = setInterval(() => { if (!document.hidden) syncNow(); }, 15000);
  syncNow({ members: true });
}
/** keepAuth: keep the current sign-in (used while switching family books; not when locking). */
function stopSync(keepAuth = false) {
  clearInterval(SYNC.timer); clearTimeout(SYNC.soon);
  const auth = keepAuth ? { at: SYNC.at, atExp: SYNC.atExp } : { at: null, atExp: 0 };
  Object.assign(SYNC, { key: null, timer: null, soon: null, busy: false, again: false, status: '', err: '', membersAt: 0, deniedShown: false, refreshing: null }, auth);
  paintSyncBtn();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && shared() && S.dataKey) syncNow(); });
window.addEventListener('online', () => { if (shared() && S.dataKey) syncNow(); });

const SYNC_ICONS = { ok: '☁️', busy: '🔄', offline: '📴', error: '⚠️', removed: '⚠️', signedout: '⚠️' };
function syncStatusText() {
  const s = sy();
  switch (SYNC.status) {
    case 'busy': return t('Syncing…');
    case 'offline': return t('No internet – your changes are saved here and will be sent later.');
    case 'removed': return t('You are no longer part of this family book.');
    case 'signedout': return t('This device lost its connection to the family book. Please ask the owner for a new invite.');
    case 'error': return t('Could not sync: {e}', { e: SYNC.err });
    default: return s?.lastSync ? t('Synced at {t}', { t: new Date(s.lastSync).toLocaleTimeString(DLOC(), { hour: '2-digit', minute: '2-digit' }) }) : t('Syncing…');
  }
}
function setSyncStatus(st, err = '') {
  SYNC.status = st; SYNC.err = err;
  paintSyncBtn();
  const el = $('#syncLine'); if (el) el.textContent = syncStatusText();
}
function paintSyncBtn() {
  const b = $('#btnSync'); if (!b) return;
  b.classList.toggle('hidden', !shared() || !S.dataKey);
  b.innerHTML = `${SYNC_ICONS[SYNC.status] || '☁️'}<span class="lbl">${esc(t('Family'))}</span>`;
  b.title = syncStatusText();
  b.classList.toggle('warn', ['error', 'removed', 'signedout'].includes(SYNC.status));
}
/** Show the family's changes without disturbing someone who is typing. */
function softRender() {
  if (!S.ui?.view || !S.dataKey) return;
  const a = document.activeElement;
  if (a && $('#view').contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { SYNC.pendingRender = true; return; }
  SYNC.pendingRender = false; render(); updateBadge();
}
$('#view').addEventListener('focusout', () => { setTimeout(() => { if (SYNC.pendingRender) softRender(); }, 50); });

// ---- Families: inviting, joining, leaving (every account always syncs to one family book – at first its own)
function parseInvite(text) {
  const m = String(text || '').match(/HA1\.([A-Za-z0-9_-]{20,})/);
  if (!m) return null;
  try { const o = JSON.parse(unb64u(m[1])); if (o.v === 1 && o.u && o.k && o.c && o.f) return o; } catch { /* not an invite */ }
  return null;
}
/** After joining, this device's own entries move to the family's item list (matched by name). */
function remapAfterJoin(oldItems) {
  const d = S.data; let changed = false;
  const byName = new Map(d.items.map(i => [i.name.trim().toLowerCase(), i.id]));
  for (const day of Object.values(d.ledger)) {
    for (const k of Object.keys(day.lines)) {
      if (k.includes('@') || k.startsWith('x_') || d.items.some(i => i.id === k)) continue;
      const old = oldItems.find(i => i.id === k), line = day.lines[k];
      let nk = byName.get((old?.name || line.name).trim().toLowerCase());
      if (!nk || day.lines[nk]) nk = 'x_' + uid();
      day.lines[nk] = line; delete day.lines[k]; changed = true;
    }
  }
  return changed;
}
/** Join someone's family book. My own entries move into it; the family's item list, budgets and currency are used. */
async function joinFamily(inv, name) {
  const s = sy();
  if (!s || !S.data.account) throw new UserError(t('Please create your account first.'));
  if (cleanUrl(inv.u) !== cleanUrl(s.url)) throw new UserError(t('This invite belongs to a different Home Accounts cloud.'));
  stopSync(true);
  SYNC.key = await importDataKey(unb64(inv.f));
  const j = await rpc('ha_join', { p_code: inv.c, p_name_enc: await sealRec({ n: name }) });
  const chk = await openRec(j.key_check);
  if (chk?.check !== 'home-accounts') throw new UserError(t('This invite is damaged. Please ask for a new one.'));
  const oldBook = s.book, wasAlone = isCreator() && Object.values(s.members || {}).filter(m => m.status === 'active').length <= 1;
  // remember the new family in this account's key ring, so the account's other devices follow
  await rpc('ha_profile_update', { p_keyring: await sealStr(S.dataKey, { book: j.book_id, fk: inv.f, creator: false }) });
  const d = S.data, oldItems = d.items;
  detachShared(d, true); d.sync = s;
  d.items = []; d.categories = d.categories.filter(c => c.id === 'other');
  for (const p of Object.values(d.plans)) Object.assign(p, { income: 0, cats: {}, note: '' }); // the family's month plan is used
  markMine(d, s.me);
  Object.assign(s, { book: j.book_id, role: j.role, creator: false, name, fk: inv.f, cursor: 0, snap: {}, members: {} });
  d.settings.name = name;
  persist(true);
  stopSync(true);
  await syncNow({ force: true, members: true, throwErrors: true, afterPull: () => remapAfterJoin(oldItems) });
  SYNC.timer = setInterval(() => { if (!document.hidden) syncNow(); }, 15000);
  if (wasAlone && oldBook) rpc('ha_delete_book', { p_book: oldBook }).catch(() => {}); // my old, now empty book
}
/** Start (again) a family book of my own – after leaving or being removed from a family. My own entries come along. */
async function startOwnBook() {
  const s = sy(), d = S.data, me = s.me;
  stopSync(true);
  detachShared(d, false); d.sync = s;
  markMine(d, me);
  const fk = rand(32);
  SYNC.key = await importDataKey(fk);
  const name = s.name || d.settings.name || '';
  const book = await rpc('ha_create_book', { p_key_check: await sealRec({ check: 'home-accounts' }), p_name_enc: await sealRec({ n: name || showPhone(d.account.phone) }) });
  await rpc('ha_profile_update', { p_keyring: await sealStr(S.dataKey, { book, fk: b64(fk), creator: true }) });
  Object.assign(s, { book, fk: b64(fk), role: 'owner', creator: true, cursor: 0, snap: {}, members: { [me]: { name, role: 'owner', status: 'active' } } });
  fk.fill(0);
  persist(true); startSync(); render(); updateBadge();
}
/** Older copies only (before accounts): stop syncing on this device. */
function dropSharing(keepFamilyEntries) {
  const d = S.data;
  stopSync();
  detachShared(d, keepFamilyEntries);
  for (const x of [...d.items, ...d.categories, ...d.income]) delete x.by;
  d.sync = null;
  persist(true); render(); updateBadge();
}

function familyCard() {
  const s = sy();
  if (!s) return `<div class="card" id="familyCard"><h3>👨‍👩‍👧 ${esc(t('Family sharing'))}</h3>
    <p class="small">${esc(t('Share this account book with your family. Everyone adds their own daily expenses from their own phone, and the family totals, budget and warnings include everyone.'))}</p>
    <div class="alert info"><span class="ico">☁️</span><div class="small">${esc(cloudReady() ? t('Family sharing needs an account. Lock the app and open it again to create your account.') : t('This app is not connected to its cloud yet. Family sharing and logging in on other devices will be available once it is.'))}</div></div></div>`;
  const people = Object.entries(s.members || {}).filter(([, m]) => m.status === 'active');
  const problem = ['removed', 'signedout'].includes(SYNC.status);
  const creator = isCreator(), alone = people.length <= 1;
  return `<div class="card" id="familyCard"><h3>👨‍👩‍👧 ${esc(t('Family sharing'))}</h3>
    <p class="small" style="margin-top:0"><span id="syncLine">${esc(syncStatusText())}</span></p>
    ${problem ? `<div class="alert danger"><span class="ico">⚠️</span><div class="small">${esc(syncStatusText())}<div><button class="btn sm" data-act="familyDrop" style="margin-top:8px">${esc(S.data.account ? t('Continue with my own account book') : t('Stop syncing on this device'))}</button></div></div></div>` : ''}
    ${alone ? `<p class="small">${esc(t('Share this account book with your family. Everyone adds their own daily expenses from their own phone, and the family totals, budget and warnings include everyone.'))}</p>
      <div class="alert good"><span class="ico">🛡️</span><div class="small">${th('Entries are **encrypted on each phone** before they go to the family cloud. The cloud stores only scrambled text that it cannot read.')}</div></div>` : ''}
    <div class="small" style="font-weight:700;margin:8px 0 4px">${esc(t('Family members'))} (${people.length})</div>
    ${people.map(([id, m]) => `<div class="list-row"><span class="emo" aria-hidden="true">${m.role === 'owner' ? '👑' : '👤'}</span>
      <div class="main"><div class="t">${esc(id === s.me ? t('{n} (you)', { n: m.name || t('You') }) : m.name || t('Family member'))}</div><div class="small muted">${esc(roleLabel(m.role))}</div></div>
      ${s.role === 'owner' && id !== s.me ? `<button class="btn sm" data-act="familyMember" data-id="${esc(id)}" aria-label="${esc(t('Change'))}">✎</button>` : ''}</div>`).join('')}
    <div class="grid-2" style="margin-top:12px">
      ${s.role === 'owner' ? `<button class="btn primary" data-act="familyInvite">➕ ${esc(t('Invite a family member'))}</button>` : ''}
      ${creator && alone ? `<button class="btn" data-act="familyJoin">🔗 ${esc(t('Join another family'))}</button>` : ''}
      <button class="btn" data-act="familySync">🔄 ${esc(t('Sync now'))}</button>
    </div>
    ${creator && !alone ? `<button class="btn danger block" data-act="familyLeave" style="margin-top:10px">${esc(t('Stop sharing with everyone'))}</button>` : ''}
    ${!creator ? `<button class="btn danger block" data-act="familyLeave" style="margin-top:10px">${esc(t('Leave the family book'))}</button>` : ''}
  </div>`;
}
function byPersonCard(mk, st) {
  const sums = {};
  for (const [k, day] of Object.entries(S.data.ledger)) {
    if (!k.startsWith(mk)) continue;
    for (const [key, l] of Object.entries(day.lines)) { const by = key.split('@')[1] || myId(); sums[by] = (sums[by] || 0) + lineAmt(l); }
  }
  const list = Object.entries(sums).sort((a, b) => b[1] - a[1]), max = list[0]?.[1] || 1;
  return `<div class="card"><h3>👨‍👩‍👧 ${esc(t('Spending by family member'))}</h3>
    ${list.length ? list.map(([by, v]) => `<div class="hbar" data-tip="${esc(`${memberName(by)}: ${money(v)}`)}">
      <div class="lab">👤 ${esc(memberName(by))}</div><div class="track money"><div class="fill" style="width:${v / max * 100}%"></div></div>
      <div class="val">${M(v)} <span class="muted small">${st.expense ? pct(v / st.expense * 100) : ''}</span></div></div>`).join('')
      : `<div class="empty">${esc(t('No expenses recorded in this month.'))}</div>`}</div>`;
}

function inviteModal(opts = {}) {
  const device = !!opts.device;
  modal(`<h3>${device ? '📱 ' + esc(t('Link my other device')) : '➕ ' + esc(t('Invite a family member'))}</h3>
    ${device ? `<p class="small">${esc(t('Use your accounts on another phone, tablet or computer. It will show the same data and stay in sync, with full owner rights.'))}</p>
      <input type="radio" name="role" value="owner" checked hidden>` : `<p class="small">${esc(t('What may this person do?'))}</p>`}
    <div class="role-pick" ${device ? 'hidden' : ''}>
      <label class="check"><input type="radio" name="role" value="member" ${device ? '' : 'checked'}> <span><b>${esc(t('Can add & edit own expenses'))}</b><br><span class="small muted">${esc(t('Adds their daily expenses. Can change or delete only what they added.'))}</span></span></label>
      <label class="check"><input type="radio" name="role" value="editor"> <span><b>${esc(t('Can add & edit everything'))}</b><br><span class="small muted">${esc(t("Can also change or delete anyone's entries, items and budgets."))}</span></span></label>
    </div>
    <div id="invOut"></div>
    <div class="error-msg" id="merr"></div>
    <div class="actions"><button type="button" class="btn" data-close>${esc(t('Close'))}</button><button type="button" class="btn primary" id="invMake">${esc(t('Create invite'))}</button></div>`, (box) => {
    $('#invMake', box).onclick = async ev => {
      const role = $('input[name=role]:checked', box).value, s = sy();
      await busy(ev.currentTarget, t('Please wait…'), async () => {
        let code;
        try { code = await rpc('ha_create_invite', { p_book: s.book, p_role: role }); } catch (e) { $('#merr', box).textContent = setupError(e); return; }
        const payload = 'HA1.' + b64u(JSON.stringify({ v: 1, u: s.url, k: s.anon, c: code, f: s.fk, ...(device ? { d: 1, n: s.name } : {}) }));
        const link = isWeb ? `${location.origin}${location.pathname}#join=${payload}` : '';
        const text = device
          ? `${t('Open this on your other device to link it to Home Accounts:')}\n${link ? link + '\n\n' : ''}${t('Or open Home Accounts on that device → Settings → Family sharing → Join a family / link this device, and paste this code:')}\n${payload}`
          : `${t('Join our family account book in Home Accounts.')}\n${link ? link + '\n\n' : ''}${t('Or open Home Accounts → Settings → Family sharing → Join a family, and paste this code:')}\n${payload}`;
        $('#invOut', box).innerHTML = `
          <div class="alert warning"><span class="ico">🔑</span><div class="small">${device
            ? th('Keep this **private** – send it only to yourself (for example by email to yourself, or copy it). It works **once** and expires in **48 hours**.')
            : th('Send this **only to that person** (for example in a private WhatsApp chat). It works **once** and expires in **48 hours**.')}</div></div>
          <textarea class="input invite-text" readonly rows="5">${esc(text)}</textarea>
          <div class="grid-2" style="margin-top:8px">${navigator.share ? `<button type="button" class="btn primary" id="invShare">📤 ${esc(t('Send'))}</button>` : ''}
            <button type="button" class="btn" id="invCopy">📋 ${esc(t('Copy'))}</button></div>`;
        $('#invMake', box).remove();
        $('#invShare', box)?.addEventListener('click', () => navigator.share({ text }).catch(() => {}));
        $('#invCopy', box).onclick = async () => {
          const ta = $('.invite-text', box); ta.select();
          try { await navigator.clipboard.writeText(text); } catch { document.execCommand?.('copy'); }
          toast(t('📋 Copied'), t('Paste it in a message to your family member.'));
        };
      });
    };
  });
}
function joinModal(prefill = '') {
  // An account may join another family while it is alone in its own book; otherwise it must leave first.
  const aloneInOwn = S.data.account && isCreator() && Object.values(sy()?.members || {}).filter(m => m.status === 'active').length <= 1;
  if (shared() && !aloneInOwn) return infoBox(t('Already sharing'), t('This device is already part of a family book. Leave it first to join another.'));
  const pre = parseInvite(prefill), device = !!pre?.d;
  modal(`<h3>🔗 ${esc(device ? t('Link this device') : t('Join a family / link this device'))}</h3>
    <p class="small">${esc(device
      ? t('This device will show the same accounts as your other device and stay in sync. Anything already recorded on this device is kept and added.')
      : t('Paste the invite you received. Your own expenses on this device will be added to the family book; the family\'s item list, budgets and currency will be used.'))}</p>
    <form id="mf" autocomplete="off">
      <label class="field"><span>${esc(t('Invite'))}</span><textarea class="input" name="inv" rows="3" placeholder="HA1.…" spellcheck="false">${esc(prefill)}</textarea></label>
      <label class="field"><span>${esc(t('Your name (as your family will see it)'))}</span><input class="input" name="name" maxlength="30" value="${esc(pre?.n || S.data.settings.name)}"></label>
      <div class="error-msg" id="merr"></div>
      <div class="actions"><button type="button" class="btn" data-close>${esc(t('Cancel'))}</button><button class="btn primary">${esc(t('Join'))}</button></div>
    </form>`, (box, close) => {
    const f = $('#mf', box);
    f.onsubmit = async ev => {
      ev.preventDefault();
      const inv = parseInvite(f.inv.value), name = f.name.value.trim();
      if (!inv) { $('#merr', box).textContent = t('That is not a Home Accounts invite. Please paste the whole message.'); return; }
      if (!name) { $('#merr', box).textContent = t('Please enter your name.'); return; }
      await busy(f.querySelector('button.primary'), t('Joining…'), async () => {
        const before = JSON.stringify(S.data);
        try { await joinFamily(inv, name); }
        catch (e) { // put everything back as it was, and carry on syncing as before
          const rt = sy()?.rt; // the sign-in token may have been renewed meanwhile: keep the newest
          stopSync(true); S.data = migrate(JSON.parse(before)); if (S.data.sync && rt) S.data.sync.rt = rt; persist(true); startSync();
          $('#merr', box).textContent = accountError(e); return;
        }
        close(); render(); updateBadge();
        if (inv.d) toast(t('✅ This device is linked'), t('Your accounts now stay the same on all your linked devices.'));
        else toast(t('✅ You joined the family book'), t('Your expenses are now shared with your family.'));
      });
    };
  });
}
function memberModal(id) {
  const s = sy(), m = s.members[id]; if (!m) return;
  if (m.role === 'owner') { // one of the owner's own devices: it can only be unlinked
    return modal(`<h3>📱 ${esc(m.name || t('Your other device'))}</h3>
      <p class="small">${esc(t('Unlink this device if it is lost, sold or no longer used. It will stop seeing and changing your accounts at once.'))}</p>
      <div class="error-msg" id="merr"></div>
      <div class="actions"><button type="button" class="btn" data-close>${esc(t('Cancel'))}</button><button type="button" class="btn danger" id="mUnlink">${esc(t('Unlink this device'))}</button></div>`, (box, close) => {
      $('#mUnlink', box).onclick = async () => {
        try { await rpc('ha_set_member', { p_book: s.book, p_user: id, p_role: 'owner', p_status: 'removed' }); }
        catch (e) { $('#merr', box).textContent = setupError(e); return; }
        delete s.members[id]; persist(true); close(); render();
        toast(t('✅ Device unlinked'));
      };
    });
  }
  modal(`<h3>👤 ${esc(m.name || t('Family member'))}</h3>
    <div class="role-pick">
      <label class="check"><input type="radio" name="role" value="member" ${m.role === 'member' ? 'checked' : ''}> <b>${esc(t('Can add & edit own expenses'))}</b></label>
      <label class="check"><input type="radio" name="role" value="editor" ${m.role === 'editor' ? 'checked' : ''}> <b>${esc(t('Can add & edit everything'))}</b></label>
    </div>
    <div class="error-msg" id="merr"></div>
    <div class="actions"><button type="button" class="btn danger" id="mRemove">${esc(t('Remove from family'))}</button><button type="button" class="btn primary" id="mSave">${esc(t('Save'))}</button></div>`, (box, close) => {
    const save = async (role, status) => {
      try { await rpc('ha_set_member', { p_book: s.book, p_user: id, p_role: role, p_status: status }); }
      catch (e) { $('#merr', box).textContent = setupError(e); return; }
      if (status === 'removed') delete s.members[id]; else s.members[id].role = role;
      persist(true); close(); render();
      toast(t('✅ Saved'), m.name || '');
    };
    $('#mSave', box).onclick = () => save($('input[name=role]:checked', box).value, 'active');
    $('#mRemove', box).onclick = async () => {
      if (await confirmBox(t('Remove {n} from the family book? They will stop seeing and adding entries. What they already added stays.', { n: m.name || t('Family member') }), t('Remove'), true)) save(m.role, 'removed');
    };
  });
}
async function familyLeave() {
  const s = sy();
  if (!S.data.account) { // older copy without an account
    if (!(await confirmBox(t('This device will stop syncing. Everything already on it stays here.'), t('Leave'), true))) return;
    try { await rpc(isCreator() ? 'ha_delete_book' : 'ha_leave', { p_book: s.book }); } catch { /* offline / already gone */ }
    dropSharing(true); return toast(t('✅ Sharing stopped'));
  }
  if (isCreator()) { // my own book: remove everyone else; my account book stays
    if (!(await confirmBox(t('Everyone else will be removed from your account book and stop seeing it. What they added stays. Continue?'), t('Remove everyone'), true))) return;
    try {
      for (const [id, m] of Object.entries(s.members || {})) if (id !== s.me && m.status === 'active') await rpc('ha_set_member', { p_book: s.book, p_user: id, p_role: m.role, p_status: 'removed' });
    } catch (e) { return toast(t('Could not sync: {e}', { e: setupError(e) }), '', 'warning'); }
    await syncNow({ members: true }); render();
    return toast(t('✅ Sharing stopped'));
  }
  if (!(await confirmBox(t("You will stop sharing. The family's entries will be removed from this device; your own entries stay."), t('Leave'), true))) return;
  try { await rpc('ha_leave', { p_book: s.book }); }
  catch (e) { if (!e.net && e.status !== 403 && !e.auth) return toast(t('Could not sync: {e}', { e: setupError(e) }), '', 'warning'); }
  try { await startOwnBook(); } catch (e) { return toast(t('Could not sync: {e}', { e: accountError(e) }), '', 'warning'); }
  toast(t('✅ Sharing stopped'), t('You now have your own account book again.'));
}
// An invite opened as a link (…#join=HA1.…) is remembered until the app is unlocked.
let pendingInvite = null;
{
  const m = location.hash.match(/join=(HA1\.[A-Za-z0-9_-]+)/);
  if (m) { pendingInvite = m[1]; history.replaceState(null, '', location.pathname + location.search); }
}

/* ---------------------------------------------------------------------
   Views & actions registry
   --------------------------------------------------------------------- */
const VIEWS = { home: viewHome, ledger: viewLedger, planner: viewPlanner, income: viewIncome, reports: viewReports, settings: viewSettings };
AFTER.planner = v => wirePlanner(v);
const ACTIONS = {
  nav: el => go(el.dataset.to),
  openDay: el => { S.ui.date = el.dataset.date; S.ui.filter = 'all'; S.ui.q = ''; go('ledger'); },
  day: el => { S.ui.date = addDays(S.ui.date, Number(el.dataset.d)); render(); },
  month: el => { S.ui.month = addMonths(S.ui.month, Number(el.dataset.d)); render(); },
  filter: el => { S.ui.filter = el.dataset.f; render(); },
  plus: el => {
    const e = entryFor(S.ui.date, el.dataset.id); if (!e) return;
    if (!canEditBy(e.by)) return notAllowed(e.by);
    if (!(e.price > 0)) { priceModal(e.id, { add: true }); return; }
    const s = stepOf(e); // 1 for kg / pcs / L …, 100 for g and ml
    setQty(e.id, Math.floor(e.qty / s + 1e-9) * s + s);
  },
  minus: el => {
    const e = entryFor(S.ui.date, el.dataset.id); if (!e) return;
    if (!canEditBy(e.by)) return notAllowed(e.by);
    const s = stepOf(e);
    setQty(e.id, Math.max(0, Math.ceil(e.qty / s - 1e-9) * s - s));
  },
  typeQty: el => { const e = entryFor(S.ui.date, el.dataset.id); if (e && !canEditBy(e.by)) return notAllowed(e.by); qtyModal(el.dataset.id); },
  editPrice: el => { const e = entryFor(S.ui.date, el.dataset.id); if (e && !canEditBy(e.by)) return notAllowed(e.by); priceModal(el.dataset.id); },
  customExpense: () => customExpenseModal(),
  voice: () => {
    if (S.ui.view !== 'ledger') { S.ui.date = todayKey(); S.ui.filter = 'all'; S.ui.q = ''; }
    voiceModal();
  },
  newItem: () => itemModal(null, S.ui.view === 'ledger' ? S.ui.q.trim() : ''),
  editItem: el => itemModal(S.data.items.find(i => i.id === el.dataset.id)),
  repeatDay: () => repeatDayFlow(),
  addIncome: () => incomeModal(null),
  editIncome: el => incomeModal(S.data.income.find(i => i.id === el.dataset.id)),
  newCat: () => catModal(null),
  editCat: el => catModal(S.data.categories.find(c => c.id === el.dataset.id)),
  font: el => { writePrefs({ fontScale: Number(el.dataset.v) }); applyPrefs(); render(); },
  theme: el => { writePrefs({ theme: el.dataset.v }); applyPrefs(); render(); },
  install: async () => {
    if (!installEvt) return;
    installEvt.prompt();
    try { await installEvt.userChoice; } catch { /* ignore */ }
    installEvt = null; render();
  },
  planYear: el => { S.ui.year += Number(el.dataset.d); render(); },
  openPlan: el => { S.ui.planMonth = el.dataset.m; S.ui.year = +el.dataset.m.slice(0, 4); go('planner'); },
  planBack: () => { S.ui.planMonth = null; render(); window.scrollTo(0, 0); },
  planMonthNav: el => { S.ui.planMonth = addMonths(S.ui.planMonth, Number(el.dataset.d)); S.ui.year = +S.ui.planMonth.slice(0, 4); render(); },
  planAdd: () => planItemModal(S.ui.planMonth),
  planItem: el => planItemModal(S.ui.planMonth, el.dataset.id),
  planCopy: () => copyPlan(S.ui.planMonth),
  planFill: () => fillFromBudgets(S.ui.planMonth),
  familyJoin: () => joinModal(),
  familyInvite: () => inviteModal(),
  familySync: () => syncNow({ members: true }).then(() => { if (S.ui.view === 'settings') render(); }),
  familyMember: el => memberModal(el.dataset.id),
  familyLeave: () => familyLeave(),
  familyDrop: () => (S.data.account ? startOwnBook().catch(e => toast(t('Could not sync: {e}', { e: accountError(e) }), '', 'warning')) : dropSharing(myRole() === 'owner')),
  signOut: async () => { if (await confirmBox(t('Sign out of this device? Your accounts stay safe in your account – log in again with your mobile number and password.'), t('Sign out'))) signOutDevice(); },
  deleteAccount: () => deleteAccountModal(),
  changePw: () => changePwModal(),
  newCode: () => newCodeModal(),
  backup: () => makeBackup(),
  shareBackup: () => shareBackup(),
  restore: () => restoreInApp(),
  erase: () => eraseAll(),
  print: () => window.print(),
  csv: () => exportCsv(),
};

/* ---------------------------------------------------------------------
   Start
   --------------------------------------------------------------------- */
paintShell();
showLock();
})();

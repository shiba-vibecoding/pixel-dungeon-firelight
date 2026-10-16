/* Firelight · competitions mock (design part 7): the boards, leagues, circles, the season, the hall of fame, the profile, the share
   cards and the bot's notifications, built from assets/compete/compete.json and anchors.json with the game's CSS, fl-mart.css (part 5)
   and fl-compete.css, so they can be shot at 375 x 812 and 1280 x 800 in EN and RU. A reference for rankui.ts, not the game.
   ?s=boards|league|week|circle|invite|season|hall|profile|cards|art|notify|img &lang=en|ru &tab= &metric= &cls= &res=up|stay|down
   &kind=friends|group &k=story|chat|circle|overtaken|league|streak &t=<ms> (frozen clock for shots) */
import { kit, stage, scene, load, loaded, setTime, frameOf } from './herocard.js';

const Q = new URLSearchParams(location.search);
const L = Q.get('lang') || 'en', S = Q.get('s') || 'boards', WIDE = innerWidth >= 900;
window.__t = +(Q.get('t') || 0); if (Q.get('still')) window.__still = true;
const K = await kit(); const C = K.compete; const T = C.strings[L]; const by = K.by;
const A = '/assets/';
const el = (tag, cls, ...kids) => { const e = document.createElement(tag); if (cls) e.className = cls; for (const k of kids) if (k != null && k !== false) e.append(k); return e; };
const txt = (tag, cls, t) => { const e = el(tag, cls); e.textContent = t; return e; };
const f = (s, o = {}) => String(s).replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');
const pl = (forms, n) => { if (typeof forms === 'string') return forms; if (L !== 'ru') return forms[n === 1 ? 0 : 1];
  const a = n % 10, b = n % 100; return forms[a === 1 && b !== 11 ? 0 : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 1 : 2]; };
const fmt = (n) => Number(n).toLocaleString(L === 'ru' ? 'ru-RU' : 'en-US');
const P = (forms, n, o = {}) => f(pl(forms, n), { n: fmt(n), ...o });
const SHEET = { warrior: 'warrior', mage: 'mage', rogue: 'rogue', huntress: 'ranger' };
const tierOf = (k) => C.leagues.tiers.find((t) => t.key === k);
const tname = (k) => tierOf(k).name[L];

// ---- pixel bits
function cv(w, h, s) { const c = document.createElement('canvas'); c.width = w * s; c.height = h * s; c.style.width = `${w * s}px`; c.style.height = `${h * s}px`; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; }
async function pix(src, s = 2, crop) { const im = await load(src); if (!im) return el('i'); const [x, y, w, h] = crop || [0, 0, im.width, im.height]; const [c, g] = cv(w, h, s); g.drawImage(im, x, y, w, h, 0, 0, w * s, h * s); return c; }
async function classIcon(cls, s = 2) { return pix(`${SHEET[cls]}.png`, s, [0, 15, 12, 15]); }
function titlePlate(sku, small = false, locked = false) {
  const i = by[sku]; if (!i) return null;
  const p = el('span', `fl-title-plate ${i.rarity}${small ? ' small' : ''}${locked ? ' locked' : ''}`); p.style.borderImageSource = `url(${A + i.plate})`;
  const ic = el('span'); pix(i.icon, small ? 1 : 2).then((c) => ic.append(c)); p.append(ic, txt('span', '', i.name[L])); return p;
}
function nameEl(name, nc) { const n = txt('b', `fl-name${nc ? ` fl-name-${nc}` : ''}`, name); return n; }

// ---- the people (a fixed cast; the board's data shape: BoardEntry + worn, migration-p7.md)
const NAMES = { en: ['Sasha', 'Mira', 'Timur', 'Lena', 'Oleg', 'Nika', 'Dan', 'Vera', 'Gleb', 'Ira', 'Max', 'Yana', 'Artem', 'Zoe', 'Lev', 'Kate', 'Roma', 'Ula', 'Fedor', 'Polina', 'Egor', 'Lisa', 'Ivan', 'Asya', 'Mark', 'Dina', 'Pavel', 'Sonya', 'Ilya', 'Tom'],
  ru: ['Саша', 'Мира', 'Тимур', 'Лена', 'Олег', 'Ника', 'Дэн', 'Вера', 'Глеб', 'Ира', 'Макс', 'Яна', 'Артём', 'Зоя', 'Лев', 'Катя', 'Рома', 'Уля', 'Фёдор', 'Полина', 'Егор', 'Лиза', 'Иван', 'Ася', 'Марк', 'Дина', 'Павел', 'Соня', 'Илья', 'Том'] }[L];
const CLS = ['warrior', 'mage', 'rogue', 'huntress'];
const LOOKS = { warrior: ['moss', 'ember', 'frost', 'dusk', 'brass'], mage: ['moss', 'ember', 'frost', 'dusk', 'brass'], rogue: ['moss', 'ember', 'frost', 'dusk', 'brass'], huntress: ['moss', 'ember', 'frost', 'dusk', 'brass'] };
const LEG = { warrior: 'forgeborn', mage: 'starflame', rogue: 'smoulder', huntress: 'wildfire' };
const HATS = ['straw', 'tricorn', 'wizard', 'crown', 'horns', 'tophat', 'wreath', 'bandana', 'pompom', 'halo', 'eyepatch', 'scarf'];
const PETS = ['firefly', 'rat', 'slime', 'bat', 'skull', 'ember'];
const FIRES = ['classic', 'blue', 'green', 'ghost', 'rainbow', 'cursed', 'golden', 'ice'];
const FRAMES = ['frame.ember', 'frame.frost', 'frame.moss', 'frame.bone', 'frame.stars', 'frame.runes', 'frame.crystal', 'frame.sunforge'];
const NC = ['ember', 'gold', 'frost', 'moss', 'rose', 'violet', 'ash', 'flame'];
const TT = ['title.kindler', 'title.keeper', 'title.ratking', 'title.deepdiver', 'title.slayer', 'title.alchemist', 'title.lucky', 'title.ghost', 'title.swift', 'title.deep', 'title.circle_champion'];
const LG = ['spark', 'coal', 'flame', 'bonfire', 'beacon'];
const ME_NAME = L === 'ru' ? 'Кирилл' : 'Kirill';
function person(i) {   // i: 0.. a stable mix of worn things; every 5th wears nothing (bare)
  const cls = CLS[(i * 3 + 1) % 4]; const bare = i % 5 === 4;
  const w = { cls: SHEET[cls], heroClass: cls, tier: [1, 2, 3, 4, 2, 5, 1, 3][i % 8], league: LG[Math.min(4, Math.floor((30 - i) / 7))] };
  if (!bare) Object.assign(w, { skin: i % 7 === 0 ? LEG[cls] : LOOKS[cls][i % 5], hat: i % 3 === 2 ? null : HATS[(i * 5) % 12], pet: i % 2 ? PETS[(i * 7) % 6] : null, fire: FIRES[(i * 3) % 8],
    frame: i % 4 === 1 ? `league.${w.league}` : FRAMES[(i * 5) % 8], nc: i % 3 === 0 ? NC[(i * 3) % 8] : null, tt: i % 2 === 0 ? TT[(i * 7) % TT.length] : null });
  else Object.assign(w, { frame: `league.${w.league}` });
  return { name: NAMES[i % NAMES.length], worn: w, bare, level: 14 + ((i * 7) % 12), depth: 12 + ((i * 5) % 14), turns: 3400 + i * 37 + ((i * 131) % 400), won: i === 0 };
}
const ME = { name: ME_NAME, me: true, worn: { cls: 'mage', heroClass: 'mage', skin: 'frost', hat: 'wizard', pet: 'firefly', fire: 'blue', frame: 'league.flame', nc: 'gold', tt: 'title.circle_champion', tier: 2, league: 'flame' }, level: 19, depth: 17, turns: 4120 };
const TOP = [
  { name: NAMES[0], friend: true, worn: { cls: 'warrior', heroClass: 'warrior', skin: 'forgeborn', hat: 'crown', pet: 'ember', fire: 'golden', frame: 'frame.sunforge', nc: 'flame', tt: 'title.sage', tier: 5, league: 'beacon' }, level: 26, depth: 26, turns: 9120, won: true },
  { name: NAMES[1], worn: { cls: 'mage', heroClass: 'mage', skin: 'starflame', hat: 'halo', pet: 'skull', fire: 'cursed', frame: 'league.beacon', nc: 'violet', tt: 'title.season_beacon', tier: 4, league: 'beacon' }, level: 24, depth: 24, turns: 8010 },
  { name: NAMES[2], worn: { cls: 'ranger', heroClass: 'huntress', skin: 'ember', hat: 'tricorn', pet: 'bat', fire: 'ice', frame: 'frame.stars', nc: 'frost', tt: 'title.swift', tier: 3, league: 'bonfire' }, level: 22, depth: 23, turns: 6450 },
];
const score = (p) => (p.gold ?? 300 + p.depth * 13) + p.level * p.depth * 100 * (p.won ? 2 : 1);
function boardList(metric = 'score', cls = 'all') {
  let list = [...TOP, ...Array.from({ length: 46 }, (_, i) => person(i + 3))];
  list.splice(36, 0, ME);
  list.forEach((p, i) => { p.friend = p.friend || (!p.me && (i === 9 || i === 21)); });
  if (cls !== 'all') list = list.filter((p) => p.worn.heroClass === cls || p.me);
  if (metric === 'speed') list = list.filter((p) => p.depth >= 5).sort((a, b) => a.turns / a.depth - b.turns / b.depth);
  if (metric === 'depth') list = list.sort((a, b) => b.depth - a.depth || a.turns - b.turns);
  if (metric === 'score' && S === 'boards' && (Q.get('tab') || 'day') !== 'day') list.forEach((p, i) => { p.boost = i; });
  return list;
}
/** What a place shows: the data of the mock is made from the place, so every board reads in order. */
function value(p, metric, tab, place) {
  const r = place;
  if (tab === 'season') return [fmt(Math.max(40, 2480 - r * 61 - (r % 3) * 13)), T.heatRating.toLowerCase()];
  if (metric === 'speed') { const v = 118 + r * 3 + (r % 2); return [String(v), T.perTurn]; }
  if (metric === 'depth') { const d = r <= 3 ? 27 - r : Math.max(5, 23 - Math.floor((r - 4) / 3)); return [String(d), P(T.turns, 2900 + r * 41)]; }
  const k = tab === 'week' ? 1.35 : tab === 'all' ? 2.1 : 1;
  const base = r === 1 ? 135840 : r === 2 ? 58210 : r === 3 ? 51200 : 48000 * Math.pow(0.955, r - 4);
  return [fmt(Math.round(base * k / 10) * 10), f(T.depthShort, { n: p.depth })];
}

// ---- the rows and the podium
const animated = (p, place) => p.me || place <= 3;
async function row(p, place, o = {}) {
  const st = await stage('row', p.worn, { animate: !o.still && animated(p, place) });
  const r = el('div', `fl-row${p.me ? ' me' : ''}${p.friend ? ' friend' : ''}${place <= 3 ? ` m${place}` : ''}${p.bare ? ' bare' : ''}${o.zone ? ` ${o.zone}` : ''}`);
  const [v, unit] = value(p, o.metric || 'score', o.tab || 'day', place);
  const sub = el('span', 'fl-row-sub');
  if (p.friend && WIDE && !o.compact) sub.append(txt('span', 'fl-chip-friend', T.friend));   // on a phone the friend is the teal edge alone
  const lg = tierOf(p.worn.league || 'spark'); sub.append(await pix(lg.mini, 2)); sub.lastChild.className = 'fl-mini';
  if (p.worn.tt && !o.compact) sub.append(titlePlate(p.worn.tt, true)); else sub.append(txt('span', '', T.classes[p.worn.heroClass]));
  sub.append(txt('small', 'fl-row-unit', unit));
  r.append(txt('span', 'fl-row-n', String(place)), st, nameEl(p.name, p.worn.nc), txt('b', 'fl-row-score', v), sub);
  return r;
}
async function pod(p, place, o = {}) {
  const d = el('div', `fl-pod m${place}${p.me ? ' me' : ''}`);
  const st = await stage('podium', p.worn, { animate: !o.still, scale: o.scale });
  const [v] = value(p, o.metric || 'score', o.tab || 'day', place);
  d.append(txt('span', 'fl-pod-n', `#${place}`), st, nameEl(p.name, p.worn.nc));
  if (p.worn.tt) d.append(titlePlate(p.worn.tt, true));
  if (o.cup) d.append(await pix(o.cup, WIDE ? 3 : 2));
  d.append(txt('span', 'fl-pod-score', v)); return d;
}
async function podium(list, o = {}) { const g = el('div', 'fl-podium'); for (let i = 0; i < 3; i++) g.append(await pod(list[i], i + 1, o)); return g; }

// ---- the window
const app = document.getElementById('overlay');
const win = el('div', 'pd-window fl-mart fl-compete');
function head(title, sub, back) {
  const h = el('div', 'fl-mart-head');
  if (back) h.append(el('button', 'pd-button quiet small fl-back', '<', txt('span', 'lbl', ' ' + (L === 'ru' ? 'Назад' : 'Back'))));
  const t = el('div', 'pd-titles', txt('h2', 'pd-heading', title)); if (sub) t.append(txt('div', 'fl-motto', sub)); h.append(t, txt('button', 'fl-close', '×')); return h;
}
function tabs(keys, cur, names) {
  const n = el('div', 'pd-tabs compact'); n.setAttribute('role', 'tablist');
  for (const k of keys) { const b = txt('button', 'pd-tab', names[k]); b.setAttribute('aria-selected', String(k === cur)); n.append(b); } return n;
}
function sec(title, more, ...kids) { const s = el('section', 'fl-sec'); const h = el('div', 'fl-sec-head', txt('h3', '', title)); if (more) h.append(txt('span', 'fl-more', more)); s.append(h, ...kids); return s; }

async function slices(metric, cls) {
  const d = el('div', 'fl-slices');
  const seg = el('div', 'fl-seg'); for (const m of C.boards.metrics) { const b = txt('button', '', T.metric[m]); b.setAttribute('aria-pressed', String(m === metric)); seg.append(b); }
  const cl = el('div', 'fl-classes');
  for (const c of C.boards.classes) { const b = el('button', c === 'all' ? 'all' : ''); if (c !== 'all') b.append(await classIcon(c, 2)); b.append(c === 'all' ? T.classAll : T.classes[c]); b.setAttribute('aria-pressed', String(c === cls)); cl.append(b); }
  d.append(seg, cl, txt('p', 'fl-metric-info', T.metricInfo[metric])); return d;
}

// ---- the aside on a monitor: me, my league, my circle
async function aside() {
  const a = el('aside', 'fl-side');
  a.append(await meCard(true));
  const lg = tierOf(ME.worn.league); const lc = el('div', 'fl-card2'); lc.style.setProperty('--tier', lg.color);
  const h = el('h3', '', await pix(lg.badge, 2), f(T.leagueOf, { t: lg.name[L] })); lc.append(h);
  const room = roomList(); const i = room.findIndex((p) => p.me);
  lc.append(txt('p', '', `${f(T.place, { n: i + 1, m: 30 })} · ${f(T.endsIn, { t: L === 'ru' ? '2 дн 7 ч' : '2 d 7 h' })}`), txt('p', '', f(T.promoteTo, { n: 5, t: tname('bonfire') })));
  for (const k of [i - 1, i]) lc.append(await row(room[k], k + 1, { zone: k < 5 ? 'up' : '', still: !room[k].me, compact: true, tab: 'week' }));
  a.append(lc);
  const cc = el('div', 'fl-card2'); cc.append(el('h3', '', T.circleWeek, txt('span', 'more', circleName())));
  const cl = circleList(); for (let k = 0; k < 3; k++) cc.append(await row(cl[k], k + 1, { tab: 'week', still: !cl[k].me, compact: true }));
  a.append(cc, txt('div', 'fl-honour-note', T.honourOnly));
  return a;
}
async function meCard(compact = false) {
  const c = el('div', `fl-hero-card${compact ? '' : ' stack'}`);
  const st = await stage(compact ? 'podium' : 'big', ME.worn, { animate: true, scale: compact ? 2 : undefined, frameScale: compact ? 2 : undefined });
  const lg = tierOf(ME.worn.league); const tier = el('span', 'fl-tier', await pix(lg.badge, 2), lg.name[L]); tier.style.setProperty('--tier', lg.color);
  const who = el('div', 'who', nameEl(ME.name, ME.worn.nc), titlePlate(ME.worn.tt, compact), tier);
  const facts = el('div', 'fl-facts');
  for (const [k, v] of [[T.heatRating, '1\u00a0240'], [T.bestPlace, '#4']]) facts.append(el('span', '', `${k} `, txt('b', '', v)));
  facts.append(el('span', '', txt('b', '', '12'), ' ' + pl(T.streak, 12).replace('{n} ', '')));
  who.append(facts); c.append(st, who); return c;
}

// ---- circles
const circleName = () => (Q.get('kind') === 'friends' ? T.friends : (L === 'ru' ? 'Ночные спелеологи' : 'Night Delvers'));
function circleList() {
  const l = [TOP[0], person(5), ME, person(9), person(13), person(17), person(21), person(2), person(25)].map((p) => ({ ...p, friend: !p.me }));
  return l;
}
function roomList() {
  const l = Array.from({ length: 29 }, (_, i) => ({ ...person(i + 1), worn: { ...person(i + 1).worn, league: 'flame', frame: i % 3 ? person(i + 1).worn.frame : 'league.flame' } }));
  l.splice(6, 0, ME); return l;
}

// ---- screens
async function boards() {
  const tab = Q.get('tab') || 'day', metric = Q.get('metric') || 'score', cls = Q.get('cls') || 'all';
  win.append(head(T.boards, T.tabInfo[tab]));
  const left = el('div', 'fl-mart-main');
  left.append(tabs(C.boards.tabs, tab, T.tabs));
  const note = el('p', 'fl-board-note');
  const cnt = { day: 1284, week: 5732, season: 11406 }[tab];
  if (cnt) note.append(txt('span', 'count', P(T[C.boards.counter[tab]], cnt)));
  if (tab === 'day') note.append(txt('span', 'closes', f(T.closes, { t: L === 'ru' ? '6 ч 12 мин' : '6 h 12 min' })));
  if (tab === 'week') note.append(txt('span', 'closes', f(T.closes, { t: L === 'ru' ? '2 дн 7 ч' : '2 d 7 h' })));
  if (tab === 'season') note.append(txt('span', 'closes', f(T.daysLeft, { n: 41 })));
  left.append(note);
  if (tab !== 'season') left.append(await slices(metric, cls));
  const list = boardList(metric, cls); list.forEach((p, i) => { p.rank = i + 1; });
  left.append(await podium(list, { metric, tab }));
  const rows = el('div', 'fl-rows'); const meAt = list.findIndex((p) => p.me);
  for (let i = 3; i < Math.min(list.length, WIDE ? 13 : 9); i++) rows.append(await row(list[i], i + 1, { metric, tab }));
  left.append(rows);
  const pin = el('div', 'fl-pin', txt('div', 'fl-pin-gap', '· · ·'), await row(list[meAt], meAt + 1, { metric, tab }), txt('div', 'fl-pin-place', f(T.placeOf, { n: meAt + 1, m: fmt(cnt || 1284) })));
  left.append(pin);
  if (WIDE) { const cols = el('div', 'fl-cols', left, await aside()); win.append(cols); } else win.append(left);
}

async function league() {
  const lg = tierOf('flame'); win.style.setProperty('--tier', lg.color);
  win.append(head(f(T.leagueOf, { t: lg.name[L] }), f(T.week, { n: 42 })));
  const main = el('div', 'fl-mart-main');
  const ladder = el('div', 'fl-ladder');
  for (const t of C.leagues.tiers) { const d = el('div', t.key === 'flame' ? 'on' : (t.tier < 3 ? 'done' : 'off'), await pix(t.badge, WIDE ? 3 : 2), txt('span', '', t.name[L])); d.style.setProperty('--tier', t.color); ladder.append(d); }
  const hd = el('div', 'fl-league-head', await pix(lg.badge, 3), el('div', 't', txt('b', '', lg.name[L]), txt('span', '', f(T.room, { n: 30 }))),
    el('div', 'fl-timer', txt('span', '', L === 'ru' ? 'До конца недели' : 'Week ends in'), txt('b', '', L === 'ru' ? '2 дн 7 ч' : '2 d 7 h')));
  main.append(hd, ladder);
  const room = roomList(); const rows = el('div', 'fl-rows');
  rows.append(txt('div', 'fl-zone up', `${T.promote} · ${f(T.promoteTo, { n: 5, t: tname('bonfire') })}`));
  for (let i = 0; i < 30; i++) {
    if (i === 25) rows.append(txt('div', 'fl-zone down', `${T.demote} · ${f(T.demoteTo, { n: 5, t: tname('coal') })}`));
    if (i === 5) rows.append(txt('div', 'fl-zone', T.safe));
    if (!WIDE && i > 9 && i < 25) { if (i === 10) rows.append(txt('div', 'fl-pin-gap', '· · ·')); continue; }
    if (WIDE && i > 13 && i < 25) { if (i === 14) rows.append(txt('div', 'fl-pin-gap', '· · ·')); continue; }
    rows.append(await row(room[i], i + 1, { tab: 'week', zone: i < 5 ? 'up' : i >= 25 ? 'down' : '', still: !room[i].me }));
  }
  main.append(rows);
  const meAt = room.findIndex((p) => p.me);
  main.append(el('div', 'fl-pin', txt('div', 'fl-pin-place', `${f(T.place, { n: meAt + 1, m: 30 })} · ${L === 'ru' ? 'до зоны повышения 2 места' : '2 places to the promotion zone'}`)));   // my row is in sight: no copy pinned
  if (WIDE) {
    const side = el('aside', 'fl-side');
    const rules = el('div', 'fl-card2', txt('h3', '', L === 'ru' ? 'Как устроены лиги' : 'How leagues work'));
    const ul = el('ul', 'fl-rules'); for (const r of (L === 'ru' ? ['Комната — 30 игроков одной лиги, сыгравших на этой неделе, по лучшему забегу недели.', 'Первые 5 поднимаются, последние 5 спускаются. Из «Маяка» выше некуда, из «Искры» ниже некуда.', 'Неделя без игры — лига та же; две подряд — на ступень ниже.', 'Пятёрка лучших «Маяка» получает знак Маяка недели.'] : ['A room is 30 players of one league who played this week, by the week\'s best run.', 'The first 5 go up, the last 5 go down. No one leaves the Beacon upwards or the Spark downwards.', 'A week not played keeps the league; two in a row: one step down.', 'The top 5 of the Beacon get the week\'s Beacon mark.'])) ul.append(txt('li', '', r));
    rules.append(ul); side.append(await meCard(true), rules, txt('div', 'fl-honour-note', T.honourOnly));
    win.append(el('div', 'fl-cols', main, side));
  } else win.append(main);
}

async function week() {
  const res = Q.get('res') || 'up'; const from = tierOf('flame'), to = tierOf(res === 'up' ? 'bonfire' : res === 'down' ? 'coal' : 'flame');
  const place = { up: 3, stay: 14, down: 27 }[res];
  await league(); app.append(win);
  const ov = el('div', 'pd-overlay static'); ov.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(5,5,4,.78);z-index:1000;padding:16px';
  const d = el('div', 'pd-window narrow fl-mart'); d.style.cssText = 'max-width:420px;height:auto';
  const w = el('div', `fl-week ${res}`);
  const badges = el('div', 'fl-week-badges');
  if (res === 'stay') badges.append(await pix(to.badge, 5));
  else badges.append(await pix(from.badge, 3), txt('span', 'arrow', res === 'up' ? '→' : '→'), await pix(to.badge, 5));
  w.append(txt('span', 'fl-motto', T.resultsTitle), badges, txt('h2', '', f(T[res], { t: to.name[L] })), txt('span', 'place', f(T.place, { n: place, m: 30 })));
  w.append(await stage('big', { ...ME.worn, frame: `league.${to.key}`, league: to.key }, { animate: true, scale: 2, frameScale: 2 }));
  w.append(txt('p', '', f(T[res + 'Text'], { n: 5, t: res === 'down' ? to.name[L] : '' })));
  w.append(el('div', 'fl-week-buttons', txt('button', 'pd-button primary', T.newWeek), txt('button', 'pd-button', T.share)));
  d.append(w); ov.append(d); document.body.append(ov);
  return 'done';
}

async function circle() {
  const kind = Q.get('kind') || 'group';
  win.append(head(T.circles, `${T.circleWeek} · ${f(T.week, { n: 42 })}`));
  const main = el('div', 'fl-mart-main');
  const pick = el('div', 'fl-circle-pick');
  for (const [k, n] of [['friends', T.friends], ['group', L === 'ru' ? 'Ночные спелеологи' : 'Night Delvers'], ['g2', L === 'ru' ? 'Офис, 3 этаж' : 'Office, 3rd floor']]) { const b = txt('button', '', n); b.setAttribute('aria-pressed', String(k === kind)); pick.append(b); }
  pick.append(txt('button', 'add', '+ ' + T.addCircle)); main.append(pick);
  const icon = el('div', 'fl-circle-icon', await pix(kind === 'group' ? 'compete/titles/title-circle_champion.png' : 'mart/fl/profile/title-keeper.png', 3));
  const n = kind === 'group' ? 23 : 9;
  main.append(el('div', 'fl-circle-head', icon, el('div', 't', txt('b', '', circleName()), txt('span', '', `${kind === 'group' ? T.group : T.friends} · ${f(T.members, { n })}`)), txt('button', 'pd-button small primary', T.invite)));
  main.append(el('div', 'fl-champ', titlePlate('title.circle_champion', true), txt('span', '', `${L === 'ru' ? 'прошлая неделя' : 'last week'}: `), txt('b', '', ME.name)));
  const list = circleList(); const rows = el('div', 'fl-rows');
  for (let i = 0; i < list.length; i++) rows.append(await row(list[i], i + 1, { tab: 'week', still: !(list[i].me || i < 3) }));
  main.append(rows, el('div', 'fl-week-buttons', txt('button', 'pd-button', T.weekCard), txt('button', 'pd-button primary', T.invite)));
  if (WIDE) {
    const side = el('aside', 'fl-side'); const pv = el('div', 'fl-card2', txt('h3', '', T.weekCard));
    const c = await circleCard(); c.style.width = '100%'; c.style.height = 'auto'; pv.append(el('div', 'fl-share-preview', c), txt('p', '', L === 'ru' ? 'Картинка 1280 × 640 уходит в чат группы со ссылкой на круг.' : 'A 1280 × 640 picture goes to the group\'s chat with a link to the circle.'));
    side.append(pv, txt('div', 'fl-honour-note', T.honourOnly)); win.append(el('div', 'fl-cols', main, side));
  } else win.append(main);
}

async function invite() {
  win.append(head(T.inviteTitle, circleName(), true));
  const main = el('div', 'fl-mart-main fl-invite');
  main.append(txt('p', 'fl-hint', T.inviteText));
  main.append(el('div', 'fl-link', await pix('compete/titles/title-circle_champion.png', 2), txt('span', '', 't.me/pixel_dungeon_gamebot?startapp=c_7KQ2X')));
  main.append(el('div', 'fl-invite-buttons', txt('button', 'pd-button', T.copy), txt('button', 'pd-button primary', T.sendChat)));
  const ppl = el('div', 'fl-people');
  for (const i of [3, 7, 11, 15, 19]) { const p = person(i); const st = await stage('row', p.worn, { still: 0 }); const add = i === 7 ? txt('button', 'pd-button small', L === 'ru' ? 'Позван' : 'Invited') : txt('button', 'pd-button small primary', '+');
    ppl.append(el('div', 'fl-person', st, el('div', 'fl-row-who', nameEl(p.name, p.worn.nc), txt('span', 'fl-row-sub', T.classes[p.worn.heroClass])), add)); }
  main.append(sec(T.inviteFriends, null, ppl));
  const pv = el('div', 'fl-share-preview'); const c = await circleCard(); c.style.width = '100%'; c.style.height = 'auto'; pv.append(c);
  main.append(sec(T.weekCard, '1280 × 640', pv));
  win.append(main);
}

async function season() {
  const s = C.season.seasons[0]; win.style.setProperty('--season', s.palette[1]); win.style.setProperty('--season-hi', s.palette[0]);
  win.append(head(`${f(T.seasonN, { n: 1 })} · ${s.name[L]}`, f(T.daysLeft, { n: 41 })));
  const main = el('div', 'fl-mart-main');
  const top = el('div', 'fl-season-top', await pix(s.cup, WIDE ? 5 : 4), el('div', '', txt('b', '', s.name[L]), txt('span', '', `${f(T.seasonN, { n: 1 })} · ${f(T.daysLeft, { n: 41 })} · ${P(T.playersSeason, 11406)}`),
    el('div', 'fl-heat', txt('b', '', '1\u00a0240'), txt('span', '', `${T.heatRating} · #212`))));
  main.append(top);
  const ul = el('ul', 'fl-rules'); for (const r of T.heatRules) ul.append(txt('li', '', r));
  main.append(sec(T.heatHow, null, ul));
  const hs = el('div', 'fl-honours');
  const h = async (art, name, who) => { const d = el('div', 'fl-honour', el('div', 'art', art), txt('b', '', name), txt('span', '', who)); return d; };
  hs.append(await h(await pix(s.cup, 4), T.cup, T.cupFor));
  hs.append(await h(await stage('podium', { ...ME.worn, frame: `season.${s.id}` }, { scale: 1, frameScale: 2, still: 0 }), T.seasonFrame, T.seasonFrameFor));
  hs.append(await h(await scene('podium', { cls: 'mage', fire: 'beacon' }, window.__t, 2), T.beaconFire, T.beaconFireFor));
  const tp = el('div', '', titlePlate('title.season_beacon')); hs.append(await h(tp, by['title.season_beacon'].name[L], `${T.titleFor}: ${L === 'ru' ? 'Маяк в конце сезона или 10 лучших по жару' : 'the Beacon at the end, or the top 10 by heat'}`));
  main.append(sec(T.honours, null, hs), txt('div', 'fl-honour-note', T.honourOnly));
  if (WIDE) {
    const side = el('aside', 'fl-side'); const list = boardList(); list.forEach((p, i) => { p.rank = i + 1; });
    const b = el('div', 'fl-card2', el('h3', '', T.heatRating, txt('span', 'more', T.hall)));
    for (let i = 0; i < 5; i++) b.append(await row(list[i], i + 1, { tab: 'season', still: i > 2 }));
    side.append(b); win.append(el('div', 'fl-cols', main, side));
  } else win.append(main);
}

async function hall() {
  const s = C.season.seasons[0]; win.style.setProperty('--season-hi', s.palette[0]);
  win.append(head(T.hall, `${f(T.seasonN, { n: 1 })} · ${s.name[L]}`));
  const main = el('div', 'fl-mart-main fl-hall');
  const ss = el('div', 'fl-hall-seasons'); for (const x of C.season.seasons.slice(0, 1)) { const b = el('button', '', await pix(x.cup, 1), `${f(T.seasonN, { n: 1 })} · ${x.name[L]}`); b.setAttribute('aria-pressed', 'true'); ss.append(b); }
  main.append(ss, el('div', 'fl-hall-banner', txt('b', '', f(T.hallOf, { n: 1 })), txt('span', '', L === 'ru' ? 'Навсегда: десятка лучших сезона по жару' : 'For ever: the season\'s top 10 by heat')));
  const list = boardList(); list.forEach((p, i) => { p.rank = i + 1; });
  main.append(await podium(list, { tab: 'season', cup: s.cup }));
  const rows = el('div', 'fl-rows'); for (let i = 3; i < 10; i++) rows.append(await row(list[i], i + 1, { tab: 'season', still: true })); main.append(rows);
  main.append(txt('div', 'fl-honour-note', T.honourOnly));
  win.append(main);
}

async function profile() {
  win.append(head(T.profile, null, true));
  const main = el('div', 'fl-mart-main');
  main.append(await meCard(false));
  const tiers = el('div', 'fl-ladder'); for (const t of C.leagues.tiers) { const d = el('div', t.key === 'flame' ? 'on' : (t.tier < 3 ? 'done' : 'off'), await pix(t.badge, 2), txt('span', '', t.name[L])); d.style.setProperty('--tier', t.color); tiers.append(d); }
  main.append(sec(T.league, f(T.leagueOf, { t: tname('flame') }), tiers));
  const tt = el('div', 'fl-titles'); for (const t of C.titles) tt.append(titlePlate(t.sku, false, !['title.circle_champion', 'title.deep'].includes(t.sku)));
  main.append(sec(L === 'ru' ? 'Титулы чести' : 'Honour titles', T.duelSoon, tt));
  const shelf = el('div', 'fl-shelf');
  for (const [lbl, art] of [[L === 'ru' ? 'День #2' : 'Day #2', 'compete/season/cup-s1.png'], [L === 'ru' ? 'Неделя #7' : 'Week #7', 'compete/league/badge-flame.png'], [L === 'ru' ? 'Круг, нед. 41' : 'Circle, w41', 'compete/titles/title-circle_champion.png']])
    shelf.append(el('span', '', await pix(art, 2), lbl));
  main.append(sec(T.trophies, null, shelf), txt('div', 'fl-honour-note', T.honourOnly));
  if (WIDE) {   // the share cards of the profile: the story and the chat picture
    const side = el('aside', 'fl-side'); const pv = el('div', 'fl-card2', txt('h3', '', T.share));
    const ch = await chatCard(); ch.style.width = '100%'; ch.style.height = 'auto'; pv.append(el('div', 'fl-share-preview', ch));
    pv.append(el('div', 'fl-week-buttons', txt('button', 'pd-button primary', T.story), txt('button', 'pd-button', T.chat)), txt('p', '', L === 'ru' ? 'Сторис 1080 × 1920 и картинка для чата 1280 × 640: герой у своего костра, место, серия, класс, глубина. Сида нет.' : 'A story of 1080 × 1920 and a chat picture of 1280 × 640: the hero by his fire, the place, the streak, the class, the depth. No seed.'));
    side.append(pv); win.append(el('div', 'fl-cols', main, side));
  } else win.append(main);
}

/** All the states of the card on one page: rows and big ones. */
async function cards() {
  win.append(head(L === 'ru' ? 'Карточка героя' : 'The hero card', L === 'ru' ? 'Строка доски 56 px и большая карточка; анимированы топ-1/2/3 и моя строка' : 'A board row of 56 px and the big card; only the top 1-3 and my row move'));
  const main = el('div', 'fl-mart-main');
  const rows = el('div', 'fl-rows'); const ST = T.cardStates;
  const cast = [[TOP[0], 1, ST.top1 + ' · ' + ST.friend], [TOP[1], 2, ST.top2], [TOP[2], 3, ST.top3], [ME, 37, ST.me], [{ ...person(9), friend: true }, 12, ST.friend], [person(6), 18, ST.plain], [person(4), 23, ST.bare]];
  for (const [p, n, lbl] of cast) { rows.append(txt('div', 'fl-zone', lbl)); rows.append(await row(p, n)); }
  main.append(sec(L === 'ru' ? 'Строка' : 'The row', '80 × 56', rows));
  const big = el('div', 'fl-podium'); big.append(await pod(TOP[1], 2), await pod(TOP[0], 1), await pod(TOP[2], 3));
  main.append(sec(L === 'ru' ? 'Топ-3' : 'Top 3', L === 'ru' ? 'подиум' : 'podium', big));
  main.append(sec(T.profile, L === 'ru' ? 'большая' : 'big', await meCard(false)));
  const bare = el('div', 'fl-hero-card', await stage('big', { cls: 'rogue', heroClass: 'rogue', frame: 'league.spark', league: 'spark', tier: 0 }, { still: 0 }), el('div', 'who', nameEl(NAMES[6]), txt('span', 'fl-motto', T.noLook)));
  main.append(sec(ST.bare, null, bare));
  win.append(main);
}

/** The art of part 7 on one sheet. */
async function art() {
  win.append(head(L === 'ru' ? 'Арт соревнований' : 'Competition art', L === 'ru' ? 'Лиги, сезон, костёр «Маяк», титулы чести' : 'Leagues, the season, the Beacon fire, honour titles'));
  const main = el('div', 'fl-mart-main'); const sc = WIDE ? 4 : 3;
  const lg = el('div', 'fl-honours five'); lg.style.gridTemplateColumns = 'repeat(5, minmax(0, 1fr))';
  for (const t of C.leagues.tiers) { const fr = t.frame.anim ? await stage('podium', { ...ME.worn, frame: `league.${t.key}` }, { animate: true, scale: WIDE ? 2 : 1, frameScale: WIDE ? 3 : 2 }) : await pix(t.frame.sprite, sc);
    lg.append(el('div', 'fl-honour', el('div', 'art', fr), await pix(t.badge, sc), await pix(t.mini, 2), txt('b', '', t.name[L]), txt('span', '', `${t.tier} / 5`))); }
  main.append(sec(L === 'ru' ? 'Лиги: рамки 14 × 14, значки 16 и 9' : 'Leagues: frames 14 × 14, badges 16 and 9', L === 'ru' ? 'у «Маяка» рамка анимирована' : 'the Beacon\'s frame is animated', lg));
  const ss = el('div', 'fl-honours'); ss.style.gridTemplateColumns = WIDE ? 'repeat(5, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))';
  ss.append(el('div', 'fl-honour', el('div', 'art', await pix(C.season.template.cup, sc)), await pix(C.season.template.frame.sprite, sc), txt('b', '', L === 'ru' ? 'Шаблон' : 'Template'), txt('span', '', C.season.template.keys.join(' '))));
  for (const s of C.season.seasons) ss.append(el('div', 'fl-honour', el('div', 'art', await pix(s.cup, sc)), await pix(s.frame.sprite, sc), txt('b', '', s.name[L]), txt('span', '', s.id)));
  main.append(sec(L === 'ru' ? 'Кубок и рамка сезона' : 'The season\'s cup and frame', L === 'ru' ? 'цвет меняется каждый сезон' : 'the colour changes every season', ss));
  const fb = el('div', 'fl-honours'); fb.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
  const fire = C.fire.beacon;
  fb.append(el('div', 'fl-honour', el('div', 'art', await pix(fire.flame.sheet, WIDE ? 3 : 2)), txt('b', '', 'flame'), txt('span', '', '6 × 13 × 17')));
  fb.append(el('div', 'fl-honour', el('div', 'art', await pix(fire.logs, sc)), txt('b', '', 'logs'), txt('span', '', '16 × 6')));
  fb.append(el('div', 'fl-honour', el('div', 'art', await stage('podium', { cls: 'warrior', fire: 'beacon', frame: 'league.beacon' }, { animate: true, scale: 2, frameScale: 2 })), txt('b', '', fire.name[L]), txt('span', '', T.beaconFireFor)));
  main.append(sec(T.beaconFire, 'fires/beacon-*', fb));
  const tt = el('div', 'fl-titles'); for (const t of C.titles) tt.append(titlePlate(t.sku));
  main.append(sec(L === 'ru' ? 'Титулы чести' : 'Honour titles', L === 'ru' ? 'не продаются' : 'never sold', tt));
  win.append(main);
}

// ---- pictures: share cards and notifications (exact sizes, drawn on a canvas like share.ts)
const FONT = (px, small) => `${px}px ${small ? 'Galmuri9' : 'Galmuri11'}`;
function text(g, s, x, y, px, color, o = {}) { g.font = FONT(px, o.small); if (o.max) while (px > 12 && g.measureText(s).width > o.max) { px -= 2; g.font = FONT(px, o.small); } g.textAlign = o.align || 'left'; g.textBaseline = 'alphabetic';
  if (o.shadow !== false) { g.fillStyle = o.shadowColor || '#0b0b09'; g.fillText(s, x, y + Math.max(2, px / 10)); } g.fillStyle = color; g.fillText(s, x, y); return g.measureText(s).width; }
async function sceneAt(g, kind, worn, scale) { const Ly = K.anchors.layouts[kind]; const c = await scene(kind, worn, window.__t, scale || Ly.scale); g.drawImage(c, Ly.at[0], Ly.at[1]); return c; }
async function logo(g, x, y, w) { const im = await load(`brand/logo-${L}@4x.png`); if (im) { const h = w * im.height / im.width; g.drawImage(im, x, y, w, h); return h; } return 0; }
function vignette(g, W, H, color, cx, cy, r) { const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r); grd.addColorStop(0, color + '66'); grd.addColorStop(0.45, color + '22'); grd.addColorStop(1, color + '00'); g.fillStyle = grd; g.fillRect(0, 0, W, H); }
function panel(g, x, y, w, h, fill = '#282a24') { g.fillStyle = '#0b0b09'; g.fillRect(x - 3, y, w + 6, h); g.fillRect(x, y - 3, w, h + 6); g.fillStyle = fill; g.fillRect(x, y, w, h); }

async function story() {
  const W = 1080, H = 1920; const [c, g] = cv(W, H, 1); const w = ME.worn;
  g.fillStyle = '#0b0b09'; g.fillRect(0, 0, W, H);
  const Ly = K.anchors.layouts.story; const s2 = await scene('story', w, window.__t); g.drawImage(s2, Ly.at[0], Ly.at[1]);
  const top = g.createLinearGradient(0, 0, 0, 420); top.addColorStop(0, 'rgba(11,11,9,.85)'); top.addColorStop(1, 'rgba(11,11,9,0)'); g.fillStyle = top; g.fillRect(0, 0, W, 420);
  const fade = g.createLinearGradient(0, s2.height - 300, 0, s2.height); fade.addColorStop(0, 'rgba(11,11,9,0)'); fade.addColorStop(1, '#0b0b09'); g.fillStyle = fade; g.fillRect(0, s2.height - 300, W, 300);
  await logo(g, 270, 70, 540);
  const y0 = s2.height + 60; text(g, f(T.storyPlace, { n: 4 }), W / 2, y0, 130, '#ffcc66', { align: 'center', max: W - 80 });
  text(g, ME.name, W / 2, y0 + 120, 80, '#ffeba4', { align: 'center' });
  text(g, `${T.classes.mage} · ${f(T.storyDepth, { n: ME.depth })} · ${pl(T.streak, 12).replace('{n}', '12')}`, W / 2, y0 + 200, 44, '#e8e2c8', { align: 'center', small: true });
  const lg = tierOf(w.league); const b = await load(lg.badge); g.imageSmoothingEnabled = false; g.drawImage(b, W / 2 - 40, y0 + 240, 80, 80);
  text(g, f(T.leagueOf, { t: lg.name[L] }), W / 2, y0 + 370, 40, lg.color, { align: 'center' });
  text(g, T.deeperQ, W / 2, H - 120, 56, '#ff9a3a', { align: 'center' }); text(g, '@pixel_dungeon_gamebot', W / 2, H - 56, 36, '#b0b5a3', { align: 'center', small: true });
  return c;
}
async function chatCard() {
  const W = 1280, H = 640; const [c, g] = cv(W, H, 1); const w = ME.worn;
  g.fillStyle = '#0b0b09'; g.fillRect(0, 0, W, H); vignette(g, W, H, K.anchors.fire.styles[w.fire].light, 360, 420, 640);
  const Ly = K.anchors.layouts.chat; const s2 = await scene('chat', w, window.__t); const [ax, ay] = Ly.at;
  g.fillStyle = '#0b0b09'; g.fillRect(ax - 6, ay - 6, s2.width + 12, s2.height + 12); g.drawImage(s2, ax, ay);
  const x = 730; const lh = await logo(g, x, 44, 360);
  let y = 44 + lh + 90; text(g, f(T.storyPlace, { n: 4 }), x, y, 84, '#ffcc66', { max: W - x - 40 }); y += 72; text(g, ME.name, x, y, 52, '#ffeba4');
  y += 52; text(g, `${T.classes.mage} · ${f(T.storyDepth, { n: ME.depth })}`, x, y, 32, '#e8e2c8', { small: true });
  y += 44; text(g, pl(T.streak, 12).replace('{n}', '12'), x, y, 32, '#ff9a3a', { small: true });
  const lg = tierOf(w.league); const b = await load(lg.badge); g.imageSmoothingEnabled = false; y += 24; g.drawImage(b, x, y, 48, 48); text(g, lg.name[L], x + 64, y + 38, 32, lg.color);
  text(g, '@pixel_dungeon_gamebot', W - 40, H - 28, 26, '#7a8173', { align: 'right', small: true, shadow: false });
  return c;
}
async function circleCard() {
  const W = 1280, H = 640; const [c, g] = cv(W, H, 1); g.fillStyle = '#0b0b09'; g.fillRect(0, 0, W, H);
  vignette(g, W, H, '#ff9a3a', 220, 600, 700);
  text(g, T.circleCardTitle, 60, 96, 64, '#ffeba4'); text(g, f(T.circleCardSub, { c: circleName(), n: 42 }), 60, 146, 32, '#b0b5a3', { small: true });
  const lh = await logo(g, W - 340, 40, 280);
  const list = circleList().slice(0, 5); const top = Math.max(186, 40 + lh + 22);
  for (let i = 0; i < 5; i++) {
    const p = list[i]; const y = top + i * 86; panel(g, 60, y, W - 120, 74, i === 0 ? '#3b2a1c' : p.me ? '#4a4e45' : '#282a24');
    text(g, String(i + 1), 104, y + 52, 40, ['#ffd84a', '#d6dde3', '#e09a5a', '#b0b5a3', '#b0b5a3'][i], { align: 'center' });
    const sc2 = await scene('row', p.worn, window.__t, 3); g.drawImage(sc2, 140, y + 1, 108, 72);
    const nm = { ember: '#ff9a3a', gold: '#ffcc66', frost: '#9fdcff', moss: '#8adc5a', rose: '#ff8aa8', violet: '#b48aff', ash: '#c8c2b8', flame: '#ffcc66' }[p.worn.nc] || '#e8e2c8';
    text(g, p.name, 272, y + 46, 36, nm); text(g, T.classes[p.worn.heroClass], 272, y + 68, 22, '#b0b5a3', { small: true, shadow: false });
    if (i === 0) { const t = by['title.circle_champion']; const ic = await load(t.icon); g.drawImage(ic, 520, y + 18, 36, 36); text(g, t.name[L], 570, y + 48, 28, '#ffeba4'); }
    text(g, value(p, 'score', 'week', i + 1)[0], W - 90, y + 50, 38, i === 0 ? '#ffd84a' : '#e8e2c8', { align: 'right' });
  }
  return c;
}
async function notifyArt(k) {
  const W = 640, H = 360; const [c, g] = cv(W, H, 1); g.fillStyle = '#0b0b09'; g.fillRect(0, 0, W, H);
  const Ly = K.anchors.layouts.notify;
  if (k === 'overtaken') {
    const rival = { ...TOP[2].worn, fire: 'ice' }; const a = await scene('notify', rival, window.__t, 5); const b = await scene('notify', ME.worn, window.__t, 5);
    g.drawImage(a, 20, 70); g.drawImage(b, 340, 70);
    g.fillStyle = 'rgba(11,11,9,.55)'; g.fillRect(340, 70, b.width, b.height);
    text(g, '#3', 20 + a.width / 2, 60, 48, '#ffcc66', { align: 'center' }); text(g, '#4', 340 + b.width / 2, 60, 48, '#b0b5a3', { align: 'center' });
    text(g, '›', 320, 200, 64, '#ff9a3a', { align: 'center' });
    text(g, T.n_overtaken.title, W / 2, H - 22, 34, '#ffeba4', { align: 'center' });
  } else if (k === 'league') {
    vignette(g, W, H, '#ffcc66', W / 2, 170, 300);
    const f1 = await load(tierOf('flame').badge), f2 = await load(tierOf('bonfire').badge); g.imageSmoothingEnabled = false;
    g.drawImage(f1, 130, 110, 96, 96); g.drawImage(f2, 370, 70, 160, 160); text(g, '→', 300, 180, 64, '#ffcc66', { align: 'center' });
    text(g, f(T.up, { t: tname('bonfire') }), W / 2, 290, 34, '#ffcc66', { align: 'center' }); text(g, f(T.place, { n: 3, m: 30 }), W / 2, 330, 24, '#e8e2c8', { align: 'center', small: true });
  } else {
    const s2 = await scene('notifyCamp', ME.worn, 300); g.drawImage(s2, 0, 0);
    const sh = g.createLinearGradient(260, 0, 460, 0); sh.addColorStop(0, 'rgba(11,11,9,0)'); sh.addColorStop(1, 'rgba(11,11,9,.85)'); g.fillStyle = sh; g.fillRect(260, 0, 380, H);
    const x = 400; text(g, '12', x + 120, 170, 120, '#ff9a3a', { align: 'center' }); text(g, pl(T.streak, 12).replace('{n} ', '').replace('{n}', ''), x + 120, 220, 28, '#ffeba4', { align: 'center' });
    text(g, L === 'ru' ? 'до полуночи UTC' : 'until midnight UTC', x + 120, 262, 24, '#b0b5a3', { align: 'center', small: true });
    text(g, '6:12', x + 120, 320, 40, '#ffcc66', { align: 'center' });
  }
  return c;
}
function notifyText(k) {
  const n = T['n_' + k];
  if (k === 'overtaken') return f(n.text, { who: TOP[2].name, n: 4, t: L === 'ru' ? '6 ч 12 мин' : '6 h 12 min' });
  if (k === 'league') return f(n.text, { w: 42, n: 3, m: 30, t: tname('flame'), res: f(n.up, { t2: tname('bonfire') }) });
  return f(n.text, { n: 12, days: pl(['день', 'дня', 'дней'], 12) });
}
async function notify() {
  document.body.classList.add('fl-tg'); app.style.display = 'none';
  const page = el('div', 'fl-chat'); page.style.cssText = 'position:fixed;inset:0;overflow:auto';
  const ic = await load('brand/mark@4x.png'); const av = el('img'); if (ic) av.src = ic.src;
  const head_ = el('div', 'fl-chat-head', av, el('div', '', 'Pixel Dungeon: Firelight', txt('small', '', L === 'ru' ? 'бот' : 'bot')));
  const wrap = el('div', ''); wrap.style.cssText = `display:flex;flex-direction:column;min-height:100%;max-width:${WIDE ? '760px' : '100%'};margin:0 auto`;
  wrap.append(head_); const col = el('div', 'fl-chat');
  for (const [k, time] of [['streak', '17:00'], ['overtaken', '18:42'], ['league', '08:00']]) {
    const m = el('div', 'fl-msg'); const c = await notifyArt(k); const img = el('img'); img.src = c.toDataURL(); m.append(img, txt('p', '', `${T['n_' + k].title}\n${notifyText(k)}`)); m.lastChild.style.whiteSpace = 'pre-line';
    m.append(txt('small', '', time), txt('span', 'fl-msg-btn', T['n_' + k].button)); col.append(m);
  }
  col.append(txt('p', 'fl-motto', T.notifyNote)); wrap.append(col); page.append(wrap); document.body.append(page);
}
async function img() {
  const k = Q.get('k') || 'story'; const c = k === 'story' ? await story() : k === 'chat' ? await chatCard() : k === 'circle' ? await circleCard() : await notifyArt(k);
  app.style.display = 'none'; c.style.cssText = `display:block;width:${c.width}px;height:${c.height}px`; document.body.style.margin = '0'; document.body.append(c);
}

const SCREENS = { boards, league, week, circle, invite, season, hall, profile, cards, art, notify, img };
await document.fonts.load('20px Galmuri11'); await document.fonts.load('20px Galmuri9');
const r = await SCREENS[S]();
if (!['notify', 'img'].includes(S) && r !== 'done') app.append(win);
await document.fonts.ready; await loaded();
if (Q.get('t')) await setTime(window.__t);
window.__setTime = setTime;
window.__ready = true;

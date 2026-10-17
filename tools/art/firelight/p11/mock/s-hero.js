// Part 11 · 1. The hero's growth: the level, strength, the passport, the ceremonies.
import { BAG, C, css, el, figure, FRESH, G, gi, hero, itemIcon, name, PHONE, pct, Q, RU, scene, slot, START, T, windowOn, world } from './kit.js';

const gain = (icon, plus, to) => el('span', 'fl-gain', gi(icon, 12, 2), el('b', '', plus), el('span', 'to', `→ ${to}`));

function lvlCard() {
  const g = C.levelGain(hero);
  return el('div', 'fl-lvlcard',
    el('span', 'fl-lvl-num', g.lvl),
    el('span', 'fl-lvl-title', T('New level!', 'Новый уровень!')),
    el('span', 'fl-gains',
      gain('hp', `+${g.ht}`, `${hero.ht}`),
      gain('acc', `+${g.attack}`, `${hero.attackSkill}`),
      gain('eva', `+${g.defense}`, `${hero.defenseSkill}`),
      g.awareness ? gain('aware', `+${pct(g.awareness[1] - g.awareness[0])}`, pct(g.awareness[1])) : null));
}

/* ---------- the level ---------- */
export async function levelup(v) {
  if (v === 'A') {
    const ui = scene({ xp: 'A', lvlPop: true });
    ui.querySelector('.pd-bar.xp').classList.add('fl-flash');
    const toast = el('div', 'pd-toast fl-lvl-toast', lvlCard());
    toast.append(el('span', 'mk-hint', T('tap: passport', 'тап — паспорт')));
    ui.append(toast);
  } else if (v === 'B') {
    const ui = scene({ xp: 'B', lvlPop: true });
    const sparks = el('div', 'fl-coal-sparks');
    [[-14, 0], [-6, 60], [4, 20], [12, 90], [18, 40], [-10, 120]].forEach(([dx, delay], k) => {
      const i = css(el('i'), { '--dx': `${dx}px`, left: `${18 + (k % 3) * 6}px`, top: `${26 - (k % 2) * 4}px` }); i.style.animationDelay = `${delay}ms`; sparks.append(i);
    });
    ui.querySelector('.pd-avatar-wrap').append(sparks);
    const b = el('div', 'fl-lvl-bubble', lvlCard());
    ui.append(b);
  } else {
    const g = C.levelGain(hero);
    const line = el('div', 'pd-log-line fl-lvl', T(`Level ${g.lvl}:`, `Уровень ${g.lvl}:`),
      el('span', 'fl-gain', gi('hp', 12, 1.5), `+${g.ht}`), el('span', 'fl-gain', gi('acc', 12, 1.5), `+${g.attack}`),
      el('span', 'fl-gain', gi('eva', 12, 1.5), `+${g.defense}`));
    const ui = scene({ xp: 'C', log: [el('div', 'pd-log-line', T('You killed the cave spinner.', 'Вы убили пещерного паука.')), line] });
    ui.querySelector('.fl-xp-pips').classList.add('fl-collapse');
  }
}

/* ---------- strength ---------- */
const STR_HEAD = () => el('div', 'fl-str-head', gi('str', 12, 2), T('Strength', 'Сила'), el('b', '', `${hero.str - 1} → ${hero.str}`));

export async function strength(v) {
  const light = C.nowLight(hero);
  if (v === 'A') {
    const ui = scene({ xp: 'A', dim: true });
    const grid = el('div', 'pd-bagrow fl-slots-a');
    for (const it of hero.items) { const s = slot(it, { light: light.includes(it) }); if (light.includes(it)) { s.querySelector('.pd-tag').classList.add('fl-str-flip'); s.classList.add('fl-moment'); } grid.append(s); }
    const head = el('div', 'fl-str-toast',
      STR_HEAD(),
      el('p', 'pd-info-head', T(`Light enough now (${light.length}):`, `Теперь по силам (${light.length}):`)),
      el('div', 'fl-str-items', ...light.map((it) => el('span', 'fl-gain', slot(it, { light: true }), el('span', '', name(it))))));
    windowOn(ui, [head, grid], { title: T('Backpack', 'Рюкзак') });
    let k = 0; for (const n of ui.querySelectorAll('.fl-str-flip')) n.style.setProperty('--k', k++);
  } else if (v === 'B') {
    const ui = scene({ xp: 'A', dim: true });
    const lo = 10, hi = 18, at = (s) => `${((Math.min(hi, Math.max(lo, s)) - lo) / (hi - lo)) * 100}%`;
    const rule = el('div', 'fl-ladder-rule', css(el('i', 'fl-reach'), { '--reach': at(hero.str) }));
    for (let s = lo; s <= hi; s++) rule.append(css(el('span', `fl-ladder-tick${s === hero.str ? ' me' : ''}`, s), { left: at(s) }));
    const things = C.gear(hero).map((it) => [it, C.strengthWanted(it)]).filter(([, w]) => w);
    const stack = {};
    for (const [it, w] of things) {
      const k = Math.min(hi, w.str); const level = (stack[k] = (stack[k] ?? 0) + 1) - 1;
      const n = css(el('div', `fl-ladder-item${w.str > C.heroStr(hero) ? ' heavy' : ''}`, itemIcon(world, it)), { left: at(w.str) });
      n.style.bottom = `calc(100% + ${4 + level * 34}px)`;
      rule.append(n);
    }
    rule.append(css(el('span', 'fl-ladder-me', gi('fire', 8, 2)), { left: at(hero.str) }));
    const ladder = el('div', 'fl-ladder', rule);
    ladder.style.paddingTop = '96px';
    const fx = C.strengthEffects(hero, hero.weapon);
    const lines = el('div', 'pd-info-block',
      el('p', 'pd-info-head', T('What strength does (the rules of 1.9.2a)', 'Что даёт сила (правила 1.9.2a)')),
      el('p', '', T(`Spare strength over the weapon: +0…${fx.spare} damage a blow (${name(hero.weapon)}).`, `Лишняя сила сверх оружия: +0…${fx.spare} урона за удар (${name(hero.weapon)}).`)),
      el('p', '', T('Each point short: the weapon ÷1.5 accuracy, ×1.2 slower; the armour ÷1.5 evasion, ×1.3 slower walking.', 'Каждой недостающей единицы: оружие ÷1,5 точности, ×1,2 медленнее; броня ÷1,5 уклонения, шаг ×1,3 медленнее.')),
      el('p', '', T('Each upgrade lowers a thing\'s strength by one.', 'Каждое улучшение снижает требование вещи на 1.')));
    windowOn(ui, [el('div', 'fl-str-toast', STR_HEAD()), ladder, lines], { title: T('Strength', 'Сила'), icon: gi('strength', 16, 2) });
  } else {
    const ui = scene({ xp: 'A', dim: true });
    const it = BAG.axe;
    const fx = C.strengthEffects(hero, it), w = C.strengthWanted(it);
    const row = (label, now, then) => [el('span', '', gi(label[0], 12, 1.5)), el('span', '', label[1]), el('span', 'now', now), el('span', 'then', then)];
    const cost = el('div', 'fl-cost',
      el('span', ''), el('span', 'pd-info-head', T('too heavy by', 'тяжелее на') + ` ${fx.short}`), el('span', 'pd-info-head', T('now', 'сейчас')), el('span', 'pd-info-head', `+${fx.short} ${T('str', 'силы')}`),
      ...row(['acc', T('accuracy', 'точность')], `×${(fx.accuracy).toFixed(2)}`, '×1'),
      ...row(['speed', T('blow speed', 'скорость удара')], `×${(1 / fx.delay).toFixed(2)}`, '×1'),
      ...row(['dmg', T('spare strength', 'лишняя сила')], '—', T('+0…0 dmg', '+0…0 урона')));
    const c = el('div', 'pd-info-block', el('p', 'pd-info-head', T(`Wants ${w.str}${w.known ? '' : '?'} strength, you have ${hero.str}`, `Нужно силы: ${w.str}${w.known ? '' : '?'}, у вас ${hero.str}`)), cost,
      el('p', 'fl-tip', gi('unknown', 8, 2), T('The level is unknown: an upgraded axe wants less. «16?» is the plain axe.', 'Уровень не известен: улучшенный топор требует меньше. «16?» — для обычного.')));
    windowOn(ui, [el('div', 'pd-examine-head', slot(it), el('div', 'pd-titles', el('p', 'pd-speech', C.itemInfo(world, hero, it)[0]))), c], { title: name(it) });
  }
}

/* ---------- the passport ---------- */
const STATS = () => {
  const p = C.passport(hero, START);
  return [
    ['lvl', T('Level', 'Уровень'), p.lvl, 30],
    ['hp', T('Health', 'Здоровье'), p.ht, 150],
    ['str', T('Strength', 'Сила'), p.str, 20],
    ['acc', T('Accuracy', 'Точность'), p.attack, 40],
    ['eva', T('Evasion', 'Уклонение'), p.defense, 40],
  ];
};
const startArmorDr = 2;   // cloth +0: 1 × (2 + 0)

export async function passport(v) {
  const ui = scene({ xp: 'A', dim: true });
  const face = await figure('assets/warrior.png', 12, 15, 0, 3, PHONE ? 4 : 5);
  const portrait = el('div', 'pd-portrait', face);
  portrait.style.cssText = `width:${PHONE ? 64 : 76}px;height:${PHONE ? 72 : 86}px`;
  const sub = el('span', 'fl-pass-sub', T('Warrior', 'Воин'), '·', gi('sigil', 16, 1.5), el('span', 'fl-sigil-tag', C.t.subclasses.gladiator));
  const where = el('span', 'fl-pass-sub', T(`depth ${hero.depth} · turn 8 412`, `глубина ${hero.depth} · ход 8 412`));
  const head = el('div', 'fl-pass-head', portrait, el('span', 'fl-pass-name', hero.name), sub, where);
  const w = C.weaponStats(hero.weapon), a = C.armorStats(hero.armor);
  if (v === 'A') {
    const st = el('div', 'fl-stats');
    for (const [ic, nm, [was, is], max, eff] of STATS()) {
      st.append(gi(ic, 12, 2), el('span', 'fl-stat-name', nm), el('span', 'fl-stat-val', is), el('span', `fl-stat-delta${is === was ? ' zero' : ''}`, is === was ? '=' : `+${is - was}`));
      st.append(el('span', ''), css(el('span', 'fl-grew'), { '--was': (was / max).toFixed(3), '--is': (is / max).toFixed(3) }));
    }
    const eq = el('div', 'fl-equip-rows',
      el('div', 'fl-equip-row', slot(hero.weapon, { equipped: true }), el('span', 'fl-equip-name', name(hero.weapon)), el('span', 'fl-equip-num', `${w.min}–${w.max}`)),
      el('div', 'fl-equip-row', slot(hero.armor, { equipped: true }), el('span', 'fl-equip-name', name(hero.armor)), el('span', 'fl-equip-num', `${T('armour', 'броня')} ${a.dr} (${T('was', 'было')} ${startArmorDr})`)),
      ...hero.rings.map((r) => el('div', 'fl-equip-row', slot(r, { equipped: true }), el('span', 'fl-equip-name', name(r)), el('span', 'fl-equip-num', C.levelKnown(r) ? '' : T('learning', 'изучаю')))));
    const K = C.knownHero(world, hero);
    const net = el('p', 'fl-tip', gi('ring', 12, 1.5), T(`With what you wear: accuracy ${C.heroAttackSkill(K)}, evasion ${C.heroDefenseSkill(K)} (the ruby ring not counted: unknown).`, `С тем, что надето: точность ${C.heroAttackSkill(K)}, уклонение ${C.heroDefenseSkill(K)} (рубиновое кольцо не в счёт: не опознано).`));
    windowOn(ui, el('div', 'fl-pass', head, el('p', 'pd-info-head', T('Since the start of the run', 'С начала забега')), st, net, el('p', 'pd-info-head', T('Worn', 'Надето')), eq), { title: T('Hero', 'Герой'), icon: gi('passport', 16, 2), split: !PHONE });
  } else if (v === 'B') {
    const big = await figure('assets/warrior.png', 12, 15, 0, 3, PHONE ? 7 : 8);
    const doll = el('div', 'fl-doll',
      slot(hero.weapon, { equipped: true }), el('div', 'fl-doll-hero', big), slot(hero.armor, { equipped: true }),
      el('div', 'fl-doll-rings', ...hero.rings.map((r) => slot(r, { equipped: true })), el('span', 'pd-stat-label', T('rings', 'кольца'))));
    doll.querySelector('.fl-doll-hero').style.gridRow = '1 / 3';
    const stats = el('div', 'fl-doll-stats');
    const rows = [...STATS(), ['dmg', T('Damage', 'Урон'), [2, w.max], 30, null, `${w.min}–${w.max}`], ['dr', T('Armour', 'Броня'), [startArmorDr, a.dr], 30]];
    for (const [ic, nm, [was, is], max, , text] of rows) {
      stats.append(el('div', 'fl-doll-stat', gi(ic, 12, 1.5), el('span', '', nm), el('span', 'v', text ?? is),
        css(el('span', 'bar'), { '--was': (was / max).toFixed(3), '--is': (is / max).toFixed(3) })));
    }
    const legend = el('div', 'fl-chart-legend', el('span', '', css(el('i'), { background: 'var(--grow-was)' }), T('at the start', 'на старте')), el('span', '', css(el('i'), { background: 'var(--grow-is)' }), T('grown', 'прирост')));
    windowOn(ui, el('div', 'fl-pass', head, doll, stats, legend), { title: T('Hero', 'Герой'), icon: gi('passport', 16, 2), split: !PHONE });
  } else {
    // C: the run by depth — level, health / 10 and strength as steps; the bosses marked
    const LV = [1, 3, 4, 5, 6, 7, 7, 8, 9, 10, 10, 11], STR = [11, 11, 11, 12, 12, 12, 13, 13, 14, 14, 14, 15];
    const W = 300, H = 110, D = 26;
    const x = (d) => ((d - 1) / (D - 1)) * W, y = (val, max) => H - (val / max) * H;
    const path = (vals, max) => vals.map((val, i) => `${i ? 'L' : 'M'}${x(i + 1).toFixed(1)},${y(val, max).toFixed(1)}${i < vals.length - 1 ? `H${x(i + 2).toFixed(1)}` : ''}`).join('');
    const bosses = [5, 10, 15, 20, 25];
    const svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      ${[5, 10, 15, 20, 25].map((d) => `<line x1="${x(d)}" x2="${x(d)}" y1="0" y2="${H}" stroke="#3b3e36" stroke-width="1"/>`).join('')}
      <path class="ht" fill="none" stroke-width="2" d="${path(LV.map((l) => 20 + 5 * (l - 1)), 150)}"/>
      <path class="str" fill="none" stroke-width="2" d="${path(STR, 20)}"/>
      <path class="lvl" fill="none" stroke-width="3" d="${path(LV, 30)}"/>
      <line x1="${x(12)}" x2="${x(12)}" y1="0" y2="${H}" stroke="#ffcc66" stroke-dasharray="2 2"/>
      ${bosses.map((d) => `<rect x="${x(d) - 3}" y="${H + 4}" width="6" height="6" fill="${d <= 12 ? '#b22a2a' : '#3b3e36'}"/>`).join('')}
    </svg>`;
    const chart = el('div', 'fl-chart'); chart.innerHTML = svg;
    for (const d of [1, 5, 10, 15, 20, 26]) chart.append(css(el('span', 'pd-stat-label'), { position: 'absolute', bottom: '0', left: `calc(22px + ${(d - 1) / 25} * (100% - 28px))`, transform: 'translateX(-50%)', font: 'var(--text-digits)' }));
    [...chart.querySelectorAll('.pd-stat-label')].forEach((n, i) => { n.textContent = [1, 5, 10, 15, 20, 26][i]; });
    const legend = el('div', 'fl-chart-legend',
      el('span', '', css(el('i'), { background: 'var(--fire-gold)' }), T('level', 'уровень')), el('span', '', css(el('i'), { background: 'var(--hp-hi)' }), T('health', 'здоровье')),
      el('span', '', css(el('i'), { background: 'var(--ally)' }), T('strength', 'сила')), el('span', '', css(el('i'), { background: 'var(--fire-coal)' }), T('boss', 'босс')));
    const strip = el('div', 'fl-doll-stats');
    for (const [ic, nm, [was, is]] of STATS()) strip.append(el('div', 'fl-doll-stat', gi(ic, 12, 1.5), el('span', '', nm), el('span', 'v', `${was} → ${is}`)));
    const steps = el('ol', 'fl-steps',
      el('li', '', T('Depth 4: the first potion of strength', 'Глубина 4: первое зелье силы')),
      el('li', '', T('Depth 10: Tengu falls — the Gladiator', 'Глубина 10: Тенгу повержен — Гладиатор')),
      el('li', '', T('Depth 12: level 11, strength 15', 'Глубина 12: уровень 11, сила 15')));
    windowOn(ui, el('div', 'fl-pass', head, chart, legend, strip, steps), { title: T('Hero · by depth', 'Герой · по глубинам'), icon: gi('passport', 16, 2), split: !PHONE });
  }
}

/* ---------- the ceremonies: the Tome of Mastery (Tengu) and the armour kit (the King) ---------- */
export async function ceremony(v) {
  const armor = Q.get('k') === 'armor';
  const title = armor ? cap(C.t.items['armor.warrior']) : cap(C.t.subclasses.gladiator);
  const what = armor ? T('The armour keeps its level and glyph and becomes yours alone. Its special: Heroic leap (a third of your health).', 'Броня сохранила уровень и глиф и стала только вашей. Особое: «Героический прыжок» (треть здоровья).')
    : firstSentence(C.t.subclassInfo.gladiator);
  if (armor) { hero.armor = { ...hero.armor, kind: 'armor.warrior', base: 'armor.mail' }; }
  if (v === 'A') {
    const ui = scene({ xp: 'A', dim: true });
    const sig = el('div', 'fl-seal-sigil', armor ? css(itemIcon(world, hero.armor), { scale: 2 }) : gi('sigil', 16, 5));
    if (armor) sig.firstChild.classList.add('fl-gi');
    const later = el('div', 'pd-info-block', el('p', 'pd-info-head', T('From now on you will see it', 'Дальше в игре видно')),
      el('p', 'fl-tip', gi('sigil', 16, 1.5), armor ? T('the class armour on the hero in 3D (its own sheet row)', 'классовая броня на герое в 3D (свой ряд листа)') : T('the sigil by your level on the HUD', 'знак у уровня в панели героя')),
      el('p', 'fl-tip', gi('passport', 16, 1.5), T('in the passport and on the end card', 'в паспорте и в итогах забега')),
      el('p', 'fl-tip', gi('chronicle', 16, 1.5), T('as a chapter of the chronicle', 'главой в летописи')));
    windowOn(ui, el('div', 'fl-seal pd-window-body', sig, el('span', 'fl-seal-title', title), el('p', 'fl-seal-line', what), later), { cls: 'fl-seal' });
  } else if (v === 'B') {
    const ui = scene({ xp: 'A' });
    const b = el('div', 'fl-banner', el('span', 'big', title), el('span', 'small', armor ? T('class armour', 'классовая броня') : T('the way is chosen', 'путь выбран')));
    ui.append(b);
    const flare = gi('sigil', 16, 3); flare.classList.add('mk-flare'); ui.append(flare);
  } else {
    const ui = scene({ xp: 'C', dim: true });
    const page = el('div', 'fl-page',
      el('div', 'fl-chapter', armor ? T('Chapter IV', 'Глава IV') : T('Chapter III', 'Глава III')),
      el('h3', '', title),
      el('p', '', what),
      el('div', 'fl-ribbon',
        el('div', 'fl-rib boss', gi('boss', 16, 1.5), armor ? T('The King of Dwarves is dead', 'Король гномов пал') : T('Tengu is dead · depth 10', 'Тенгу повержен · глубина 10'), el('span', 'when', armor ? '20' : '10')),
        el('div', 'fl-rib big', gi('sigil', 16, 1.5), armor ? T('Armour kit applied: ', 'Набор брони: ') + title : T('Tome of Mastery: ', 'Книга мастерства: ') + title, el('span', 'when', armor ? '20' : '10'))));
    windowOn(ui, page, { title: T('Chronicle', 'Летопись'), icon: gi('chronicle', 16, 2) });
  }
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const firstSentence = (s) => (s.match(/^.*?[.!?](\s|$)/) || [s])[0].trim();
void FRESH; void G; void RU; void hero;

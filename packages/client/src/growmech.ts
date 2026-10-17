import { type Hero, HUNGRY, itemDef, STARVING, type World } from '@pd/core';
import { audio } from './audio';
import { h, hb } from './growdom';
import { gi } from './growicons';
import { strengthEffects } from './growth';
import { hungerReport } from './hungerinfo';
import { brewOdds } from './brewodds';
import { lang, locale, t } from './i18n';
import { G } from './i18n-grow';
import { KEYS, keysHeld, restInfo, searchInfo, shopInfo, SHOP_DEPTHS, trapInfo, type TrapColour, WELLS } from './mechinfo';
import { button, show, windowOf } from './screens';

/*
 * «How it works» (part 11, variant A): the Guide's nine cards after the pattern of the hunger card — an icon, the state, the numbers
 * of this hero on this depth, one tip. Every number is the core's own, through mechinfo.ts (held to the rules by its tests) and the
 * older hungerinfo.ts and brewodds.ts; a worn ring the player has not identified is left out of all of them.
 */

const T = (ru: string, en: string): string => (lang === 'ru' ? ru : en);
const num = (x: number, digits = 0): string => x.toLocaleString(locale, { maximumFractionDigits: digits });
const pct = (x: number): string => `${Math.round(x * 100)}%`;
const span = (a: { min: number; max: number }): string => (a.min === a.max ? String(a.min) : `${a.min}–${a.max}`);

export const MECH_IDS = ['hunger', 'rest', 'search', 'traps', 'pot', 'well', 'shop', 'key', 'strength'] as const;
export type MechId = (typeof MECH_IDS)[number];

const ICON: Readonly<Record<MechId, string>> = { hunger: 'hunger', rest: 'rest', search: 'search', traps: 'traps', pot: 'pot', well: 'well', shop: 'shop', key: 'key', strength: 'strength' };
const NAME: Readonly<Record<MechId, string>> = {
  hunger: T('Голод', 'Hunger'), rest: T('Отдых', 'Rest'), search: T('Поиск', 'Search'), traps: T('Ловушки', 'Traps'), pot: T('Котёл', 'Alchemy pot'),
  well: T('Колодцы', 'Wells'), shop: T('Лавки', 'Shops'), key: T('Ключи', 'Keys'), strength: T('Сила', 'Strength'),
};
const TRAP_NAME: Readonly<Record<string, readonly [string, string]>> = {
  toxic: ['Ядовитый газ', 'Toxic gas'], fire: ['Огонь', 'Fire'], paralytic: ['Паралич', 'Paralysis'], poison: ['Отравленный дротик', 'Poison dart'],
  alarm: ['Тревога', 'Alarm'], lightning: ['Молния', 'Lightning'], gripping: ['Капкан', 'Gripping'], summoning: ['Призыв', 'Summoning'],
};
const COLOUR_INDEX: Readonly<Record<TrapColour, number>> = { red: 0, orange: 1, yellow: 2, green: 3, teal: 4, violet: 5, white: 6, grey: 7 };
const COLOUR_NAME: Readonly<Record<TrapColour, readonly [string, string]>> = {
  red: ['красный', 'red'], orange: ['оранжевый', 'orange'], yellow: ['жёлтый', 'yellow'], green: ['зелёный', 'green'], teal: ['бирюзовый', 'teal'],
  violet: ['фиолетовый', 'violet'], white: ['белый', 'white'], grey: ['серый', 'grey'],
};
const pick = (pair: readonly [string, string]): string => (lang === 'ru' ? pair[0] : pair[1]);

interface Card {
  /** The state, in a few words: what the card is about now. */
  state: string;
  /** The rule in a line, for the tile. */
  rule: string;
  blocks: HTMLElement[];
  tip: string;
}

const rows = (pairs: ReadonlyArray<readonly [string, string]>): HTMLElement =>
  h('table', 'fl-table', ...pairs.map(([a, b]) => h('tr', '', h('td', '', a), h('td', 'n', b))));

function hungerCard(world: World, hero: Hero): Card {
  const r = hungerReport(world, hero);
  const until = r.state === 'fed' ? r.untilHungry : r.state === 'hungry' ? r.untilStarving : 0;
  return {
    state: r.state === 'fed' ? T('Сыт', 'Fed') : r.state === 'hungry' ? T('Голодны', 'Hungry') : T('Истощены', 'Starving'),
    rule: T(`голод с ${HUNGRY}, истощение с ${STARVING}`, `hungry at ${HUNGRY}, starving at ${STARVING}`),
    blocks: [rows([
      [T('голод растёт', 'hunger grows'), T(`+${r.growth} каждые ${num(r.step, 1)} ходов`, `+${r.growth} every ${num(r.step, 1)} turns`)],
      [r.state === 'fed' ? T('до голода', 'until hungry') : T('до истощения', 'until starving'), until === null ? T('никогда', 'never') : T(`${until} ходов`, `${until} turns`)],
      [T('при истощении', 'while starving'), T(`−1 здоровья примерно за ${r.starveEvery} ходов`, `−1 health about every ${r.starveEvery} turns`)],
      [T('паёк / пирожок', 'ration / pasty'), `${itemDef('food.ration').energy} / ${itemDef('food.pasty').energy}`],
    ])],
    tip: r.hiddenRing ? T('Неопознанное кольцо в этих числах не учтено.', 'An unidentified ring is not in these figures.') : T('Нажмите на значок еды у полосы голода: там то же и ещё запасы.', 'Tap the food icon by the bar: the same, and your food.'),
  };
}

function restCard(world: World, hero: Hero): Card {
  const r = restInfo(world, hero);
  return {
    state: r.starving ? T('Не лечит', 'No healing') : T(`1 здоровья в ${num(r.delay, 1)} хода`, `1 health per ${num(r.delay, 1)} turns`),
    rule: T('1 здоровья в 10 ходов; при истощении — нет', '1 health per 10 turns; none while starving'),
    blocks: [rows([
      [T('не хватает', 'missing'), String(r.missing)],
      [T('до полного здоровья', 'to full health'), r.turnsToFull === null ? T('не лечит', 'never') : T(`${r.turnsToFull} ходов`, `${r.turnsToFull} turns`)],
      ...(r.mending ? [[T('кольцо исцеления', 'ring of mending'), `${r.mending > 0 ? '+' : ''}${r.mending}`] as const] : []),
    ])],
    tip: r.hiddenRing ? T('Неопознанное кольцо не учтено.', 'An unidentified ring is not counted.') : T('Удерживайте песочные часы: герой отдыхает, пока не выздоровеет или не придёт враг.', 'Hold the hourglass: the hero rests until healed or a foe comes.'),
  };
}

function searchCard(world: World, hero: Hero): Card {
  const r = searchInfo(world, hero);
  return {
    state: T(`Шаг находит: ${pct(r.chance)}`, `A step finds: ${pct(r.chance)}`),
    rule: T('2 хода, все тайники в 2 клетках на виду', '2 turns, every secret within 2 cells in view'),
    blocks: [rows([
      [T('поиск', 'search'), T(`${r.turns} хода · ${r.radius} клетки`, `${r.turns} turns · ${r.radius} cells`)],
      [T('каждый шаг рядом', 'each step beside it'), pct(r.chance)],
      [T('внимательность растёт до', 'the eye grows until'), T(`${r.capLevel}-го уровня (${pct(r.chanceAtCap)})`, `level ${r.capLevel} (${pct(r.chanceAtCap)})`)],
      [T('ваш уровень', 'your level'), String(r.lvl)],
    ])],
    tip: r.hiddenRing ? T('Неопознанное кольцо не учтено.', 'An unidentified ring is not counted.') : T('Волшебная карта и колодец осознания открывают всё сразу.', 'Magic mapping and a well of awareness show everything at once.'),
  };
}

function trapsCard(world: World, hero: Hero): Card {
  const list = trapInfo(world, hero);
  const lines = list.map((trap) => {
    const bits: string[] = [];
    if (trap.volume !== undefined) bits.push(T(`облако ${trap.volume}`, `cloud of ${trap.volume}`));
    if (trap.breath) bits.push(T(`${span(trap.breath)} урона за вдох`, `${span(trap.breath)} damage a breath`));
    if (trap.paralysis) bits.push(T(`${trap.paralysis} ходов без движения`, `${trap.paralysis} turns still`));
    if (trap.burning) bits.push(T(`горение ${trap.burning.turns} ходов, ${span(trap.burning.perTurn)} в ход`, `burning ${trap.burning.turns} turns, ${span(trap.burning.perTurn)} a turn`));
    if (trap.poison) bits.push(T(`яд ${trap.poison.turns} ходов`, `poison ${trap.poison.turns} turns`));
    if (trap.bolt) bits.push(T(`молния ${span(trap.bolt)} сейчас`, `bolt ${span(trap.bolt)} now`));
    if (trap.grip) bits.push(T(`${span(trap.grip.damage)} урона (броня ${trap.grip.armour})`, `${span(trap.grip.damage)} damage (armour ${trap.grip.armour})`));
    if (trap.summon) bits.push(T('1–3 монстра', '1–3 monsters'));
    if (trap.kind === 'alarm') bits.push(T('сбегаются монстры уровня', 'every monster of the level comes'));
    const swatch = h('i', 'pd-trapc');
    swatch.style.setProperty('--c', String(COLOUR_INDEX[trap.colour]));
    return h('tr', '', h('td', '', swatch), h('td', '', h('b', '', pick(TRAP_NAME[trap.kind]!)), ' · ', pick(COLOUR_NAME[trap.colour])), h('td', 'n', bits.join('; ')));
  });
  return {
    state: T('8 видов', '8 kinds'),
    rule: T('цвет — это эффект; чёрная — сработала', 'the colour is the effect; black: gone off'),
    blocks: [h('table', 'fl-table fl-traps', ...lines)],
    tip: T('Найденная ловушка остаётся на виду; сработавшая чернеет и больше не опасна.', 'A trap you have found stays shown; once it has gone off it turns black and is harmless.'),
  };
}

function potCard(world: World, hero: Hero): Card {
  const sungrass = brewOdds([{ kind: 'seed.sungrass', qty: 3 }]);
  const healing = sungrass.own[0]?.chance ?? 0;
  const seeds = hero.items.filter((i) => itemDef(i.kind).category === 'seed').reduce((n, i) => n + i.qty, 0);
  void world;
  return {
    state: T(`Семян в рюкзаке: ${seeds}`, `Seeds in the pack: ${seeds}`),
    rule: T('3 семени; 1/N — случайное зелье, иначе по семенам', '3 seeds; 1 in N a random potion, else by the seeds'),
    blocks: [rows([
      [T('нужно семян', 'seeds needed'), '3'],
      [T('N семян: случайное зелье', 'N seeds: a random potion'), '1 / N'],
      [T('3 солнцецвета', '3 sungrass'), T(`исцеление ${pct(healing)}`, `healing ${pct(healing)}`)],
    ])],
    tip: T('Выберите семена на карточке семени: «Что сварится?» посчитает шансы.', 'Pick seeds on a seed\'s card: «What will it brew?» works out the odds.'),
  };
}

function wellCard(): Card {
  const names: Record<string, string> = { health: T('здоровья', 'of health'), awareness: T('осознания', 'of awareness'), transmutation: T('превращения', 'of transmutation') };
  const does: Record<string, string> = {
    heal: T('лечит', 'heals'), cure: T('снимает недуги', 'cures ailments'), feed: T('кормит', 'feeds'), identify: T('опознаёт вещи в рюкзаке', 'identifies the pack'), map: T('открывает карту', 'maps the level'),
    transmute: T('превращает брошенную вещь', 'turns a thing dropped in'),
  };
  return {
    state: T('3 вида', '3 kinds'),
    rule: T('здоровье, осознание — один глоток; превращение — бросить вещь', 'health, awareness: one drink; transmutation: drop a thing in'),
    blocks: [rows(WELLS.map((w) => [T(`колодец ${names[w.water]}`, `well ${names[w.water]}`), `${w.how === 'step' ? T('глоток: ', 'drink: ') : T('бросить вещь: ', 'drop a thing: ')}${w.does.map((d) => does[d]).join(', ')}`]))],
    tip: T('Колодец здоровья и осознания даёт один глоток, потом иссякает.', 'A well of health or awareness gives one drink, then runs dry.'),
  };
}

function shopCard(world: World, hero: Hero): Card {
  const s = shopInfo(world, hero);
  return {
    state: T(`Цена ×${s.multiplier} здесь`, `Price ×${s.multiplier} here`),
    rule: T('цена × 5 × (глубина ÷ 5 + 1), продажа ×1', 'price × 5 × (depth ÷ 5 + 1), selling ×1'),
    blocks: [rows([
      [T('купить', 'buy'), `×${s.multiplier}`],
      [T('продать', 'sell'), `×${s.sellMultiplier}`],
      [T('лавки на глубинах', 'shops on depths'), SHOP_DEPTHS.join(', ')],
      ...(s.haggle ? [[T('торговец', 'haggler'), '÷2'] as const] : []),
    ])],
    tip: s.hiddenRing ? T('Неопознанное кольцо не учтено.', 'An unidentified ring is not counted.') : T('Цена зависит от глубины, где вы торгуете, а не где нашли вещь.', 'The price goes by the depth you trade on, not where the thing was found.'),
  };
}

function keyCard(hero: Hero): Card {
  const opens: Record<string, string> = { door: T('запертая дверь своей глубины', 'the locked door of its depth'), chest: T('сундук', 'a chest'), exit: T('выход с босса', 'the boss\'s exit') };
  const names: Record<string, string> = { 'key.iron': T('железный', 'iron'), 'key.golden': T('золотой', 'golden'), 'key.skeleton': T('костяной', 'skeleton') };
  const held = keysHeld(hero);
  return {
    state: held.length ? T(`В рюкзаке: ${held.length}`, `In the pack: ${held.length}`) : T('Ключей нет', 'No keys'),
    rule: T('железный — дверь, золотой — сундук, костяной — выход босса', 'iron: a door; golden: a chest; skeleton: the boss exit'),
    blocks: [rows([
      ...KEYS.map((k) => [`${names[k.kind]}`, opens[k.opens]!] as const),
      ...held.map((k) => [T(`у вас: ${names[k.kind]}`, `yours: ${names[k.kind]}`), T(`глубина ${k.depth}${k.here ? ' (здесь)' : ''}`, `depth ${k.depth}${k.here ? ' (here)' : ''}`)] as const),
    ])],
    tip: T('Ключ открывает только на своей глубине и пропадает вместе с ней, если его оставить.', 'A key opens only on its own depth, and is lost with it if left behind.'),
  };
}

function strengthCard(hero: Hero): Card {
  const weapon = hero.weapon ? strengthEffects(hero, hero.weapon) : null;
  return {
    state: T(`Ваша сила: ${hero.str}`, `Your strength: ${hero.str}`),
    rule: T('не хватает n: точность ÷1,5ⁿ; лишняя: +0…n урона', 'short by n: accuracy ÷1.5ⁿ; spare: +0…n damage'),
    blocks: [rows([
      [T('оружие: не хватает n', 'weapon: short by n'), T('точность ÷1,5ⁿ, удар ×1,2ⁿ медленнее', 'accuracy ÷1.5ⁿ, blow ×1.2ⁿ slower')],
      [T('доспех: не хватает n', 'armour: short by n'), T('уклонение ÷1,5ⁿ, шаг ×1,3ⁿ медленнее', 'evasion ÷1.5ⁿ, step ×1.3ⁿ slower')],
      [T('лишняя сила', 'spare strength'), T('+0…n урона (кроме охотницы)', '+0…n damage (not a huntress)')],
      [T('каждое улучшение', 'each upgrade'), T('требование вещи −1', 'the thing\'s requirement −1')],
      ...(weapon ? [[T('ваше оружие', 'your weapon'), weapon.spare > 0 ? T(`+0…${weapon.spare} урона`, `+0…${weapon.spare} damage`) : weapon.short > 0 ? T(`не хватает ${weapon.short}`, `short by ${weapon.short}`) : T('в самый раз', 'just right')] as const] : []),
    ])],
    tip: T('Пока уровень вещи скрыт, требование показано для обычной вещи со знаком «?».', 'While a thing\'s level is hidden, its requirement is a plain one\'s, marked «?».'),
  };
}

export function mechCard(id: MechId, world: World, hero: Hero): Card {
  switch (id) {
    case 'hunger': return hungerCard(world, hero);
    case 'rest': return restCard(world, hero);
    case 'search': return searchCard(world, hero);
    case 'traps': return trapsCard(world, hero);
    case 'pot': return potCard(world, hero);
    case 'well': return wellCard();
    case 'shop': return shopCard(world, hero);
    case 'key': return keyCard(hero);
    default: return strengthCard(hero);
  }
}

/** The nine tiles of the Guide's «How it works»: icon, name, the rule in a line and today's figure. */
export function mechList(world: World, hero: Hero, open: (id: MechId) => void): HTMLElement {
  const grid = h('div', 'fl-mgrid');
  for (const id of MECH_IDS) {
    const card = mechCard(id, world, hero);
    grid.append(hb('fl-mcard', NAME[id], () => (audio.play('click'), open(id)), h('span', 'fl-mhead', gi(ICON[id], 16, 2), h('span', 'fl-mech-state', NAME[id])), h('span', 'pd-stat-label', card.rule), h('span', 'fl-mnow', card.state)));
  }
  return h('div', 'fl-mechs', h('p', 'fl-count-line', gi('chronicle', 16, 2), G.mech.tapCard), grid);
}

/** One card as a window, after the hunger card's pattern; `back` is where the arrow goes (the Guide). */
export function showMechanic(id: MechId, world: World, hero: Hero, back: () => void, onClose: () => void): void {
  const card = mechCard(id, world, hero);
  const head = h('div', 'fl-mech-head', gi(ICON[id], 16, 3), h('div', 'pd-titles', h('span', 'fl-mech-state', card.state), h('span', 'pd-stat-label', G.mech.sub(hero.depth))));
  const box = windowOf(
    { title: NAME[id], onClose, narrow: false, className: 'pd-info-window wide' },
    h('button', 'pd-back', G.mech.back),
    head,
    h('p', 'pd-note', card.rule),
    h('div', 'pd-info-block', ...card.blocks),
    h('p', 'fl-tip', gi('search', 16, 1.5), card.tip),
    button(t.close, back, 'quiet'),
  );
  (box.querySelector('.pd-back') as HTMLButtonElement).onclick = () => (audio.play('click'), back());
  show(box, onClose);
}


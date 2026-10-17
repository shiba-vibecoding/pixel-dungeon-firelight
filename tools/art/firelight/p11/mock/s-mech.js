// Part 11 · 4. Mechanics to «feel»: a card each, as the hunger card is — icon, state, a picture, the game's own numbers, one tip.
import { BAG, C, css, el, gi, hero, loadImg, mk, PHONE, Q, RU, scene, T, windowOn, world } from './kit.js';

const D = hero.depth;
/** A small picture made of the game's own tiles and sprites (tiles<n>.png 16 px, items.png), whole-pixel scaled. */
async function pic(cols, rows, draw, scale) {
  const c = document.createElement('canvas'); c.width = cols * 16; c.height = rows * 16;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const tiles = await loadImg('assets/tiles2.png'), items = await loadImg('assets/items.png');
  const tile = (id, x, y) => g.drawImage(tiles, (id % 16) * 16, Math.floor(id / 16) * 16, 16, 16, x * 16, y * 16, 16, 16);
  const item = (it, x, y) => { const [sx, sy] = C.spriteOffset(world, typeof it === 'string' ? mk(it) : it); g.drawImage(items, sx, sy, 16, 16, x, y, 16, 16); };
  const spr = async (src, fw, fh, col, row, x, y) => { const im = await loadImg(src); g.drawImage(im, col * fw, row * fh, fw, fh, x, y, fw, fh); };
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) tile(C.T.EMPTY, x, y);
  await draw({ g, tile, item, spr, W: cols * 16, H: rows * 16 });
  const img = el('img', 'fl-mech-pic'); img.src = c.toDataURL();
  img.style.width = `${cols * 16 * scale}px`; img.style.height = `${rows * 16 * scale}px`;
  return img;
}
const hero16 = (s) => s.spr('assets/warrior.png', 12, 15, 0, 3, 0, 0);

/* ---------- the traps of 1.9.2a, with today's numbers (depth 12, this hero) ---------- */
const hp = hero.ht, dr = C.armorStats(hero.armor).dr;
const TRAPS = [
  ['toxic', C.T.TOXIC_TRAP, T('green', 'зелёный'), T('Toxic gas', 'Ядовитый газ'), T(`a cloud of ${300 + 20 * D}; ${Math.trunc((hp + 5 + 5 * D) / 40)} damage a breath`, `облако ${300 + 20 * D}; ${Math.trunc((hp + 5 + 5 * D) / 40)} урона за вдох`)],
  ['fire', C.T.FIRE_TRAP, T('orange', 'оранжевый'), T('Fire', 'Огонь'), T(`burning 8 turns, 1–${3 + Math.trunc(D / 4)} a turn; scrolls burn`, `горение 8 ходов, 1–${3 + Math.trunc(D / 4)} в ход; свитки горят`)],
  ['paralytic', C.T.PARALYTIC_TRAP, T('yellow', 'жёлтый'), T('Paralysis', 'Паралич'), T(`gas of ${80 + 5 * D}; 5 turns still`, `газ ${80 + 5 * D}; 5 ходов без движения`)],
  ['poison', C.T.POISON_TRAP, T('violet', 'фиолетовый'), T('Poison dart', 'Отравленный дротик'), T(`poison ${4 + Math.trunc(D / 2)} turns, 1 a turn`, `яд ${4 + Math.trunc(D / 2)} ходов, по 1`)],
  ['alarm', C.T.ALARM_TRAP, T('red', 'красный'), T('Alarm', 'Тревога'), T('every monster of the level comes', 'сбегаются все монстры уровня')],
  ['lightning', C.T.LIGHTNING_TRAP, T('teal', 'бирюзовый'), T('Lightning', 'Молния'), T(`⅓–⅔ of your health: ${Math.trunc(hero.hp / 3)}–${Math.trunc(2 * hero.hp / 3)} now`, `⅓–⅔ здоровья: сейчас ${Math.trunc(hero.hp / 3)}–${Math.trunc(2 * hero.hp / 3)}`)],
  ['gripping', C.T.GRIPPING_TRAP, T('grey', 'серый'), T('Gripping', 'Капкан'), T(`up to ${D + 3} damage, less by armour (${dr})`, `до ${D + 3} урона, меньше от брони (${dr})`)],
  ['summoning', C.T.SUMMONING_TRAP, T('white', 'белый'), T('Summoning', 'Призыв'), T('1 monster, 50% a second, 50% a third', '1 монстр, 50% — второй, 50% — третий')],
];
const trapTile = async (id) => pic(1, 1, ({ tile }) => tile(id, 0, 0), 2);

export async function mechanic(v) {
  const ui = scene({ xp: 'A', dim: true });
  const kind = Q.get('m') || 'traps';
  const head = (state) => el('div', 'fl-mech-head', gi(kind === 'traps' ? 'traps' : kind, 16, 3), el('div', 'pd-titles', el('span', 'fl-mech-state', state), el('span', 'pd-stat-label', T(`depth ${D} · numbers of PD 1.9.2a`, `глубина ${D} · числа PD 1.9.2a`))));
  if (v === 'A') {
    const table = el('table', 'fl-table', el('tr', '', el('th', '', ''), el('th', '', T('trap', 'ловушка')), el('th', '', T('what it does now', 'что сделает сейчас'))));
    for (const [, id, , nm, what] of TRAPS) table.append(el('tr', '', el('td', '', await trapTile(id)), el('td', '', nm), el('td', '', what)));
    const tip = el('p', 'fl-tip', gi('search', 16, 1.5), T('A trap you have found stays shown; once it has gone off it turns black and is harmless.', 'Найденная ловушка остаётся на виду; сработавшая чернеет и больше не опасна.'));
    windowOn(ui, [head(T('Traps', 'Ловушки')), el('div', 'pd-info-block', table), el('div', 'pd-info-block', tip)], { wide: !PHONE });
  } else if (v === 'B') {
    const scale = PHONE ? 3 : 4;
    const p = await pic(7, 3, async (s) => {
      for (let x = 0; x < 7; x++) { s.tile(C.T.WALL, x, 0); }
      s.tile(C.T.FIRE_TRAP, 2, 1); s.tile(C.T.INACTIVE_TRAP, 4, 1); s.tile(C.T.EMPTY, 5, 2);
      await s.spr('assets/warrior.png', 12, 15, 0, 3, 16 * 0 + 2, 16 * 1);
      const g = s.g; g.strokeStyle = '#ffcc66'; g.setLineDash([2, 2]); g.strokeRect(16 * 4 + 0.5, 16 * 2 + 0.5, 47, 15); g.setLineDash([]);
      g.fillStyle = 'rgba(255,204,102,.15)'; g.fillRect(16 * 4, 16 * 2, 48, 16);
    }, scale);
    const steps = el('ol', 'fl-steps',
      el('li', '', el('span', '', T('Seen: its colour tells what it does — ', 'Видна — цвет говорит, что сделает: '), el('b', '', T('orange = fire', 'оранжевый = огонь')))),
      el('li', '', el('span', '', T('Black: it has gone off and is safe now.', 'Чёрная — уже сработала, безопасна.'))),
      el('li', '', el('span', '', T(`Hidden (the dotted cells): a search finds every one within 2 cells in view (2 turns); each step finds it with ${Math.round(C.awareness(hero) * 100)}% (your level ${hero.lvl}).`, `Скрытая (пунктир): поиск находит все в 2 клетках на виду (2 хода); каждый шаг — с шансом ${Math.round(C.awareness(hero) * 100)}% (ваш уровень ${hero.lvl}).`))));
    const legend = el('div', 'fl-chips mk-wrap');
    for (const [, id, col, nm] of TRAPS) legend.append(el('span', 'fl-chip', await trapTile(id), `${col} · ${nm}`));
    windowOn(ui, [head(T('Traps', 'Ловушки')), p, steps, legend], { wide: !PHONE });
  } else {
    const t = el('table', 'fl-table mk-dense', el('tr', '', el('th', '', ''), el('th', '', T('colour', 'цвет')), el('th', '', T('effect', 'эффект'))));
    for (const [, id, col, nm, what] of TRAPS) t.append(el('tr', '', el('td', '', await trapTile(id)), el('td', '', col), el('td', '', el('b', 'mk-b', nm), ` ${what}`)));
    const facts = el('table', 'fl-table mk-dense',
      el('tr', '', el('td', '', T('search', 'поиск')), el('td', 'n', T('2 turns · 2 cells', '2 хода · 2 клетки'))),
      el('tr', '', el('td', '', T('a step finds', 'шаг находит')), el('td', 'n', `${Math.round(C.awareness(hero) * 100)}%`)),
      el('tr', '', el('td', '', T('the eye grows to', 'внимательность до')), el('td', 'n', T('level 9', 'ур. 9'))),
      el('tr', '', el('td', '', T('magic mapping, a well of awareness', 'волшебная карта, колодец осознания')), el('td', 'n', T('all shown', 'все видны'))));
    windowOn(ui, [head(T('Traps · cheat sheet', 'Ловушки · шпаргалка')), t, facts], { wide: !PHONE });
  }
}

/* ---------- the book of «how it works»: every mechanic, its icon, a picture and its numbers ---------- */
function MECHS() {
  const r = C.hungerReport(world, hero);
  const price = (it) => C.buyPrice(it, D, true);
  return [
    ['hunger', T('Hunger', 'Голод'), T(`hungry at ${C.HUNGRY}, starving at ${C.STARVING}; +10 every ${r.step} turns`, `голод с ${C.HUNGRY}, истощение с ${C.STARVING}; +10 каждые ${r.step} ходов`), T(`${r.untilHungry} turns to hungry`, `${r.untilHungry} ходов до голода`),
      async (s) => { await hero16(s); s.item(BAG.ration, 22, 0); s.item(BAG.pasty, 40, 0); }],
    ['rest', T('Rest', 'Отдых'), T('1 health every 10 turns; none while starving', '1 здоровья в 10 ходов; при истощении — нет'), T(`${(hero.ht - hero.hp) * 10} turns to full`, `${(hero.ht - hero.hp) * 10} ходов до полного`),
      async (s) => { await hero16(s); s.g.fillStyle = '#ffeba4'; s.g.font = '8px monospace'; s.g.fillText('z', 18, 6); s.g.fillText('Z', 24, 3); }],
    ['search', T('Search', 'Поиск'), T('2 turns, every secret within 2 cells in view', '2 хода, все тайники в 2 клетках на виду'), T(`a step: ${Math.round(C.awareness(hero) * 100)}%`, `шаг: ${Math.round(C.awareness(hero) * 100)}%`),
      async (s) => { s.tile(C.T.WALL, 2, 0); s.tile(C.T.WALL, 3, 0); await hero16(s); }],
    ['traps', T('Traps', 'Ловушки'), T('the colour is the effect; black — gone off', 'цвет — это эффект; чёрная — сработала'), T('8 kinds', '8 видов'),
      async (s) => { s.tile(C.T.TOXIC_TRAP, 0, 0); s.tile(C.T.FIRE_TRAP, 1, 0); s.tile(C.T.PARALYTIC_TRAP, 2, 0); s.tile(C.T.INACTIVE_TRAP, 3, 0); }],
    ['pot', T('Alchemy pot', 'Котёл'), T('3 seeds; 1/N a random potion, else by the seeds', '3 семени; 1/N — случайное, иначе по семенам'), T('3 sungrass: healing 67%', '3 солнцецвета: исцеление 67%'),
      async (s) => { s.tile(C.T.ALCHEMY, 1, 0); s.item(BAG.sungrass, 0, 0); s.item('potion.healing', 34, 0); }],
    ['well', T('Wells', 'Колодцы'), T('health, awareness: one drink; transmutation: drop a thing in', 'здоровье, осознание — один глоток; превращение — бросить вещь'), T('3 kinds', '3 вида'),
      async (s) => { s.tile(C.T.WELL, 1, 0); s.tile(C.T.EMPTY_WELL, 2, 0); }],
    ['shop', T('Shops', 'Лавки'), T(`price × 5 × (depth ÷ 5 + 1): ×${5 * (Math.floor(D / 5) + 1)} here; sells at ×1`, `цена × 5 × (глубина ÷ 5 + 1): здесь ×${5 * (Math.floor(D / 5) + 1)}; продажа ×1`), T(`upgrade: ${price(mk('scroll.upgrade'))}`, `улучшение: ${price(mk('scroll.upgrade'))}`),
      async (s) => { await s.spr('assets/shopkeeper.png', 16, 16, 0, 0, 0, 0); s.tile(C.T.PEDESTAL, 2, 0); s.item('scroll.upgrade', 32, -2); }],
    ['key', T('Keys', 'Ключи'), T('iron: a locked door of its depth; golden: a chest; skeleton: the boss\'s exit', 'железный — дверь своей глубины; золотой — сундук; костяной — выход босса'), T('1 iron key (depth 12)', '1 железный (гл. 12)'),
      async (s) => { s.tile(C.T.LOCKED_DOOR, 1, 0); s.item('key.iron', 0, 0); s.tile(C.T.LOCKED_EXIT, 3, 0); s.item('key.skeleton', 32, 0); }],
    ['strength', T('Strength', 'Сила'), T('short by n: ÷1.5ⁿ accuracy; spare: +0…n damage', 'не хватает n: точность ÷1,5ⁿ; лишняя: +0…n урона'), T(`yours ${hero.str}`, `у вас ${hero.str}`),
      async (s) => { s.item(BAG.plate, 0, 0); s.item(BAG.axe, 18, 0); s.item(hero.weapon, 36, 0); }],
  ];
}
export async function mechanics(v) {
  const ui = scene({ xp: 'A', dim: true });
  const list = MECHS();
  const body = el('div', v === 'C' ? 'fl-booklist' : 'mk-mgrid');
  for (const [ic, nm, rule, now, draw] of list) {
    if (v === 'C') { body.append(el('div', 'fl-bookrow', gi(ic, 16, 2), el('div', '', el('div', 'what', nm), el('div', 'look', rule)), el('div', 'meta', now))); continue; }
    const card = el('div', 'mk-mcard', el('div', 'mk-mhead', gi(ic, 16, 2), el('span', 'fl-mech-state mk-s', nm)));
    if (v === 'B') card.append(await pic(4, 1, draw, PHONE ? 1.5 : 2));
    card.append(el('span', 'pd-stat-label', v === 'A' ? rule : ''), el('span', 'mk-now', now));
    body.append(card);
  }
  windowOn(ui, [el('p', 'fl-count-line', gi('chronicle', 16, 2), T('How it works — tap a card for the whole page', 'Как это работает — тап по карточке откроет страницу целиком')), body], { title: T('Guide', 'Памятка'), wide: !PHONE });
}
void css; void RU;

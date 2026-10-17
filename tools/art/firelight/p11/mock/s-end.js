// Part 11 · 5. The end of the run: how the hero grew, the finds, what killed him — a card worth sharing.
import { C, cap, css, el, figure, gi, hero, itemIcon, mk, name, NAME, PHONE, Q, scene, slot, START, T, windowOn, world } from './kit.js';
import { RUN, runIcon, runText } from './s-know.js';

// the run went on to depth 14: two levels more, a point of strength, the longsword +4, the plate on
Object.assign(hero, { lvl: 13, ht: 80, hp: 0, str: 16, attackSkill: 22, defenseSkill: 17, depth: 14, kills: 241 });
hero.weapon = mk('weapon.longsword', 4, { enchant: 'fire' });
hero.armor = mk('armor.plate', 2);
const CAUSE = cap(C.t.mobs.brute);
const FINDS = ['weapon.shortSword', 'potion.healing', 'ankh', 'tome.mastery', 'scroll.enchantment', 'armor.plate'];
const FIND_TXT = [T('first upgrade, d2', 'первое улучшение, гл. 2'), T('healing learned, d3', 'исцеление, гл. 3'), T('ankh, d6', 'анкх, гл. 6'), T('mastery, d10', 'мастерство, гл. 10'), T('enchanted, d11', 'зачарование, гл. 11'), T('plate, d12', 'латы, гл. 12')];
const foot = () => el('div', 'fl-end-foot', el('span', '', T('turn 9 870 · 1 512 gold · 241 slain', 'ход 9 870 · 1 512 золота · убито 241')), el('span', 'pd-stat-label', 'Pixel Dungeon: Firelight'));
const growRows = () => {
  const r = el('div', 'fl-growrow');
  const row = (ic, nm, was, is) => r.append(gi(ic, 12, 2), el('span', '', nm), el('span', 'was', was), el('span', 'arrow', '→'), el('span', 'is', is));
  row('lvl', T('level', 'уровень'), 1, hero.lvl); row('hp', T('health', 'здоровье'), START.ht, hero.ht); row('str', T('strength', 'сила'), START.str, hero.str);
  row('dr', T('armour', 'броня'), 2, C.armorStats(hero.armor).dr); row('dmg', T('best blow', 'лучший удар'), C.weaponStats(mk('weapon.shortSword')).max, C.weaponStats(hero.weapon).max);
  return r;
};
async function heroBlock(scale) {
  const fig = await figure('assets/warrior.png', 12, 15, 0, 5, scale);
  return el('div', 'fl-end-hero', el('div', 'pd-portrait mk-endp', fig), el('div', 'pd-titles',
    el('span', 'fl-end-name', NAME), el('span', 'fl-pass-sub', T('Warrior', 'Воин'), '·', gi('sigil', 16, 1.5), el('span', 'fl-sigil-tag', C.t.subclasses.gladiator)),
    el('span', 'fl-end-cause', gi('kills', 12, 1.5), T(`Killed by a ${CAUSE.toLowerCase()} · depth 14`, `${CAUSE}, глубина 14`))));
}

export async function end(v) {
  const share = Q.has('share');
  const ui = scene({ xp: 'A', dim: true, hud: !share });
  let card;
  if (v === 'A') {
    card = el('div', 'fl-endcard', await heroBlock(PHONE ? 4 : 5), growRows(),
      el('div', 'fl-best', slot(hero.weapon, { equipped: true }), el('span', 'nm', name(hero.weapon)), slot(hero.armor, { equipped: true }), el('span', 'nm', name(hero.armor))),
      el('p', 'pd-info-head', T('The finds', 'Находки')),
      el('div', 'fl-finds', ...FINDS.map((k) => el('div', 'pd-slot', itemIcon(world, mk(k))))), foot());
  } else if (v === 'B') {
    const ev = RUN.filter((e) => ['firstUpgrade', 'boss', 'mastery', 'enchant', 'bought', 'strength'].includes(e[2]));
    const rib = el('div', 'fl-ribbon');
    for (const e of ev) rib.append(el('div', `fl-rib${e[2] === 'boss' ? ' boss' : ''}`, runIcon(e), runText(e), el('span', 'when', T(`d${e[0]}`, `гл. ${e[0]}`))));
    rib.append(el('div', 'fl-rib', gi('lvl', 12, 2), T('Level 13 · strength 16', 'Уровень 13 · сила 16'), el('span', 'when', T('d14', 'гл. 14'))));
    rib.append(el('div', 'fl-rib dead', gi('kills', 12, 2), T(`Killed by a ${CAUSE.toLowerCase()}`, `Погиб: ${CAUSE.toLowerCase()}`), el('span', 'when', T('d14', 'гл. 14'))));
    card = el('div', 'fl-scroll', el('div', 'fl-chapter', T('The chronicle of the run', 'Летопись забега')), await heroBlock(PHONE ? 3 : 4), rib, foot());
  } else {
    const col = (cls, title, rows) => el('div', cls, el('h4', '', title), ...rows.map(([ic, txt]) => el('div', 'fl-best', ic, el('span', 'nm', txt))));
    const start = [[slot(mk('weapon.shortSword')), cap(C.t.items['weapon.shortSword'])], [slot(mk('armor.cloth')), cap(C.t.items['armor.cloth'])],
      [gi('hp', 12, 2), `${START.ht} ${T('health', 'здоровья')}`], [gi('str', 12, 2), `${T('strength', 'сила')} ${START.str}`], [gi('lvl', 12, 2), T('level 1', 'уровень 1')]];
    const now = [[slot(hero.weapon, { equipped: true }), name(hero.weapon)], [slot(hero.armor, { equipped: true }), name(hero.armor)],
      [gi('hp', 12, 2), `${hero.ht} ${T('health', 'здоровья')}`], [gi('str', 12, 2), `${T('strength', 'сила')} ${hero.str}`], [gi('lvl', 12, 2), T(`level ${hero.lvl}`, `уровень ${hero.lvl}`)]];
    card = el('div', 'fl-endcard', await heroBlock(PHONE ? 3 : 4), el('div', 'fl-spread', col('was', T('Set out with', 'Вышел с'), start), col('is', T('Fell with', 'Пал с'), now)),
      el('div', 'fl-finds', ...FINDS.map((k) => el('div', 'pd-slot', itemIcon(world, mk(k))))), foot());
  }
  if (share) { ui.querySelector('.mk-dim').remove(); ui.querySelector('.mk-bg').style.filter = 'brightness(.35)'; ui.append(el('div', 'mk-share', card)); return; }
  const head = el('h2', 'pd-display', T('You died', 'Вы пали'));
  const buttons = el('div', 'mk-buttons', el('button', 'pd-button primary', T('Share', 'Поделиться')), el('button', 'pd-button', T('New run', 'Новый забег')));
  windowOn(ui, [head, card, buttons], { wide: !PHONE, cls: 'pd-runend' });
  void FIND_TXT;
}
void css;

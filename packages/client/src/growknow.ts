import { createItem, itemDef, type ItemKind, ITEMS, itemSprite, type MobKind, MOBS, SCROLL_RUNES, type World } from '@pd/core';
import { audio } from './audio';
import { type GChild, h, hb, spriteNode, vars } from './growdom';
import { gi } from './growicons';
import { type ChronicleEntry, catalog, type KnowCategory, stillPossible } from './growth';
import { type Beast, cycleMark, grow, type GrowMem, hidesKind, isBeast, lookKey } from './growmem';
import { capitalize, t } from './i18n';
import { G } from './i18n-grow';
import { mobDescription } from './examine';
import { portrait } from './screens';

/*
 * The books of what the player knows (part 11, variants A): the collection of potions, scrolls, rings and wands, the bestiary and the
 * chronicle of the run. Nothing here tells what the player has not found out:
 *  - an identified kind stands in the collection by its own name, in the order of the game's list;
 *  - a look met but not yet identified (a colour, a rune, a gem, a wood) stands apart, in the order it was first seen, by its look alone;
 *    it is never set at the place of the kind it hides, which would give the kind away by position;
 *  - the rest is only counted. The elimination view (C) puts the player's own ticks and crosses against the kinds still unknown.
 */

const CATEGORIES: readonly KnowCategory[] = ['potion', 'scroll', 'ring', 'wand'];
export const KNOW_KINDS: readonly ItemKind[] = Object.keys(ITEMS) as ItemKind[];

/** The plain bottle, scroll, band and stick shown for what has not been met (items.png, as the journal's catalog does). */
const SILHOUETTE: Readonly<Record<KnowCategory, number>> = { potion: 56, scroll: 40, ring: 72, wand: 68 };
const TAB_KIND: Readonly<Record<KnowCategory, ItemKind>> = { potion: 'potion.healing', scroll: 'scroll.identify', ring: 'ring.accuracy', wand: 'wand.lightning' };

/** «Healing» for «Potion of healing»: the name without its category word, as the shelf's small label needs. */
export const shortName = (kind: ItemKind): string => t.items[kind].replace(/^(Potion|Scroll|Wand|Ring) of (the )?/, '').replace(/^(Зелье|Свиток|Палочка|Кольцо) /, '');

/** The name of a look: a colour, a rune, a gem or a wood. */
export function lookName(category: KnowCategory, label: number): string {
  switch (category) {
    case 'potion': return t.colors[label] ?? '';
    case 'scroll': return SCROLL_RUNES[label] ?? '';
    case 'ring': return t.gems[label] ?? '';
    default: return t.woods[label] ?? '';
  }
}

/** A kind's name as the player may use it: its own once the party knows it, else by its look (unknown wands and rings by their wood and gem). */
export function kindLabel(world: World, kind: ItemKind): string {
  if (!hidesKind(kind) || world.known.includes(kind)) return t.items[kind];
  const category = itemDef(kind).category as KnowCategory;
  const name = lookName(category, world.run.labels[kind] ?? 0);
  return category === 'potion' ? t.unknownPotion(name) : category === 'scroll' ? t.unknownScroll(name) : category === 'ring' ? t.unknownRing(name) : t.unknownWand(name);
}

/* ---------- 3. The collection ---------- */

export interface ShelfModel {
  category: KnowCategory;
  /** Kinds the party has identified, in the game's order. */
  known: Array<{ kind: ItemKind; sprite: number; name: string; uses: number }>;
  /** Looks met whose kind is not yet identified, in the order they were first seen. */
  met: Array<{ look: string; label: number; sprite: number; name: string; note?: string; uses: number }>;
  /** How many kinds of this category have not been met (a number, nothing more). */
  unseen: number;
  total: number;
}

/** A sprite for a look alone: any kind of the category, given the look as its label. */
function lookSprite(world: World, category: KnowCategory, label: number): number {
  const sample = KNOW_KINDS.find((kind) => itemDef(kind).category === category)!;
  return itemSprite(createItem(sample), { ...world.run.labels, [sample]: label });
}

export function shelfModel(world: World, mem: GrowMem, category: KnowCategory): ShelfModel {
  const { entries } = catalog(world, category, KNOW_KINDS);
  const known = entries.filter((e) => e.known).map((e) => ({
    kind: e.kind,
    sprite: itemSprite(createItem(e.kind), world.run.labels),
    name: shortName(e.kind),
    uses: mem.uses[lookKey(world, e.kind) ?? e.kind] ?? 0,
  }));
  // The labels of identified kinds are those of the known cells, never of the «met» ones.
  const knownLabels = new Set(entries.filter((e) => e.known).map((e) => e.label));
  const met = mem.looks
    .filter((look) => look.startsWith(`${category}:`))
    .map((look) => ({ look, label: Number(look.slice(category.length + 1)) }))
    .filter(({ label }) => !knownLabels.has(label))
    .map(({ look, label }) => ({
      look, label, sprite: lookSprite(world, category, label), name: lookName(category, label), note: mem.notes[look], uses: mem.uses[look] ?? 0,
    }));
  return { category, known, met, unseen: Math.max(0, entries.length - known.length - met.length), total: entries.length };
}

function shelfCell(cls: string, sprite: number, label: string, ...extra: GChild[]): HTMLElement {
  const slot = h('div', 'pd-slot', spriteNode(sprite), ...extra);
  return h('div', `fl-shelf-cell ${cls}`, slot, h('span', 'nm', label));
}

const usesText = (category: KnowCategory, n: number): string => (n <= 0 ? '' : category === 'potion' ? G.know.drunk(n) : category === 'scroll' ? G.know.read(n) : G.know.used(n));

export interface CollectionOptions {
  world: World;
  category: KnowCategory;
  mode: 'shelf' | 'elim';
  onCategory(category: KnowCategory): void;
  onMode(mode: 'shelf' | 'elim'): void;
  /** A tap on an identified kind: its page. */
  onKind(kind: ItemKind): void;
  /** Draws the book again (a tick was made). */
  redraw(): void;
}

function bookTabs(o: CollectionOptions): HTMLElement {
  const tabs = h('div', 'pd-tabs fl-book-tabs');
  tabs.setAttribute('role', 'tablist');
  for (const category of CATEGORIES) {
    const book = catalog(o.world, category, KNOW_KINDS);
    const tab = hb('pd-tab', G.know.categories[category]!, () => (audio.play('click'), o.onCategory(category)),
      spriteNode(itemSprite(createItem(TAB_KIND[category]), SILHOUETTE_LABELS(o.world, category))), h('small', '', `${book.known}/${book.entries.length}`));
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(category === o.category));
    tabs.append(tab);
  }
  return tabs;
}

/** Labels for a tab's picture: a plain look of the category (never the look of a kind of this run). */
const SILHOUETTE_LABELS = (world: World, category: KnowCategory): Record<string, number> => ({ ...world.run.labels, [TAB_KIND[category]]: 0 });

/** The collection (A «Showcase», and C «Elimination» as the second view). */
export function collectionView(o: CollectionOptions): HTMLElement {
  const model = shelfModel(o.world, grow.data, o.category);
  const count = h('p', 'fl-count-line', gi('catalog', 16, 2), h('span', '', G.know.known, ' ', h('b', '', `${model.known.length} / ${model.total}`)), '·', h('span', '', G.know.met, ' ', h('b', '', model.known.length + model.met.length)));
  const modes = h('div', 'fl-modes');
  for (const [id, label] of [['shelf', G.know.modeShelf], ['elim', G.know.modeElim]] as const) {
    const b = hb('fl-chip', label, () => (audio.play('click'), o.onMode(id)), label);
    b.setAttribute('aria-pressed', String(o.mode === id));
    modes.append(b);
  }
  const body = o.mode === 'elim' ? eliminationView(o, model) : shelfView(o, model);
  return h('div', 'fl-collection', bookTabs(o), count, modes, body);
}

function shelfView(o: CollectionOptions, model: ShelfModel): HTMLElement {
  const shelf = h('div', 'fl-shelf');
  for (const k of model.known) {
    const cell = shelfCell('known', k.sprite, k.name);
    cell.setAttribute('role', 'button');
    cell.tabIndex = 0;
    cell.onclick = () => (audio.play('click'), o.onKind(k.kind));
    const u = usesText(model.category, k.uses);
    if (u) cell.append(h('span', 'use', u));
    shelf.append(cell);
  }
  for (const m of model.met) {
    const cell = shelfCell(m.note ? 'guess' : '', m.sprite, m.note ?? m.name, ...(m.note ? [gi('note', 8, 2)] : []));
    cell.setAttribute('aria-label', m.name);
    const u = usesText(model.category, m.uses);
    cell.append(h('span', 'use', [m.note ? m.name : '', u].filter(Boolean).join(' · ')));
    shelf.append(cell);
  }
  for (let i = 0; i < model.unseen; i++) shelf.append(shelfCell('unseen', SILHOUETTE[model.category], G.know.unseenName));
  return shelf;
}

/** C: the looks met and not yet identified, against the kinds still unknown: the player's own ticks (✓), crosses (×) and doubts (?). */
function eliminationView(o: CollectionOptions, model: ShelfModel): HTMLElement {
  const kinds = stillPossible(o.world, o.category, KNOW_KINDS);
  if (model.met.length === 0) return h('p', 'pd-note', G.know.elimEmpty);
  const grid = vars(h('div', 'fl-elim'), { '--cols': kinds.length });
  grid.append(h('span'), ...kinds.map((kind) => h('span', 'colhead', shortName(kind))));
  for (const m of model.met) {
    grid.append(h('div', 'pd-slot mini', spriteNode(m.sprite)));
    for (const kind of kinds) {
      const mark = grow.data.marks[`${m.look}|${kind}`];
      const cell = hb(`cell ${mark ?? ''}`, `${m.name} / ${shortName(kind)}`, () => {
        audio.play('click');
        cycleMark(grow.data, m.look, kind);
        grow.touch();
        o.redraw();
      }, mark === 'x' ? '×' : mark === 'tick' ? '✓' : mark === 'q' ? '?' : '');
      grid.append(cell);
    }
  }
  return h('div', '', grid, h('p', 'fl-tip', gi('note', 8, 2), G.know.elimHelp));
}

/* ---------- the bestiary ---------- */

/** The bosses and the depths they keep (the dungeon's own, known to every player: a boss every fifth floor). */
const BOSSES: ReadonlyArray<readonly [MobKind, number]> = [['goo', 5], ['tengu', 10], ['dm300', 15], ['king', 20], ['yog', 25]];
const BOSS_KINDS = new Set<MobKind>(BOSSES.map(([kind]) => kind));

export interface BeastEntry {
  kind: MobKind;
  beast: Beast;
  boss: boolean;
}

/** The monsters met, by the depth they were first seen on, then in the game's order; with the next boss not yet met as a silhouette. */
export function bestiaryModel(mem: GrowMem): { met: BeastEntry[]; next: { kind: MobKind; depth: number } | null } {
  const order = Object.keys(MOBS) as MobKind[];
  const met = (Object.entries(mem.beasts) as Array<[MobKind, Beast]>)
    .filter(([kind, beast]) => isBeast(kind) && beast.first > 0)
    .map(([kind, beast]) => ({ kind, beast, boss: BOSS_KINDS.has(kind) }))
    .sort((a, b) => a.beast.first - b.beast.first || order.indexOf(a.kind) - order.indexOf(b.kind));
  const next = BOSSES.find(([kind]) => !mem.beasts[kind]?.first);
  return { met, next: next ? { kind: next[0], depth: next[1] } : null };
}

function facts(entry: BeastEntry): HTMLElement {
  const stats = MOBS[entry.kind];
  const rows: GChild[] = [
    h('dt', '', G.beast.firstMet), h('dd', '', G.beast.onDepth(entry.beast.first)),
    h('dt', '', G.beast.slain), h('dd', '', entry.beast.kills),
    h('dt', '', G.beast.exp), h('dd', '', G.beast.expLine(stats.exp, stats.maxLvl)),
  ];
  if (entry.beast.hit > 0) rows.push(h('dt', '', G.beast.hitYou), h('dd', '', G.beast.hitLine(entry.beast.hit)));
  return h('dl', 'fl-facts', ...rows);
}

export function bestiaryView(mem: GrowMem, picked: MobKind | null, onPick: (kind: MobKind) => void): HTMLElement {
  const { met, next } = bestiaryModel(mem);
  if (met.length === 0 && !next) return h('p', 'pd-note', G.beast.none);
  const grid = h('div', 'fl-beast-grid');
  for (const entry of met) {
    const card = hb(`fl-beast${entry.boss ? ' boss' : ''}${entry.kind === picked ? ' picked' : ''}`, capitalize(t.mobs[entry.kind]), () => (audio.play('click'), onPick(entry.kind)),
      portrait(entry.kind), h('span', 'nm', capitalize(t.mobs[entry.kind])), h('span', 'kills', `× ${entry.beast.kills}`));
    grid.append(card);
  }
  if (next) grid.append(h('div', 'fl-beast unmet boss', portrait(next.kind), h('span', 'nm', G.know.unseenName), h('span', 'kills', G.beast.unmet(next.depth))));
  const chosen = met.find((e) => e.kind === picked);
  const detail = chosen
    ? h('div', 'pd-info-block fl-beast-detail',
      h('div', 'pd-examine-head', portrait(chosen.kind), h('div', 'pd-titles', h('h3', 'pd-heading', capitalize(t.mobs[chosen.kind])))),
      h('p', 'pd-speech', mobDescription({ kind: chosen.kind } as never)),
      facts(chosen))
    : h('p', 'pd-note', G.beast.tap);
  return h('div', 'fl-bestiary', h('p', 'fl-count-line', gi('bestiary', 16, 2), G.beast.count(met.length)), grid, detail);
}

/* ---------- the chronicle ---------- */

/** What an entry of the chronicle says and shows, from what the player may know now (a kind hidden under a look is named by the look). */
export interface ChronicleLine {
  text: string;
  icon: HTMLElement;
  big: boolean;
  cls: string;
  turn: number;
  depth: number;
}

const itemKindIcon = (world: World, kind: ItemKind): HTMLElement => spriteNode(itemSprite(createItem(kind), world.run.labels));

/** What an enchantment or a glyph is called, in a word: «flaming», «of bounce»; a key it does not know stays as it is. */
export function enchantWord(value: string): string {
  const enchant = t.enchantInfo as Record<string, string>;
  const glyph = t.glyphInfo as Record<string, string>;
  if (value in enchant) return t.enchantName('', value as never, 'weapon.sword').trim().toLowerCase();
  if (value in glyph) return t.glyphName('', value as never).trim();
  return value;
}

export function chronicleLine(world: World, e: ChronicleEntry): ChronicleLine | null {
  const value = e.value;
  const base = { turn: e.turn, depth: e.depth };
  const kind = (): ItemKind => value as ItemKind;
  switch (e.kind) {
    case 'depth': return { ...base, text: G.chronicle.depth(e.depth), icon: gi('depth', 12, 2), big: false, cls: 'depth' };
    case 'level': return { ...base, text: G.chronicle.level(value as number), icon: gi('lvl', 12, 2), big: false, cls: '' };
    case 'strength': return { ...base, text: G.chronicle.strength, icon: gi('str', 12, 2), big: false, cls: '' };
    case 'firstUpgrade': return { ...base, text: G.chronicle.firstUpgrade(kindLabel(world, kind())), icon: itemKindIcon(world, kind()), big: true, cls: '' };
    case 'upgrade': return { ...base, text: G.chronicle.upgrade(kindLabel(world, kind())), icon: itemKindIcon(world, kind()), big: false, cls: '' };
    case 'enchant': return { ...base, text: G.chronicle.enchant(enchantWord(String(value))), icon: gi('enchant', 8, 2), big: true, cls: '' };
    case 'boss': return { ...base, text: G.chronicle.boss(capitalize(t.mobs[value as MobKind] ?? String(value))), icon: gi('boss', 16, 1.5), big: true, cls: 'boss' };
    case 'mastery': return { ...base, text: G.chronicle.mastery(t.subclasses[value as keyof typeof t.subclasses] ?? String(value)), icon: gi('sigil', 16, 1.5), big: true, cls: '' };
    case 'classArmor': return { ...base, text: G.chronicle.classArmor, icon: gi('sigil', 16, 1.5), big: true, cls: '' };
    case 'learned': return { ...base, text: G.chronicle.learned(kindLabel(world, kind())), icon: itemKindIcon(world, kind()), big: false, cls: '' };
    case 'ankh': return { ...base, text: G.chronicle.ankh, icon: spriteNode(itemSprite(createItem('ankh'), world.run.labels)), big: true, cls: '' };
    case 'uncurse': return { ...base, text: G.chronicle.uncurse(value as number), icon: gi('cursed', 8, 2), big: false, cls: '' };
    case 'death': return { ...base, text: G.chronicle.death(''), icon: gi('kills', 12, 2), big: true, cls: 'dead' };
    case 'victory': return { ...base, text: G.chronicle.victory, icon: gi('boss', 16, 1.5), big: true, cls: '' };
    default: return null;
  }
}

/** The chronicle as a ribbon (A): depths, and what happened on them, the big moments brighter. */
export function chronicleView(world: World, mem: GrowMem, heroLine: string): HTMLElement {
  const lines = mem.chronicle.map((e) => chronicleLine(world, e)).filter((l): l is ChronicleLine => l !== null);
  if (lines.length === 0) return h('p', 'pd-note', G.chronicle.empty);
  const ribbon = h('div', 'fl-ribbon');
  for (const line of lines) {
    ribbon.append(h('div', `fl-rib${line.big ? ' big' : ''}${line.cls ? ` ${line.cls}` : ''}`, line.icon, line.text, h('span', 'when', line.cls === 'depth' ? '' : G.chronicle.turn(line.turn))));
  }
  return h('div', 'fl-chronicle', h('p', 'fl-count-line', gi('chronicle', 16, 2), heroLine), ribbon);
}

import {
  armorStats, awareness, effectiveLevel, type Effect, type Hero, heroStr, type Item, itemDef, type ItemKind, kindKnown, levelKnown, maxExp,
  visiblyCursed, weaponStats, type World,
} from '@pd/core';

/*
 * Design part 11, «the joy of growing»: what the player SEES of the hero's growth and of the things in the pack. Nothing here
 * changes a rule (PD 1.9.2a, the core): it reads the hero, the items and the effects the core already sends, and only what the
 * player may know — an item's level once it is known (levelKnown), a curse once it shows (visiblyCursed), a kind once the party
 * has learned it (kindKnown). Pure functions, no DOM: the screens of every variant (A, B, C) read the same answers.
 */

/* ---------- 1. Levels ---------- */

/** What one level gives (combat.ts earnExp): five of health, a point of accuracy and of evasion. */
export const LEVEL_HT = 5;
/** The last level that sharpens the eye (actors.ts awareness: 1 + min(lvl, 9)); from level 10 on it stays as it is. */
export const AWARENESS_CAP = 9;
/** Experience is counted in fives: a level wants 5 + 5 × level (maxExp), so a pip is five points and there are level + 1 pips. */
export const EXP_PIP = 5;

export interface LevelGain {
  lvl: number;
  ht: number;
  attack: number;
  defense: number;
  /** The chance to notice a hidden door or trap next to the hero, before and after (null once it stops growing). */
  awareness: [number, number] | null;
}

/** What the level just reached gave, as the card of the level-up shows it (from the hero after the levelUp effect). */
export function levelGain(hero: Hero): LevelGain {
  const before = { ...hero, lvl: hero.lvl - 1 };
  return {
    lvl: hero.lvl,
    ht: LEVEL_HT,
    attack: 1,
    defense: 1,
    awareness: hero.lvl <= AWARENESS_CAP ? [awareness(before), awareness(hero)] : null,
  };
}

/** The experience bar as pips (variant C) and as a share (A, B): how many fives are full and how far the next one is. */
export function expPips(hero: Hero): { pips: number; full: number; part: number; share: number } {
  const need = maxExp(hero);
  return { pips: need / EXP_PIP, full: Math.floor(hero.exp / EXP_PIP), part: (hero.exp % EXP_PIP) / EXP_PIP, share: hero.exp / need };
}

/* ---------- 2. Strength ---------- */

export type Heft = 'fits' | 'heavy' | 'unknown';

/** A weapon's or armour's strength as the slot shows it: the known one, or the typical one with «?» while its level is hidden. */
export function strengthWanted(item: Item): { str: number; known: boolean } | null {
  const category = itemDef(item.kind).category;
  if (category !== 'weapon' && category !== 'armor') return null;
  const known = levelKnown(item);
  const shown = known ? item : { ...item, level: 0, durability: undefined, glyph: undefined };
  return { str: (category === 'weapon' ? weaponStats(shown) : armorStats(shown)).str, known };
}

/** Whether the hero can wear it without a penalty, and by how much it is too heavy (a typical figure while the level is hidden). */
export function heft(hero: Hero, item: Item): { heft: Heft; short: number } | null {
  const want = strengthWanted(item);
  if (!want) return null;
  const short = Math.max(0, want.str - heroStr(hero));
  return { heft: short > 0 ? 'heavy' : want.known ? 'fits' : 'unknown', short };
}

/**
 * The penalties of a weapon or armour too heavy by `short` points, and what spare strength gives (actors.ts): a weapon strikes
 * 1.5^n less accurately and 1.2^n slower; an armour makes its wearer 1.5^n easier to hit and 1.3^n slower; spare strength adds
 * 0..spare to a blow (not for a huntress) and, for a rogue, spare strength over the armour's goes to evasion.
 */
export function strengthEffects(hero: Hero, item: Item): {
  short: number; spare: number; accuracy?: number; delay?: number; evasion?: number; speed?: number; bonusDamage?: number; rogueEvasion?: number;
} | null {
  const want = strengthWanted(item);
  if (!want) return null;
  const str = heroStr(hero);
  const short = Math.max(0, want.str - str);
  const spare = Math.max(0, str - want.str);
  if (itemDef(item.kind).category === 'weapon') {
    return {
      short, spare,
      ...(short > 0 ? { accuracy: 1 / 1.5 ** short, delay: 1.2 ** short } : {}),
      ...(spare > 0 && hero.heroClass !== 'huntress' ? { bonusDamage: spare } : {}),
    };
  }
  return {
    short, spare,
    ...(short > 0 ? { evasion: 1 / 1.5 ** short, speed: 1.3 ** -short } : {}),
    ...(spare > 0 && hero.heroClass === 'rogue' ? { rogueEvasion: spare } : {}),
  };
}

/** The things carried that a point of strength just made light enough (red «14» turning plain): compared at strength − 1. */
export function nowLight(hero: Hero): Item[] {
  const weaker = { ...hero, str: hero.str - 1 };
  return gear(hero).filter((item) => (heft(weaker, item)?.short ?? 0) > 0 && heft(hero, item)!.short === 0);
}

/** Everything the hero carries and wears, the worn things first. */
export function gear(hero: Hero): Item[] {
  return [...(hero.weapon ? [hero.weapon] : []), ...(hero.armor ? [hero.armor] : []), ...hero.rings, ...hero.items];
}

/* ---------- 3. The marks of a bag slot ---------- */

/** The corner mark at the bottom left, one at a time, in this order: a curse matters most, then what is new, then the magic. */
export const MARK_ORDER = ['cursed', 'new', 'enchant', 'glyph', 'note'] as const;
export type Mark = (typeof MARK_ORDER)[number];

export interface SlotMarks {
  /** Top left: the level once known (+3, −2), «?» for gear whose level is still hidden; null for the rest. */
  level: { text: string; tone: 'up' | 'down' | 'unknown' } | null;
  /** Top right: the strength it wants, red when too heavy, the feather for a moment after a point of strength made it light. */
  strength: { text: string; heft: Heft; light: boolean } | null;
  /** Bottom left: the one mark (MARK_ORDER), and every mark that applies (variant B paints them all on the frame). */
  mark: Mark | null;
  marks: Mark[];
  /** The colour of the enchantment's rune (ItemSprite.Glowing), when the mark is a known enchantment. */
  enchant?: string;
}

export interface SlotContext {
  /** Kinds or items the player has not looked at since they were picked up (the client keeps this: newness.ts). */
  fresh?: boolean;
  /** The player wrote a note on it, or on its kind (notes.ts). */
  noted?: boolean;
  /** The strength just went up and this thing is among nowLight(hero). */
  light?: boolean;
}

export function slotMarks(world: World, hero: Hero, item: Item, ctx: SlotContext = {}): SlotMarks {
  const category = itemDef(item.kind).category;
  const gearLike = category === 'weapon' || category === 'armor' || category === 'wand' || category === 'ring';
  const known = levelKnown(item);
  const level = !gearLike ? null
    : !known ? { text: '?', tone: 'unknown' as const }
      : item.level === 0 ? null : { text: `${item.level > 0 ? '+' : '−'}${Math.abs(item.level)}`, tone: item.level > 0 ? 'up' as const : 'down' as const };
  const want = strengthWanted(item);
  const h = heft(hero, item);
  const marks: Mark[] = [];
  if (visiblyCursed(item)) marks.push('cursed');
  if (ctx.fresh) marks.push('new');
  if (item.enchant && kindKnown(world, item)) marks.push('enchant');
  if (item.glyph) marks.push('glyph');
  if (ctx.noted) marks.push('note');
  marks.sort((a, b) => MARK_ORDER.indexOf(a) - MARK_ORDER.indexOf(b));
  return {
    level,
    strength: want && h ? { text: want.known ? String(want.str) : `${want.str}?`, heft: h.heft, light: !!ctx.light } : null,
    mark: marks[0] ?? null,
    marks,
    ...(item.enchant ? { enchant: item.enchant } : {}),
  };
}

/* ---------- 4. Comparing with what is worn ---------- */

export interface Compare {
  kind: 'weapon' | 'armor';
  /** Damage (weapon: [min, max]) or armour ([dr, dr]) of the thing worn now and of this one; `known` false: typical figures. */
  worn: { lo: number; hi: number; str: number; known: boolean } | null;
  this: { lo: number; hi: number; str: number; known: boolean };
  /** This one wants this many points of strength more than the hero has (0: fits). */
  heavier: number;
}

export function compare(hero: Hero, item: Item): Compare | null {
  const category = itemDef(item.kind).category;
  if (category !== 'weapon' && category !== 'armor') return null;
  const figures = (it: Item): Compare['this'] => {
    const known = levelKnown(it);
    const shown = known ? it : { ...it, level: 0, durability: undefined, glyph: undefined };
    if (category === 'weapon') {
      const s = weaponStats(shown);
      return { lo: s.min, hi: s.max, str: s.str, known };
    }
    const s = armorStats(shown);
    return { lo: s.dr, hi: s.dr, str: s.str, known };
  };
  const wornItem = category === 'weapon' ? hero.weapon : hero.armor;
  const worn = wornItem && wornItem !== item && itemDef(wornItem.kind).category === category ? figures(wornItem) : null;
  const mine = figures(item);
  return { kind: category, worn, this: mine, heavier: Math.max(0, mine.str - heroStr(hero)) };
}

/* ---------- 5. Visible growth on the hero in 3D ---------- */

/** The steps of an upgrade's shine: +1..+2, +3..+5, +6..+9, +10 and more (0: nothing, a plain or unknown thing). */
export const TIER_FROM = [1, 3, 6, 10] as const;

export function shineTier(item: Item | null): 0 | 1 | 2 | 3 | 4 {
  if (!item || !levelKnown(item)) return 0;
  const level = effectiveLevel(item);
  let tier = 0;
  for (const from of TIER_FROM) if (level >= from) tier++;
  return tier as 0 | 1 | 2 | 3 | 4;
}

export interface Aura {
  weapon: 0 | 1 | 2 | 3 | 4;
  armor: 0 | 1 | 2 | 3 | 4;
  /** The enchantment's colour key (view.ts ENCHANT_COLORS) and the armour's glyph, once the party knows them. */
  enchant: string | null;
  glyph: string | null;
  /** A worn thing known to be cursed: the wisps. */
  cursed: boolean;
  /** Variant C, the ring on the floor: lit segments for the weapon (left half) and the armour (right), ten at most. */
  ring: { weapon: number; armor: number };
}

/**
 * What the 3D hero shows of his things. Another player's hero shows the same, from what the core sends of him (the level
 * once it is known): nothing about an item gives away more than its owner knows.
 */
export function auraOf(hero: Hero): Aura {
  const w = hero.weapon && itemDef(hero.weapon.kind).category === 'weapon' ? hero.weapon : null;
  const a = hero.armor;
  const lit = (item: Item | null): number => (item && levelKnown(item) ? Math.max(0, Math.min(10, effectiveLevel(item))) : 0);
  return {
    weapon: shineTier(w),
    armor: shineTier(a),
    enchant: w?.enchant ?? null,
    glyph: a?.glyph ?? null,
    cursed: [w, a, ...hero.rings].some((item) => !!item && visiblyCursed(item)),
    ring: { weapon: lit(w), armor: lit(a) },
  };
}

/* ---------- 6. The knowledge books ---------- */

export type KnowCategory = 'potion' | 'scroll' | 'ring' | 'wand';

export interface CatalogEntry {
  kind: ItemKind;
  /** The look it hides under this run (run.labels: colour, rune, gem, wood), or null for a kind with a sprite of its own. */
  label: number | null;
  known: boolean;
}

/** Every kind of a hiding category, and what the party knows of it in this run (World.known): the collection's pages. */
export function catalog(world: World, category: KnowCategory, kinds: readonly ItemKind[]): { entries: CatalogEntry[]; known: number } {
  const entries = kinds.filter((kind) => itemDef(kind).category === category).map((kind) => ({
    kind,
    label: world.run.labels[kind] ?? null,
    known: world.known.includes(kind),
  }));
  return { entries, known: entries.filter((e) => e.known).length };
}

/**
 * The kinds a look may still be (variant C's elimination grid): every kind of the category not yet known; the player's
 * crosses (ruled out) and ticks (a guess) are the client's own, kept with the notes.
 */
export function stillPossible(world: World, category: KnowCategory, kinds: readonly ItemKind[]): ItemKind[] {
  return kinds.filter((kind) => itemDef(kind).category === category && !world.known.includes(kind));
}

/* ---------- 7. The chronicle of the run ---------- */

export type ChronicleKind =
  | 'depth' | 'level' | 'strength' | 'upgrade' | 'firstUpgrade' | 'enchant' | 'boss' | 'mastery' | 'classArmor' | 'learned'
  | 'ankh' | 'uncurse' | 'death' | 'victory';

export interface ChronicleEntry {
  kind: ChronicleKind;
  depth: number;
  turn: number;
  /** What it was about: a level, an item kind, a monster, a subclass. */
  value?: string | number;
}

/**
 * One effect of the core into the chronicle (or nothing): the moments worth keeping, from what the core already sends —
 * levelUp, strength, upgraded, imbued (a scroll of enchantment), the scroll of remove curse that lifted something, bossSlain, mastered,
 * classArmor, identified, resurrected, died (this hero), victory; the depths come from the client's own descent (descent below).
 * «The first upgrade» is the first `upgraded` of the run.
 */
export function chronicleOf(effect: Effect, me: string, at: { depth: number; turn: number }, log: readonly ChronicleEntry[]): ChronicleEntry | null {
  const e = effect as Effect & { hero?: string; [k: string]: unknown };
  if ('hero' in e && e.hero !== undefined && e.hero !== me && e.type !== 'bossSlain') return null;
  const entry = (kind: ChronicleKind, value?: string | number): ChronicleEntry => ({ kind, ...at, ...(value !== undefined ? { value } : {}) });
  switch (e.type) {
    case 'levelUp': return entry('level', e.lvl as number);
    case 'strength': return entry('strength');
    case 'upgraded': return entry(log.some((x) => x.kind === 'firstUpgrade') ? 'upgrade' : 'firstUpgrade', (e.item as Item).kind);
    case 'imbued': { const item = e.item as Item; return entry('enchant', item.enchant ?? item.glyph ?? item.kind); }
    case 'scroll': return e.kind === 'removeCurse' && (e.count as number) > 0 ? entry('uncurse', e.count as number) : null;
    case 'bossSlain': return entry('boss', e.kind as string);
    case 'mastered': return entry('mastery', e.subclass as string);
    case 'classArmor': return entry('classArmor', (e.item as Item).kind);
    case 'identified': return entry('learned', e.kind as string);
    case 'resurrected': return entry('ankh');
    case 'died': return e.who === me ? entry('death', (e.by ?? e.kind) as string | undefined) : null;
    case 'victory': return entry('victory');
    default: return null;
  }
}

/** A new depth reached (the client sees the hero's depth change): written once per depth, the deepest only. */
export function descent(depth: number, turn: number, log: readonly ChronicleEntry[]): ChronicleEntry | null {
  return log.some((x) => x.kind === 'depth' && (x.value as number) >= depth) ? null : { kind: 'depth', depth, turn, value: depth };
}

/* ---------- 8. «Was → is», from the start of the run ---------- */

/**
 * The hero as far as the player may know him (as hungerinfo.ts does): a worn ring whose kind or level is still hidden is left out,
 * or the passport's accuracy and evasion would give away what the ring is and how good.
 */
export function knownHero(world: World, hero: Hero): Hero {
  return { ...hero, rings: hero.rings.filter((ring) => kindKnown(world, ring) && levelKnown(ring)) };
}

export interface Passport {
  lvl: [number, number];
  ht: [number, number];
  str: [number, number];
  attack: [number, number];
  defense: [number, number];
}

/** The hero now against the hero as the class sets out (actors.ts HERO_CLASSES and createHero: level 1, accuracy 10, evasion 5). */
export function passport(hero: Hero, start: { ht: number; str: number }): Passport {
  return {
    lvl: [1, hero.lvl],
    ht: [start.ht, hero.ht],
    str: [start.str, hero.str],
    attack: [10, hero.attackSkill],
    defense: [5, hero.defenseSkill],
  };
}

/* ---------- 9. Progress toward knowing, in segments ---------- */

/** A count toward knowing (familiar.ts) as N segments: how many are full; at most 10 segments, each a whole number of steps. */
export function segments(done: number, of: number): { n: number; full: number; per: number } {
  const n = Math.min(10, of);
  const per = Math.ceil(of / n);
  return { n: Math.ceil(of / per), full: Math.min(Math.ceil(of / per), Math.floor(done / per)), per };
}

import { type Effect, type Hero, type Item, itemDef, ITEMS, type ItemKind, levelKnown, type World } from '@pd/core';
import { lang } from './i18n';
import { mergeWith } from './cloud';

/*
 * Badges (Badges): feats remembered on this device across runs. Most are
 * earned within a run (so many monsters slain, so much gold, a boss); a few
 * gather over many runs (every class has slain Goo, every rare monster has
 * fallen). Each player earns their own, co-op or not.
 */

export type BadgeId =
  | 'slain1' | 'slain2' | 'slain3' | 'slain4' | 'gold1' | 'gold2' | 'gold3' | 'gold4' | 'level1' | 'level2' | 'level3' | 'level4'
  | 'potions' | 'scrolls' | 'rings' | 'wands' | 'allItems' | 'bags' | 'deathFire' | 'deathPoison' | 'deathGas' | 'deathHunger'
  | 'deathGlyph' | 'deathFalling' | 'yasd' | 'boss1' | 'boss2' | 'boss3' | 'boss4' | 'boss1AllClasses' | 'boss3AllSubclasses'
  | 'haggler' | 'thorns' | 'str1' | 'str2' | 'str3' | 'str4' | 'food1' | 'food2' | 'food3' | 'food4' | 'item1' | 'item2' | 'item3'
  | 'item4' | 'rare' | 'victory' | 'victoryAllClasses' | 'happyEnd' | 'combo' | 'cooked1' | 'cooked2' | 'cooked3' | 'cooked4' | 'grim' | 'piranhas'
  | 'games1' | 'games2' | 'games3' | 'games4' | 'champion';

/** Each badge's icon in badges.png, and its words. */
export const BADGES: ReadonlyArray<{ id: BadgeId; image: number; en: string; ru: string }> = [
  { id: 'slain1', image: 0, en: '10 enemies slain', ru: 'Убито 10 врагов' },
  { id: 'slain2', image: 1, en: '50 enemies slain', ru: 'Убито 50 врагов' },
  { id: 'slain3', image: 2, en: '150 enemies slain', ru: 'Убито 150 врагов' },
  { id: 'slain4', image: 3, en: '250 enemies slain', ru: 'Убито 250 врагов' },
  { id: 'gold1', image: 4, en: '100 gold collected', ru: 'Собрано 100 золота' },
  { id: 'gold2', image: 5, en: '500 gold collected', ru: 'Собрано 500 золота' },
  { id: 'gold3', image: 6, en: '2500 gold collected', ru: 'Собрано 2500 золота' },
  { id: 'gold4', image: 7, en: '7500 gold collected', ru: 'Собрано 7500 золота' },
  { id: 'level1', image: 8, en: 'Level 6 reached', ru: 'Достигнут 6-й уровень' },
  { id: 'level2', image: 9, en: 'Level 12 reached', ru: 'Достигнут 12-й уровень' },
  { id: 'level3', image: 10, en: 'Level 18 reached', ru: 'Достигнут 18-й уровень' },
  { id: 'level4', image: 11, en: 'Level 24 reached', ru: 'Достигнут 24-й уровень' },
  { id: 'boss1', image: 12, en: '1st boss slain', ru: 'Убит первый босс' },
  { id: 'boss2', image: 13, en: '2nd boss slain', ru: 'Убит второй босс' },
  { id: 'boss3', image: 14, en: '3rd boss slain', ru: 'Убит третий босс' },
  { id: 'boss4', image: 15, en: '4th boss slain', ru: 'Убит четвёртый босс' },
  { id: 'potions', image: 16, en: 'All potions identified', ru: 'Опознаны все зелья' },
  { id: 'scrolls', image: 17, en: 'All scrolls identified', ru: 'Опознаны все свитки' },
  { id: 'rings', image: 18, en: 'All rings identified', ru: 'Опознаны все кольца' },
  { id: 'wands', image: 19, en: 'All wands identified', ru: 'Опознаны все палочки' },
  { id: 'haggler', image: 20, en: 'Ring of Haggler obtained', ru: 'Получено кольцо торговца' },
  { id: 'thorns', image: 21, en: 'Ring of Thorns obtained', ru: 'Получено кольцо шипов' },
  { id: 'victory', image: 22, en: 'Amulet of Yendor obtained', ru: 'Амулет Йендора добыт' },
  { id: 'bags', image: 23, en: 'All bags bought', ru: 'Куплены все сумки' },
  { id: 'deathFire', image: 24, en: 'Death from fire', ru: 'Смерть от огня' },
  { id: 'deathPoison', image: 25, en: 'Death from poison', ru: 'Смерть от яда' },
  { id: 'deathGas', image: 26, en: 'Death from toxic gas', ru: 'Смерть от ядовитого газа' },
  { id: 'deathHunger', image: 27, en: 'Death from hunger', ru: 'Смерть от голода' },
  { id: 'grim', image: 29, en: 'Monster killed by a grim weapon', ru: 'Враг убит мрачным оружием' },
  { id: 'piranhas', image: 30, en: '6 piranhas killed', ru: 'Убито 6 пираний' },
  { id: 'boss1AllClasses', image: 32, en: '1st boss slain by Warrior, Mage, Rogue & Huntress', ru: 'Первый босс убит воином, магом, разбойником и охотницей' },
  { id: 'boss3AllSubclasses', image: 33, en: '3rd boss slain by every one of the eight ways', ru: 'Третий босс убит всеми восемью путями мастерства' },
  { id: 'yasd', image: 34, en: 'Death from fire, poison, toxic gas & hunger', ru: 'Смерть от огня, яда, газа и голода' },
  { id: 'allItems', image: 35, en: 'All potions, scrolls, rings & wands identified', ru: 'Опознаны все зелья, свитки, кольца и палочки' },
  { id: 'victoryAllClasses', image: 36, en: 'Amulet of Yendor obtained by Warrior, Mage, Rogue & Huntress', ru: 'Амулет добыт воином, магом, разбойником и охотницей' },
  { id: 'rare', image: 37, en: 'All rare monsters slain', ru: 'Убиты все редкие чудища' },
  { id: 'happyEnd', image: 38, en: 'Happy end', ru: 'Счастливый конец' },
  { id: 'str1', image: 40, en: '13 points of Strength attained', ru: 'Сила достигла 13' },
  { id: 'str2', image: 41, en: '15 points of Strength attained', ru: 'Сила достигла 15' },
  { id: 'str3', image: 42, en: '17 points of Strength attained', ru: 'Сила достигла 17' },
  { id: 'str4', image: 43, en: '19 points of Strength attained', ru: 'Сила достигла 19' },
  { id: 'food1', image: 44, en: '10 pieces of food eaten', ru: 'Съедено 10 порций еды' },
  { id: 'food2', image: 45, en: '20 pieces of food eaten', ru: 'Съедено 20 порций еды' },
  { id: 'food3', image: 46, en: '30 pieces of food eaten', ru: 'Съедено 30 порций еды' },
  { id: 'food4', image: 47, en: '40 pieces of food eaten', ru: 'Съедено 40 порций еды' },
  { id: 'item1', image: 48, en: 'Item of level 3 acquired', ru: 'Получен предмет 3-го уровня' },
  { id: 'item2', image: 49, en: 'Item of level 6 acquired', ru: 'Получен предмет 6-го уровня' },
  { id: 'item3', image: 50, en: 'Item of level 9 acquired', ru: 'Получен предмет 9-го уровня' },
  { id: 'item4', image: 51, en: 'Item of level 12 acquired', ru: 'Получен предмет 12-го уровня' },
  { id: 'cooked1', image: 52, en: '3 potions cooked', ru: 'Сварено 3 зелья' },
  { id: 'cooked2', image: 53, en: '6 potions cooked', ru: 'Сварено 6 зелий' },
  { id: 'cooked3', image: 54, en: '9 potions cooked', ru: 'Сварено 9 зелий' },
  { id: 'cooked4', image: 55, en: '12 potions cooked', ru: 'Сварено 12 зелий' },
  { id: 'combo', image: 56, en: '7-hit combo', ru: 'Серия из 7 ударов' },
  { id: 'deathGlyph', image: 57, en: 'Death from an enchantment', ru: 'Смерть от собственных чар' },
  { id: 'deathFalling', image: 59, en: 'Death from falling down', ru: 'Смерть от падения' },
  { id: 'games1', image: 60, en: '10 games played', ru: 'Сыграно 10 игр' },
  { id: 'games2', image: 61, en: '100 games played', ru: 'Сыграно 100 игр' },
  { id: 'games3', image: 62, en: '500 games played', ru: 'Сыграно 500 игр' },
  { id: 'games4', image: 63, en: '2000 games played', ru: 'Сыграно 2000 игр' },
  { id: 'champion', image: 39, en: 'Challenge won', ru: 'Испытание пройдено' },
];

export const badgeText = (id: BadgeId): string => {
  const badge = BADGES.find((b) => b.id === id)!;
  return lang === 'ru' ? badge.ru : badge.en;
};

/** What is remembered on this device. */
interface Store {
  earned: BadgeId[];
  /** Rare monster kinds slain, classes that slew Goo or won, ways that slew DM-300, deaths suffered. */
  rare: string[];
  boss1: string[];
  boss3: string[];
  victories: string[];
  deaths: string[];
  games: number;
  /** The last run counted, so a run is counted once however often it is reopened. */
  lastRun?: number;
  /** Badges already shown in the badges window; absent for stores from before it was kept. */
  seen?: BadgeId[];
}

const KEY = 'pd-badges';

function load(): Store {
  const empty: Store = { earned: [], rare: [], boss1: [], boss3: [], victories: [], deaths: [], games: 0 };
  try {
    return { ...empty, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Store>) };
  } catch {
    return empty;
  }
}

const store = load();

/** The badges' store again from the device, once the cloud's copy has been folded in (cloud.ts). */
export function reloadBadges(): void {
  Object.assign(store, load());
}

// Two devices' badges are both kept: every list joined, the count of games the larger.
mergeWith(KEY, (here, cloud) => {
  try {
    const a = { ...load(), ...(here ? (JSON.parse(here) as Partial<Store>) : {}) };
    const b = JSON.parse(cloud) as Partial<Store>;
    const join = <T>(x: T[] | undefined, y: T[] | undefined): T[] => [...new Set([...(x ?? []), ...(y ?? [])])];
    const merged: Store = {
      ...a,
      earned: join(a.earned, b.earned),
      rare: join(a.rare, b.rare),
      boss1: join(a.boss1, b.boss1),
      boss3: join(a.boss3, b.boss3),
      victories: join(a.victories, b.victories),
      deaths: join(a.deaths, b.deaths),
      games: Math.max(a.games ?? 0, b.games ?? 0),
      lastRun: Math.max(a.lastRun ?? 0, b.lastRun ?? 0) || undefined,
      seen: a.seen || b.seen ? join(a.seen, b.seen) : undefined,
    };
    return JSON.stringify(merged);
  } catch {
    return here;
  }
});

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Kept for this session only.
  }
}

export const earnedBadges = (): ReadonlySet<BadgeId> => new Set(store.earned);

/** Badges earned since the badges window was last opened: they get a golden dot. */
export const unseenBadges = (): ReadonlySet<BadgeId> => new Set(store.earned.filter((id) => !(store.seen ?? store.earned).includes(id)));

export function markBadgesSeen(): void {
  store.seen = [...store.earned];
  save();
}

const RARE_KINDS = ['albino', 'bandit', 'shielded', 'senior', 'acidic'];
const BOSSES: Readonly<Record<string, BadgeId>> = { goo: 'boss1', tengu: 'boss2', dm300: 'boss3', king: 'boss4' };
const SUBCLASSES = ['gladiator', 'berserker', 'warlock', 'battlemage', 'freerunner', 'assassin', 'sniper', 'warden'];
const CLASSES = ['warrior', 'mage', 'rogue', 'huntress'];
const DEATHS: Readonly<Record<string, BadgeId>> = {
  burning: 'deathFire', poison: 'deathPoison', gas: 'deathGas', hunger: 'deathHunger', fall: 'deathFalling',
  multiplicity: 'deathGlyph', deferred: 'deathGlyph',
};

/** Kinds that go by a label until known: every one of them known means the whole category is identified. */
const LABELLED = new Map<string, ItemKind[]>();
const labelled = (category: string): ItemKind[] => {
  if (!LABELLED.has(category)) {
    LABELLED.set(category, (Object.keys(ITEMS) as ItemKind[]).filter((kind) => itemDef(kind).category === category && itemDef(kind).sprite === undefined));
  }
  return LABELLED.get(category)!;
};

/** Games played: counts a run the first time it is seen on this device. */
export function countGame(seed: number): BadgeId[] {
  if (store.lastRun === seed) return [];
  store.lastRun = seed;
  store.games++;
  const fresh: BadgeId[] = [];
  const earn = (id: BadgeId, when: boolean): void => {
    if (when && !store.earned.includes(id)) {
      store.earned.push(id);
      fresh.push(id);
    }
  };
  earn('games1', store.games >= 10);
  earn('games2', store.games >= 100);
  earn('games3', store.games >= 500);
  earn('games4', store.games >= 2000);
  save();
  return fresh;
}

/** Looks over the hero and what just happened; returns the badges earned just now. */
export function checkBadges(world: World, me: Hero, effects: readonly Effect[]): BadgeId[] {
  const fresh: BadgeId[] = [];
  let dirty = false;
  const remember = (list: string[], value: string): void => {
    if (!list.includes(value)) {
      list.push(value);
      dirty = true;
    }
  };
  const earn = (id: BadgeId, when = true): void => {
    if (when && !store.earned.includes(id)) {
      store.earned.push(id);
      fresh.push(id);
    }
  };
  const tiers = (ids: readonly BadgeId[], value: number, steps: readonly number[]): void =>
    ids.forEach((id, i) => earn(id, value >= steps[i]!));

  tiers(['slain1', 'slain2', 'slain3', 'slain4'], me.kills, [10, 50, 150, 250]);
  tiers(['gold1', 'gold2', 'gold3', 'gold4'], me.stats?.gold ?? 0, [100, 500, 2500, 7500]);
  tiers(['level1', 'level2', 'level3', 'level4'], me.lvl, [6, 12, 18, 24]);
  tiers(['str1', 'str2', 'str3', 'str4'], me.str, [13, 15, 17, 19]);
  tiers(['food1', 'food2', 'food3', 'food4'], me.stats?.food ?? 0, [10, 20, 30, 40]);
  tiers(['cooked1', 'cooked2', 'cooked3', 'cooked4'], me.stats?.brewed ?? 0, [3, 6, 9, 12]);
  earn('piranhas', (me.stats?.piranhas ?? 0) >= 6);

  const belongings: Item[] = [...me.items, ...me.rings, me.armor, ...(me.weapon ? [me.weapon] : [])];
  // Badges.validateItemLevelAquired: only a level that is known counts.
  const best = Math.max(0, ...belongings.filter(levelKnown).map((item) => item.level));
  tiers(['item1', 'item2', 'item3', 'item4'], best, [3, 6, 9, 12]);
  earn('haggler', belongings.some((item) => item.kind === 'ring.haggler'));
  earn('thorns', belongings.some((item) => item.kind === 'ring.thorns'));
  earn('bags', ['bag.seeds', 'bag.scrolls', 'bag.wands'].every((kind) => me.items.some((item) => item.kind === kind)));

  const known = new Set(world.known);
  const all = (category: string): boolean => labelled(category).every((kind) => known.has(kind));
  earn('potions', all('potion'));
  earn('scrolls', all('scroll'));
  earn('rings', all('ring'));
  earn('wands', all('wand'));
  earn('allItems', ['potions', 'scrolls', 'rings', 'wands'].every((id) => store.earned.includes(id as BadgeId)));

  let grimAt = -1;
  for (const effect of effects) {
    if (effect.type === 'combo' && effect.hero === me.id) earn('combo', effect.count >= 7);
    if (effect.type === 'enchanted' && effect.enchant === 'death') grimAt = effect.pos;
    if (effect.type === 'died' && effect.by === me.id) {
      if (effect.pos === grimAt) earn('grim');
      if (effect.kind && RARE_KINDS.includes(effect.kind)) remember(store.rare, effect.kind);
    }
    if (effect.type === 'bossSlain' && effect.depth === me.depth && BOSSES[effect.kind]) {
      earn(BOSSES[effect.kind]!);
      if (effect.kind === 'goo') remember(store.boss1, me.heroClass);
      if (effect.kind === 'dm300' && me.subclass) remember(store.boss3, me.subclass);
    }
    // Badges.validateVictory: the Amulet in hand; and a party's win is everyone's.
    if (effect.type === 'amulet' && effect.hero === me.id) earn('victory');
    if (effect.type === 'victory') {
      earn('victory');
      // Badges.validateHappyEnd: out on the surface with it.
      earn('happyEnd', effect.ending === 'surface');
      // Badges.validateChampion: the Amulet taken with a challenge on.
      earn('champion', (world.challenges ?? 0) > 0);
      remember(store.victories, me.heroClass);
    }
    if (effect.type === 'died' && effect.who === me.id && me.killedBy) {
      const death = DEATHS[me.killedBy];
      if (death) {
        earn(death);
        remember(store.deaths, death);
      }
    }
  }
  earn('rare', RARE_KINDS.every((kind) => store.rare.includes(kind)));
  earn('boss1AllClasses', CLASSES.every((cls) => store.boss1.includes(cls)));
  earn('boss3AllSubclasses', SUBCLASSES.every((way) => store.boss3.includes(way)));
  earn('victoryAllClasses', CLASSES.every((cls) => store.victories.includes(cls)));
  earn('yasd', ['deathFire', 'deathPoison', 'deathGas', 'deathHunger'].every((id) => store.deaths.includes(id)));
  if (fresh.length > 0 || dirty) save();
  return fresh;
}

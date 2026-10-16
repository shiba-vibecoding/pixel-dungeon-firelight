import type { HeroClass } from '@pd/core';

/*
 * Pixel-Mart's catalogue: every cosmetic that is sold for Telegram Stars or earned, written once as data. The client's storefront and
 * the server's purchases, gifts and equip rules read this one file (the server imports it by path: it is pure data with no DOM, and
 * @pd/core, the rules, stays untouched). Cosmetics never touch the rules or the scoring (MONETIZATION.md).
 *
 * The things sold are the designer's (design part 5, public/assets/mart/fl/catalog.json: ids, names, art and what each is). The
 * client reads that file for the art (flart.ts); the PRICES are this file's, set by the owner (see below), and the server prices every
 * purchase from here, never from what a device says. The ids are the designer's skus (`skin.huntress.*` is the designer's
 * `skin.ranger.*`: the ranger's sheets are the huntress's). A test holds the two files together (client/test/mart.test.ts).
 *
 * Prices (Stars), steps 25 / 50 / 75 / 100 / 150 / 200 / 250 / 450: hero looks 100-250 in the designer's order, legendary looks 450,
 * the camp's fires 75-150 (the classic one is free), pets 75 or 150 (seen all the time), hats 50 or 100, trails, kill effects and
 * damage numbers 50, death effects 75 (seen once a run), quip packs 75, decorations 50-150, profile frames 50 (100 for the Sunforge),
 * titles and name colours 25 or 50, photo frames 25 or 50, the sticker pack 50, bundles 0.7 of their parts rounded down to end in 9,
 * the season pass 300. Earn-only items have no price: a season-pass level, a streak, a place on a board, a badge, the patronage.
 */

export type Category =
  | 'look' | 'campfire' | 'hat' | 'pet' | 'trail' | 'killfx' | 'deathfx' | 'numbers' | 'quips' | 'decor'
  | 'frame' | 'title' | 'namecolor' | 'photoframe' | 'sticker' | 'bundle' | 'pass';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Lang = 'ru' | 'en';

export const CATEGORIES: readonly Category[] = [
  'look', 'campfire', 'hat', 'pet', 'trail', 'killfx', 'deathfx', 'numbers', 'quips', 'decor', 'frame', 'title', 'namecolor', 'photoframe', 'sticker', 'bundle',
];
export const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];
export const HEROES: readonly HeroClass[] = ['warrior', 'mage', 'rogue', 'huntress'];

/** The prices that exist, Stars. */
export const PRICE_STEPS: readonly number[] = [25, 50, 75, 100, 150, 200, 250, 450];
/** A legendary look costs this, all of them. */
export const LEGENDARY_PRICE = 450;
/** The season pass, Stars, for a season. */
export const PASS_PRICE = 300;
/** The starter kit, Stars: sold once to an account. */
export const STARTER_PRICE = 49;

/**
 * How an earn-only item is won: a season-pass level, a streak of daily dungeons, a place among a finished board's best, a badge (the
 * server's checked runs know them), or the patronage.
 */
export type Earn =
  | { by: 'pass'; level: number; track: 'free' | 'paid' }
  | { by: 'streak'; days: number }
  | { by: 'board'; kind: 'daily' | 'week'; place: number }
  | { by: 'badge'; badge: string }
  /** Won in the competitions (the server's honours): a title of the boards, a season's frame, the Beacon fire. Never sold. */
  | { by: 'honour'; id: string }
  /** Reached a step of the weekly leagues (1 Spark ... 5 Beacon): the league's frame. */
  | { by: 'league'; tier: number }
  | { by: 'patron' };

/** Only sold between these days of the year ([month, day], inclusive, wrapping over the new year). */
export interface Season {
  from: readonly [number, number];
  to: readonly [number, number];
}
const WINTER: Season = { from: [12, 1], to: [2, 28] };

export interface Item {
  /** Unique; also what the wallet keeps. */
  id: string;
  category: Category;
  /** Price in Stars; 0 for earn-only items (and for stickers, which are sold in their pack). */
  stars: number;
  name: Readonly<Record<Lang, string>>;
  rarity: Rarity;
  /** For a hero look: whose. */
  heroClass?: HeroClass;
  /** A legendary look (also set on the other legendary things): shown with a coal frame and sold dear. */
  legendary?: boolean;
  /** Earn-only: not for sale, won by this. */
  earn?: Earn;
  /** The season pass gives it at this level of a track (besides its price, if it has one). */
  reward?: { level: number; track: 'free' | 'paid' };
  /** A bundle: the items it grants. */
  items?: readonly string[];
  /** A pack (the stickers): its parts are not sold alone, so it has no saving. */
  pack?: boolean;
  /** Sold once to an account, in whatever form (the starter kit's four classes). */
  once?: string;
  /** Only sold in this part of the year. */
  season?: Season;
  /** Colours of a placeholder (an earn-only item with no art yet): the glyph's tones, a name's colour. */
  tones?: readonly string[];
  /** The name colour shimmers through its tones. */
  shimmer?: boolean;
}

type Row = readonly [key: string, ru: string, en: string, stars: number, extra?: Season | string];

const rarityOf = (stars: number, legendary: boolean): Rarity => (legendary ? 'legendary' : stars >= 150 ? 'epic' : stars >= 75 ? 'rare' : 'common');

/* ---- What the designer drew: names in both languages, and the price (see above) ---- */

const HATS: Row[] = [
  ['straw', 'Соломенная шляпа', 'Straw Hat', 50],
  ['tricorn', 'Треуголка', 'Pirate Tricorn', 50],
  ['wizard', 'Колпак звездочёта', 'Stargazer Cap', 50],
  ['crown', 'Корона углей', 'Crown of Embers', 100],
  ['horns', 'Рогатый шлем', 'Horned Helm', 50],
  ['tophat', 'Цилиндр', 'Top Hat', 50],
  ['wreath', 'Венок', 'Flower Wreath', 50],
  ['bandana', 'Бандана', 'Bandana', 50],
  ['pompom', 'Шапка с помпоном', 'Pompom Hat', 50, WINTER],
  ['halo', 'Нимб', 'Halo', 100],
  ['eyepatch', 'Повязка на глаз', 'Eyepatch', 50],
  ['scarf', 'Огненный шарф', 'Fire Scarf', 50],
];
const PETS: Row[] = [
  ['firefly', 'Светлячок', 'Firefly', 75],
  ['rat', 'Крысёнок', 'Little Rat', 75],
  ['slime', 'Слизнячок', 'Slime', 75],
  ['bat', 'Карманная мышь', 'Pocket Bat', 150],
  ['skull', 'Весёлый череп', 'Grinning Skull', 150],
  ['ember', 'Огонёк', 'Ember Spirit', 150],
];
const TRAILS: Row[] = [
  ['embers', 'Угольки под ногами', 'Ember Steps', 50],
  ['frost', 'Иней', 'Frost Steps', 50],
  ['petals', 'Лепестки', 'Petals', 50],
  ['gold', 'Золотая пыль', 'Gold Dust', 50],
  ['shadow', 'Теневой след', 'Shadow Steps', 50],
  ['ghost', 'Призрачные следы', 'Ghost Prints', 50],
];
const KILLS: Row[] = [
  ['ember_burst', 'Взрыв углей', 'Ember Burst', 50],
  ['soul', 'Улетающая душа', 'Soul Wisp', 50],
  ['coins', 'Монетки', 'Coin Pop', 50],
  ['pillar', 'Огненный столб', 'Flame Pillar', 50],
  ['stars', 'Звёздный осколок', 'Starshatter', 50],
  ['smoke_ring', 'Кольцо дыма', 'Smoke Ring', 50],
];
const DEATHS: Row[] = [
  ['ascend', 'Вознесение', 'Ascension', 75],
  ['ash', 'Прах к праху', 'Ash to Ash', 75],
  ['ghost', 'Неупокоенный дух', 'Restless Ghost', 75],
  ['eruption', 'Последнее пламя', 'Last Flame', 75],
];
const DIGITS: Row[] = [
  ['ember', 'Огненные цифры', 'Ember Numbers', 50],
  ['frost', 'Ледяные цифры', 'Frost Numbers', 50],
  ['gold', 'Золотые цифры', 'Gold Numbers', 50],
  ['toxic', 'Ядовитые цифры', 'Toxic Numbers', 50],
];
const QUIPS: Row[] = [
  ['pirate', 'Пират', 'Pirate', 75],
  ['gopnik', 'Гопник', 'Gopnik', 75],
  ['knight', 'Рыцарь', 'Knight', 75],
  ['philosopher', 'Философ', 'Philosopher', 75],
  ['granny', 'Бабка', 'Granny', 75],
  ['robot', 'Робот', 'Robot', 75],
];
const DECOR: Row[] = [
  ['tent', 'Палатка', 'Tent', 150],
  ['banner', 'Знамя костра', 'Firelight Banner', 100],
  ['lantern', 'Фонарь', 'Lantern', 50],
  ['statue', 'Статуя героя', 'Hero Statue', 150],
  ['musicbox', 'Музыкальная шкатулка', 'Music Box', 100],
  ['chest', 'Сундук', 'Treasure Chest', 50],
  ['bedroll', 'Спальник', 'Bedroll', 50],
  ['cauldron', 'Котёл ведьмы', 'Witch Cauldron', 100],
  ['bench', 'Скамья из бревна', 'Log Bench', 50],
  ['dummy', 'Чучело для тренировки', 'Training Dummy', 50],
  ['signpost', 'Указатель', 'Signpost', 50],
  ['woodpile', 'Поленница', 'Woodpile', 50],
];
const FRAMES: Row[] = [
  ['ember', 'Угли', 'Ember', 50],
  ['frost', 'Иней', 'Frost', 50],
  ['moss', 'Мох', 'Moss', 50],
  ['bone', 'Кость', 'Bone', 50],
  ['stars', 'Звёздная ночь', 'Night Sky', 50],
  ['runes', 'Демонские руны', 'Demon Runes', 50],
  ['crystal', 'Пещерный кристалл', 'Cave Crystal', 50],
  ['sunforge', 'Солнечная кузня', 'Sunforge', 100],
];
const PHOTOS: Row[] = [
  ['polaroid', 'Моментальное фото', 'Instant Photo', 25],
  ['film', 'Плёнка', 'Film Strip', 25],
  ['dungeon', 'Камень подземелья', 'Dungeon Stone', 25],
  ['gilded', 'Позолота', 'Gilded', 50],
  ['frost', 'Изморозь', 'Frozen', 50],
  ['embers', 'Тлеющие угли', 'Glowing Coals', 50],
];
const NAMES: Row[] = [
  ['ember', 'Угольный', 'Ember', 25],
  ['gold', 'Золотой', 'Gold', 50],
  ['frost', 'Морозный', 'Frost', 25],
  ['moss', 'Моховой', 'Moss', 25],
  ['rose', 'Розовый', 'Rose', 25],
  ['violet', 'Фиалковый', 'Violet', 25],
  ['ash', 'Пепельный', 'Ash', 25],
  ['flame', 'Живое пламя', 'Living Flame', 50],
];
const FIRES: Row[] = [
  ['classic', 'Классический', 'Classic', 0],
  ['blue', 'Синее пламя', 'Blue Flame', 75],
  ['green', 'Ведьмин зелёный', 'Witch Green', 75],
  ['ghost', 'Призрачный огонь', 'Ghost Fire', 100],
  ['rainbow', 'Радужный', 'Rainbow', 150],
  ['cursed', 'Проклятый лиловый', 'Cursed Purple', 100],
  ['golden', 'Золотой', 'Golden', 150],
  ['ice', 'Ледяное пламя', 'Ice Flame', 100],
];
const TITLES: Row[] = [
  ['kindler', 'Разжигатель', 'Kindler', 25, 'common'],
  ['keeper', 'Хранитель костра', 'Keeper of the Fire', 50, 'rare'],
  ['ratking', 'Крысиный шептун', 'Rat Whisperer', 25, 'common'],
  ['deepdiver', 'Ныряльщик в глубины', 'Deep Diver', 0, 'rare'],
  ['slayer', 'Гроза Жижи', 'Goo Slayer', 0, 'common'],
  ['alchemist', 'Безумный алхимик', 'Mad Alchemist', 50, 'rare'],
  ['lucky', 'Везучий дурак', 'Lucky Fool', 25, 'common'],
  ['ghost', 'Друг призраков', 'Friend of Ghosts', 0, 'rare'],
  ['sage', 'Мудрец залов', 'Sage of the Halls', 0, 'legend'],
  ['ember', 'Душа углей', 'Ember Soul', 0, 'legend'],
  ['patron', 'Покровитель костра', 'Patron of the Fire', 0, 'legend'],
  ['first', 'Первая искра', 'First Spark', 0, 'legend'],
];
const STICKERS: Row[] = [
  ['fire', 'Огонь', 'Fire', 0],
  ['skull', 'Череп', 'Skull', 0],
  ['heart', 'Сердце', 'Heart', 0],
  ['crown', 'Корона', 'Crown', 0],
  ['star', 'Звезда', 'Star', 0],
  ['amulet', 'Амулет', 'Amulet', 0],
  ['sword', 'Меч', 'Sword', 0],
  ['potion', 'Зелье', 'Potion', 0],
  ['rat', 'Крыса', 'Rat', 0],
  ['ghost', 'Призрак', 'Ghost', 0],
  ['gg', 'GG', 'GG', 0],
  ['wow', '!?', '!?', 0],
];
/** Five looks of each class (the designer's order: dearer further down), then the class's legendary one. */
const LOOK_ROWS: Row[] = [
  ['moss', 'Моховой', 'Moss', 100],
  ['frost', 'Морозный', 'Frost', 150],
  ['ember', 'Угольный', 'Ember', 150],
  ['dusk', 'Сумеречный', 'Dusk', 200],
  ['brass', 'Латунный', 'Brass', 250],
];
const LEGENDARY: Record<HeroClass, readonly [variant: string, ru: string, en: string]> = {
  warrior: ['forgeborn', 'Рождённый в горне', 'Forgeborn'],
  mage: ['starflame', 'Звёздное пламя', 'Starflame'],
  rogue: ['smoulder', 'Тлеющая тень', 'Smouldering Shade'],
  huntress: ['wildfire', 'Лесной пожар', 'Wildfire'],
};

/** What a title or a name needs instead of a price: a badge, the patronage (the season ones come from the pass's lines). */
const TITLE_EARN: Readonly<Record<string, Earn>> = {
  deepdiver: { by: 'badge', badge: 'boss4' },
  slayer: { by: 'badge', badge: 'boss1' },
  sage: { by: 'badge', badge: 'victory' },
  patron: { by: 'patron' },
};

/**
 * The season pass's two lines, the designer's (catalog.json season.free and season.paid) with one change: level 13 of the paid line
 * gives the golden fire in place of the flame pillar, so that the paid line is worth over 1000 Stars at the shop's prices (a test
 * holds it there). Level 30 of each line is an item the shop does not sell.
 */
export const PASS_FREE: ReadonlyArray<readonly [level: number, id: string]> = [
  [1, 'sticker.fire'], [2, 'name.ember'], [4, 'trail.embers'], [6, 'sticker.skull'], [8, 'fire.green'], [10, 'title.kindler'], [12, 'quips.robot'],
  [15, 'frame.moss'], [18, 'kill.smoke_ring'], [20, 'decor.woodpile'], [24, 'digits.toxic'], [28, 'hat.wreath'], [30, 'title.ghost'],
];
export const PASS_PAID: ReadonlyArray<readonly [level: number, id: string]> = [
  [1, 'frame.sunforge'], [3, 'hat.pompom'], [5, 'pet.firefly'], [7, 'fire.ghost'], [9, 'photo.embers'], [11, 'skin.mage.frost'], [13, 'fire.golden'],
  [16, 'decor.musicbox'], [19, 'death.ascend'], [22, 'name.flame'], [25, 'title.ember'], [27, 'pet.skull'], [30, 'title.first'],
];
/** Items only the pass gives (no price): the exclusive end of each line, and the paid line's title. */
const PASS_ONLY: ReadonlySet<string> = new Set(['title.ghost', 'title.ember', 'title.first']);

function passReward(id: string): Partial<Pick<Item, 'reward' | 'earn'>> {
  for (const [track, list] of [['free', PASS_FREE], ['paid', PASS_PAID]] as const) {
    const found = list.find(([, candidate]) => candidate === id);
    if (found) return PASS_ONLY.has(id) ? { earn: { by: 'pass', level: found[0], track } } : { reward: { level: found[0], track } };
  }
  return {};
}

function make(prefix: string, category: Category, rows: readonly Row[]): Item[] {
  return rows.map(([key, ru, en, stars, more]) => {
    const id = `${prefix}.${key}`;
    const earn = category === 'title' ? TITLE_EARN[key] : undefined;
    const legend = category === 'title' && more === 'legend';
    const season = more !== undefined && typeof more !== 'string' ? more : undefined;
    return {
      id, category, stars, name: { ru, en }, rarity: legend ? 'legendary' : category === 'title' && typeof more === 'string' ? (more === 'rare' ? 'rare' : 'common') : rarityOf(stars, false),
      ...(legend ? { legendary: true } : {}), ...(earn ? { earn } : {}), ...(season ? { season } : {}), ...passReward(id),
    };
  });
}

/** Five looks and a legendary one for each class. */
const lookItems = HEROES.flatMap((heroClass): Item[] => {
  const legend = LEGENDARY[heroClass];
  const plain = LOOK_ROWS.map(([variant, ru, en, stars]): Item => {
    const id = `skin.${heroClass}.${variant}`;
    return { id, category: 'look', stars, name: { ru, en }, rarity: rarityOf(stars, false), heroClass, ...passReward(id) };
  });
  const id = `skin.${heroClass}.${legend[0]}`;
  return [...plain, { id, category: 'look', stars: LEGENDARY_PRICE, name: { ru: legend[1], en: legend[2] }, rarity: 'legendary', heroClass, legendary: true, ...passReward(id) }];
});

/** Bundles are sold at 0.7 of their parts' prices, rounded down to end in 9 (689, 359, 249). */
export function bundlePrice(parts: readonly string[], catalog: readonly Item[]): number {
  const value = parts.reduce((sum, id) => sum + (catalog.find((entry) => entry.id === id)?.stars ?? 0), 0);
  const cut = Math.floor(value * 0.7);
  return cut - ((cut + 1) % 10);
}

const base: Item[] = [
  ...lookItems,
  ...make('fire', 'campfire', FIRES),
  ...make('hat', 'hat', HATS),
  ...make('pet', 'pet', PETS),
  ...make('trail', 'trail', TRAILS),
  ...make('kill', 'killfx', KILLS),
  ...make('death', 'deathfx', DEATHS),
  ...make('digits', 'numbers', DIGITS),
  ...make('quips', 'quips', QUIPS),
  ...make('decor', 'decor', DECOR),
  ...make('frame', 'frame', FRAMES),
  ...make('title', 'title', TITLES),
  ...make('name', 'namecolor', NAMES),
  ...make('photo', 'photoframe', PHOTOS),
  ...make('sticker', 'sticker', STICKERS),

  // Earn-only, not the designer's (no art of theirs yet): a streak of daily dungeons, or a place on a board. Placeholder art.
  { id: 'title.undying', category: 'title', stars: 0, name: { ru: 'Неугасимый', en: 'Undying' }, rarity: 'rare', earn: { by: 'streak', days: 7 } },
  { id: 'trail.streak_flame', category: 'trail', stars: 0, name: { ru: 'Пламенный след', en: 'Flame trail' }, rarity: 'epic', earn: { by: 'streak', days: 14 }, tones: ['#ff5a1c'] },
  { id: 'frame.laurel', category: 'frame', stars: 0, name: { ru: 'Рамка: лавры', en: 'Frame: laurels' }, rarity: 'epic', earn: { by: 'streak', days: 30 }, tones: ['#6adf6a', '#2a5a2a'] },
  { id: 'frame.cup', category: 'frame', stars: 0, name: { ru: 'Рамка: кубок', en: 'Frame: cup' }, rarity: 'epic', earn: { by: 'board', kind: 'daily', place: 3 }, tones: ['#ffd84a', '#8a5a0a'] },
  { id: 'title.champion', category: 'title', stars: 0, name: { ru: 'Чемпион недели', en: 'Champion of the week' }, rarity: 'epic', earn: { by: 'board', kind: 'week', place: 3 } },
  // Honours of the competitions (design part 7, assets/compete): won on the boards, in a season, in a circle; never sold. The server judges them
  // (server honours.ts) and the wallet grants them from the player's record; a test holds these names to the designer's (compete.json).
  { id: 'title.swift', category: 'title', stars: 0, name: { ru: 'Скоростной', en: 'Swift' }, rarity: 'epic', earn: { by: 'honour', id: 'swift' } },
  { id: 'title.deep', category: 'title', stars: 0, name: { ru: 'Глубинный', en: 'Deep Delver' }, rarity: 'epic', earn: { by: 'honour', id: 'deep' } },
  { id: 'title.circle_champion', category: 'title', stars: 0, name: { ru: 'Чемпион круга', en: 'Circle Champion' }, rarity: 'epic', earn: { by: 'honour', id: 'circle_champion' } },
  { id: 'title.duelist', category: 'title', stars: 0, name: { ru: 'Дуэлянт', en: 'Duelist' }, rarity: 'epic', earn: { by: 'honour', id: 'duelist' } },
  { id: 'title.season_beacon', category: 'title', stars: 0, name: { ru: 'Маяк сезона', en: 'Beacon of the Season' }, rarity: 'legendary', legendary: true, earn: { by: 'honour', id: 'season_beacon' } },
  { id: 'fire.beacon', category: 'campfire', stars: 0, name: { ru: 'Маяк', en: 'Beacon' }, rarity: 'legendary', legendary: true, earn: { by: 'honour', id: 'fire.beacon' } },
  { id: 'frame.league.spark', category: 'frame', stars: 0, name: { ru: 'Рамка лиги: Искра', en: 'League frame: Spark' }, rarity: 'common', earn: { by: 'league', tier: 1 }, tones: ['#7e796e', '#33302a'] },
  { id: 'frame.league.coal', category: 'frame', stars: 0, name: { ru: 'Рамка лиги: Уголь', en: 'League frame: Coal' }, rarity: 'rare', earn: { by: 'league', tier: 2 }, tones: ['#e8441f', '#33282a'] },
  { id: 'frame.league.flame', category: 'frame', stars: 0, name: { ru: 'Рамка лиги: Пламя', en: 'League frame: Flame' }, rarity: 'rare', earn: { by: 'league', tier: 3 }, tones: ['#ff9a3a', '#7a2a0a'] },
  { id: 'frame.league.bonfire', category: 'frame', stars: 0, name: { ru: 'Рамка лиги: Костёр', en: 'League frame: Bonfire' }, rarity: 'epic', earn: { by: 'league', tier: 4 }, tones: ['#ffcc66', '#8a5a0a'] },
  { id: 'frame.league.beacon', category: 'frame', stars: 0, name: { ru: 'Рамка лиги: Маяк', en: 'League frame: Beacon' }, rarity: 'epic', earn: { by: 'league', tier: 5 }, tones: ['#e8c870', '#bff4ff'] },
  { id: 'frame.season.s1', category: 'frame', stars: 0, name: { ru: 'Рамка сезона: Угли глубин', en: 'Season frame: Embers of the Deep' }, rarity: 'epic', earn: { by: 'honour', id: 'frame.season.s1' }, tones: ['#ff9a3a', '#6e1e10'] },
  { id: 'frame.season.s2', category: 'frame', stars: 0, name: { ru: 'Рамка сезона: Иней пещер', en: 'Season frame: Frost of the Caves' }, rarity: 'epic', earn: { by: 'honour', id: 'frame.season.s2' }, tones: ['#8ad0f0', '#1a3a6a'] },
  { id: 'frame.season.s3', category: 'frame', stars: 0, name: { ru: 'Рамка сезона: Мох стоков', en: 'Season frame: Moss of the Sewers' }, rarity: 'epic', earn: { by: 'honour', id: 'frame.season.s3' }, tones: ['#8adc5a', '#163a1a'] },
  { id: 'frame.season.s4', category: 'frame', stars: 0, name: { ru: 'Рамка сезона: Тень залов', en: 'Season frame: Shadow of the Halls' }, rarity: 'epic', earn: { by: 'honour', id: 'frame.season.s4' }, tones: ['#b48aff', '#2a1250'] },
  {
    id: 'name.champion', category: 'namecolor', stars: 0, name: { ru: 'Имя чемпиона', en: 'Champion’s name' }, rarity: 'legendary', legendary: true,
    earn: { by: 'board', kind: 'week', place: 1 }, tones: ['#ffd84a', '#ffffff'], shimmer: true,
  },
];

const bundle = (id: string, ru: string, en: string, parts: readonly string[]): Item => ({
  id, category: 'bundle', stars: bundlePrice(parts, base), name: { ru, en }, rarity: 'epic', items: parts,
});

/** The starter kit: a 100 Star look of the player's class, a 75 Star fire and a 50 Star trail for 49; once to an account. */
export const STARTER_ONCE = 'starter';
const starters = HEROES.map((heroClass): Item => ({
  id: `bundle.starter.${heroClass}`, category: 'bundle', stars: STARTER_PRICE, rarity: 'rare', once: STARTER_ONCE, heroClass,
  name: { ru: 'Стартовый набор', en: 'Starter kit' }, items: [`skin.${heroClass}.moss`, 'fire.blue', 'trail.embers'],
}));

export const CATALOG: readonly Item[] = [
  ...base,
  bundle('bundle.forge', 'Набор кузнеца', 'Forge Kit', ['skin.warrior.forgeborn', 'hat.crown', 'pet.ember', 'fire.golden']),
  bundle('bundle.night', 'Ночной дозор', 'Night Watch', ['skin.rogue.dusk', 'hat.tricorn', 'pet.bat', 'trail.shadow', 'fire.cursed']),
  bundle('bundle.camp', 'Первый привал', 'First Camp', ['decor.tent', 'decor.lantern', 'decor.bench', 'fire.blue', 'frame.ember']),
  {
    id: 'stickers.pack1', category: 'bundle', stars: 50, rarity: 'common', pack: true, name: { ru: 'Набор наклеек «Глубокая ночь»', en: 'Sticker Pack: Deep Night' },
    items: STICKERS.map(([key]) => `sticker.${key}`),
  },
  ...starters,
];

const BY_ID = new Map(CATALOG.map((entry) => [entry.id, entry]));

// The season pass is one purchase a season: its item is made for the season asked about (pass.ts says which is on).
export const passSku = (season: number): string => `pass.s${season}`;
export const isPassSku = (id: string): boolean => /^pass\.s\d+$/.test(id);
export const passSeason = (id: string): number => Number(/^pass\.s(\d+)$/.exec(id)?.[1] ?? NaN);
const passItem = (id: string): Item => ({ id, category: 'pass', stars: PASS_PRICE, name: { ru: 'Пропуск сезона', en: 'Season pass' }, rarity: 'epic' });

/** An item by its id (a season pass's too). Only the catalogue's own ids: an old placeholder's is `canonical()` first. */
export function itemById(id: string): Item | undefined {
  return BY_ID.get(id) ?? (isPassSku(id) ? passItem(id) : undefined);
}


/**
 * The ids of the first, placeholder catalogue (before the designer's art came), and what each is now. Whoever bought or won one of
 * those keeps its worth: an owned or worn old id counts as the item it is mapped to (the server's wallets hold the old ids as they
 * were granted; nothing in storage is rewritten). Things the new catalogue still has under the same id are not listed.
 */
export const LEGACY: Readonly<Record<string, string>> = {
  'look.warrior.ember': 'skin.warrior.ember', 'look.warrior.frost': 'skin.warrior.frost', 'look.warrior.gilded': 'skin.warrior.brass', 'look.warrior.phoenix': 'skin.warrior.forgeborn', 'look.mage.ember': 'skin.mage.ember', 'look.mage.frost': 'skin.mage.frost', 'look.mage.gilded': 'skin.mage.brass', 'look.mage.phoenix': 'skin.mage.starflame', 'look.rogue.ember': 'skin.rogue.ember', 'look.rogue.frost': 'skin.rogue.frost', 'look.rogue.gilded': 'skin.rogue.brass', 'look.rogue.phoenix': 'skin.rogue.smoulder', 'look.huntress.ember': 'skin.huntress.ember', 'look.huntress.frost': 'skin.huntress.frost', 'look.huntress.gilded': 'skin.huntress.brass', 'look.huntress.phoenix': 'skin.huntress.wildfire',
  'fire.violet': 'fire.cursed', 'fire.soul': 'fire.ghost', 'fire.void': 'fire.golden',
  'hat.cap': 'hat.bandana',
  'pet.cat': 'pet.bat', 'pet.ghost': 'pet.skull',
  'trail.stars': 'trail.gold',
  'killfx.confetti': 'kill.coins', 'killfx.ashburst': 'kill.ember_burst', 'killfx.stars': 'kill.stars',
  'deathfx.petals': 'death.ascend', 'deathfx.ember': 'death.eruption', 'deathfx.phoenix': 'death.ash',
  'numbers.gold': 'digits.gold', 'numbers.ice': 'digits.frost', 'numbers.fire': 'digits.ember', 'numbers.rainbow': 'digits.toxic',
  'quips.noble': 'quips.knight',
  'decor.skull': 'decor.dummy', 'decor.flowers': 'decor.woodpile',
  'pframe.ember': 'frame.ember', 'pframe.ice': 'frame.frost', 'pframe.rune': 'frame.runes', 'pframe.crown': 'frame.sunforge',
  'pframe.laurel': 'frame.laurel', 'pframe.cup': 'frame.cup',
  'title.delver': 'title.kindler', 'title.pyromancer': 'title.keeper', 'title.nightwalker': 'title.alchemist', 'title.relic': 'title.lucky',
  'namecolor.crimson': 'name.ember', 'namecolor.azure': 'name.frost', 'namecolor.emerald': 'name.moss', 'namecolor.gold': 'name.gold',
  'namecolor.aurora': 'name.flame', 'namecolor.champion': 'name.champion',
  'photo.ember': 'photo.embers', 'photo.scroll': 'photo.dungeon', 'sticker.flame': 'sticker.fire',
  // The first pass's rewards.
  'trail.pass_sparks': 'trail.embers', 'numbers.pass_pale': 'digits.toxic', 'title.pass_veteran': 'title.kindler', 'decor.pass_banner': 'decor.banner',
  'namecolor.pass_ember': 'name.ember', 'hat.pass_hood': 'hat.bandana', 'pframe.pass_bronze': 'frame.moss', 'killfx.pass_glow': 'kill.smoke_ring',
  'deathfx.pass_smoke': 'death.ash', 'fire.pass_season': 'fire.golden', 'hat.pass_wreath': 'hat.wreath', 'sticker.pass_medal': 'sticker.star',
  'trail.pass_leaves': 'trail.petals', 'title.pass_vanguard': 'title.keeper', 'numbers.pass_royal': 'digits.gold', 'decor.pass_brazier': 'decor.cauldron',
  'pet.pass_moth': 'pet.bat', 'killfx.pass_flare': 'kill.pillar', 'namecolor.pass_dusk': 'name.violet', 'pframe.pass_gold': 'frame.sunforge',
  'deathfx.pass_wisp': 'death.ghost', 'look.warrior.pass_season': 'skin.warrior.forgeborn',
};

/** An id as the catalogue knows it now: an old placeholder's, or the same. */
export const canonical = (id: string): string => LEGACY[id] ?? id;

/** What every player has: the classic campfire. Never bought, never earned, and worn when nothing else is. */
export const DEFAULT_OWNED: readonly string[] = ['fire.classic'];

/** Won, not sold. */
export const earnOnly = (entry: Item): boolean => entry.earn !== undefined;

/** Sold for Stars: priced, not earn-only. */
export const forSale = (entry: Item): boolean => entry.stars > 0 && !earnOnly(entry);

/** Whether an item is in season on a day (UTC), by its own season if it has one. */
export function inSeason(entry: Item, now: number): boolean {
  if (!entry.season) return true;
  const date = new Date(now);
  const day = (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
  const from = entry.season.from[0] * 100 + entry.season.from[1];
  const to = entry.season.to[0] * 100 + entry.season.to[1];
  return from <= to ? day >= from && day <= to : day >= from || day <= to;
}

/** What a bundle's parts cost apart (a pack's parts are not sold alone: nothing). */
export const bundleValue = (entry: Item): number => (entry.pack ? 0 : (entry.items ?? []).reduce((sum, id) => sum + (BY_ID.get(id)?.stars ?? 0), 0));

/** Every item a purchase of this id puts in the wallet: the item, or a bundle's parts. */
export function grantedBy(id: string): string[] {
  // A sku of the first catalogue (a gift waiting in the mail, a payment arriving late) grants what it became.
  const entry = itemById(canonical(id));
  if (!entry) return [];
  return entry.items ? [...entry.items] : [entry.id];
}

export const itemName = (entry: Item, lang: Lang): string => entry.name[lang];

export const RARITY_RANK: Readonly<Record<Rarity, number>> = { common: 0, rare: 1, epic: 2, legendary: 3 };

/** The designer's sku of an item: the huntress's things are the ranger's there. */
export const artSku = (id: string): string => id.replace('.huntress.', '.ranger.');

/* ---- What is worn ---- */

/** Where an item is worn: one slot of its own, or (decor) the set. */
export type Slot = `look.${HeroClass}` | 'hat' | 'pet' | 'trail' | 'killfx' | 'deathfx' | 'numbers' | 'quips' | 'campfire' | 'frame' | 'title' | 'namecolor' | 'photoframe';
export const SLOTS: readonly Slot[] = [
  'look.warrior', 'look.mage', 'look.rogue', 'look.huntress',
  'hat', 'pet', 'trail', 'killfx', 'deathfx', 'numbers', 'quips', 'campfire', 'frame', 'title', 'namecolor', 'photoframe',
];
/** The most decorations that stand in the camp at once. */
export const DECOR_MAX = 4;

/** The slot an item is worn in, or null for what is not worn (decor has its set; stickers, bundles and the pass are not worn). */
export function slotOf(entry: Item): Slot | null {
  switch (entry.category) {
    case 'look': return entry.heroClass ? `look.${entry.heroClass}` : null;
    case 'hat': case 'pet': case 'trail': case 'killfx': case 'deathfx': case 'numbers': case 'quips': case 'title': case 'namecolor': case 'photoframe':
      return entry.category;
    case 'campfire': return 'campfire';
    case 'frame': return 'frame';
    default: return null;
  }
}

/** What a player wears. */
export interface Equipped {
  slots: Partial<Record<Slot, string>>;
  decor: string[];
}

export const emptyEquipped = (): Equipped => ({ slots: {}, decor: [] });

/** A stored or received equip state, cleaned up: only known items in their own slots. */
export function cleanEquipped(raw: unknown): Equipped {
  const out = emptyEquipped();
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as { slots?: unknown; decor?: unknown };
  if (typeof r.slots === 'object' && r.slots !== null) {
    for (const slot of SLOTS) {
      const id = (r.slots as Record<string, unknown>)[slot];
      const entry = typeof id === 'string' ? itemById(canonical(id)) : undefined;
      if (entry && slotOf(entry) === slot) out.slots[slot] = entry.id;
    }
  }
  if (Array.isArray(r.decor)) {
    for (const id of r.decor) {
      const entry = typeof id === 'string' ? itemById(canonical(id)) : undefined;
      if (entry?.category === 'decor' && !out.decor.includes(entry.id) && out.decor.length < DECOR_MAX) out.decor.push(entry.id);
    }
  }
  return out;
}

/* ---- Validation (run by the tests, and by anyone who edits the data) ---- */

/** The prices a sold item of a category may have, Stars (a legendary one costs LEGENDARY_PRICE; bundles have their own rule). */
export const PRICE_RANGE: Readonly<Partial<Record<Category, readonly [number, number]>>> = {
  look: [100, 250], campfire: [75, 150], hat: [50, 100], pet: [75, 150], trail: [50, 50], killfx: [50, 50], deathfx: [75, 75],
  numbers: [50, 50], quips: [75, 75], decor: [50, 150], frame: [50, 100], title: [25, 50], namecolor: [25, 50], photoframe: [25, 50],
};
export const LEGENDARY_MIN = LEGENDARY_PRICE;

/** What every id of a category starts with. */
export const ID_PREFIX: Readonly<Record<Category, string>> = {
  look: 'skin.', campfire: 'fire.', hat: 'hat.', pet: 'pet.', trail: 'trail.', killfx: 'kill.', deathfx: 'death.', numbers: 'digits.', quips: 'quips.',
  decor: 'decor.', frame: 'frame.', title: 'title.', namecolor: 'name.', photoframe: 'photo.', sticker: 'sticker.', bundle: '', pass: 'pass.',
};

/** What is wrong with a catalogue: an empty list is a good one. */
export function validateCatalog(catalog: readonly Item[] = CATALOG): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const priceOf = (id: string): number => catalog.find((candidate) => candidate.id === id)?.stars ?? 0;
  for (const entry of catalog) {
    const at = entry.id;
    if (!/^[a-z]+(\.[a-z0-9_]+)+$/.test(entry.id)) problems.push(`${at}: odd id`);
    if (seen.has(entry.id)) problems.push(`${at}: duplicate id`);
    seen.add(entry.id);
    if (!entry.id.startsWith(ID_PREFIX[entry.category])) problems.push(`${at}: id does not match category ${entry.category}`);
    if (entry.category === 'bundle' && !/^(bundle|stickers)\./.test(entry.id)) problems.push(`${at}: a bundle's id starts with bundle. or stickers.`);
    if (!entry.name.ru.trim() || !entry.name.en.trim()) problems.push(`${at}: missing name`);
    if (!RARITIES.includes(entry.rarity)) problems.push(`${at}: bad rarity`);
    if (!Number.isInteger(entry.stars) || entry.stars < 0) problems.push(`${at}: bad price`);
    if (entry.stars > 0 && !PRICE_STEPS.includes(entry.stars) && !(entry.category === 'bundle' && entry.stars % 10 === 9)) problems.push(`${at}: price ${entry.stars} is not a step`);
    if (entry.category === 'look' && !entry.heroClass) problems.push(`${at}: a look needs a class`);
    if (entry.legendary && entry.rarity !== 'legendary') problems.push(`${at}: legendary flag without legendary rarity`);
    if (entry.rarity === 'legendary' && !entry.legendary) problems.push(`${at}: legendary rarity without the flag`);
    if (entry.earn) {
      if (entry.stars !== 0) problems.push(`${at}: earn-only items are free`);
      if (entry.items) problems.push(`${at}: a bundle cannot be earned`);
    } else if (entry.category === 'bundle') {
      const parts = entry.items ?? [];
      if (parts.length < 2) problems.push(`${at}: a bundle needs two items or more`);
      for (const part of parts) {
        const found = catalog.find((candidate) => candidate.id === part);
        if (!found) problems.push(`${at}: unknown part ${part}`);
        else if (found.category === 'bundle') problems.push(`${at}: nested bundle ${part}`);
        else if (found.earn) problems.push(`${at}: earn-only part ${part}`);
      }
      if (new Set(parts).size !== parts.length) problems.push(`${at}: a part twice`);
      if (!entry.pack && !entry.once) {
        const value = parts.reduce((sum, part) => sum + priceOf(part), 0);
        if (entry.stars <= 0 || entry.stars >= value) problems.push(`${at}: a bundle must cost less than its parts (${entry.stars} against ${value})`);
        if (entry.stars !== bundlePrice(parts, catalog)) problems.push(`${at}: a bundle costs 0.7 of its parts, rounded down to end in 9 (${bundlePrice(parts, catalog)})`);
      }
      if (entry.pack && entry.stars !== 50) problems.push(`${at}: the sticker pack costs 50`);
      if (entry.once && entry.stars !== STARTER_PRICE) problems.push(`${at}: the starter kit costs ${STARTER_PRICE}`);
    } else if (entry.category === 'sticker') {
      if (entry.stars !== 0) problems.push(`${at}: a sticker is sold in its pack, not alone`);
    } else if (DEFAULT_OWNED.includes(entry.id)) {
      if (entry.stars !== 0) problems.push(`${at}: what everyone has is free`);
    } else {
      if (entry.stars <= 0) problems.push(`${at}: for sale at no price`);
      if (entry.rarity === 'legendary') {
        if (entry.stars !== LEGENDARY_PRICE) problems.push(`${at}: a legendary costs ${LEGENDARY_PRICE}`);
      } else {
        const range = PRICE_RANGE[entry.category];
        if (range && (entry.stars < range[0] || entry.stars > range[1])) problems.push(`${at}: price ${entry.stars} outside ${range[0]}-${range[1]}`);
      }
    }
    if (entry.category !== 'bundle' && entry.items) problems.push(`${at}: only bundles hold items`);
    if (entry.category === 'look' && entry.heroClass && !HEROES.includes(entry.heroClass)) problems.push(`${at}: unknown class`);
  }
  return problems;
}

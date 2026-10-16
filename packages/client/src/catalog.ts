import type { HeroClass } from '@pd/core';

/*
 * Pixel-Mart's catalogue (the expanded shop): every cosmetic that is sold for Telegram Stars or earned, written once as data.
 * The client's storefront and the server's purchases, gifts and equip rules read this one file (the server imports it by path:
 * it is pure data with no DOM, and @pd/core, the rules, stays untouched). Cosmetics never touch the rules or the scoring
 * (MONETIZATION.md).
 *
 * Art is a placeholder for now: an item's `asset` is where its real picture will be (public/assets/shop/<asset>.png), `tones`
 * are the colours the placeholder is tinted and drawn with, and ART lists the assets that really exist. When the designer's
 * sheets arrive only this data and the asset files change.
 *
 * Prices (Stars): small things 25–50, looks 100–250, legendary 500 and up, bundles below the sum of their parts. Earn-only
 * items have no price: a season-pass level, a streak or a place on a board gives them (see EARN, and pass.ts for the pass).
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

/** How an earn-only item is won: a season-pass level, a streak of daily dungeons, a place among a finished board's best. */
export type Earn =
  | { by: 'pass'; level: number; track: 'free' | 'paid' }
  | { by: 'streak'; days: number }
  | { by: 'board'; kind: 'daily' | 'week'; place: number };

export interface Item {
  /** Unique; also what the wallet keeps. */
  id: string;
  category: Category;
  /** Price in Stars; 0 for earn-only items. */
  stars: number;
  name: Readonly<Record<Lang, string>>;
  /** Where the real art goes (public/assets/shop/<asset>.png); see ART. */
  asset: string;
  rarity: Rarity;
  /** For a hero look: whose. */
  heroClass?: HeroClass;
  /** A legendary look (also set on the other legendary things): shown with a gold frame and sold dear. */
  legendary?: boolean;
  /** Earn-only: not for sale, won by this. */
  earn?: Earn;
  /** A bundle: the items it grants. */
  items?: readonly string[];
  /** Colours of the placeholder and of what the item does: a look's tint, a campfire's flame and sparks, a name's colour. */
  tones?: readonly string[];
  /** The name colour or number style shimmers through its tones. */
  shimmer?: boolean;
}

const item = (
  id: string, category: Category, stars: number, ru: string, en: string, rarity: Rarity, extra: Partial<Item> = {},
): Item => ({ id, category, stars, name: { ru, en }, asset: id.replace('.', '/'), rarity, ...extra });

const earned = (id: string, category: Category, ru: string, en: string, rarity: Rarity, earn: Earn, extra: Partial<Item> = {}): Item =>
  item(id, category, 0, ru, en, rarity, { earn, ...extra });

const CLASS_NAMES: Record<HeroClass, Record<Lang, string>> = {
  warrior: { ru: 'Воин', en: 'Warrior' },
  mage: { ru: 'Маг', en: 'Mage' },
  rogue: { ru: 'Разбойник', en: 'Rogue' },
  huntress: { ru: 'Охотница', en: 'Huntress' },
};

/** The looks of each class: a tint over the class's own sprite until the recoloured sheets are drawn. */
const LOOKS: ReadonlyArray<readonly [variant: string, ru: string, en: string, rarity: Rarity, stars: number, tone: string]> = [
  ['ember', 'Угольный', 'Ember', 'rare', 100, '#e8641e'],
  ['frost', 'Ледяной', 'Frost', 'rare', 150, '#5fb4f0'],
  ['gilded', 'Золочёный', 'Gilded', 'epic', 250, '#e8c34a'],
  ['phoenix', 'Феникс', 'Phoenix', 'legendary', 500, '#ff4a1c'],
];

const lookItems = HEROES.flatMap((heroClass): Item[] =>
  LOOKS.map(([variant, ru, en, rarity, stars, tone]) =>
    item(`look.${heroClass}.${variant}`, 'look', stars, `${CLASS_NAMES[heroClass].ru}: ${ru}`, `${CLASS_NAMES[heroClass].en}: ${en}`, rarity, {
      heroClass, tones: [tone], ...(rarity === 'legendary' ? { legendary: true } : {}),
    }),
  ),
);

/** The three looks of a class together, cheaper than apart. */
const lookBundles = HEROES.map((heroClass): Item =>
  item(`bundle.looks.${heroClass}`, 'bundle', 349, `Три облика: ${CLASS_NAMES[heroClass].ru}`, `Three looks: ${CLASS_NAMES[heroClass].en}`, 'epic', {
    heroClass, items: ['ember', 'frost', 'gilded'].map((variant) => `look.${heroClass}.${variant}`),
  }),
);

export const CATALOG: readonly Item[] = [
  ...lookItems,
  // Campfire styles: the flame's tint, then the sparks' colours (hot, warm, cool).
  item('fire.blue', 'campfire', 50, 'Синий костёр', 'Blue fire', 'rare', { tones: ['#5aa8ff', '#e8f6ff', '#9fd0ff', '#4a78d8'] }),
  item('fire.green', 'campfire', 50, 'Зелёный костёр', 'Green fire', 'rare', { tones: ['#55d27a', '#f0ffe0', '#a8f0a0', '#3c9a5a'] }),
  item('fire.violet', 'campfire', 75, 'Лиловый костёр', 'Violet fire', 'epic', { tones: ['#b078ff', '#fbeaff', '#d8a8ff', '#7a4ad8'] }),
  item('fire.soul', 'campfire', 100, 'Костёр душ', 'Soulfire', 'epic', { tones: ['#46e0d0', '#f0ffff', '#9af4ec', '#2a8f98'] }),
  item('fire.void', 'campfire', 500, 'Костёр бездны', 'Voidfire', 'legendary', { tones: ['#7a3cff', '#ffffff', '#c9a0ff', '#2a1a6a'], legendary: true }),
  // Hats.
  item('hat.cap', 'hat', 25, 'Колпак', 'Cap', 'common', { tones: ['#c0392b'] }),
  item('hat.horns', 'hat', 40, 'Рога', 'Horns', 'rare', { tones: ['#d8d0b8'] }),
  item('hat.wizard', 'hat', 50, 'Колдовской колпак', 'Wizard hat', 'rare', { tones: ['#4a5ad8'] }),
  item('hat.crown', 'hat', 50, 'Корона', 'Crown', 'epic', { tones: ['#e8c34a'] }),
  item('hat.halo', 'hat', 500, 'Нимб', 'Halo', 'legendary', { tones: ['#fff3b0'], legendary: true }),
  // Pets, who walk after the hero.
  item('pet.rat', 'pet', 100, 'Ручная крыса', 'Pet rat', 'rare', { tones: ['#8a7a68'] }),
  item('pet.firefly', 'pet', 100, 'Светлячок', 'Firefly', 'rare', { tones: ['#d8ff8a'] }),
  item('pet.cat', 'pet', 150, 'Подвальный кот', 'Cellar cat', 'epic', { tones: ['#4a4a52'] }),
  item('pet.ghost', 'pet', 500, 'Призрачный друг', 'Ghost friend', 'legendary', { tones: ['#cfe8ff'], legendary: true }),
  // Footstep trails.
  item('trail.embers', 'trail', 50, 'Тлеющий след', 'Ember trail', 'rare', { tones: ['#ff9a3a'] }),
  item('trail.petals', 'trail', 50, 'След из лепестков', 'Petal trail', 'rare', { tones: ['#f08ab0'] }),
  item('trail.frost', 'trail', 50, 'Морозный след', 'Frost trail', 'rare', { tones: ['#bfe3ff'] }),
  item('trail.stars', 'trail', 500, 'Звёздный след', 'Stardust trail', 'legendary', { tones: ['#fff3b0'], legendary: true }),
  // Kill and death effects.
  item('killfx.confetti', 'killfx', 50, 'Конфетти', 'Confetti', 'rare', { tones: ['#f0c040'] }),
  item('killfx.ashburst', 'killfx', 50, 'Пепельный взрыв', 'Ash burst', 'rare', { tones: ['#8a8a8a'] }),
  item('killfx.stars', 'killfx', 40, 'Звёздочки', 'Stars', 'common', { tones: ['#fff3b0'] }),
  item('deathfx.petals', 'deathfx', 50, 'Лепестки', 'Petals', 'rare', { tones: ['#f08ab0'] }),
  item('deathfx.ember', 'deathfx', 50, 'Угли', 'Embers', 'rare', { tones: ['#ff9a3a'] }),
  item('deathfx.phoenix', 'deathfx', 500, 'Возрождение', 'Rebirth', 'legendary', { tones: ['#ff4a1c'], legendary: true }),
  // Damage-number styles.
  item('numbers.gold', 'numbers', 25, 'Золотые числа', 'Gold numbers', 'common', { tones: ['#e8c34a'] }),
  item('numbers.ice', 'numbers', 25, 'Ледяные числа', 'Ice numbers', 'common', { tones: ['#9fd0ff'] }),
  item('numbers.fire', 'numbers', 50, 'Огненные числа', 'Fire numbers', 'rare', { tones: ['#ff7a2a', '#ffd060'], shimmer: true }),
  item('numbers.rainbow', 'numbers', 50, 'Радужные числа', 'Rainbow numbers', 'epic', { tones: ['#ff5a5a', '#ffd060', '#6adf6a', '#5aa8ff', '#b078ff'], shimmer: true }),
  // Quip packs: another set of lines for the hero (quip-packs.ts).
  item('quips.pirate', 'quips', 50, 'Реплики: пират', 'Quips: pirate', 'rare', { tones: ['#d8a050'] }),
  item('quips.noble', 'quips', 50, 'Реплики: аристократ', 'Quips: noble', 'rare', { tones: ['#b078ff'] }),
  // Camp decorations (a set of up to DECOR_MAX stands round the fire).
  item('decor.lantern', 'decor', 25, 'Фонарь', 'Lantern', 'common', { tones: ['#ffb050'] }),
  item('decor.banner', 'decor', 25, 'Знамя', 'Banner', 'common', { tones: ['#c0392b'] }),
  item('decor.skull', 'decor', 25, 'Череп на колу', 'Skull on a pole', 'common', { tones: ['#d8d0b8'] }),
  item('decor.flowers', 'decor', 25, 'Цветы', 'Flowers', 'common', { tones: ['#f08ab0'] }),
  item('decor.tent', 'decor', 50, 'Палатка', 'Tent', 'rare', { tones: ['#8a6a48'] }),
  item('decor.statue', 'decor', 50, 'Статуя', 'Statue', 'rare', { tones: ['#9a9a9a'] }),
  // Profile frames (the portrait in the player's card and on the boards).
  item('pframe.ember', 'frame', 50, 'Рамка: угли', 'Frame: embers', 'rare', { tones: ['#ff7a2a', '#7a2a0a'] }),
  item('pframe.ice', 'frame', 50, 'Рамка: лёд', 'Frame: ice', 'rare', { tones: ['#bfe3ff', '#3a6ea8'] }),
  item('pframe.rune', 'frame', 75, 'Рамка: руны', 'Frame: runes', 'epic', { tones: ['#b078ff', '#3a1a6a'] }),
  item('pframe.crown', 'frame', 500, 'Рамка: корона', 'Frame: crown', 'legendary', { tones: ['#ffd84a', '#8a5a0a'], legendary: true }),
  // Titles under the name.
  item('title.delver', 'title', 25, 'Спелеолог', 'Delver', 'common'),
  item('title.pyromancer', 'title', 25, 'Пиромант', 'Pyromancer', 'common'),
  item('title.nightwalker', 'title', 50, 'Ночной странник', 'Nightwalker', 'rare'),
  item('title.relic', 'title', 50, 'Реликвия подземелья', 'Relic of the dungeon', 'epic'),
  // Name colours.
  item('namecolor.crimson', 'namecolor', 25, 'Алое имя', 'Crimson name', 'common', { tones: ['#e0483a'] }),
  item('namecolor.azure', 'namecolor', 25, 'Лазурное имя', 'Azure name', 'common', { tones: ['#4aa8f0'] }),
  item('namecolor.emerald', 'namecolor', 25, 'Изумрудное имя', 'Emerald name', 'common', { tones: ['#3cc26a'] }),
  item('namecolor.gold', 'namecolor', 50, 'Золотое имя', 'Gold name', 'rare', { tones: ['#ffd84a'] }),
  item('namecolor.aurora', 'namecolor', 500, 'Имя-северное сияние', 'Aurora name', 'legendary', { tones: ['#5affc8', '#5aa8ff', '#b078ff'], shimmer: true, legendary: true }),
  // Photo mode: frames and stickers.
  item('photo.ember', 'photoframe', 25, 'Рамка кадра: угли', 'Photo frame: embers', 'common', { tones: ['#ff9a3a'] }),
  item('photo.scroll', 'photoframe', 25, 'Рамка кадра: свиток', 'Photo frame: scroll', 'common', { tones: ['#d8c8a0'] }),
  item('photo.film', 'photoframe', 50, 'Рамка кадра: плёнка', 'Photo frame: film', 'rare', { tones: ['#2a2a2a'] }),
  item('sticker.flame', 'sticker', 25, 'Наклейка: пламя', 'Sticker: flame', 'common', { tones: ['#ff7a2a'] }),
  item('sticker.skull', 'sticker', 25, 'Наклейка: череп', 'Sticker: skull', 'common', { tones: ['#d8d0b8'] }),
  item('sticker.star', 'sticker', 25, 'Наклейка: звезда', 'Sticker: star', 'common', { tones: ['#ffd84a'] }),
  item('sticker.crown', 'sticker', 50, 'Наклейка: корона', 'Sticker: crown', 'rare', { tones: ['#e8c34a'] }),

  // Earn-only: from the season pass (pass.ts lists the levels), a streak of daily dungeons, or a place on a board.
  earned('trail.pass_sparks', 'trail', 'Искристый след', 'Spark trail', 'common', { by: 'pass', level: 3, track: 'free' }, { tones: ['#fff3b0'] }),
  earned('numbers.pass_pale', 'numbers', 'Бледные числа', 'Pale numbers', 'common', { by: 'pass', level: 6, track: 'free' }, { tones: ['#d8e0ea'] }),
  earned('title.pass_veteran', 'title', 'Ветеран сезона', 'Veteran of the season', 'rare', { by: 'pass', level: 9, track: 'free' }),
  earned('decor.pass_banner', 'decor', 'Знамя сезона', 'Season banner', 'rare', { by: 'pass', level: 12, track: 'free' }, { tones: ['#e8c34a'] }),
  earned('namecolor.pass_ember', 'namecolor', 'Имя цвета углей', 'Ember-coloured name', 'rare', { by: 'pass', level: 15, track: 'free' }, { tones: ['#ff7a2a'] }),
  earned('hat.pass_hood', 'hat', 'Капюшон сезона', 'Season hood', 'rare', { by: 'pass', level: 18, track: 'free' }, { tones: ['#4a4a62'] }),
  earned('pframe.pass_bronze', 'frame', 'Рамка сезона', 'Season frame', 'rare', { by: 'pass', level: 21, track: 'free' }, { tones: ['#c88a4a', '#5a3a1a'] }),
  earned('killfx.pass_glow', 'killfx', 'Сияние', 'Glow', 'rare', { by: 'pass', level: 24, track: 'free' }, { tones: ['#fff3b0'] }),
  earned('deathfx.pass_smoke', 'deathfx', 'Дымок', 'Smoke', 'rare', { by: 'pass', level: 27, track: 'free' }, { tones: ['#9a9a9a'] }),
  earned('fire.pass_season', 'campfire', 'Костёр сезона', 'Season fire', 'epic', { by: 'pass', level: 30, track: 'free' }, { tones: ['#ffcf3a', '#ffffff', '#ffe28a', '#e8641e'] }),

  earned('hat.pass_wreath', 'hat', 'Лавровый венок', 'Laurel wreath', 'rare', { by: 'pass', level: 1, track: 'paid' }, { tones: ['#6adf6a'] }),
  earned('sticker.pass_medal', 'sticker', 'Наклейка: медаль', 'Sticker: medal', 'rare', { by: 'pass', level: 4, track: 'paid' }, { tones: ['#e8c34a'] }),
  earned('trail.pass_leaves', 'trail', 'Осенний след', 'Autumn trail', 'rare', { by: 'pass', level: 5, track: 'paid' }, { tones: ['#d8682a'] }),
  earned('title.pass_vanguard', 'title', 'Авангард', 'Vanguard', 'epic', { by: 'pass', level: 8, track: 'paid' }),
  earned('numbers.pass_royal', 'numbers', 'Королевские числа', 'Royal numbers', 'epic', { by: 'pass', level: 10, track: 'paid' }, { tones: ['#b078ff', '#ffd84a'], shimmer: true }),
  earned('decor.pass_brazier', 'decor', 'Жаровня', 'Brazier', 'epic', { by: 'pass', level: 13, track: 'paid' }, { tones: ['#ff9a3a'] }),
  earned('pet.pass_moth', 'pet', 'Ночная бабочка', 'Night moth', 'epic', { by: 'pass', level: 16, track: 'paid' }, { tones: ['#c8c8e8'] }),
  earned('killfx.pass_flare', 'killfx', 'Вспышка', 'Flare', 'epic', { by: 'pass', level: 19, track: 'paid' }, { tones: ['#fff3b0'] }),
  earned('namecolor.pass_dusk', 'namecolor', 'Имя цвета заката', 'Dusk-coloured name', 'epic', { by: 'pass', level: 22, track: 'paid' }, { tones: ['#ff7ab0', '#b078ff'], shimmer: true }),
  earned('pframe.pass_gold', 'frame', 'Золотая рамка сезона', 'Golden season frame', 'epic', { by: 'pass', level: 25, track: 'paid' }, { tones: ['#ffd84a', '#8a5a0a'] }),
  earned('deathfx.pass_wisp', 'deathfx', 'Огонёк', 'Wisp', 'epic', { by: 'pass', level: 28, track: 'paid' }, { tones: ['#9af4ec'] }),
  earned('look.warrior.pass_season', 'look', 'Воин: Сезонный', 'Warrior: Seasonal', 'legendary', { by: 'pass', level: 30, track: 'paid' }, { heroClass: 'warrior', tones: ['#e8c34a'], legendary: true }),

  earned('title.undying', 'title', 'Неугасимый', 'Undying', 'rare', { by: 'streak', days: 7 }),
  earned('trail.streak_flame', 'trail', 'Пламенный след', 'Flame trail', 'epic', { by: 'streak', days: 14 }, { tones: ['#ff5a1c'] }),
  earned('pframe.laurel', 'frame', 'Рамка: лавры', 'Frame: laurels', 'epic', { by: 'streak', days: 30 }, { tones: ['#6adf6a', '#2a5a2a'] }),
  earned('pframe.cup', 'frame', 'Рамка: кубок', 'Frame: cup', 'epic', { by: 'board', kind: 'daily', place: 3 }, { tones: ['#ffd84a', '#8a5a0a'] }),
  earned('title.champion', 'title', 'Чемпион недели', 'Champion of the week', 'epic', { by: 'board', kind: 'week', place: 3 }),
  earned('namecolor.champion', 'namecolor', 'Имя чемпиона', 'Champion’s name', 'legendary', { by: 'board', kind: 'week', place: 1 }, { tones: ['#ffd84a', '#ffffff'], shimmer: true, legendary: true }),

  // Bundles.
  item('bundle.starter', 'bundle', 99, 'Набор новичка', 'Starter set', 'rare', { items: ['hat.cap', 'fire.blue', 'trail.embers', 'namecolor.gold'] }),
  item('bundle.pyro', 'bundle', 199, 'Набор пироманта', 'Pyromancer set', 'epic', {
    items: ['fire.violet', 'killfx.ashburst', 'deathfx.ember', 'trail.embers', 'title.pyromancer', 'hat.horns'],
  }),
  item('bundle.photo', 'bundle', 99, 'Набор фотографа', 'Photographer set', 'rare', {
    items: ['photo.ember', 'photo.scroll', 'photo.film', 'sticker.flame', 'sticker.skull', 'sticker.star', 'sticker.crown'],
  }),
  item('bundle.camp', 'bundle', 99, 'Набор уюта', 'Cosy camp set', 'rare', { items: ['decor.lantern', 'decor.banner', 'decor.skull', 'decor.flowers', 'decor.tent', 'decor.statue'] }),
  ...lookBundles,
];

const BY_ID = new Map(CATALOG.map((entry) => [entry.id, entry]));

// The season pass is one purchase a season: its item is made for the season asked about (pass.ts says which is on).
export const PASS_PRICE = 299;
export const passSku = (season: number): string => `pass.s${season}`;
export const isPassSku = (id: string): boolean => /^pass\.s\d+$/.test(id);
export const passSeason = (id: string): number => Number(/^pass\.s(\d+)$/.exec(id)?.[1] ?? NaN);
const passItem = (id: string): Item => ({ id, category: 'pass', stars: PASS_PRICE, name: { ru: 'Пропуск сезона', en: 'Season pass' }, asset: 'pass/season', rarity: 'epic' });

/** An item by its id (a season pass's too). */
export function itemById(id: string): Item | undefined {
  return BY_ID.get(id) ?? (isPassSku(id) ? passItem(id) : undefined);
}

/** Won, not sold. */
export const earnOnly = (entry: Item): boolean => entry.earn !== undefined;

/** Sold for Stars: priced, not earn-only. */
export const forSale = (entry: Item): boolean => entry.stars > 0 && !earnOnly(entry);

/** What a bundle's parts cost apart. */
export const bundleValue = (bundle: Item): number => (bundle.items ?? []).reduce((sum, id) => sum + (BY_ID.get(id)?.stars ?? 0), 0);

/** Every item a purchase of this id puts in the wallet: the item, or a bundle's parts. */
export function grantedBy(id: string): string[] {
  const entry = itemById(id);
  if (!entry) return [];
  return entry.items ? [...entry.items] : [id];
}

export const itemName = (entry: Item, lang: Lang): string => entry.name[lang];

export const RARITY_RANK: Readonly<Record<Rarity, number>> = { common: 0, rare: 1, epic: 2, legendary: 3 };

/** Assets whose real art exists (public/assets/shop/<asset>.png); the rest are drawn as placeholders. Empty until the sheets arrive. */
export const ART: ReadonlySet<string> = new Set<string>();

/* ---- What is worn ---- */

/** Where an item is worn: one slot of its own, or (decor) the set. */
export type Slot = `look.${HeroClass}` | 'hat' | 'pet' | 'trail' | 'killfx' | 'deathfx' | 'numbers' | 'quips' | 'campfire' | 'frame' | 'title' | 'namecolor';
export const SLOTS: readonly Slot[] = [
  'look.warrior', 'look.mage', 'look.rogue', 'look.huntress',
  'hat', 'pet', 'trail', 'killfx', 'deathfx', 'numbers', 'quips', 'campfire', 'frame', 'title', 'namecolor',
];
/** The most decorations that stand in the camp at once. */
export const DECOR_MAX = 4;

/** The slot an item is worn in, or null for what is not worn (decor has its set; photo things, bundles and the pass are not worn). */
export function slotOf(entry: Item): Slot | null {
  switch (entry.category) {
    case 'look': return entry.heroClass ? `look.${entry.heroClass}` : null;
    case 'hat': case 'pet': case 'trail': case 'killfx': case 'deathfx': case 'numbers': case 'quips': case 'title': case 'namecolor':
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
      const entry = typeof id === 'string' ? itemById(id) : undefined;
      if (entry && slotOf(entry) === slot) out.slots[slot] = entry.id;
    }
  }
  if (Array.isArray(r.decor)) {
    for (const id of r.decor) {
      const entry = typeof id === 'string' ? itemById(id) : undefined;
      if (entry?.category === 'decor' && !out.decor.includes(entry.id) && out.decor.length < DECOR_MAX) out.decor.push(entry.id);
    }
  }
  return out;
}

/* ---- Validation (run by the tests, and by anyone who edits the data) ---- */

/** Price bounds in Stars of what is sold and not legendary or a bundle, by category. */
export const PRICE_RANGE: Readonly<Partial<Record<Category, readonly [number, number]>>> = {
  look: [100, 250], campfire: [50, 100], hat: [25, 50], pet: [100, 150], trail: [25, 50], killfx: [25, 50], deathfx: [25, 50],
  numbers: [25, 50], quips: [25, 50], decor: [25, 50], frame: [50, 100], title: [25, 50], namecolor: [25, 50], photoframe: [25, 50], sticker: [25, 50],
};
export const LEGENDARY_MIN = 500;

/** What every id of a category starts with. */
export const ID_PREFIX: Readonly<Record<Category, string>> = {
  look: 'look.', campfire: 'fire.', hat: 'hat.', pet: 'pet.', trail: 'trail.', killfx: 'killfx.', deathfx: 'deathfx.', numbers: 'numbers.', quips: 'quips.',
  decor: 'decor.', frame: 'pframe.', title: 'title.', namecolor: 'namecolor.', photoframe: 'photo.', sticker: 'sticker.', bundle: 'bundle.', pass: 'pass.',
};

/** What is wrong with a catalogue: an empty list is a good one. */
export function validateCatalog(catalog: readonly Item[] = CATALOG): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const entry of catalog) {
    const at = entry.id;
    if (!/^[a-z]+(\.[a-z0-9_]+)+$/.test(entry.id)) problems.push(`${at}: odd id`);
    if (seen.has(entry.id)) problems.push(`${at}: duplicate id`);
    seen.add(entry.id);
    if (!entry.id.startsWith(ID_PREFIX[entry.category])) problems.push(`${at}: id does not match category ${entry.category}`);
    if (!entry.name.ru.trim() || !entry.name.en.trim()) problems.push(`${at}: missing name`);
    if (!entry.asset) problems.push(`${at}: missing asset`);
    if (!RARITIES.includes(entry.rarity)) problems.push(`${at}: bad rarity`);
    if (!Number.isInteger(entry.stars) || entry.stars < 0) problems.push(`${at}: bad price`);
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
      const value = parts.reduce((sum, part) => sum + (catalog.find((candidate) => candidate.id === part)?.stars ?? 0), 0);
      if (entry.stars <= 0 || entry.stars >= value) problems.push(`${at}: a bundle must cost less than its parts (${entry.stars} against ${value})`);
    } else {
      if (entry.stars <= 0) problems.push(`${at}: for sale at no price`);
      if (entry.rarity === 'legendary') {
        if (entry.stars < LEGENDARY_MIN) problems.push(`${at}: legendary below ${LEGENDARY_MIN}`);
      } else {
        const range = PRICE_RANGE[entry.category];
        if (range && (entry.stars < range[0] || entry.stars > range[1])) problems.push(`${at}: price ${entry.stars} outside ${range[0]}–${range[1]}`);
      }
    }
    if (entry.category !== 'bundle' && entry.items) problems.push(`${at}: only bundles hold items`);
    if (entry.category === 'look' && entry.heroClass && !HEROES.includes(entry.heroClass)) problems.push(`${at}: unknown class`);
  }
  return problems;
}

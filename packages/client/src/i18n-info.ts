import { lang } from './i18n';
import { plural } from './i18n-util';

/*
 * The words of the information windows: the hunger icon's card, the progress toward knowing an item, the alchemy pot's odds.
 * Russian and English side by side, as the photo mode's are (i18n-photo.ts).
 */

export interface Words {
  hunger: {
    title: string;
    state: { fed: string; hungry: string; starving: string };
    /** «Hunger 140 of 360», and where the two lines are drawn. */
    level: (hunger: number, max: number) => string;
    thresholds: (hungry: number, starving: number) => string;
    fedLine: (untilHungry: number | null, untilStarving: number | null) => string;
    hungryLine: (untilStarving: number | null) => string;
    starvingLine: string;
    meaning: Record<'fed' | 'hungry' | 'starving', (everyTurns: number) => string>;
    food: (turns: number | null) => string;
    noFood: string;
    foodItem: (name: string, qty: number, energy: number) => string;
    rates: string;
    rate: (perTurn: number) => string;
    rogue: (step: number) => string;
    ring: (level: number, perTurn: number) => string;
    hiddenRing: string;
    /** On a food's own card. */
    waste: (n: number) => string;
    wasteHeals: string;
    wasteCharges: string;
    close: string;
  };
  know: {
    label: string;
    hits: (done: number, of: number) => string;
    taken: (done: number, of: number) => string;
    zaps: (done: number, of: number) => string;
    turns: (done: number, of: number) => string;
    idle: Record<'hits' | 'taken' | 'turns', string>;
  };
}

const ruTurns = (n: number): string => `${n} ${plural(n, 'ход', 'хода', 'ходов')}`;
const enTurns = (n: number): string => `${n} ${n === 1 ? 'turn' : 'turns'}`;
/** A rate or a number with at most two decimals, the decimal sign of the language. */
const ruNum = (n: number): string => String(+n.toFixed(2)).replace('.', ',');
const enNum = (n: number): string => String(+n.toFixed(2));

const RU: Words = {
  hunger: {
    title: 'Голод',
    state: { fed: 'Вы сыты', hungry: 'Вы голодны', starving: 'Вы истощены' },
    level: (h, max) => `Голод ${Math.round(h)} из ${max}`,
    thresholds: (a, b) => `Голод с ${a}, истощение с ${b}`,
    fedLine: (a, b) => `До голода: ${a === null ? 'не наступит' : ruTurns(a)} · до истощения: ${b === null ? 'не наступит' : ruTurns(b)}`,
    hungryLine: (b) => `Голоден · до истощения: ${b === null ? 'не наступит' : ruTurns(b)}`,
    starvingLine: 'Истощён',
    meaning: {
      fed: () => 'Пока ничего не мешает. Голод отнимает силы только при истощении.',
      hungry: () => 'Пока ничего не отнимает, но до истощения недалеко. Поешьте.',
      starving: (every) => `Здоровье не восстанавливается, а примерно раз в ${ruTurns(every)} вы теряете 1. Любая еда это прекращает.`,
    },
    food: (n) => (n === null ? 'Еды в рюкзаке: хватит надолго' : `Еды в рюкзаке: на ${ruTurns(n)}`),
    noFood: 'Еды в рюкзаке нет',
    foodItem: (name, qty, energy) => `${name}${qty > 1 ? ` ×${qty}` : ''}: по ${energy}`,
    rates: 'Скорость голода',
    rate: (p) => `${ruNum(p)} за ход`,
    rogue: (step) => `Разбойник голодает медленнее: 1 за ${ruNum(step)} хода`,
    ring: (level, p) => `Кольцо сытости ${level > 0 ? '+' : ''}${level}: ${ruNum(p)} за ход`,
    hiddenRing: 'На вас неопознанное кольцо: его влияние в расчёт не входит.',
    waste: (n) => `Съедите сейчас — пропадёт ${n} сытости`,
    wasteHeals: 'Зато еда вас подлечит.',
    wasteCharges: 'Зато еда подзарядит палочки.',
    close: 'Закрыть',
  },
  know: {
    label: 'Опознание',
    hits: (d, o) => `${d} из ${o} ударов`,
    taken: (d, o) => `${d} из ${o} полученных ударов`,
    zaps: (d, o) => `${d} из ${o} применений`,
    turns: (d, o) => `${d} из ${o} ходов в носке`,
    idle: {
      hits: 'Счёт идёт, пока оружие в руке.',
      taken: 'Счёт идёт, пока броня надета.',
      turns: 'Счёт идёт, пока кольцо надето.',
    },
  },
};

const EN: Words = {
  hunger: {
    title: 'Hunger',
    state: { fed: 'You are fed', hungry: 'You are hungry', starving: 'You are starving' },
    level: (h, max) => `Hunger ${Math.round(h)} of ${max}`,
    thresholds: (a, b) => `Hungry from ${a}, starving from ${b}`,
    fedLine: (a, b) => `Until hungry: ${a === null ? 'never' : enTurns(a)} · until starving: ${b === null ? 'never' : enTurns(b)}`,
    hungryLine: (b) => `Hungry · until starving: ${b === null ? 'never' : enTurns(b)}`,
    starvingLine: 'Starving',
    meaning: {
      fed: () => 'Nothing is wrong yet. Hunger only costs you anything once you starve.',
      hungry: () => 'It costs nothing yet, but starving is not far off. Eat.',
      starving: (every) => `Health does not come back, and about every ${enTurns(every)} you lose 1. Any food ends it.`,
    },
    food: (n) => (n === null ? 'Food in the pack: lasts a long time' : `Food in the pack: ${enTurns(n)} worth`),
    noFood: 'No food in the pack',
    foodItem: (name, qty, energy) => `${name}${qty > 1 ? ` ×${qty}` : ''}: ${energy} each`,
    rates: 'How fast hunger grows',
    rate: (p) => `${enNum(p)} a turn`,
    rogue: (step) => `A rogue goes hungry more slowly: 1 per ${enNum(step)} turns`,
    ring: (level, p) => `Ring of Satiety ${level > 0 ? '+' : ''}${level}: ${enNum(p)} a turn`,
    hiddenRing: 'You wear an unidentified ring: it is not counted in these figures.',
    waste: (n) => `Eat now and ${n} of its satiety is wasted`,
    wasteHeals: 'But it will heal you.',
    wasteCharges: 'But it will charge your wands.',
    close: 'Close',
  },
  know: {
    label: 'Identifying',
    hits: (d, o) => `${d} of ${o} hits`,
    taken: (d, o) => `${d} of ${o} hits taken`,
    zaps: (d, o) => `${d} of ${o} uses`,
    turns: (d, o) => `${d} of ${o} turns worn`,
    idle: {
      hits: 'It counts while the weapon is in your hand.',
      taken: 'It counts while the armour is worn.',
      turns: 'It counts while the ring is worn.',
    },
  },
};

export const I: Words = lang === 'ru' ? RU : EN;
/** Both languages, for the tests. */
export const WORDS = { ru: RU, en: EN } as const;

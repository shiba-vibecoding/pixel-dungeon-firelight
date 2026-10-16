import type { HeroClass } from '@pd/core';
import { CATALOG, HEROES, type Item } from '../src/catalog';
import type { BoardEntry, BoardSlice, BoardView, Profile } from '../src/checked';

/*
 * A made-up crowd for looking at the competitions' screens without a server (dev/compete.html): the same shape of data the server sends
 * (BoardEntry with its `w`), made from a seed so that every look is the same. Not part of the game.
 */

const rng = (seed: number): (() => number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let a = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  a = (a + Math.imul(a ^ (a >>> 7), 61 | a)) ^ a;
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
};

const NAMES = {
  en: ['Sasha', 'Mira', 'Timur', 'Lena', 'Oleg', 'Nika', 'Dan', 'Vera', 'Gleb', 'Ira', 'Max', 'Yana', 'Artem', 'Zoe', 'Lev', 'Kate', 'Roma', 'Ula', 'Fedor', 'Polina', 'Egor', 'Lisa', 'Ivan', 'Asya', 'Mark', 'Dina', 'Pavel', 'Sonya', 'Ilya', 'Tom'],
  ru: ['Саша', 'Мира', 'Тимур', 'Лена', 'Олег', 'Ника', 'Дэн', 'Вера', 'Глеб', 'Ира', 'Макс', 'Яна', 'Артём', 'Зоя', 'Лев', 'Катя', 'Рома', 'Уля', 'Фёдор', 'Полина', 'Егор', 'Лиза', 'Иван', 'Ася', 'Марк', 'Дина', 'Павел', 'Соня', 'Илья', 'Том'],
};

const of = (category: Item['category']): Item[] => CATALOG.filter((item) => item.category === category && item.stars > 0 && !item.earn);
const pick = <T,>(list: readonly T[], random: () => number): T => list[Math.floor(random() * list.length)]!;

export const MY_NAME = { en: 'Kirill', ru: 'Кирилл' };

/** One player of the crowd, by number: a hero of some class dressed from the shop's things (every fifth wears nothing). */
export function person(i: number, ru: boolean): BoardEntry {
  const random = rng(i * 7919 + 13);
  const heroClass = HEROES[Math.floor(random() * 4)] as HeroClass;
  const bare = i % 5 === 4;
  const depth = 5 + Math.floor(random() * 21);
  const level = Math.min(30, 6 + Math.floor(depth * 0.9));
  const turns = 1800 + Math.floor(random() * depth * 380);
  const won = depth === 26 && random() > 0.5;
  const gold = Math.floor(random() * 4000);
  const w: NonNullable<BoardEntry['w']> = {};
  if (!bare) {
    const looks = of('look').filter((item) => item.heroClass === heroClass);
    if (random() > 0.35) w.l = pick(looks, random).id;
    if (random() > 0.4) w.h = pick(of('hat'), random).id;
    if (random() > 0.5) w.p = pick(of('pet'), random).id;
    if (random() > 0.3) w.f = pick(of('campfire'), random).id;
    if (random() > 0.5) w.fr = pick(of('frame'), random).id;
    if (random() > 0.6) w.nc = pick(of('namecolor'), random).id;
    if (random() > 0.55) w.tt = pick(of('title'), random).id;
  }
  const list = NAMES[ru ? 'ru' : 'en'];
  return {
    id: `p${i.toString(16).padStart(16, '0')}`, name: list[i % list.length]!, heroClass, score: (gold + level * depth * 100) * (won ? 2 : 1), depth, level, gold, won,
    turns, at: i, ...(Object.keys(w).length > 0 ? { w } : {}), ...(i % 11 === 3 ? { patron: true } : {}),
  };
}

/** A board of `played` players of a day, week or all time, ranked by the slice; the player is the one at `mine` (1-based). */
export function board(kind: string, slice: BoardSlice | undefined, ru: boolean, played = 1284, mine = 37): BoardView {
  const k = kind === 'week' ? 1.35 : kind === 'all' ? 2.1 : 1;
  const crowd = Array.from({ length: 100 }, (_, i) => {
    const p = person(i + (kind === 'week' ? 200 : kind === 'all' ? 400 : 0), ru);
    return { ...p, score: Math.round((p.score * k) / 10) * 10 };
  });
  const metric = slice?.metric ?? 'score';
  let list = crowd.filter((p) => !slice?.cls || p.heroClass === slice.cls);
  if (metric === 'speed') list = list.filter((p) => p.depth >= 5 && p.turns !== undefined).sort((a, b) => a.turns! / a.depth - b.turns! / b.depth);
  else if (metric === 'depth') list = list.sort((a, b) => b.depth - a.depth || a.turns! - b.turns!);
  else list = list.sort((a, b) => b.score - a.score);
  // The first three are the best, as a board's first three read.
  const me: BoardEntry = {
    id: 'me', name: MY_NAME[ru ? 'ru' : 'en'], heroClass: 'mage', score: 10500, depth: 17, level: 19, gold: 1200, won: false, turns: 4120, at: 1,
    w: { l: 'skin.mage.frost', h: 'hat.wizard', p: 'pet.firefly', f: 'fire.blue', fr: 'frame.runes', nc: 'name.gold' },
  };
  const top = list.slice(0, metric === 'score' && !slice?.cls ? 100 : 50);
  return { name: `${kind}:fake`, rank: metric === 'score' && !slice?.cls ? mine : null, top, total: top.length, played, you: me };
}

export function profile(ru: boolean): Profile {
  return {
    name: MY_NAME[ru ? 'ru' : 'en'], games: 87, wins: 3, deepest: 21, best: 10500, bestByClass: { mage: 10500 }, arenaWaves: 0, arenaBest: 0,
    streak: { last: null, count: 12, best: 14, freezes: 1 }, dailyDone: true, badges: {} as Profile['badges'], history: [], trophies: [
      { board: 'daily:2026-10-12', place: 2, at: 1 }, { board: 'week:2026-W41', place: 7, at: 1 }, { board: 'daily:2026-10-09', place: 3, at: 1 },
    ],
    places: { daily: 37 }, totals: { daily: 1284 }, runs: {}, today: '2026-10-16',
  } as Profile;
}

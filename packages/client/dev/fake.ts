import type { HeroClass } from '@pd/core';
import { CATALOG, HEROES, type Item } from '../src/catalog';
import type { BoardEntry, BoardSlice, BoardView, CircleBoardView, CircleRef, HallView, LeagueResult, LeagueView, Profile } from '../src/checked';

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

/** The weapons a class might end a run holding (design part 9). */
const WEAPONS: Record<string, readonly string[]> = {
  warrior: ['weapon.shortSword', 'weapon.sword', 'weapon.longsword', 'weapon.mace', 'weapon.battleAxe', 'weapon.warHammer', 'weapon.spear'],
  mage: ['weapon.knuckles', 'weapon.quarterstaff', 'weapon.dagger', 'weapon.glaive'],
  rogue: ['weapon.dagger', 'weapon.shortSword', 'missile.dart', 'weapon.spear'],
  huntress: ['weapon.dagger', 'missile.boomerang', 'weapon.glaive', 'missile.dart'],
};

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
  // The armour and the weapon he held at the end of the run (the server's word from the final world): most carry one.
  w.a = 1 + Math.floor(random() * 5);
  const arms = WEAPONS[heroClass]!;
  if (random() > 0.15) w.wp = pick(arms, random);
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
    w: { a: 3, wp: 'weapon.quarterstaff', l: 'skin.mage.frost', h: 'hat.wizard', p: 'pet.firefly', f: 'fire.blue', fr: 'frame.runes', nc: 'name.gold' },
  };
  const top = list.slice(0, metric === 'score' && !slice?.cls ? 100 : 50);
  return { name: `${kind}:fake`, rank: metric === 'score' && !slice?.cls ? mine : null, top, total: top.length, played, you: me };
}

/** The season's board: Heat in place of the score, 11 406 players, 41 days left. */
export function seasonBoard(ru: boolean): BoardView {
  const crowd = Array.from({ length: 50 }, (_, i) => ({ ...person(i + 600, ru), score: 2406 - i * 31 - (i % 3) * 7 }));
  const me: BoardEntry = { ...board('day', undefined, ru).you!, score: 1240 };
  return {
    name: 'season:s1', rank: 212, top: crowd, total: 50, played: 11406, you: me,
    season: { id: 's1', number: 1, start: Date.parse('2026-10-19'), end: Date.parse('2026-12-14'), daysLeft: 41, started: true },
  };
}

/** The league room of the week: 30 players of the Flame, the player 7th (or where `rank` says). */
export function league(ru: boolean, open = true, rank = 7): LeagueView {
  const room = Array.from({ length: 30 }, (_, i) => ({ ...person(i + 800, ru), score: 183380 - i * 5200 + (i % 4) * 90 }));
  const me: BoardEntry = { ...board('day', undefined, ru).you!, score: room[rank - 1]!.score };
  room.splice(rank - 1, 1, me);
  return {
    open, need: 60, played: open ? 214 : 41, week: '2026-W43', endsAt: Date.now() + (2 * 24 + 7) * 3_600_000 - 12 * 60_000, tier: 'flame', best: 3,
    tiers: ['spark', 'coal', 'flame', 'bonfire', 'beacon'],
    room: open ? { number: 3, tier: 'flame', size: 30, top: room, rank, up: 5, down: 5 } : null, seen: null,
  };
}

export function weekResult(kind: 'up' | 'stay' | 'down'): LeagueResult {
  return kind === 'up'
    ? { week: '2026-W42', tier: 'flame', to: 'bonfire', result: 'up', place: 3, size: 30, points: 60, mark: false }
    : kind === 'stay'
      ? { week: '2026-W42', tier: 'flame', to: 'flame', result: 'stay', place: 14, size: 30, points: 20, mark: false }
      : { week: '2026-W42', tier: 'flame', to: 'coal', result: 'down', place: 28, size: 30, points: 0, mark: false };
}

/** The player's two circles, and the week's board of one. */
export function circles(ru: boolean): CircleRef[] {
  return [
    { code: 'abcdefghij', name: ru ? 'Ночные спелеологи' : 'Night Delvers', kind: 'group', cap: 200 },
    { code: 'bcdefghijk', name: ru ? 'Друзья' : 'Friends', kind: 'friends', cap: 50 },
  ];
}

export function circleBoard(ru: boolean, code: string): CircleBoardView {
  const rows = Array.from({ length: 9 }, (_, i) => ({ ...person(i + 900, ru), score: 183380 - i * 9000 }));
  const me: BoardEntry = { ...board('day', undefined, ru).you!, score: 135000 };
  rows.splice(2, 1, me);
  const group = code === 'abcdefghij';
  return {
    code, week: '2026-W43', circles: circles(ru),
    circle: { name: circles(ru).find((c) => c.code === code)!.name, kind: group ? 'group' : 'friends', size: group ? 23 : 9, cap: group ? 200 : 50, champion: { week: '2026-W42', you: true, name: me.name, score: 150000 } },
    board: { name: 'circle', rank: 3, top: rows, total: rows.length, played: rows.length, you: me },
  };
}

/** The hall of fame of season 1: the top ten, written. */
export function hall(ru: boolean, season = 's1'): HallView {
  const top = Array.from({ length: 10 }, (_, i) => ({ ...person(i + 700, ru), score: 2406 - i * 74 }));
  return { current: 's3', available: ['s1', 's2'], season, frozen: true, top };
}

export function profile(ru: boolean): Profile {
  return {
    name: MY_NAME[ru ? 'ru' : 'en'], games: 87, wins: 3, deepest: 21, best: 10500, bestByClass: { mage: 10500 }, arenaWaves: 0, arenaBest: 0,
    streak: { last: null, count: 12, best: 14, freezes: 1 }, dailyDone: true, badges: {} as Profile['badges'], history: [{ heroClass: 'mage', armor: 3, weapon: 'weapon.quarterstaff', depth: 17, level: 19, gold: 1200, won: false, score: 10500, slot: 'dungeon', ranked: true, at: 1 }] as unknown as Profile['history'], trophies: [
      { board: 'daily:2026-10-12', place: 2, at: 1 }, { board: 'week:2026-W41', place: 7, at: 1 }, { board: 'daily:2026-10-09', place: 3, at: 1 },
    ],
    places: { daily: 37 }, totals: { daily: 1284 }, runs: {}, today: '2026-10-16',
    season: { id: 's1', number: 1, start: Date.parse('2026-10-19'), end: Date.parse('2026-12-14'), daysLeft: 41, started: true }, heat: 1240, heatDays: 19,
    honour: ['circle_champion', 'deep'], seasons: [], league: { open: true, need: 60, played: 214, tier: 'flame', best: 3, inRoom: true },
  } as Profile;
}

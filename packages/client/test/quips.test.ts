import type { Effect } from '@pd/core';
import { describe, expect, it } from 'vitest';
import {
  CHANCE, COOLDOWN_MS, FADE_MS, HOLD_MAX_MS, HOLD_MIN_MS, holdFor, LAST_WORDS_HOLD_MS, LONGEST_LINE, type Moment, OCCASIONS, poolOf, POP_MS,
  QUIP_CLASSES, type QuipData, type QuipLang, type QuipMode, QuipPicker, type QuipSet, RECENT, type Register,
} from '../src/quips';
import { enQuips } from '../src/quips-en';
import { ruQuips } from '../src/quips-ru';
import { QuipWatch, type WatchHero } from '../src/quipwatch';

const LANGS: ReadonlyArray<readonly [QuipLang, QuipData]> = [['ru', ruQuips], ['en', enQuips]];
const REGISTERS: readonly Register[] = ['foul', 'clean'];
const MOMENTS: readonly Moment[] = ['kill', ...OCCASIONS];

/** Every line of a set, with where it is. */
function linesOf(set: QuipSet): string[] {
  const out: string[] = [];
  for (const lines of Object.values(set.kill)) out.push(...lines);
  for (const lines of Object.values(set.shared)) out.push(...lines);
  for (const byClass of Object.values(set.own)) for (const lines of Object.values(byClass)) out.push(...lines);
  return out;
}

/** A generator that repeats a fixed, well-spread sequence: the picker's dice, made repeatable. */
function dice(seed = 1): () => number {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

describe('the lines', () => {
  for (const [lang, data] of LANGS) {
    for (const register of REGISTERS) {
      const set = data[register];
      describe(`${lang} ${register}`, () => {
        it('has at least 20 plain kill lines for every class', () => {
          for (const heroClass of QUIP_CLASSES) expect(set.kill[heroClass].length, heroClass).toBeGreaterThanOrEqual(20);
        });

        it('has lines for every occasion, shared and for every class', () => {
          for (const occasion of OCCASIONS) {
            expect(set.shared[occasion].length, occasion).toBeGreaterThanOrEqual(4);
            for (const heroClass of QUIP_CLASSES) {
              expect(set.own[occasion]?.[heroClass]?.length, `${occasion} ${heroClass}`).toBeGreaterThan(0);
              expect(poolOf(set, occasion, heroClass).length, `${occasion} ${heroClass}`).toBeGreaterThanOrEqual(5);
            }
          }
        });

        it('has pools big enough that the last eight lines never exhaust a kill pool, and no line twice in one pool', () => {
          for (const moment of MOMENTS) {
            for (const heroClass of QUIP_CLASSES) {
              const pool = poolOf(set, moment, heroClass);
              expect(new Set(pool).size, `${moment} ${heroClass}`).toBe(pool.length);
              if (moment === 'kill') expect(pool.length).toBeGreaterThan(RECENT);
            }
          }
        });

        it('has no line over 80 characters, none empty, none with stray spaces', () => {
          for (const line of linesOf(set)) {
            expect(line.length, line).toBeLessThanOrEqual(LONGEST_LINE);
            expect(line.trim(), line).toBe(line);
            expect(line.length, line).toBeGreaterThan(1);
            expect(line, line).not.toMatch(/ {2}/);
          }
        });

        it('fits in two lines of the bubble on a 360 px phone', () => {
          // The bubble's text is about 296 px wide: 9 px a letter in Russian, 7.6 in English (the pixel font at 15 px).
          const perLine = lang === 'ru' ? 31 : 37;
          for (const line of linesOf(set)) {
            let rows = 1;
            let width = 0;
            for (const word of line.split(' ')) {
              if (width === 0) width = word.length;
              else if (width + 1 + word.length <= perLine) width += 1 + word.length;
              else {
                rows++;
                width = word.length;
              }
            }
            expect(rows, line).toBeLessThanOrEqual(2);
          }
        });

        it('says nothing about a people, a body, an orientation or sex', () => {
          const banned = lang === 'ru'
            ? /чурк|хач|жид[ыаов]|пидор|пидр|педик|гомик|негр|даун|дебил|имбецил|инвалид|олигофрен|шлюх|шалав|проститутк|секс|трах|изнасил|минет|хуесос/i
            : /nigg|fagg|retard|tranny|\bspic|chink|kike|gook|cripple|slut|whore|cunt|bitch|sissy|dyke|midget|\bgay\b|\brape|blowjob|\bcock\b|pussy|\btits\b|\bsex/i;
          for (const line of linesOf(set)) expect(line, line).not.toMatch(banned);
        });
      });
    }

    it(`${lang}: the clean register has no swearing`, () => {
      const swear = lang === 'ru'
        ? /хуй|хуе|хуя|хуё|пизд|бля|сука|суки|сучар|мудак|мудил|говн|жоп|срат|сран|залуп|дерьм|ссат|ссы|падл|мраз|(?<![а-яё])(?:на|по|вы|за|от|до|про|раз|съ|объ|пере|под|при|ис)?[её]б[аоуыилнёе]|уе?[её]б/i
        : /\b(?:fuck\w*|shit\w*|ass|asshole|dumbass|bitch|damn\w*|hell|crap|bastard|dick\w*|piss\w*|prick|motherfuck\w*)\b/i;
      for (const line of linesOf(data.clean)) expect(line, line).not.toMatch(swear);
    });

    it(`${lang}: most of the foul register really is foul, and the clean one is another set`, () => {
      const swear = lang === 'ru' ? /хуй|хуе|хуя|хуё|хул|пизд|бля|сука|суки|мудак|мудил|говн|жоп|ссы|ёб|еб/i : /fuck|shit|ass|bitch|damn|piss|prick|bastard/i;
      for (const heroClass of QUIP_CLASSES) {
        const lines = data.foul.kill[heroClass];
        expect(lines.filter((l) => swear.test(l)).length / lines.length, heroClass).toBeGreaterThan(0.7);
      }
      const clean = new Set(linesOf(data.clean));
      const same = linesOf(data.foul).filter((l) => clean.has(l));
      // A line may be good in both registers; a fifth of the foul ones at most.
      expect(same.length / linesOf(data.foul).length).toBeLessThan(0.2);
    });
  }

  it('keeps the shared Russian lines free of a masculine «I», for the huntress shares them', () => {
    const masculine = /(?<![а-яё])(?:живой|взял|вляпался|голодный|попал|заметил|раздавил|наступил|вывез|устал|рад)(?![а-яё])/i;
    for (const register of REGISTERS) {
      const set = ruQuips[register];
      for (const lines of Object.values(set.shared)) for (const line of lines) expect(line, line).not.toMatch(masculine);
    }
  });

  it('has the draft\'s approved lines', () => {
    expect(ruQuips.foul.kill.warrior).toContain('Сдох, сука, и правильно.');
    expect(ruQuips.clean.kill.mage).toContain('Элементарно.');
    expect(ruQuips.foul.shared.streak).toContain('Конвейер, нахуй!');
    expect(enQuips.foul.kill.mage).toContain('Science, motherfucker.');
    expect(enQuips.clean.shared.trivial).toContain('Rat. Terrifying.');
    expect(ruQuips.foul.shared.nearDeath).toContain('Блядь… ещё дышу.');
  });
});

describe('the bubble timing', () => {
  it('holds 1.6 to 2.4 seconds, longer for a longer line', () => {
    expect(holdFor('Эй')).toBe(HOLD_MIN_MS);
    expect(holdFor('x'.repeat(80))).toBe(HOLD_MAX_MS);
    expect(holdFor('x'.repeat(40))).toBeGreaterThan(HOLD_MIN_MS);
    expect(holdFor('x'.repeat(40))).toBeLessThan(HOLD_MAX_MS);
    expect(holdFor('x'.repeat(50))).toBeGreaterThanOrEqual(holdFor('x'.repeat(40)));
    for (const [, data] of LANGS) for (const line of linesOf(data.foul)) expect(holdFor(line)).toBeLessThanOrEqual(HOLD_MAX_MS);
  });

  it('pops in 120 ms, fades in 200 ms, and the last words are brief', () => {
    expect(POP_MS).toBe(120);
    expect(FADE_MS).toBe(200);
    expect(LAST_WORDS_HOLD_MS).toBeLessThan(HOLD_MIN_MS);
  });
});

describe('the picker', () => {
  const picker = (mode: QuipMode = 'foul', random = dice(7)) => new QuipPicker(ruQuips, () => mode, random);

  /** How often a moment is spoken over many tries, each long after the last. */
  function rate(moment: Moment, tries = 4000): number {
    const p = picker('foul', dice(3));
    let said = 0;
    for (let i = 0; i < tries; i++) if (p.offer(moment, 'warrior', i * (COOLDOWN_MS + 1000)) !== null) said++;
    return said / tries;
  }

  it('speaks an ordinary kill about a quarter of the time', () => {
    expect(rate('kill')).toBeGreaterThan(0.21);
    expect(rate('kill')).toBeLessThan(0.29);
  });

  it('speaks the other moments about half the time, and a new depth rarely', () => {
    for (const moment of ['trivial', 'oneHit', 'ranged', 'wand', 'thief', 'cursed', 'hungry'] as const) {
      expect(rate(moment), moment).toBeGreaterThan(0.45);
      expect(rate(moment), moment).toBeLessThan(0.55);
    }
    expect(rate('descend')).toBeGreaterThan(0.16);
    expect(rate('descend')).toBeLessThan(0.24);
  });

  it('always speaks bosses, near-death wins, streaks, first blood, the Amulet and death', () => {
    for (const moment of ['goo', 'tengu', 'dm300', 'king', 'yog', 'nearDeath', 'streak', 'firstBlood', 'amulet', 'death'] as const) {
      expect(CHANCE[moment]).toBe(1);
      expect(rate(moment, 300), moment).toBe(1);
    }
  });

  it('waits out the cooldown between bubbles, except for a sure moment', () => {
    // A dice that always says yes.
    const yes = new QuipPicker(ruQuips, () => 'foul', () => 0);
    expect(yes.offer('kill', 'mage', 10_000)).not.toBeNull();
    expect(yes.offer('kill', 'mage', 10_000 + COOLDOWN_MS - 1)).toBeNull();
    expect(yes.offer('trivial', 'mage', 10_000 + COOLDOWN_MS - 1)).toBeNull();
    // A sure moment breaks in, and starts the wait again.
    expect(yes.offer('streak', 'mage', 10_000 + 1000)).not.toBeNull();
    expect(yes.offer('kill', 'mage', 10_000 + 1000 + COOLDOWN_MS - 1)).toBeNull();
    expect(yes.offer('kill', 'mage', 10_000 + 1000 + COOLDOWN_MS)).not.toBeNull();
  });

  it('does not use up the cooldown when it says nothing', () => {
    const no = new QuipPicker(ruQuips, () => 'foul', () => 0.99);
    expect(no.offer('kill', 'rogue', 1000)).toBeNull();
    const maybe = new QuipPicker(ruQuips, () => 'foul', (() => { let n = 0; return () => (n++ === 0 ? 0.99 : 0); })());
    expect(maybe.offer('kill', 'rogue', 1000)).toBeNull();
    expect(maybe.offer('kill', 'rogue', 1001)).not.toBeNull();
  });

  it('never repeats any of the last eight lines', () => {
    for (const [, data] of LANGS) {
      for (const register of REGISTERS) {
        const mode: QuipMode = register;
        const p = new QuipPicker(data, () => mode, dice(11));
        const said: string[] = [];
        for (let i = 0; i < 3000; i++) {
          const line = p.offer('kill', QUIP_CLASSES[i % 4]!, i * 7000);
          if (line !== null) said.push(line);
        }
        expect(said.length).toBeGreaterThan(500);
        for (let i = 0; i < said.length; i++) expect(said.slice(Math.max(0, i - RECENT), i), said[i]).not.toContain(said[i]);
      }
    }
  });

  it('never repeats within eight lines across different moments either', () => {
    const p = new QuipPicker(enQuips, () => 'foul', dice(5));
    const said: string[] = [];
    // Sure moments, all the time: a short pool wears out, and then the one said longest ago comes back, never one of the last few.
    for (let i = 0; i < 400; i++) {
      const moment: Moment = (['nearDeath', 'streak', 'firstBlood', 'death'] as const)[i % 4]!;
      const line = p.offer(moment, 'huntress', i * 100);
      if (line !== null) said.push(line);
    }
    expect(said.length).toBe(400);
    for (let i = 8; i < said.length; i++) expect(said.slice(i - 8, i), said[i]).not.toContain(said[i]);
  });

  it('says nothing at all when switched off, whatever the moment', () => {
    const off = new QuipPicker(ruQuips, () => 'off', () => 0);
    for (const moment of MOMENTS) for (const heroClass of QUIP_CLASSES) expect(off.offer(moment, heroClass, 1_000_000)).toBeNull();
  });

  it('follows the setting as it changes, and each register draws on its own lines', () => {
    let mode: QuipMode = 'foul';
    const p = new QuipPicker(ruQuips, () => mode, () => 0);
    const foul = p.offer('death', 'warrior', 0)!;
    expect(linesOf(ruQuips.foul)).toContain(foul);
    mode = 'clean';
    p.reset();
    const clean = p.offer('death', 'warrior', 0)!;
    expect(linesOf(ruQuips.clean)).toContain(clean);
    mode = 'off';
    expect(p.offer('death', 'warrior', 100_000)).toBeNull();
  });

  it('draws a class\'s kill lines from its own voice', () => {
    const p = new QuipPicker(enQuips, () => 'clean', () => 0);
    for (const heroClass of QUIP_CLASSES) {
      p.reset();
      expect(enQuips.clean.kill[heroClass]).toContain(p.offer('kill', heroClass, 0)!);
    }
  });
});

describe('what the hero\'s turn was', () => {
  const me: WatchHero & { heroClass: string } = { id: 'h1', pos: 40, depth: 3, hp: 20, ht: 20, kills: 7, heroClass: 'warrior' };
  const died = (who: string, kind: string, by = 'h1', depth = 3): Effect => ({ type: 'died', depth, who, pos: 41, kind, by }) as unknown as Effect;
  const hit = (target: string, damage = 5): Effect => ({ type: 'attack', depth: 3, attacker: 'h1', target, hit: true, damage });
  const watch = () => new QuipWatch();

  it('knows an ordinary kill, a rat and a boss', () => {
    expect(watch().read([hit('#1'), hit('#1'), died('#1', 'gnoll')], me, 10)).toBe('kill');
    expect(watch().read([hit('#1'), died('#1', 'rat')], me, 10)).toBe('trivial');
    expect(watch().read([hit('#1'), died('#1', 'albino')], me, 10)).toBe('trivial');
    expect(watch().read([hit('#1'), died('#1', 'crab')], me, 10)).toBe('trivial');
    const bosses = { goo: 'goo', tengu: 'tengu', dm300: 'dm300', king: 'king', yog: 'yog' } as const;
    for (const [kind, moment] of Object.entries(bosses)) expect(watch().read([hit('#9'), hit('#9'), died('#9', kind)], me, 10), kind).toBe(moment);
  });

  it('ignores kills by others, on other floors, and of the peaceful and the conjured', () => {
    expect(watch().read([died('#1', 'gnoll', 'h2')], me, 10)).toBeNull();
    expect(watch().read([died('#1', 'gnoll', 'h1', 4)], me, 10)).toBeNull();
    expect(watch().read([died('#1', 'sheep')], me, 10)).toBeNull();
    expect(watch().read([died('#1', 'mirror')], me, 10)).toBeNull();
    expect(watch().read([hit('#1')], me, 10)).toBeNull();
  });

  it('knows a win with less than 15% of the health left', () => {
    expect(watch().read([hit('#1'), hit('#1'), died('#1', 'gnoll')], { ...me, hp: 2 }, 10)).toBe('nearDeath');
    expect(watch().read([hit('#1'), hit('#1'), died('#1', 'gnoll')], { ...me, hp: 3 }, 10)).toBe('kill');
    expect(watch().read([hit('#1'), hit('#1'), died('#1', 'gnoll')], { ...me, hp: 3.5, ht: 20 }, 10)).toBe('kill');
  });

  it('knows the first blood of a run', () => {
    expect(watch().read([hit('#1'), hit('#1'), died('#1', 'rat')], { ...me, kills: 1 }, 2)).toBe('firstBlood');
    expect(watch().read([hit('#1'), hit('#1'), died('#1', 'rat')], { ...me, kills: 2 }, 2)).toBe('trivial');
  });

  it('knows three kills within ten turns, and starts the count again after', () => {
    const w = watch();
    const kill = (n: number, turn: number) => w.read([hit(`#${n}`), hit(`#${n}`), died(`#${n}`, 'gnoll')], me, turn);
    expect(kill(1, 20)).toBe('kill');
    expect(kill(2, 24)).toBe('kill');
    expect(kill(3, 29)).toBe('streak');
    expect(kill(4, 30)).toBe('kill');
    expect(kill(5, 31)).toBe('kill');
    expect(kill(6, 32)).toBe('streak');
    // Too slow: the first falls out of the window.
    const slow = watch();
    expect(slow.read([hit('#1'), hit('#1'), died('#1', 'gnoll')], me, 100)).toBe('kill');
    expect(slow.read([hit('#2'), hit('#2'), died('#2', 'gnoll')], me, 108)).toBe('kill');
    expect(slow.read([hit('#3'), hit('#3'), died('#3', 'gnoll')], me, 111)).toBe('kill');
  });

  it('knows a kill in one blow, but not a rat\'s or a long fight\'s', () => {
    expect(watch().read([hit('#1', 30), died('#1', 'gnoll')], me, 10)).toBe('oneHit');
    expect(watch().read([hit('#1', 30), died('#1', 'rat')], me, 10)).toBe('trivial');
    const w = watch();
    w.read([hit('#1', 5)], me, 9);
    expect(w.read([hit('#1', 5), died('#1', 'gnoll')], me, 10)).toBe('kill');
  });

  it('knows a thrown kill and a wand\'s', () => {
    const thrown: Effect = { type: 'thrown', depth: 3, from: 40, to: 41, item: 'dart' } as unknown as Effect;
    const zapped: Effect = { type: 'zapped', depth: 3, from: 40, to: 41 };
    expect(watch().read([thrown, hit('#1', 30), died('#1', 'gnoll')], me, 10)).toBe('ranged');
    expect(watch().read([zapped, died('#1', 'gnoll')], me, 10)).toBe('wand');
    // A monster's bolt is not mine.
    expect(watch().read([{ type: 'zapped', depth: 3, from: 55, to: 40 }, hit('#1', 30), died('#1', 'gnoll')], me, 10)).toBe('oneHit');
  });

  it('knows a thief killed after it stole', () => {
    const w = watch();
    w.read([{ type: 'stole', depth: 3, mob: '#5', hero: 'h1', item: {} as never }], me, 5);
    expect(w.read([hit('#5'), hit('#5'), died('#5', 'thief')], me, 9)).toBe('thief');
    // One that never stole is an ordinary kill.
    expect(watch().read([hit('#5'), hit('#5'), died('#5', 'thief')], me, 9)).toBe('kill');
    // Another hero's loss is not mine.
    const other = watch();
    other.read([{ type: 'stole', depth: 3, mob: '#5', hero: 'h2', item: {} as never }], me, 5);
    expect(other.read([hit('#5'), hit('#5'), died('#5', 'thief')], me, 9)).toBe('kill');
  });

  it('knows death, the Amulet, hunger and a curse found out', () => {
    expect(watch().read([{ type: 'died', depth: 3, who: 'h1', pos: 40 }], me, 10)).toBe('death');
    expect(watch().read([{ type: 'died', depth: 3, who: 'h2', pos: 40 }], me, 10)).toBeNull();
    expect(watch().read([{ type: 'amulet', hero: 'h1', first: true }], me, 10)).toBe('amulet');
    expect(watch().read([{ type: 'amulet', hero: 'h1', first: false }], me, 10)).toBeNull();
    expect(watch().read([{ type: 'hunger', hero: 'h1', state: 'hungry' }], me, 10)).toBe('hungry');
    expect(watch().read([{ type: 'hunger', hero: 'h1', state: 'starving' }], me, 10)).toBeNull();
    expect(watch().read([{ type: 'hunger', hero: 'h2', state: 'hungry' }], me, 10)).toBeNull();
    const cursed = { kind: 'weapon.sword', cursed: true } as never;
    const unseen = { kind: 'weapon.sword', cursed: true, curseUnknown: true } as never;
    expect(watch().read([{ type: 'revealed', hero: 'h1', item: cursed }], me, 10)).toBe('cursed');
    expect(watch().read([{ type: 'cursedEquip', hero: 'h1', item: unseen }], me, 10)).toBe('cursed');
    expect(watch().read([{ type: 'pickedUp', hero: 'h1', item: unseen }], me, 10)).toBeNull();
    expect(watch().read([{ type: 'pickedUp', hero: 'h1', item: cursed }], me, 10)).toBe('cursed');
  });

  it('gives one moment a turn: the one most worth a word', () => {
    // A boss killed at death's door in one blow: the boss.
    expect(watch().read([hit('#1', 99), died('#1', 'tengu')], { ...me, hp: 1 }, 10)).toBe('tengu');
    // Death outranks all.
    expect(watch().read([died('#1', 'gnoll'), { type: 'died', depth: 3, who: 'h1', pos: 40 }], me, 10)).toBe('death');
  });
});

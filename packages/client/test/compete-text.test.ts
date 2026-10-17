import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cardKey, cardSize, idleFrame, lookOfEntry, sparkState, wholeScale } from '../src/cardlook';
import { fill, formatNumber, pluralForm, pluralIndex, say, spanText } from '../src/compete-text';

const json = <T>(path: string): T => JSON.parse(readFileSync(new URL(`../public/assets/compete/${path}`, import.meta.url), 'utf8')) as T;

describe('the competitions\' words (compete-text.ts)', () => {
  it('takes the Russian plural forms by the rule: one, few, many', () => {
    const form = (n: number) => pluralIndex('ru', n);
    expect([1, 21, 101].map(form)).toEqual([0, 0, 0]);
    expect([2, 3, 4, 22, 24, 102].map(form)).toEqual([1, 1, 1, 1, 1, 1]);
    expect([0, 5, 11, 12, 13, 14, 15, 20, 25, 111, 112].map(form)).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
    expect([0, 1, 2, 5].map((n) => pluralIndex('en', n))).toEqual([1, 0, 1, 1]);
  });

  it('says a number in the designer\'s forms, with the number formatted', () => {
    const players = ['Сегодня спустился {n} игрок', 'Сегодня спустились {n} игрока', 'Сегодня спустились {n} игроков'];
    expect(say(players, 1284, 'ru')).toBe(`Сегодня спустились ${formatNumber(1284, 'ru')} игрока`);
    expect(say(players, 21, 'ru')).toContain('спустился 21 игрок');
    expect(say(['{n} turn', '{n} turns'], 1, 'en')).toBe('1 turn');
    expect(say(['{n} turn', '{n} turns'], 2400, 'en')).toBe('2,400 turns');
    // A text with one form only is the same for any number; the last form serves a language that gave fewer than it needs.
    expect(pluralForm('Heat', 5, 'ru')).toBe('Heat');
    expect(pluralForm(['one', 'other'], 5, 'ru')).toBe('other');
  });

  it('fills {names}, and leaves nothing for a name not given', () => {
    expect(fill('{who} passed you: #{n}', { who: 'Sasha', n: 4 })).toBe('Sasha passed you: #4');
    expect(fill('a {x} b')).toBe('a  b');
  });

  it('counts a time in the words of its units', () => {
    const units = { d: 'd', h: 'h', m: 'min', soon: 'soon' };
    expect(spanText(2 * 86_400_000 + 7 * 3_600_000 + 1, units)).toBe('2 d 7 h');
    expect(spanText(5 * 3_600_000 + 12 * 60_000, units)).toBe('5 h 12 min');
    expect(spanText(9 * 60_000, units)).toBe('9 min');
    expect(spanText(0, units)).toBe('soon');
  });

  it('has the designer\'s texts for every language of the data, with the same keys', () => {
    const data = json<{ strings: Record<'en' | 'ru', Record<string, unknown>> }>('compete.json');
    const keys = (o: Record<string, unknown>, prefix = ''): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]));
    expect(keys(data.strings.ru).sort()).toEqual(keys(data.strings.en).sort());
  });
});

describe('the hero card\'s sizes (anchors.json, cardlook.ts)', () => {
  const anchors = json<{ layouts: Record<string, { scene: [number, number]; scale?: number | { phone: number }; frame?: { slice: number; scale: number }; size?: [number, number] }> }>('anchors.json');

  it('makes a board\'s row 80 x 56, the profile\'s card 216 x 156, the podium\'s 96 x 96, as the designer says', () => {
    for (const name of ['row', 'big', 'podium'] as const) {
      const layout = anchors.layouts[name]!;
      const scale = typeof layout.scale === 'number' ? layout.scale : layout.scale!.phone;
      const [w, h] = cardSize(layout.scene, scale, layout.frame!.slice, layout.frame!.scale);
      if (layout.size) expect([w, h]).toEqual(layout.size);
    }
    expect(cardSize([36, 24], 2, 4, 1)).toEqual([80, 56]);
    expect(cardSize([64, 44], 3, 4, 3)).toEqual([216, 156]);
    expect(cardSize([40, 40], 2, 4, 2)).toEqual([96, 96]);
  });

  it('keeps a card\'s art pixels whole on any screen', () => {
    expect(wholeScale(2, 1)).toBe(2);
    expect(wholeScale(2, 1.5)).toBe(3);
    expect(wholeScale(2, 2.75)).toBe(5);
    expect(wholeScale(1, 0.5)).toBe(1);
  });

  it('walks the hero\'s idle in the original\'s frames, one a second', () => {
    const seq = [0, 0, 0, 1, 0, 0, 1, 1];
    expect([0, 500, 1000, 2000, 3000, 4000, 7000, 8000].map((t) => idleFrame(seq, 1, t))).toEqual([0, 0, 0, 0, 1, 0, 1, 0]);
  });

  it('lifts a spark a pixel a frame and puts it out at the card\'s top', () => {
    // The big card's fire stands at y 39: a spark 22 above it is inside the card.
    expect(sparkState(-22, 0, 0, 39)).toEqual({ rise: 0, frame: 0 });
    expect(sparkState(-22, 0, 600, 39)).toEqual({ rise: 5, frame: 1 });
    // A spark that would leave the card at its top is not drawn: the row's fire at y 21 puts out all but the lowest.
    expect(sparkState(-22, 0, 0, 21)).toBeUndefined();
    expect(sparkState(-30, 3, 0, 30)).toBeUndefined();
  });

  it('keeps a composed card under its look, and the armour\'s tier when it is told', () => {
    expect(cardKey({ heroClass: 'mage', a: 2 })).toBe('mage|2|||||');
    expect(cardKey({ heroClass: 'mage' })).toBe('mage|1|||||');
    expect(lookOfEntry({ heroClass: 'mage', w: { lg: 'flame', a: 3, fr: 'frame.ember' } })).toEqual({ heroClass: 'mage', lg: 'flame', a: 3, fr: 'frame.ember' });
  });
});

describe('the designer\'s numbers (compete.json)', () => {
  const data = json<{
    leagues: { room: number; promote: number; demote: number; tiers: unknown[] };
    season: { weeks: number; heat: Record<string, number> };
    boards: { speed: { minDepth: number }; rows: number };
  }>('compete.json');

  it('says what the owner decided: rooms of 30, 5 up and 5 down, five leagues, a season of 8 weeks, speed from depth 5', () => {
    expect(data.leagues).toMatchObject({ room: 30, promote: 5, demote: 5 });
    expect(data.leagues.tiers).toHaveLength(5);
    expect(data.season.weeks).toBe(8);
    expect(data.boards.speed.minDepth).toBe(5);
    expect(data.boards.rows).toBe(50);
  });
});

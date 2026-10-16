import { describe, expect, it } from 'vitest';
import {
  FADE, HOLD, type Layer, layerLevels, type LayerPlan, planLayers, SONGS, songEvents, songLength, songProblems, StepCursor, STINGERS, stepSeconds,
} from '../src/music';
import { BAR, SONG_DATA } from '../src/music-songs';
import { CELL, EARSHOT, heard } from '../src/spatial';

describe('the sequencer clock', () => {
  it('has a sixteenth of a beat for a step', () => {
    expect(stepSeconds(120)).toBeCloseTo(0.125);
    expect(stepSeconds(60)).toBeCloseTo(0.25);
    expect(stepSeconds(72) * 16).toBeCloseTo((60 / 72) * 4);
  });

  it('puts every step exactly one step after the last, across the loop point', () => {
    const cursor = new StepCursor(0.2, 8, 2);
    const seen: Array<[number, number]> = [];
    cursor.time = 1;
    // Frames of an uneven rate, as a busy main thread gives them.
    for (let now = 1; now < 9; now += 0.037 + (Math.floor(now * 10) % 3) * 0.02) cursor.run(now, 0.15, 0.05, (position, time) => seen.push([position, time]));
    expect(seen.length).toBeGreaterThan(30);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]![1] - seen[i - 1]![1]).toBeCloseTo(0.2, 9);
      const expected = seen[i - 1]![0] === 7 ? 2 : seen[i - 1]![0] + 1;
      expect(seen[i]![0]).toBe(expected);
    }
    expect(seen[0]![0]).toBe(0);
  });

  it('schedules ahead only as far as it is told, and never twice', () => {
    const cursor = new StepCursor(0.1, 16, 0);
    cursor.time = 0.06;
    const times: number[] = [];
    cursor.run(0, 0.15, 0.05, (_, time) => times.push(time));
    expect(times.length).toBe(1);
    expect(Math.max(...times)).toBeLessThan(0.15);
    cursor.run(0, 0.15, 0.05, (_, time) => times.push(time));
    expect(times.length).toBe(1);
    cursor.run(0.1, 0.15, 0.05, (_, time) => times.push(time));
    expect(times.length).toBe(2);
    expect(times[1]).toBeCloseTo(0.16, 9);
  });

  it('skips what is long past after a stall instead of cramming it into one instant', () => {
    const cursor = new StepCursor(0.125, 64, 0);
    cursor.time = 0;
    cursor.run(0, 0.15, 0.05, () => undefined);
    const emitted: Array<[number, number]> = [];
    // The timer was held up for ten seconds.
    cursor.run(10, 0.15, 0.05, (position, time) => emitted.push([position, time]));
    expect(emitted.length).toBeLessThanOrEqual(2);
    for (const [position, time] of emitted) {
      expect(time).toBeGreaterThanOrEqual(10);
      // And the song kept its place in time: the step is the one that belongs to that moment.
      expect(position).toBe(Math.round(time / 0.125) % 64);
    }
  });

  it('ends at the end when it is played once', () => {
    const cursor = new StepCursor(0.1, 4, 0, true);
    const positions: number[] = [];
    cursor.run(0, 100, 1000, (position) => positions.push(position));
    expect(positions).toEqual([0, 1, 2, 3]);
    expect(cursor.ended).toBe(true);
  });
});

describe('the layers', () => {
  const step = (prev: LayerPlan | null, danger: number, boss: boolean, now: number): LayerPlan => planLayers(prev, { danger, boss }, now);

  it('stay calm with nothing about', () => {
    expect(step(null, 0, false, 0).mode).toBe('calm');
  });

  it('turn to danger at once when an enemy is in sight, and to the boss at once when one is fought', () => {
    const calm = step(null, 0, false, 0);
    const danger = step(calm, 1, false, 1);
    expect(danger.mode).toBe('danger');
    expect(step(danger, 3, true, 2).mode).toBe('boss');
    expect(step(calm, 0, true, 1).mode).toBe('boss');
  });

  it('hold danger for a while after the last enemy is gone, and then return to calm', () => {
    let plan = step(step(null, 0, false, 0), 2, false, 10);
    plan = step(plan, 0, false, 10 + HOLD.danger - 0.1);
    expect(plan.mode).toBe('danger');
    plan = step(plan, 0, false, 10 + HOLD.danger + 0.1);
    expect(plan.mode).toBe('calm');
  });

  it('do not flicker when an enemy steps out of sight and back', () => {
    let plan = step(null, 1, false, 0);
    const modes: Layer[] = [];
    for (let t = 0; t < 20; t += 0.5) {
      plan = step(plan, Math.floor(t) % 2 === 0 ? 1 : 0, false, t);
      modes.push(plan.mode);
    }
    expect(new Set(modes)).toEqual(new Set(['danger']));
  });

  it('go from the boss to danger, if enemies remain, and from danger to calm, each after its hold', () => {
    let plan = step(null, 1, true, 0);
    expect(plan.mode).toBe('boss');
    plan = step(plan, 2, false, HOLD.boss - 1);
    expect(plan.mode).toBe('boss');
    plan = step(plan, 2, false, HOLD.boss + 0.1);
    expect(plan.mode).toBe('danger');
    plan = step(plan, 0, false, HOLD.boss + 0.2);
    expect(plan.mode).toBe('danger');
    plan = step(plan, 0, false, HOLD.boss + 0.2 + HOLD.danger + 0.1);
    expect(plan.mode).toBe('calm');
  });

  it('sound exactly one layer', () => {
    for (const mode of ['calm', 'danger', 'boss'] as const) {
      const { gains } = layerLevels(mode, 'calm', ['calm', 'danger', 'boss']);
      expect(gains[mode]).toBe(1);
      expect(Object.values(gains).reduce((a, b) => a + b, 0)).toBe(1);
    }
  });

  it('use the layer below when a song lacks one (a camp has only the calm; a stinger only its own)', () => {
    expect(layerLevels('boss', 'calm', ['calm']).gains.calm).toBe(1);
    expect(layerLevels('danger', 'calm', ['calm', 'boss']).gains.calm).toBe(1);
    expect(layerLevels('calm', 'calm', ['danger']).gains.danger).toBe(1);
  });

  it('fade in quickly, give way a little slower, and come back down slowest', () => {
    const up = layerLevels('danger', 'calm', ['calm', 'danger', 'boss']);
    expect(up.fades.danger).toBe(FADE.up);
    expect(up.fades.calm).toBe(FADE.over);
    const down = layerLevels('calm', 'danger', ['calm', 'danger', 'boss']);
    expect(down.fades.calm).toBe(FADE.up);
    expect(down.fades.danger).toBe(FADE.down);
    expect(FADE.up).toBeLessThan(FADE.over);
    expect(FADE.over).toBeLessThan(FADE.down);
  });
});

describe('the songs', () => {
  const all = [...SONGS, ...STINGERS];

  it('are written right: bars add up, notes and chords can be read', () => {
    for (const name of all) expect(songProblems(name), name).toEqual([]);
  });

  it('loop in a whole number of steps, and last long enough to be a tune', () => {
    for (const name of SONGS) {
      const { intro, loop } = songLength(name);
      const step = stepSeconds(SONG_DATA[name].bpm);
      expect(loop / step).toBeCloseTo(Math.round(loop / step), 9);
      expect(intro / step).toBeCloseTo(Math.round(intro / step), 9);
      expect(loop).toBeGreaterThan(30);
      expect(loop + intro).toBeLessThan(260);
    }
  });

  it('have the notes of every layer they are meant to', () => {
    const layersOf = (name: (typeof all)[number]): Map<string, Set<string>> => {
      const found = new Map<string, Set<string>>();
      for (const events of songEvents(name)) {
        for (const e of events) {
          if (!found.has(e.layer)) found.set(e.layer, new Set());
          found.get(e.layer)!.add(e.inst);
        }
      }
      return found;
    };
    for (const name of SONGS) {
      const found = layersOf(name);
      expect([...found.keys()].sort(), name).toEqual((SONG_DATA[name].layers ?? ['calm', 'danger', 'boss']).slice().sort());
      // Calm is quiet music: a pad, a pluck, the bass, a tune, and no drums.
      for (const inst of ['pad', 'pluck', 'bass']) expect(found.get('calm')!.has(inst), `${name} calm ${inst}`).toBe(true);
      expect(found.get('calm')!.has('drum'), `${name} calm drums`).toBe(false);
      if (name !== 'camp') {
        expect(found.get('danger')!.has('drum'), `${name} danger drums`).toBe(true);
        expect(found.get('boss')!.has('drum'), `${name} boss drums`).toBe(true);
        expect(found.get('boss')!.has('bass'), `${name} boss bass`).toBe(true);
      }
    }
    // A stinger is one layer.
    for (const name of STINGERS) expect([...layersOf(name).keys()]).toEqual(['danger']);
  });

  it('keep every note in a singable range', () => {
    for (const name of all) {
      for (const events of songEvents(name)) {
        for (const e of events) {
          if (e.inst === 'drum') continue;
          expect(e.midi, `${name} ${e.inst}`).toBeGreaterThanOrEqual(28);
          expect(e.midi, `${name} ${e.inst}`).toBeLessThanOrEqual(100);
          expect(e.len).toBeGreaterThan(0);
        }
      }
    }
  });

  it('give the boss layer at least as many drum hits as danger', () => {
    for (const name of SONGS.filter((n) => n !== 'camp')) {
      let danger = 0;
      let boss = 0;
      for (const events of songEvents(name)) {
        for (const e of events) {
          if (e.inst !== 'drum') continue;
          if (e.layer === 'danger') danger++;
          if (e.layer === 'boss') boss++;
        }
      }
      expect(boss, name).toBeGreaterThan(danger * 0.9);
    }
  });

  it('time the stingers: a few seconds', () => {
    expect(songLength('victory').loop).toBeGreaterThan(3);
    expect(songLength('victory').loop).toBeLessThan(8);
    expect(songLength('death').loop).toBeGreaterThan(4);
    expect(songLength('death').loop).toBeLessThan(9);
    expect(BAR).toBe(16);
  });
});

describe('positional sound', () => {
  const hero = { x: 160, y: 160 };

  it('is full beside the hero and quieter and duller the farther it is', () => {
    const near = heard({ x: hero.x + CELL, y: hero.y }, hero);
    const far = heard({ x: hero.x + CELL * 10, y: hero.y }, hero);
    const farther = heard({ x: hero.x + CELL * 20, y: hero.y }, hero);
    expect(near.gain).toBe(1);
    expect(far.gain).toBeLessThan(near.gain);
    expect(farther.gain).toBeLessThan(far.gain);
    expect(far.cutoff).toBeLessThan(near.cutoff);
    expect(farther.cutoff).toBeLessThan(far.cutoff);
  });

  it('pans to the side it came from', () => {
    expect(heard({ x: hero.x + CELL * 5, y: hero.y }, hero).pan).toBeGreaterThan(0.3);
    expect(heard({ x: hero.x - CELL * 5, y: hero.y }, hero).pan).toBeLessThan(-0.3);
    expect(heard({ x: hero.x, y: hero.y + CELL * 5 }, hero).pan).toBe(0);
    expect(Math.abs(heard({ x: hero.x + CELL * 90, y: hero.y }, hero).pan)).toBeLessThanOrEqual(0.75);
  });

  it('is not heard from beyond earshot', () => {
    expect(heard({ x: hero.x + CELL * (EARSHOT - 1), y: hero.y }, hero).audible).toBe(true);
    expect(heard({ x: hero.x + CELL * (EARSHOT + 1), y: hero.y }, hero).audible).toBe(false);
  });
});

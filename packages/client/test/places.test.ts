import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { LENGTH, RoomType, T, type Level, type World, WIDTH } from '@pd/core';
import { hasSfx, renderSfx, seedOf, SFX, voiceSpan } from '../src/sfx-synth';
import { AMBIENT_CADENCE, AMBIENT_LOOP, AMBIENT_MOTE } from '../src/fxplayer';
import { parseFx } from '../src/fxsheet';
import { DUST_PER, FIREFLY_PER, lookOf, P_ALTAR, P_DEW, P_FORGE, P_PEDESTAL, P_POT, P_SHELF, P_SIGN, P_SUNGRASS, P_WELL, POT_LOOK, scanAmbient, scanPlaces, W_AWARE, W_CHANGE, W_HEALTH, WATER_Y, WELL_FX, WELL_LOOK } from '../src/places';
import { stamps } from '../src/stamps';

/** A world with just what the places read: one level's map and wells, one floor's altar, heaps and plants. */
function world(o: {
  cells?: Array<[number, number]>;
  wells?: Array<{ pos: number; water: 'health' | 'awareness' | 'transmutation' }>;
  altar?: { pos: number; volume: number };
  heaps?: Array<{ pos: number; kind: string; items: Array<{ kind: string }> }>;
  plants?: Array<{ pos: number; kind: string }>;
}): World {
  const map = new Array<number>(LENGTH).fill(T.EMPTY);
  for (const [cell, terrain] of o.cells ?? []) map[cell] = terrain;
  const level = { depth: 1, map, wells: o.wells ?? [], altar: o.altar } as unknown as Level;
  return { levels: { 1: level }, floors: { 1: { altar: o.altar, heaps: o.heaps ?? [], plants: o.plants ?? [] } } } as unknown as World;
}

describe('the special places of a floor', () => {
  it('lists a well only while it holds water, with its own water', () => {
    const w = world({ cells: [[100, T.WELL], [200, T.WELL], [300, T.EMPTY_WELL]], wells: [{ pos: 100, water: 'awareness' }, { pos: 200, water: 'transmutation' }] });
    const spots = scanPlaces(w, 1);
    expect(spots.filter((s) => s.kind === P_WELL).map((s) => [s.cell, s.water])).toEqual([[100, W_AWARE], [200, W_CHANGE]]);
    expect(spots.some((s) => s.cell === 300)).toBe(false);
    expect(W_HEALTH).toBe(0);
  });

  it('lights the altar only while its fire burns, and a pedestal only with a prize on it', () => {
    const lit = scanPlaces(world({ cells: [[100, T.PEDESTAL]], altar: { pos: 100, volume: 20 } }), 1);
    expect(lit.map((s) => s.kind)).toEqual([P_ALTAR]);
    // Out: no fire; the scroll the fire leaves behind lies on its pedestal like any prize.
    const cold = scanPlaces(world({ cells: [[100, T.PEDESTAL]], altar: { pos: 100, volume: 0 } }), 1);
    expect(cold).toEqual([]);
    const reward = scanPlaces(world({ cells: [[100, T.PEDESTAL]], altar: { pos: 100, volume: 0 }, heaps: [{ pos: 100, kind: 'heap', items: [{ kind: 'wipeOut' }] }] }), 1);
    expect(reward.map((s) => s.kind)).toEqual([P_PEDESTAL]);
    // An empty pedestal, or one with something hidden on it, shows nothing.
    expect(scanPlaces(world({ cells: [[100, T.PEDESTAL]] }), 1)).toEqual([]);
    expect(scanPlaces(world({ cells: [[100, T.PEDESTAL]], heaps: [{ pos: 100, kind: 'hidden', items: [{ kind: 'ring.accuracy' }] }] }), 1)).toEqual([]);
  });

  it('finds pots, shelves, signs, sungrass and dew, and nothing else', () => {
    const spots = scanPlaces(world({
      cells: [[10, T.ALCHEMY], [11, T.BOOKSHELF], [12, T.SIGN], [13, T.STATUE], [14, T.HIGH_GRASS]],
      plants: [{ pos: 20, kind: 'sungrass' }, { pos: 21, kind: 'firebloom' }],
      heaps: [{ pos: 30, kind: 'heap', items: [{ kind: 'dew' }] }, { pos: 31, kind: 'heap', items: [{ kind: 'food.ration' }] }, { pos: 32, kind: 'chest', items: [{ kind: 'dew' }] }],
    }), 1);
    expect(spots.map((s) => s.kind).sort()).toEqual([P_POT, P_SHELF, P_SIGN, P_SUNGRASS, P_DEW].sort());
  });

  it('gives light to wells, the altar, the pot and a prize, and none to what only glints', () => {
    for (const water of [W_HEALTH, W_AWARE, W_CHANGE]) expect(lookOf({ kind: P_WELL, cell: 0, water })!.light).toBeGreaterThan(0);
    expect(lookOf({ kind: P_ALTAR, cell: 0, water: 0 })!.light).toBeGreaterThan(lookOf({ kind: P_POT, cell: 0, water: 0 })!.light);
    expect(lookOf({ kind: P_SIGN, cell: 0, water: 0 })).toBeNull();
    // The three waters are three different colours.
    const colours = new Set([W_HEALTH, W_AWARE, W_CHANGE].map((water) => lookOf({ kind: P_WELL, cell: 0, water })!.rgb.join(',')));
    expect(colours.size).toBe(3);
  });
});

describe('the short things drawn over the scene', () => {
  it('fill a fixed pool, reuse a free slot and drop the oldest when the pool is full', () => {
    stamps.clear();
    for (let i = 0; i < stamps.cap + 5; i++) stamps.add(stamps.Z, i, i, 1, 100 + i, 500, [1, 1, 1]);
    expect(Array.from(stamps.used).every((u) => u === 1)).toBe(true);
    expect(stamps.busy(200)).toBe(true);
    expect(stamps.busy(5000)).toBe(false);
    stamps.clear();
    expect(stamps.busy(0)).toBe(false);
  });
});

describe('the sounds of the places', () => {
  it('exist, and the knocks of a search differ: hollow rings on, solid is dull and short', () => {
    for (const name of ['knockHollow', 'knockSolid', 'alarm', 'bleat', 'thorns', 'psiWarn', 'purify', 'shimmer', 'levitate', 'glyph', 'wellHealth', 'wellAware', 'wellChange', 'bubble', 'brewDone', 'altarFire', 'altarAccept', 'altarRefuse', 'stoneCrack', 'stoneAwake', 'pages', 'shine', 'slowed']) {
      expect(hasSfx(name), name).toBe(true);
    }
    const length = (name: keyof typeof SFX): number => Math.max(...SFX[name].voices.map(voiceSpan));
    expect(length('knockHollow')).toBeGreaterThan(length('knockSolid') * 2);
    // The solid one has far less of the low body: it is mostly a short click of noise.
    const hollow = renderSfx(SFX.knockHollow, 44100, seedOf('knockHollow'));
    const solid = renderSfx(SFX.knockSolid, 44100, seedOf('knockSolid'));
    const tail = (x: Float32Array): number => {
      let e = 0;
      for (let i = Math.floor(x.length * 0.5); i < x.length; i++) e += x[i]! * x[i]!;
      return e;
    };
    expect(tail(hollow)).toBeGreaterThan(tail(solid));
  });

  it('make the alarm a bell: three strikes, over a second long', () => {
    expect(SFX.alarm.voices.every((v) => v.repeat?.[0] === 3 || v.repeat === undefined)).toBe(true);
    expect(Math.max(...SFX.alarm.voices.map(voiceSpan))).toBeGreaterThan(1.2);
  });
});

describe('a search tells nothing the find does not', () => {
  let idleFx: typeof import('../src/idlefx').idleFx;
  let audio: typeof import('../src/audio').audio;
  beforeAll(async () => {
    vi.stubGlobal('addEventListener', () => undefined);
    vi.stubGlobal('document', { addEventListener: () => undefined, visibilityState: 'visible', hidden: false });
    idleFx = (await import('../src/idlefx')).idleFx;
    audio = (await import('../src/audio')).audio;
  });

  const view = {
    puppets: new Map([['me', { alive: true, flip: false, id: 'me', to: 0 } as never]]),
    position: () => ({ x: 100, y: 100 }),
    flashes: [] as Array<{ cell: number; start: number }>,
  };

  /** Plays a search beside a wall and reports which sounds came out by the time its result is in. */
  function search(found: boolean, wall: boolean): string[] {
    const spy = vi.spyOn(audio, 'play').mockImplementation(() => undefined);
    idleFx.clear();
    const map = new Array<number>(48 * 48).fill(0);
    idleFx.search(1000, view as never, 'me', map, (cell) => wall && cell === 5 * 48 + 6);
    if (found) idleFx.noteFound(1100);
    idleFx.frame(1000 + 700, view as never, 'me', false, false, 5, false);
    const names = spy.mock.calls.map((c) => c[0] as string);
    spy.mockRestore();
    return names;
  }

  it('answers a search that found nothing with a solid knock, beside a wall, and says nothing hollow', () => {
    const sounds = search(false, true);
    expect(sounds).toContain('knockSolid');
    expect(sounds).not.toContain('knockHollow');
  });

  it('plays no knock at all after a find (the hollow one comes with the find itself) and none away from walls', () => {
    expect(search(true, true)).not.toContain('knockSolid');
    expect(search(false, false)).not.toContain('knockSolid');
  });

  it('plays the same sounds up to the result whether or not there is something to find', () => {
    // Before the result is in, the search sounds identical: nothing leaks ahead of the find.
    const before = (found: boolean): string[] => {
      const spy = vi.spyOn(audio, 'play').mockImplementation(() => undefined);
      idleFx.clear();
      const map = new Array<number>(48 * 48).fill(0);
      idleFx.search(2000, view as never, 'me', map, (cell) => cell === 5 * 48 + 6);
      void found;
      const names = spy.mock.calls.map((c) => c[0] as string);
      spy.mockRestore();
      return names;
    };
    expect(before(true)).toEqual(before(false));
  });
});

describe('the designer\'s loops of a floor (part 13: fx.json ambient)', () => {
  const asset = (path: string): unknown => JSON.parse(readFileSync(new URL(`../public/assets/${path}`, import.meta.url), 'utf8'));
  const data = asset('fx/fx.json') as { ambient: { terrain: Record<string, unknown>; garden: { fx: string; per: number }; library: { fx: string; per: number; shelfEvery: [number, number] }; heap: Record<string, string>; npc: Record<string, string> } };
  const lib = parseFx(data);

  /** A world with rooms and a blacksmith too. */
  function level(o: Parameters<typeof world>[0] & { rooms?: Array<{ left: number; top: number; right: number; bottom: number; type: number }>; blacksmith?: number }): World {
    const w = world(o);
    Object.assign(w.levels[1]!, { rooms: o.rooms ?? [], ...(o.blacksmith !== undefined ? { blacksmith: o.blacksmith } : {}) });
    return w;
  }

  it('keeps the effects the designer\'s data names for each terrain, and every one of them exists', () => {
    const ids = scanAmbient(level({
      cells: [[100, T.WELL], [101, T.WELL], [102, T.WELL], [110, T.ALCHEMY], [120, T.SIGN], [130, T.PEDESTAL], [140, T.BOOKSHELF]],
      wells: [{ pos: 100, water: 'health' }, { pos: 101, water: 'awareness' }, { pos: 102, water: 'transmutation' }],
      heaps: [{ pos: 130, kind: 'heap', items: [{ kind: 'ring.accuracy' }] }, { pos: 150, kind: 'heap', items: [{ kind: 'dew' }] }],
    }), 1).map((e) => e.id);
    const terrain = data.ambient.terrain;
    const wells = terrain.WELL as Record<string, string>;
    expect(ids).toEqual(expect.arrayContaining([wells.health, wells.awareness, wells.transmutation, terrain.ALCHEMY, terrain.SIGN, terrain.PEDESTAL, terrain.BOOKSHELF, data.ambient.heap.pedestalPrize, data.ambient.heap.dew]));
    for (const id of new Set(ids)) expect(lib.fx[id], id).toBeDefined();
    // Each well has its own water, in the order of the places' waters.
    expect(WELL_FX).toEqual([wells.health, wells.awareness, wells.transmutation]);
  });

  it('shows a well\'s water only while it holds water, a pedestal only with a prize on it, and never the altar\'s', () => {
    expect(scanAmbient(level({ cells: [[100, T.WELL], [200, T.EMPTY_WELL]], wells: [{ pos: 100, water: 'awareness' }] }), 1).map((e) => e.id)).toEqual(['place.well.awareness']);
    const prize = scanAmbient(level({ cells: [[100, T.PEDESTAL]], heaps: [{ pos: 100, kind: 'heap', items: [{ kind: 'ring.accuracy' }] }] }), 1).map((e) => e.id);
    expect(prize.sort()).toEqual(['place.pedestal', 'place.prize']);
    expect(scanAmbient(level({ cells: [[100, T.PEDESTAL]] }), 1)).toEqual([]);
    expect(scanAmbient(level({ cells: [[100, T.PEDESTAL]], altar: { pos: 100, volume: 30 } }), 1)).toEqual([]);
    // The well lies lower than the floor of its room, where the water is.
    const well = scanAmbient(level({ cells: [[100, T.WELL]], wells: [{ pos: 100, water: 'health' }] }), 1)[0]!;
    expect(well.lift).toBeCloseTo(WATER_Y + 0.02, 5);
    expect(well.mode).toBe(AMBIENT_LOOP);
  });

  it('puts a glint on every shelf every 4 to 7 seconds and the dust before one in four, the same shelves every time', () => {
    const cells: Array<[number, number]> = Array.from({ length: 200 }, (_, i) => [100 + i, T.BOOKSHELF]);
    const a = scanAmbient(level({ cells }), 1);
    const b = scanAmbient(level({ cells }), 1);
    expect(a).toEqual(b);
    const glints = a.filter((e) => e.id === data.ambient.library.fx.replace('dust', 'shelf'));
    expect(glints).toHaveLength(200);
    expect(glints.every((e) => e.mode === AMBIENT_CADENCE && e.every[0] === data.ambient.library.shelfEvery[0] && e.every[1] === data.ambient.library.shelfEvery[1])).toBe(true);
    const dust = a.filter((e) => e.id === data.ambient.library.fx);
    expect(dust.every((e) => e.mode === AMBIENT_MOTE)).toBe(true);
    // About one in four (the dice are fixed by the cell).
    expect(dust.length).toBeGreaterThan(200 / DUST_PER * 0.6);
    expect(dust.length).toBeLessThan(200 / DUST_PER * 1.4);
  });

  it('lets fireflies rise over a garden\'s tall grass, about one in six cells, and nowhere else', () => {
    const grass: Array<[number, number]> = Array.from({ length: 300 }, (_, i) => [(10 + Math.floor(i / 30)) * WIDTH + 5 + (i % 30), T.HIGH_GRASS]);
    const garden = { left: 5, top: 10, right: 34, bottom: 19, type: RoomType.GARDEN };
    const lit = scanAmbient(level({ cells: grass, rooms: [garden] }), 1).filter((e) => e.id === data.ambient.garden.fx);
    expect(lit.length).toBeGreaterThan(300 / FIREFLY_PER * 0.6);
    expect(lit.length).toBeLessThan(300 / FIREFLY_PER * 1.4);
    expect(lit.every((e) => e.mode === AMBIENT_MOTE)).toBe(true);
    // The tall grass of a cave or a sewer has none; nor has the grass beside the garden's room.
    expect(scanAmbient(level({ cells: grass, rooms: [{ ...garden, type: RoomType.STANDARD }] }), 1)).toEqual([]);
    expect(scanAmbient(level({ cells: grass }), 1)).toEqual([]);
    expect(FIREFLY_PER).toBe(data.ambient.garden.per);
    expect(DUST_PER).toBe(data.ambient.library.per);
  });

  it('keeps a dewdrop\'s glint where the drop lies, and the forge beside the blacksmith with its light', () => {
    expect(scanAmbient(level({ heaps: [{ pos: 30, kind: 'heap', items: [{ kind: 'dew' }] }, { pos: 31, kind: 'heap', items: [{ kind: 'food.ration' }] }] }), 1).map((e) => [e.id, e.x])).toEqual([['place.dew', 30.5]]);
    // To the east of him when that is open floor, else to the west, else at his feet.
    const east = scanAmbient(level({ cells: [[501, T.EMPTY_SP]], blacksmith: 500 }), 1);
    expect(east.map((e) => [e.id, e.x])).toEqual([[data.ambient.npc.blacksmith, 501.5 % WIDTH]]);
    const west = scanAmbient(level({ cells: [[501, T.WALL], [499, T.EMPTY_SP]], blacksmith: 500 }), 1);
    expect(west[0]!.x).toBeCloseTo(((499 % WIDTH) + 0.5), 5);
    expect(scanAmbient(level({ cells: [[501, T.WALL], [499, T.WALL]], blacksmith: 500 }), 1)[0]!.x).toBeCloseTo(((500 % WIDTH) + 0.5), 5);
    // His light is a place's own light: orange, flickering, 4 cells.
    const spots = scanPlaces(level({ blacksmith: 500 }), 1);
    expect(spots.map((s) => s.kind)).toEqual([P_FORGE]);
    const look = lookOf(spots[0]!)!;
    expect(look.reach).toBe(lib.fx['quest.forge']!.light!.radius);
    expect(look.rgb.map((c) => Math.round(c * 255))).toEqual(lib.fx['quest.forge']!.light!.rgb);
    expect(scanPlaces(level({}), 1)).toEqual([]);
  });

  it('gives the pot and the health well the colours of the designer\'s sheets', () => {
    expect(POT_LOOK.rgb.map((c) => Math.round(c * 255))).toEqual(lib.fx['place.pot.amber']!.light!.rgb);
    const health = WELL_LOOK[W_HEALTH]!.rgb.map((c) => Math.round(c * 255));
    expect(health).toEqual(lib.fx['place.well.health']!.light!.rgb);
    expect(WELL_LOOK[W_AWARE]!.rgb.map((c) => Math.round(c * 255))[2]).toBe(255);
  });

  it('draws nothing of its own where the designer\'s sheet draws: a well, the pot, a prize, a shelf, a sign and a garden give the hand-made motes up', async () => {
    const places = readFileSync(new URL('../src/r3d/places3d.ts', import.meta.url), 'utf8');
    // Each of the hand-made motes is behind the switch of the sheets (`this.art`), so the two are never drawn together.
    for (const place of ['well', 'pot', 'pollen', 'prize', 'dust', 'glint', 'dew']) {
      const body = places.slice(places.indexOf(`private ${place}(`));
      expect(body.slice(0, body.indexOf('\n  }\n')), place).toContain('this.art');
    }
  });
});

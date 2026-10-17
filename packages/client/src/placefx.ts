import { cellX, cellY, type Effect, type Glyph, heroById, type Mob, T, WIDTH, type World } from '@pd/core';
import { audio, type Sound } from './audio';
import { fx } from './fx';
import { itemName } from './itemtext';
import { P_ALTAR, P_PEDESTAL, P_POT, P_SHELF, P_WELL, placeStore, scanPlaces, type Spot, W_AWARE, W_CHANGE, W_HEALTH } from './places';
import { WORDS } from './placetext';
import { quality } from './quality';
import { seenCells } from './sight';
import { stamps } from './stamps';
import type { View } from './view';

/*
 * What the special places and a few weak things do, as light, sound and a word (the look of them standing there is r3d/places3d.ts):
 *
 *  - a well drunk from: a column of light in the water's colour, rings, a chime of its own, and a toast saying what it did;
 *  - what is brewed, offered, taken off a pedestal; the statue waking; the sounds each place makes now and then while it is in sight;
 *  - the wand of flock's sheep, the mirror images, the lullaby's «z», the ring of thorns, the armour's glyphs, the alarm's bell;
 *  - the wand of teleportation's vanishing, slowness and poison on their target, the potions of purity and levitation.
 *
 * Presentation only: it reads the effects the rules already give and the world as it is; it changes no rule, and it says nothing that
 * what the party sees does not already say. (A ring's thorns and haggling show only once the ring is known.)
 */

const TILE = 16;

/** Where a toast goes (main.ts sets it: screens.ts is not imported here). */
export const placeSink = {
  toast: (_text: string, _tone?: 'good' | 'warn'): void => undefined,
};

const place = (cell: number): { x: number; y: number } => ({ x: cellX(cell) * TILE + TILE / 2, y: cellY(cell) * TILE + TILE / 2 });
const cx = (cell: number): number => (cell % WIDTH) + 0.5;
const cz = (cell: number): number => Math.trunc(cell / WIDTH) + 0.5;

/** The palettes of each water, as the effects module's colours. */
const WATER_COLORS: ReadonlyArray<readonly string[]> = [
  ['#7dffa0', '#c8ffd8', '#ffa8c8', '#40e070'],
  ['#8fd0ff', '#e0f4ff', '#5aa0ff', '#ffffff'],
  ['#d09aff', '#ffd0ff', '#7a50e0', '#ffe080'],
];
const WATER_RGB: ReadonlyArray<readonly [number, number, number]> = [[0.42, 0.95, 0.55], [0.42, 0.74, 1.0], [0.78, 0.45, 1.0]];
const WATER_CSS = ['110, 255, 150', '120, 190, 255', '200, 140, 255'];

const GLYPH_RGB: Readonly<Record<Glyph, readonly [number, number, number]>> = {
  bounce: [0.95, 0.9, 0.55], affection: [1, 0.45, 0.72], antiEntropy: [0.6, 0.86, 1], multiplicity: [0.76, 0.8, 1], potential: [1, 0.95, 0.4],
  metabolism: [0.5, 1, 0.55], stench: [0.62, 0.82, 0.3], viscosity: [0.85, 0.7, 0.45], displacement: [0.72, 0.5, 1], entanglement: [0.4, 0.85, 0.35],
  autoRepair: [1, 0.75, 0.4],
};
const GLYPH_ORDER: readonly Glyph[] = [
  'bounce', 'affection', 'antiEntropy', 'multiplicity', 'potential', 'metabolism', 'stench', 'viscosity', 'displacement', 'entanglement', 'autoRepair',
];

const DUST = ['#b8ad8f', '#8f866c', '#d6ccae'];
const WHITE_SMOKE = ['rgba(255,255,255,0.8)', 'rgba(230,240,255,0.7)', '#ffffff'];
const WOOL = ['#ffffff', '#f2f2f2', '#dcdcdc'];

const waterOf = (water: string): number => (water === 'health' ? W_HEALTH : water === 'awareness' ? W_AWARE : W_CHANGE);

/** A column of light and the rest of what drinking from a well looks like. */
function wellUse(cell: number, water: number, mine: boolean, now: number): void {
  const at = place(cell);
  const colors = WATER_COLORS[water]!;
  const rgb = WATER_RGB[water]!;
  const calm = quality.reducedMotion;
  if (water === W_CHANGE) {
    // Wading into the water of change does nothing: it only shimmers.
    stamps.add(stamps.RUNE, cx(cell), cz(cell), 0.3, now, 700, rgb, 1.1);
    fx.burst(at.x, at.y - 2, now, { count: 10, colors: colors, glow: true, speed: [8, 24], life: [500, 900], rise: 14, spread: 4, size: [1, 1] });
    audio.play('wellChange', 1, 0.7, at);
    return;
  }
  stamps.add(stamps.BEAM, cx(cell), cz(cell), 0, now, calm ? 900 : 1500, rgb, 1);
  fx.wave(at.x, at.y, now, { colors, rings: calm ? 1 : 3, tiles: 3.2, duration: 800, stagger: 140, width: 2 });
  fx.burst(at.x, at.y - 2, now, { count: quality.light ? 16 : 34, colors, glow: true, speed: [8, 40], life: [700, 1400], rise: 40, drag: 0.3, spread: 5, size: [1, 2] });
  fx.pulse(at.x, at.y, now, WATER_CSS[water]!, 8, 1200);
  if (mine) fx.flash(WATER_CSS[water]!, 0.22, 500, now);
  audio.play(water === W_HEALTH ? 'wellHealth' : 'wellAware', 1, 1, mine ? undefined : at);
}

/** Looks and sounds for one effect, after the view has taken it in. */
function one(effects: readonly Effect[], index: number, view: View, world: World, myId: string, now: number): void {
  const effect = effects[index]!;
  const here = (depth: number): boolean => depth === view.depth;
  switch (effect.type) {
    case 'well': {
      const hero = heroById(world, effect.hero);
      if (!hero || hero.depth !== view.depth) return;
      const water = waterOf(effect.water);
      wellUse(hero.pos, water, effect.hero === myId, now);
      if (effect.hero === myId) placeSink.toast(WORDS.wellDone(water), 'good');
      return;
    }
    case 'transmuted': {
      const hero = heroById(world, effect.hero);
      if (!hero || hero.depth !== view.depth) return;
      const at = place(hero.pos);
      stamps.add(stamps.BEAM, cx(hero.pos), cz(hero.pos), 0, now, 1400, WATER_RGB[W_CHANGE]!, 1);
      fx.wave(at.x, at.y, now, { colors: WATER_COLORS[W_CHANGE]!, rings: 3, tiles: 3, duration: 800, stagger: 150, width: 2 });
      fx.burst(at.x, at.y - 2, now, { count: quality.light ? 18 : 40, colors: WATER_COLORS[W_CHANGE]!, glow: true, speed: [10, 50], life: [700, 1300], rise: 30, spread: 5, size: [1, 2] });
      fx.pulse(at.x, at.y, now, WATER_CSS[W_CHANGE]!, 8, 1100);
      audio.play('wellChange', 1, 1, effect.hero === myId ? undefined : at);
      if (effect.hero === myId) placeSink.toast(WORDS.transmuted(itemName(world, effect.from), itemName(world, effect.to)), 'good');
      return;
    }
    case 'brewed': {
      if (!here(effect.depth)) return;
      const at = place(effect.pos);
      fx.burst(at.x, at.y - 4, now, { count: quality.light ? 12 : 26, colors: ['#66f0cc', '#aaffe8', '#ffffff', '#ffe27a'], glow: true, speed: [10, 50], life: [500, 1100], rise: 40, drag: 0.3, spread: 4, size: [1, 2] });
      fx.pulse(at.x, at.y, now, '110, 240, 200', 6, 800);
      stamps.add(stamps.BEAM, cx(effect.pos), cz(effect.pos), 0, now, 900, [0.4, 0.95, 0.8], 0.7);
      audio.play('brewDone', 1, 0.9, at);
      return;
    }
    case 'sacrifice': {
      if (!here(effect.depth)) return;
      const at = place(effect.pos);
      if (effect.outcome === 'unworthy') {
        audio.play('altarRefuse', 1, 0.9, at);
        fx.burst(at.x, at.y, now, { count: 14, colors: ['#4a4a4a', '#6a6a6a', '#2a2a2a'], speed: [5, 20], life: [700, 1300], rise: 20, drag: 0.4, size: [2, 3], spread: 6 });
        return;
      }
      audio.play('altarAccept', effect.outcome === 'reward' ? 0.9 : 1.1, 1, at);
      stamps.add(stamps.BEAM, cx(effect.pos), cz(effect.pos), 0, now, effect.outcome === 'reward' ? 1800 : 1100, [1, 0.5, 0.2], effect.outcome === 'reward' ? 1.5 : 1);
      fx.pulse(at.x, at.y, now, '255, 140, 60', effect.outcome === 'reward' ? 12 : 8, 1200);
      return;
    }
    case 'pickedUp': {
      const hero = heroById(world, effect.hero);
      if (!hero || hero.depth !== view.depth) return;
      const terrain = world.levels[hero.depth]?.map[hero.pos];
      if (terrain !== T.PEDESTAL) return;
      // A prize lifted off its pedestal: its light goes up in a handful of gold.
      const at = place(hero.pos);
      fx.burst(at.x, at.y - 4, now, { count: quality.light ? 8 : 18, colors: ['#ffe9a0', '#ffffff', '#ffd060'], glow: true, speed: [10, 40], life: [500, 1000], rise: 30, spread: 4, size: [1, 2] });
      audio.play('shine', 1.1, 0.8, effect.hero === myId ? undefined : at);
      return;
    }
    case 'dew': {
      const hero = heroById(world, effect.hero);
      if (!hero || hero.depth !== view.depth) return;
      const at = place(hero.pos);
      fx.burst(at.x, at.y - 2, now, { count: quality.light ? 5 : 11, colors: ['#bfefff', '#ffffff', '#7fd0ff'], glow: true, speed: [6, 24], life: [500, 1000], rise: 26, spread: 4, size: [1, 1] });
      return;
    }
    case 'flock': {
      if (!here(effect.depth)) return;
      // Sheep pop in with a puff of wool, each with its own bleat, a beat apart, and a little different.
      effect.cells.forEach((cell, i) => {
        const at = place(cell);
        fx.burst(at.x, at.y, now + i * 40, { count: 9, colors: WOOL, speed: [20, 60], life: [300, 620], gravity: 60, drag: 0.2, size: [1, 2], spread: 3 });
        fx.burst(at.x, at.y - 4, now + i * 40, { count: 4, colors: ['#ffffff', '#ffe9a0'], glow: true, speed: [10, 30], life: [300, 600], rise: 20, size: [1, 1] });
        if (i < 4) audio.later(60 + i * 90, 'bleat', 0.82 + ((i * 37) % 7) * 0.05, 0.6, at);
      });
      return;
    }
    case 'faded': {
      if (!here(effect.depth)) return;
      // A sheep melts away in a soft puff.
      const at = place(effect.pos);
      fx.burst(at.x, at.y, now, { count: 12, colors: WHITE_SMOKE, speed: [10, 40], life: [400, 800], rise: 14, drag: 0.4, size: [2, 3], spread: 5 });
      fx.burst(at.x, at.y - 4, now, { count: 6, colors: ['#ffffff', '#ffe9a0'], glow: true, speed: [10, 30], life: [300, 600], rise: 24, size: [1, 1] });
      audio.play('pop', 0.9, 0.6, at);
      audio.later(40, 'puff', 1.2, 0.5, at);
      return;
    }
    case 'baa': {
      if (!here(effect.depth)) return;
      const puppet = view.puppets.get(effect.mob);
      if (puppet) {
        const p = view.position(puppet, now);
        audio.play('bleat', 0.9 + Math.random() * 0.25, 0.55, { x: p.x + TILE / 2, y: p.y + TILE / 2 });
      }
      return;
    }
    case 'mirrored': {
      if (!here(effect.depth)) return;
      effect.cells.forEach((cell, i) => {
        const at = place(cell);
        fx.burst(at.x, at.y - 4, now + i * 60, { count: quality.light ? 8 : 18, colors: ['#c6f6ff', '#86d6ff', '#ffffff'], glow: true, speed: [6, 30], life: [400, 900], rise: 10, spread: 5, size: [1, 1] });
        fx.wave(at.x, at.y, now + i * 60, { colors: ['#bfe6ff'], rings: 1, tiles: 1.1, duration: 420, width: 1.5 });
      });
      audio.play('shimmer', 1, 0.8);
      return;
    }
    case 'scroll': {
      if (effect.kind === 'lullaby') lullaby(view, world, now);
      if (effect.kind === 'psionic') psionic(view, effect.hero === myId, now);
      return;
    }
    case 'glyph': {
      const hero = heroById(world, effect.hero);
      if (!hero || hero.depth !== view.depth) return;
      const rgb = GLYPH_RGB[effect.glyph] ?? [1, 1, 1];
      stamps.add(stamps.RUNE, cx(hero.pos), cz(hero.pos), 0.55, now, quality.reducedMotion ? 320 : 520, rgb, 1);
      audio.play('glyph', 0.85 + GLYPH_ORDER.indexOf(effect.glyph) * 0.055, 0.7, effect.hero === myId ? undefined : place(hero.pos));
      return;
    }
    case 'trap': {
      if (!here(effect.depth) || effect.kind !== 'alarm') return;
      // The alarm: rings of sound spreading out from the plate, each wider than the last, and the plate shivering.
      const at = place(effect.pos);
      const seen = effect.hero !== '' || seenCells(world, view.depth)[effect.pos] === true;
      if (!seen) return;
      fx.wave(at.x, at.y, now, { colors: ['#ffd860', '#ffffff', '#ffb040'], rings: quality.light ? 2 : 4, tiles: 11, duration: 1300, stagger: 240, width: 2.5 });
      fx.pulse(at.x, at.y, now, '255, 210, 90', 7, 700);
      fx.burst(at.x, at.y - 4, now, { count: 10, colors: ['#ffd860', '#ffffff'], glow: true, speed: [20, 60], life: [300, 600], size: [1, 1], spread: 2 });
      return;
    }
    case 'zapped': {
      if (!here(effect.depth)) return;
      const at = place(effect.to);
      if (effect.bolt === 'teleport') {
        // The target is drawn into a point and gone: specks flying in, a ring closing, a violet flash.
        fx.curse(at.x, at.y, now + 80, 8);
        fx.wave(at.x, at.y, now + 60, { colors: ['#e0b0ff', '#ffffff'], rings: 2, tiles: 1.6, duration: 380, stagger: 90, width: 2 });
        fx.pulse(at.x, at.y, now + 60, '200, 140, 255', 6, 500);
      } else if (effect.bolt === 'slow') {
        // A weight settling on it: an amber ring that sinks, drops dripping off it.
        fx.wave(at.x, at.y, now + 60, { colors: ['#ffd060', '#fff0b0'], rings: 2, tiles: 1.4, duration: 600, stagger: 140, width: 2 });
        fx.burst(at.x, at.y - 4, now + 60, { count: 10, colors: ['#ffd060', '#c89a30', '#fff0b0'], speed: [4, 14], life: [600, 1100], gravity: 40, drag: 0.4, size: [1, 2], spread: 5 });
        audio.later(80, 'slowed', 1, 0.7, at);
      } else if (effect.bolt === 'poison') {
        fx.burst(at.x, at.y - 2, now + 60, { count: 14, colors: ['#5fcf2f', '#a6e86a', '#2f8f1f'], speed: [8, 30], life: [500, 1000], rise: 18, drag: 0.3, size: [1, 2], spread: 5 });
        fx.wave(at.x, at.y, now + 60, { colors: ['#7ad040'], rings: 1, tiles: 1.2, duration: 500, width: 2 });
      }
      return;
    }
    case 'used': {
      const hero = heroById(world, effect.hero);
      if (!hero || hero.depth !== view.depth) return;
      if (effect.kind === 'potion.levitation') {
        const at = place(hero.pos);
        fx.wave(at.x, at.y + 3, now, { colors: ['#dff2ff', '#ffffff'], rings: 2, tiles: 1.5, duration: 600, stagger: 150, width: 1.5 });
        fx.burst(at.x, at.y + 4, now, { count: quality.light ? 8 : 18, colors: ['#e8f4ff', '#bfe3ff', '#ffffff'], speed: [10, 36], life: [400, 800], rise: 20, drag: 0.3, angle: -Math.PI / 2, cone: 2.2, size: [1, 1], spread: 5 });
        audio.play('levitate', 1, 0.8, effect.hero === myId ? undefined : at);
      }
      return;
    }
    case 'burst': {
      if (!here(effect.depth) || effect.kind !== 'purity') return;
      // The clearing: a wave of white-blue that runs out over the whole of the cloud's reach and takes the gas with it.
      const at = place(effect.pos);
      fx.wave(at.x, at.y, now, { colors: ['#ffffff', '#cfeaff', '#e8f8ff'], rings: quality.light ? 2 : 3, tiles: effect.radius + 1.6, duration: 900, stagger: 170, width: 3 });
      fx.pulse(at.x, at.y, now, '210, 235, 255', 7, 700);
      fx.burst(at.x, at.y - 3, now, { count: 14, colors: ['#ffffff', '#cfeaff'], glow: true, speed: [14, 50], life: [500, 1000], rise: 14, size: [1, 1], spread: 4 });
      audio.play('purify', 1, 0.8, at);
      return;
    }
    case 'attack': {
      thorns(effects, index, view, world, myId, now);
      return;
    }
    default:
      return;
  }
}

/** The ring of thorns, once it is known: the monster's blow came back as a number on it (the hurt that follows), now with a spike. */
function thorns(effects: readonly Effect[], index: number, view: View, world: World, myId: string, now: number): void {
  const blow = effects[index]!;
  if (blow.type !== 'attack' || !blow.hit || blow.depth !== view.depth || !blow.attacker.startsWith('#')) return;
  const hero = heroById(world, blow.target);
  if (!hero || hero.id !== myId || !hero.rings.some((r) => r.kind === 'ring.thorns') || !world.known.includes('ring.thorns')) return;
  for (let i = index + 1; i < effects.length; i++) {
    const next = effects[i]!;
    if (next.type === 'attack') return;
    if (next.type === 'glyph') return;
    if (next.type === 'hurt' && next.who === blow.attacker && next.damage > 0) {
      const mob = world.floors[view.depth]?.mobs.find((m) => m.id === blow.attacker);
      if (mob) {
        stamps.add(stamps.SPIKES, cx(mob.pos), cz(mob.pos), 0.45, now + 60, 380, [1, 0.45, 0.35], 0.9, 0.4);
        audio.later(60, 'thorns', 1, 0.7, place(mob.pos));
      }
      return;
    }
  }
}

/** The lullaby: a little «z» drifting up, again and again, over every creature it put to sleep that the party sees. */
function lullaby(view: View, world: World, now: number): void {
  const seen = seenCells(world, view.depth);
  const mobs = (world.floors[view.depth]?.mobs ?? []).filter((m: Mob) => m.state === 'sleeping' && m.kind !== 'statue' && seen[m.pos] === true);
  const rgb: readonly [number, number, number] = [0.78, 0.88, 1];
  let n = 0;
  for (const mob of mobs.slice(0, 10)) {
    const flip = (mob.pos % 3) * 1.2;
    for (let k = 0; k < 3; k++) {
      if (n++ >= 30) return;
      stamps.add(stamps.Z, cx(mob.pos), cz(mob.pos), 0.95, now + 200 + k * 900 + (mob.pos % 5) * 70, 1700, rgb, 0.3 + k * 0.05, flip + k);
    }
  }
}

/** The psionic blast: a rising whine as a warning, then the flash and the shove of it. */
function psionic(view: View, mine: boolean, now: number): void {
  void view;
  if (quality.reducedMotion) return;
  // A warm warning flash at the edge of the screen, the moment before the white one (fx-events.ts).
  if (mine) fx.flash('255, 190, 90', 0.28, 150, now, true);
}

/**
 * The batch of effects of a turn, once the view has taken them in. (Called before the per-effect looks; these are the ones that
 * need the whole batch, or the world, or a toast.)
 */
export function placesBatch(effects: readonly Effect[], view: View, world: World, myId: string, now: number): void {
  for (let i = 0; i < effects.length; i++) one(effects, i, view, world, myId, now);
}

/* ------------------------------------------------------------------------------------------------------------------------------ */
/* The floor's places, and what they sound like now and then                                                                      */
/* ------------------------------------------------------------------------------------------------------------------------------ */

/** The list of places is made again when the floor or the turn changes. */
export function updatePlaces(world: World, depth: number, key: string): void {
  if (placeStore.key === key) return;
  placeStore.key = key;
  placeStore.floor = `${depth}:${key.slice(key.lastIndexOf(':') + 1)}`;
  placeStore.spots = scanPlaces(world, depth);
}

/** What each place sounds like, how often (ms between), how loud, from how many cells it is heard. */
interface Air {
  sound: (spot: Spot) => Sound;
  every: readonly [number, number];
  volume: number;
  range: number;
}

const AIRS: Readonly<Record<number, Air>> = {
  [P_WELL]: { sound: (s) => (s.water === W_HEALTH ? 'wellHealth' : s.water === W_AWARE ? 'wellAware' : 'wellChange'), every: [6500, 11000], volume: 0.16, range: 7 },
  [P_ALTAR]: { sound: () => 'altarFire', every: [2600, 4200], volume: 0.3, range: 9 },
  [P_POT]: { sound: () => 'bubble', every: [2200, 4600], volume: 0.3, range: 6 },
  [P_PEDESTAL]: { sound: () => 'shine', every: [9000, 15000], volume: 0.22, range: 6 },
  [P_SHELF]: { sound: () => 'pages', every: [22000, 40000], volume: 0.2, range: 3 },
};

const nextAt = new Map<number, number>();
let airKey = '';
const hearing = { x: 0, y: 0 };

/** Every frame: the sounds of the places in sight, one now and then each (never together), and the statue that has woken. */
export function placesFrame(view: View, world: World, hero: { pos: number }, now: number): void {
  if (airKey !== placeStore.floor) {
    airKey = placeStore.floor;
    nextAt.clear();
  }
  const seen = seenCells(world, view.depth);
  const hx = hero.pos % WIDTH;
  const hy = Math.trunc(hero.pos / WIDTH);
  const spots = placeStore.spots;
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i]!;
    const air = AIRS[s.kind];
    if (!air || !seen[s.cell]) continue;
    if (Math.abs((s.cell % WIDTH) - hx) > air.range || Math.abs(Math.trunc(s.cell / WIDTH) - hy) > air.range) continue;
    const due = nextAt.get(s.cell);
    if (due === undefined) {
      nextAt.set(s.cell, now + 400 + Math.random() * air.every[1]);
      continue;
    }
    if (now < due) continue;
    nextAt.set(s.cell, now + air.every[0] + Math.random() * (air.every[1] - air.every[0]));
    hearing.x = cellX(s.cell) * TILE + TILE / 2;
    hearing.y = cellY(s.cell) * TILE + TILE / 2;
    audio.play(air.sound(s), 0.95 + Math.random() * 0.1, air.volume, hearing);
  }
  // The statue that woke: stone breaks away from it, and a heavy sound follows the creaking.
  while (view.woke.length > 0) {
    const cell = view.woke.pop()!;
    stoneWakes(cell, now);
  }
  while (view.warps.length > 0) {
    const w = view.warps.pop()!;
    const at = place(w.cell);
    if (seen[w.cell]) {
      fx.burst(at.x, at.y - 4, now, { count: quality.light ? 8 : 16, colors: ['#e0b0ff', '#ffffff', '#b070ff'], glow: true, speed: [6, 40], life: [400, 900], rise: 14, spread: 4, size: [1, 1] });
      fx.wave(at.x, at.y, now, { colors: ['#e0b0ff'], rings: 1, tiles: 1.3, duration: 420, width: 2 });
      audio.play('teleport', 1.3, 0.5, at);
    }
  }
}

/** A statue stirring: cracks run over it and glow, dust sifts off, the grinding of stone; then it breaks free. */
function stoneWakes(cell: number, now: number): void {
  const at = place(cell);
  stamps.add(stamps.CRACKS, cx(cell), cz(cell), 0.5, now, 720, [0.6, 0.95, 1], 1);
  audio.play('stoneCrack', 1, 1, at);
  fx.burst(at.x, at.y - 2, now, { count: quality.light ? 10 : 22, colors: DUST, speed: [4, 22], life: [500, 1100], gravity: 30, drag: 0.3, size: [1, 2], spread: 6 });
  fx.burst(at.x, at.y - 2, now + 300, { count: quality.light ? 6 : 14, colors: ['#9a958a', '#c0b8a4', '#6e6a62'], speed: [14, 50], life: [400, 800], gravity: 40, size: [1, 2], spread: 5 });
  fx.shake(1.5, 500, now);
  // Then it breaks away from what held it.
  fx.burst(at.x, at.y - 2, now + 640, { count: quality.light ? 12 : 30, colors: ['#9a958a', '#c0b8a4', '#6e6a62', '#d8dce4'], speed: [30, 100], life: [350, 800], gravity: 40, size: [1, 3], spread: 4 });
  fx.burst(at.x, at.y - 6, now + 640, { count: 8, colors: ['#9ff4ff', '#ffffff'], glow: true, speed: [10, 40], life: [300, 600], size: [1, 1], spread: 2 });
  window.setTimeout(() => fx.shake(4, 380, fx.now), 640);
  audio.later(640, 'stoneAwake', 1, 1, at);
}

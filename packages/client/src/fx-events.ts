import { cellX, cellY, type Effect, F, heroById, HEIGHT, type ItemKind, terrainFlags, type Level, type MobKind, T, WIDTH, type World } from '@pd/core';
import { type BurstOptions, fx, type Piece } from './fx';
import { type Puppet, STEP_MS, TILE, type View } from './view';
import { audio } from './audio';
import { quality } from './quality';
import { seenCells } from './sight';
import { duration, levelRegion } from './sprites';
import { fxp } from './fxplayer';
import { eventKey } from './fxsheet';
import { showBossCard } from './bosscard';
import { addFxLights } from './fxdraw2d';
import { regionIndex } from './worldsheets';
import { minedFx } from './questfx';
import {
  bloodRgb, chunkCount, chunksOf, FLOOR as FLOOR_LAYER, gore as record, levelSpatterMap, NO_BLOOD, NO_BODY, poolSplat, shade as shadeOf, spatterOf,
  type SpatterMap,
} from './gore';

/*
 * What the dungeon's events look like beyond the sprites: blood and sparks on
 * a blow, a spray in the direction it came from, bursts on a kill, fire,
 * frost and smoke, light on healing and on a level gained, and the camera
 * kicked by heavy blows, explosions and fallen bosses.
 */

const BLOOD = ['#b01818', '#d83030', '#7a0e0e'];
const ICHOR = ['#5fcf2f', '#2f8f1f', '#a6e86a'];
const BONE = ['#ece6cc', '#c4bea6', '#8f8a78'];
const SPARK = ['#ffe9a0', '#ffffff', '#ffb040'];
const ECTO = ['#c6f6ff', '#86d6ff', '#ffffff'];
const FIRE = ['#ffcf60', '#ff7a20', '#ffefa0', '#ff4010'];
const VOID = ['#b050d0', '#6a2a9a', '#e8a0ff'];
const GOLD = ['#ffe070', '#fff6c0', '#e0a020'];
const HEAL = ['#80ff80', '#c8ffc8', '#40e040'];
const FROST = ['#d6f4ff', '#9fdcff', '#ffffff'];
const SMOKE = ['#6a6a6a', '#8a8a8a', '#4a4a4a'];
const DUST = ['#b8ad8f', '#8f866c', '#d6ccae'];

/** What spills from a creature struck or slain, and whether it glows. */
function material(kind: string): { colors: readonly string[]; glow: boolean } {
  switch (kind as MobKind) {
    case 'goo': case 'acidic': case 'spinner': case 'rottingFist': case 'larva': case 'swarm':
      return { colors: ICHOR, glow: false };
    case 'skeleton': case 'undead':
      return { colors: BONE, glow: false };
    case 'golem': case 'dm300': case 'statue':
      return { colors: SPARK, glow: true };
    case 'wraith': case 'curse': case 'ghost': case 'mirror':
      return { colors: ECTO, glow: true };
    case 'elemental': case 'burningFist':
      return { colors: FIRE, glow: true };
    case 'eye': case 'yog':
      return { colors: VOID, glow: true };
    case 'bee':
      return { colors: GOLD, glow: true };
    default:
      return { colors: BLOOD, glow: false };
  }
}

/**
 * What a creature comes apart into: chunks of meat, bone chips, blobs of slime,
 * stone and metal bits, embers that burn out, or (for ghosts) only wisps; what
 * a chunk smears where it bounces, the pool spreading under the body, and
 * whether a body is left at all.
 */
interface Gore {
  pieces: readonly Piece[];
  smear: string | null;
  pool: { color: string; edge: string } | null;
  corpse: boolean;
  /** Chunks that glow and burn out, leaving nothing. */
  embers?: boolean;
  /** Nothing solid: it leaves as a wisp. */
  wisp?: boolean;
}

const MEAT: Gore = {
  pieces: [['#c42020', '#5a0808'], ['#8a1010', '#420404'], ['#e07070', '#a03030'], ['#d83030', '#6a0a0a']],
  smear: '#7a0e0e', pool: { color: '#7a0e0e', edge: '#4e0606' }, corpse: true,
};
const BONE_CHIPS: Gore = {
  pieces: [['#ece6cc', '#8f8a78'], ['#d6cfb4', '#7a7462'], ['#c4bea6', '#6a6555']], smear: null, pool: null, corpse: true,
};
const SLIME: Gore = {
  pieces: [['#5fcf2f', '#2a6a14'], ['#a6e86a', '#4f8f2f'], ['#2f8f1f', '#164a0c']],
  smear: '#2f8f1f', pool: { color: '#2f7f1f', edge: '#1a4a10' }, corpse: true,
};
const RUBBLE: Gore = {
  pieces: [['#9a958a', '#4a4740'], ['#c0b8a4', '#5e584c'], ['#6e6a62', '#38352f'], ['#c8ccd4', '#5a5e66']], smear: null, pool: null, corpse: true,
};
const EMBERS: Gore = {
  pieces: [['#ffcf60', '#ff7a20'], ['#ffefa0', '#ffb040'], ['#ff7a20', '#c03008']], smear: null, pool: null, corpse: false, embers: true,
};
const ECTOPLASM: Gore = { pieces: [], smear: null, pool: null, corpse: false, wisp: true };
const VOID_FLESH: Gore = {
  pieces: [['#b050d0', '#4a1a6a'], ['#6a2a9a', '#30104a'], ['#e8a0ff', '#8a50b0']],
  smear: '#4a1a6a', pool: { color: '#4a1a6a', edge: '#2a0a3a' }, corpse: true,
};
const CHITIN: Gore = {
  pieces: [['#ffd020', '#8a6a08'], ['#4a3a18', '#1a1206'], ['#fff0a0', '#b09030']], smear: null, pool: null, corpse: true,
};

function goreOf(kind: string): Gore {
  switch (kind as MobKind) {
    case 'goo': case 'acidic': case 'spinner': case 'rottingFist': case 'larva': case 'swarm':
      return SLIME;
    case 'skeleton': case 'undead':
      return BONE_CHIPS;
    case 'golem': case 'dm300': case 'statue':
      return RUBBLE;
    case 'wraith': case 'curse': case 'ghost': case 'mirror':
      return ECTOPLASM;
    case 'elemental': case 'burningFist':
      return EMBERS;
    case 'eye': case 'yog':
      return VOID_FLESH;
    case 'bee':
      return CHITIN;
    default:
      return MEAT;
  }
}

const BOSSES = new Set(['goo', 'tengu', 'dm300', 'king', 'yog']);

/*
 * The designer's effects (fxplayer.ts): the screen takes their shake and flash through the effects module (so the settings' shake and
 * reduced motion apply), and the player asks the view where a character is. Where it has a look for an event, the older effects of that
 * event are left out below.
 */
let boundView: View | null = null;
let boundWorld: World | null = null;
const heroAt = { x: 0, y: 0 };
const bossAt = { x: 0, z: 0 };
const env = {
  depth: 0,
  myId: '',
  labels: {} as Readonly<Partial<Record<ItemKind, number>>>,
  where(id: string, out: { x: number; z: number }): boolean {
    const puppet = boundView?.puppets.get(id);
    if (!puppet || !boundView) return false;
    boundView.positionInto(puppet, fx.now, heroAt);
    out.x = (heroAt.x + TILE / 2) / TILE;
    out.z = (heroAt.y + TILE / 2) / TILE;
    return true;
  },
  htOf(id: string): number {
    return boundView?.puppets.get(id)?.ht ?? 0;
  },
  sees(cell: number): boolean {
    return boundWorld !== null && boundView !== null && seenCells(boundWorld, boundView.depth)[cell] === true;
  },
};
fxp.sink = {
  shake: (px, ms, now) => fx.shake(px, ms, now),
  flash: (rgb, alpha, ms, now) => fx.flash(rgb, alpha, ms, now),
  stain: (x, y, now, color) => fx.splat(x, y, now, [color], 5, 5),
  reducedMotion: () => quality.reducedMotion,
  light: () => quality.light,
};
// Splats and chunks that settle on the floor are baked into the level's blood for good (gore.ts); a cloud of blood in water that has run
// its course leaves a faint stain in the cells it reached.
fx.onStain = (x, y, w, h, color, edge) => {
  if (!color.startsWith('#')) return;
  record.addSplat({ layer: FLOOR_LAYER, x, y, w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)), rgb: edge ? shadeOf(cssRgb(color), 0.8) : cssRgb(color) });
};
fx.onBleedEnd = (b) => {
  const map = fx.floor;
  if (!map) return;
  const reach = b.reach + 0.55;
  const cx = b.x / TILE;
  const cz = b.y / TILE;
  for (let z = Math.max(0, Math.floor(cz - reach)); z <= Math.min(HEIGHT - 1, Math.ceil(cz + reach)); z++) {
    for (let x = Math.max(0, Math.floor(cx - reach)); x <= Math.min(WIDTH - 1, Math.ceil(cx + reach)); x++) {
      const cell = z * WIDTH + x;
      const flags = terrainFlags[map[cell] ?? 0] ?? 0;
      if ((flags & F.LIQUID) === 0 || (flags & F.PIT) !== 0) continue;
      const edge = 1 - Math.hypot(x + 0.5 - cx, z + 0.5 - cz) / reach;
      if (edge > 0) record.settleWater(cell, Math.round(255 * 0.22 * b.power * edge * Math.sqrt(edge)));
    }
  }
};
fxp.locate = (id, now, out) => {
  const puppet = boundView?.puppets.get(id);
  if (!puppet || !boundView) return false;
  boundView.positionInto(puppet, now, heroAt);
  out.x = (heroAt.x + TILE / 2) / TILE;
  out.z = (heroAt.y + TILE / 2) / TILE;
  return true;
};

/** The way the last blow on each creature went, so its death can throw it apart that way. */
const blows = new Map<string, { angle: number; at: number; damage: number }>();
/** A blow this recent still counts as the one that killed. */
const BLOW_MS = 1500;

/** Where a character stands on the floor (its feet), and how high its middle is over them. */
function feetOf(view: View, puppet: Puppet, now: number): { x: number; y: number; z: number } {
  const { x, y } = view.position(puppet, now);
  return { x: x + TILE / 2, y: y + TILE - 3, z: Math.min(puppet.sprite.sheet.h, TILE) / 2 - 1 };
}

/** Chunks thrown off a body: a handful on a kill (more for a boss), one or two off a heavy blow. */
function throwGibs(feet: { x: number; y: number; z: number }, gore: Gore, count: number, angle: number | undefined, force: number, now: number): void {
  if (gore.wisp || gore.pieces.length === 0) return;
  fx.gib(feet.x, feet.y, feet.z, now, {
    count, pieces: gore.pieces, smear: gore.smear, angle, glow: gore.embers, life: [500, 950],
    speed: [26 * force, 72 * force], up: [70, 70 + 60 * force], size: [2.4, 4.2],
  });
}

/** The body of a slain monster stays where it fell once its death has played (not the ghostly or fiery). */
function layBody(view: View, puppet: Puppet, gore: Gore, boss: boolean, now: number): void {
  const { sheet, anims } = puppet.sprite;
  if (!gore.corpse || puppet.isHero || !sheet.image.complete) return;
  const die = anims.die;
  const frame = die.frames[die.frames.length - 1] ?? 0;
  const end = now + duration(die);
  // The sprite stays whole to the end of its death; then the body takes its place.
  puppet.laid = true;
  puppet.removeAt = end;
  const at = view.position(puppet, end);
  // The body stays for good in the 3D view (gore.ts): where it fell, how it faced, and a seed for its look; with its pool of blood.
  if (!NO_BODY.has(puppet.kind)) {
    record.addBody({ kind: puppet.kind, cell: puppet.to, flip: puppet.flip, seed: Math.floor(Math.random() * 0x7fffffff), hits: 0, at: end }, now);
    if (gore.pool) {
      const radius = Math.max(4, Math.min(10, Math.round(sheet.w * 0.35))) + (boss ? 3 : 0);
      record.addSplat(poolSplat(at.x + TILE / 2, at.y + TILE - 2, radius + (boss ? 9 : 2), cssRgb(gore.pool.color)));
    }
  }
  fx.corpse({
    image: sheet.image, sx: (frame % sheet.cols) * sheet.w, sy: (Math.floor(frame / sheet.cols) + puppet.row) * sheet.h, w: sheet.w, h: sheet.h,
    flip: puppet.flip, x: at.x + (TILE - sheet.w) / 2, y: at.y + TILE - sheet.h, at: end,
    // A boss lies there for the rest of the visit; anything else for a minute.
    life: boss ? 3_600_000 : 60_000,
    pool: gore.pool ? { start: now + duration(die) * 0.4, radius: Math.max(4, Math.min(10, Math.round(sheet.w * 0.35))) + (boss ? 3 : 0), ...gore.pool } : undefined,
  });
}

/** '#rrggbb' as a number. */
const cssRgb = (css: string): number => parseInt(css.slice(1, 7), 16);

/** The level's map as spatter sees it, made once for each map the effects module is given. */
let spatterMapFor: ArrayLike<number> | null = null;
let spatterMap: SpatterMap | null = null;
/** The doors of that map, and how many blows have wounded in each cell (a pool grows with them). */
let spatterDoors: number[] = [];
const poolHits = new Map<number, number>();

function mapFor(map: ArrayLike<number>): SpatterMap {
  if (spatterMapFor !== map) {
    spatterMapFor = map;
    spatterMap = levelSpatterMap(map);
    spatterDoors = [];
    poolHits.clear();
    for (let cell = 0; cell < map.length; cell++) if (map[cell] === T.DOOR || map[cell] === T.OPEN_DOOR || map[cell] === T.LOCKED_DOOR) spatterDoors.push(cell);
  }
  return spatterMap!;
}

/**
 * A pool under a wounded creature, which each blow that lands there adds to: it spreads and darkens (the splats overlap) over a fight,
 * a blob and never a square. A big creature's grows larger. `gentle` is the attacker's cell, which only takes a little.
 */
function pool(feet: { x: number; y: number }, kind: string, ht: number, gentle: boolean): void {
  const map = fx.floor;
  if (!map || NO_BLOOD.has(kind)) return;
  const sm = mapFor(map);
  const cell = Math.floor(feet.y / TILE) * WIDTH + Math.floor(feet.x / TILE);
  if (!sm.ground(cell)) return;
  const n = (poolHits.get(cell) ?? 0) + 1;
  poolHits.set(cell, n);
  const cap = gentle ? 5 : ht > 40 ? 20 : 11;
  const radius = Math.min(cap, (gentle ? 1.5 : 3) + n * (gentle ? 0.7 : 1.5));
  record.addSplat(poolSplat(feet.x, feet.y - 1, radius, shadeOf(bloodRgb(kind), 0.55)));
}

/**
 * The blood of a blow, flung about the room (gore.ts): on the floor round the victim, on the faces of the walls within two cells north of
 * it, on the bodies and the heaps lying near. It is baked into the level's decals, so it costs nothing after, and stays; the amount
 * follows the damage, and half as much on the light effects quality.
 */
function spatter(view: View, world: World, feet: { x: number; y: number }, kind: string, damage: number, ht: number): void {
  const map = fx.floor;
  if (!map || NO_BLOOD.has(kind)) return;
  const sm = mapFor(map);
  const heaps = (world.floors[view.depth]?.heaps ?? []).map((h) => h.pos);
  const out = spatterOf(sm, { x: feet.x, y: feet.y, kind, damage, ht }, quality.light, Math.random, { bodies: record.bodies, heaps, doors: spatterDoors });
  for (const s of out.splats) record.addSplat(s);
  for (const s of out.heapSpecks) record.addSplat(s);
  // The items lying in it and the doors take a stain on their own pictures (world3d.ts bakes them).
  for (const cell of out.heapHits) record.stainHeap(cell);
  for (const cell of out.doorHits) record.stainDoor(cell);
  for (const i of out.bodyHits) {
    const body = record.bodies[i];
    if (body && body.hits < 6) body.hits++;
  }
}

const cellCentre = (cell: number): { x: number; y: number } => ({ x: (cell % WIDTH) * TILE + TILE / 2, y: Math.trunc(cell / WIDTH) * TILE + TILE / 2 });

function centreOf(view: View, id: string, now: number): { x: number; y: number } | null {
  const puppet = view.puppets.get(id);
  if (!puppet) return null;
  const { x, y } = view.position(puppet, now);
  return { x: x + TILE / 2, y: y + TILE - Math.min(puppet.sprite.sheet.h, TILE) / 2 - 1 };
}

const burst = (at: { x: number; y: number } | null, now: number, o: BurstOptions): void => {
  if (at) fx.burst(at.x, at.y, now, o);
};

/** Bolt colours (as in view.ts) for the light a spell leaves where it strikes. */
const BOLT_GLOW: Readonly<Record<string, readonly string[]>> = {
  fire: FIRE, lightning: ['#ffffff', '#fffcc0', '#c0e8ff'], poison: ICHOR, magic: ['#90c8ff', '#ffffff', '#5090ff'],
  slow: ['#f0e890', '#ffffff'], teleport: ECTO, blink: ['#ffffff'], beam: VOID, rocks: DUST, shadow: VOID, amok: ['#ff60a0', '#ffffff'],
  reach: ['#e8e8e8', '#ffffff'], flock: ['#ffffff'], regrowth: HEAL,
};

/** The look of one effect; called after the view has taken it in. */
export function effectFx(effect: Effect, view: View, world: World, myId: string, now: number): void {
  const here = (depth: number): boolean => depth === view.depth;
  boundView = view;
  boundWorld = world;
  env.depth = view.depth;
  env.myId = myId;
  env.labels = world.run.labels;
  switch (effect.type) {
    case 'attack': {
      if (!here(effect.depth)) return;
      const from = centreOf(view, effect.attacker, now);
      const to = centreOf(view, effect.target, now);
      const attacker = view.puppets.get(effect.attacker);
      const target = view.puppets.get(effect.target);
      // The attacker lunges into the blow.
      if (attacker && from && to) {
        const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
        if (len < TILE * 1.6) {
          attacker.lungeStart = now;
          attacker.lungeX = ((to.x - from.x) / len) * 4;
          attacker.lungeY = ((to.y - from.y) / len) * 4;
        }
      }
      // The designer's hit, crit (damage of 30 % of the target's health or more: the core has no flag) and miss. A hit's sparks go on
      // top of the blood below; a miss's puff takes the place of the older white specks.
      const own = fxp.onEffect(effect, env, now);
      if (!effect.hit || !to || !target) {
        if (to && !own) burst(to, now, { count: 3, colors: ['#ffffff', '#d0d0d0'], speed: [20, 40], life: [120, 220], size: [1, 1] });
        return;
      }
      const share = Math.min(1, effect.damage / Math.max(1, target.ht));
      const angle = from ? Math.atan2(to.y - from.y, to.x - from.x) : undefined;
      const { colors, glow } = material(target.kind);
      // The view has already marked the slain dead; its health is still from before the blow.
      const killing = !target.alive || target.hp - effect.damage <= 0;
      const heavy = share >= 0.25 || killing;
      const gore = goreOf(target.kind);
      if (angle !== undefined) {
        if (blows.size > 200) blows.clear();
        blows.set(effect.target, { angle, at: now, damage: effect.damage });
        // The struck reels back along the blow, a few whole pixels, and springs back.
        const reach = heavy ? 3 : 2;
        target.knockStart = now;
        target.knockX = Math.round(Math.cos(angle) * reach);
        target.knockY = Math.round(Math.sin(angle) * reach);
        // A heavy blow cuts a white streak across them.
        if (heavy) fx.slash(to.x, to.y, angle, now);
      }
      // The «Sparks» effect: a hero's blows strike gold as well.
      if (attacker?.look?.effect === 'sparks') {
        burst(to, now, { count: 8 + Math.round(share * 12), colors: SPARKS, glow: true, speed: [40, 110], life: [180, 420], gravity: 140, drag: 0.1, size: [1, 2], angle, cone: 1.4 });
      }
      burst(to, now, {
        count: 6 + Math.round(share * 30) + Math.min(10, effect.damage) + (heavy ? 8 : 0), colors, glow,
        speed: [35, 100 + share * 90 + (heavy ? 30 : 0)], life: [280, 680], gravity: 260, drag: 0.12, size: [1, 3], angle, cone: 1.7, spread: 2,
      });
      // What spilt stays on the floor; in water it goes red round the victim, a cloud that spreads a cell or two and fades.
      if (!glow) {
        fx.splat(to.x, to.y, now, colors, 3 + Math.round(share * 9));
        if (colors === BLOOD) {
          const feet = feetOf(view, target, now);
          fx.bleedWater(feet.x, feet.y, now, 0.45 + share * 0.9, 1.1 + share * 1.6);
        }
      }
      spatter(view, world, feetOf(view, target, now), target.kind, effect.damage, target.ht);
      // The pool under the wounded grows with each blow; the attacker's own cell takes a little of it.
      pool(feetOf(view, target, now), target.kind, target.ht, false);
      if (attacker && !quality.light) pool(feetOf(view, attacker, now), target.kind, target.ht, true);
      // A very heavy blow that does not kill still tears a chunk or two off.
      if (!killing && share >= 0.3) throwGibs(feetOf(view, target, now), gore, share >= 0.5 ? 2 : 1, angle, 0.8, now);
      const mine = effect.attacker === myId || effect.target === myId;
      if (effect.target === myId) {
        // The hero's own wounds: the screen's edges flush red, and the view jolts.
        fx.flash('200, 0, 0', 0.28 + share * 0.7, 380 + share * 300, now, true);
        fx.shake(1 + share * 7, 160 + share * 200, now);
        if (share >= 0.2) fx.hitStop(70);
      } else if (mine && heavy) {
        audio.play('crit', 1, 0.8);
        fx.shake(1.5 + share * 3, 160, now);
        fx.hitStop(55 + share * 50);
        // A heavy blow's number lands big, my killing blow's bigger still.
        const kill = killing && effect.attacker === myId;
        for (const floater of view.floaters) if (floater.start === now && floater.text === String(effect.damage)) floater.scale = kill ? 2 : 1.5;
        if (kill) {
          // And the floor round the slain is kicked up in a ring.
          const feet = feetOf(view, target, now);
          fx.ring(feet.x, feet.y, now, gore.pieces.length > 0 && !gore.embers ? [...DUST, gore.pieces[0]![0]] : DUST, 14);
          if (gore.smear) {
            for (let i = 0; i < 6; i++) {
              const a = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
              fx.splat(feet.x + Math.cos(a) * 7, feet.y - 4 + Math.sin(a) * 3.5, now, [gore.smear], 1, 1);
            }
          }
        }
      }
      return;
    }
    case 'hurt': {
      if (!here(effect.depth)) return;
      const at = centreOf(view, effect.who, now);
      const puppet = view.puppets.get(effect.who);
      if (puppet) burst(at, now, { count: 3 + Math.min(10, effect.damage), ...material(puppet.kind), speed: [20, 60], life: [200, 450], gravity: 200 });
      if (effect.who === myId) fx.flash('200, 0, 0', Math.min(0.6, 0.15 + effect.damage / Math.max(1, puppet?.ht ?? 20)), 300, now, true);
      return;
    }
    case 'died': {
      if (!here(effect.depth)) return;
      const puppet = view.puppets.get(effect.who);
      const at = centreOf(view, effect.who, now) ?? cellCentre(effect.pos);
      const kind = puppet?.kind ?? effect.kind ?? '';
      const boss = BOSSES.has(kind);
      const gore = goreOf(kind);
      // A spray of droplets (kept small: the chunks below are what reads as pieces of it).
      burst(at, now, { count: boss ? 90 : 24, ...material(kind), speed: [30, boss ? 160 : 120], life: [400, boss ? 1400 : 850], gravity: 180, drag: 0.15, size: [1, boss ? 3 : 2] });
      if (!material(kind).glow) fx.splat(at.x, at.y, now, material(kind).colors, boss ? 40 : 10, boss ? 14 : 7);
      // It comes apart: chunks fly the way the killing blow went (whoever struck it, so the whole party sees them).
      const blow = blows.get(effect.who);
      blows.delete(effect.who);
      const angle = blow && now - blow.at < BLOW_MS ? blow.angle : undefined;
      const feet = puppet ? feetOf(view, puppet, now) : { x: at.x, y: at.y + 5, z: 5 };
      throwGibs(feet, gore, boss ? 16 : 4 + Math.floor(Math.random() * 4), angle, boss ? 1.3 : 1, now);
      // A slaying in water reddens it widely.
      if (gore.pool?.color === MEAT.pool?.color) fx.bleedWater(feet.x, feet.y, now, 1, boss ? 3.2 : 2);
      if (puppet) layBody(view, puppet, gore, boss, now);
      // The last blow's worth of blood flung about, and the death's: as if the whole of its health were struck.
      spatter(view, world, feet, kind, boss ? 40 : 14, boss ? 40 : 14);
      // The body bursts into a heap of meat and pieces round the cell (gore.ts): more for a boss, for a big creature, for a crit.
      if (fx.floor && !NO_BLOOD.has(kind)) {
        const ht = puppet?.ht ?? 8;
        const heavy = !!blow && now - blow.at < BLOW_MS && blow.damage >= 0.45 * ht;
        const heaps = new Set((world.floors[view.depth]?.heaps ?? []).map((h) => h.pos));
        // The pool under it as it falls is laid first, the pieces over it.
        for (let n = 0; n < (boss ? 6 : 2); n++) pool(feet, kind, boss ? 80 : ht, false);
        for (const s of chunksOf(mapFor(fx.floor), kind, feet.x, feet.y, chunkCount(ht, boss, heavy, quality.light), boss ? 38 : 20, heaps, Math.random)) record.addSplat(s);
      }
      // What was alive leaves as a faint wisp (a ghost as nothing else).
      burst(at, now, {
        count: (boss ? 30 : 6) * (gore.wisp ? 3 : 1), colors: gore.wisp ? [...ECTO, '#ffffff'] : ['#ffffff', '#d8e8ff'], glow: true,
        speed: [4, gore.wisp ? 24 : 14], life: [600, gore.wisp ? 1500 : 1100], rise: 18, drag: 0.3, size: [1, gore.wisp ? 3 : 1], spread: gore.wisp ? 5 : 2,
      });
      if (boss) {
        fx.shake(7, 900, now);
        fx.flash('255, 255, 255', 0.55, 500, now);
        fx.hitStop(260);
      } else if (effect.by === myId) {
        fx.shake(2, 140, now);
      }
      if (effect.who === myId) {
        fx.flash('120, 0, 0', 0.6, 1400, now, true);
        fx.shake(5, 500, now);
        fx.hitStop(300);
      }
      return;
    }
    case 'bossSlain':
      fx.shake(6, 1200, now);
      return;
    case 'amulet':
    case 'victory': {
      // The Amulet of Yendor taken, and the run won: a shower of gold over everything in sight. (The Amulet taken for the first time
      // also hangs over the hero with its light, shake and flash from the data; the gold stays over it.)
      const at = centreOf(view, effect.hero, now);
      if (!at) return;
      const own = effect.type === 'amulet' && fxp.onEffect(effect, env, now);
      for (let i = 0; i < 6; i++) {
        fx.burst(at.x + (Math.random() - 0.5) * 120, at.y - 60 - Math.random() * 40, now + i * 120, { count: 30, colors: GOLD, glow: true, speed: [10, 50], life: [1200, 2200], gravity: 40, drag: 0.5, size: [1, 2], spread: 30 });
      }
      if (!own) {
        fx.flash('255, 240, 160', 0.6, 1200, now);
        fx.shake(3, 600, now);
      }
      return;
    }
    case 'yell':
      // A boss that notices the heroes: the ground trembles.
      if (here(effect.depth) && effect.line === 'notice' && BOSSES.has(effect.kind)) {
        view.bossIntro = { kind: effect.kind, start: now };
        audio.duck(0.3, 2600);
        // The card is a page element (fl-fx.css) with red light at the boss and a kick of the camera, from the data; without them the
        // canvas card is drawn and the ground trembles as it always did.
        const base = `${import.meta.env.BASE_URL}assets/`;
        if (showBossCard(effect.kind, effect.depth, regionIndex(effect.depth), base)) {
          view.bossIntro.dom = true;
          if (env.where(effect.mob, bossAt)) fxp.bossArrives(bossAt.x, bossAt.z, now);
        } else {
          fx.shake(4, 700, now);
          fx.flash('120, 0, 0', 0.35, 700, now, true);
        }
      }
      return;
    case 'levelUp': {
      // The pillar of gold light at the feet comes from the data (its flash only for the hero who rose); the gold specks go over it.
      const own = fxp.onEffect(effect, env, now);
      const at = centreOf(view, effect.hero, now);
      burst(at, now, { count: 46, colors: GOLD, glow: true, speed: [20, 70], life: [700, 1400], rise: 40, drag: 0.4, size: [1, 2], spread: 4 });
      if (effect.hero === myId) {
        if (!own) fx.flash('255, 230, 120', 0.25, 500, now);
        view.levelCard = { lvl: effect.lvl, start: now };
      }
      return;
    }
    case 'resurrected':
      fxp.onEffect(effect, env, now);
      return;
    case 'scroll': {
      // The shouts and hushes of the scrolls (the others only log a line).
      const at = centreOf(view, effect.hero, now);
      if (!at) return;
      const mine = effect.hero === myId;
      // The designer's rings on the floor, their specks, light, shake and flash (fx.json) take the place of the canvas rings, specks and
      // flashes below; the sounds stay.
      const own = fxp.onEffect(effect, env, now);
      switch (effect.kind) {
        case 'challenge': {
          // «Оглушительный рёв»: red-orange shockwaves racing out, the view jolted, the hero's scream in specks.
          if (!own) {
            fx.wave(at.x, at.y, now, { colors: ['#e0402a', '#ff7a3a'], rings: 4, tiles: 6, duration: 700, width: 2.5 });
            burst(at, now, { count: 28, colors: ['#e0402a', '#ff7a3a', '#ffb070'], glow: true, speed: [50, 130], life: [300, 600], drag: 0.08, size: [1, 2], spread: 3 });
          }
          audio.play('roar', 1, 0.9, mine ? undefined : at);
          if (mine && !own) {
            fx.shake(3, 300, now);
            fx.flash('224, 64, 42', 0.3, 500, now, true);
          }
          return;
        }
        case 'terror':
          audio.play('wail', 1, 0.8, mine ? undefined : at);
          if (!own) {
            fx.wave(at.x, at.y, now, { colors: ['#5a2a8a', '#3a1a60'], rings: 3, tiles: 5, duration: 1100, stagger: 200, width: 2.5 });
            burst(at, now, { count: 14, colors: VOID, speed: [10, 40], life: [500, 1000], drag: 0.3, size: [1, 2], spread: 4 });
            if (mine) fx.flash('30, 0, 50', 0.35, 700, now, true);
          }
          return;
        case 'lullaby':
          audio.play('lullaby', 1, 0.8, mine ? undefined : at);
          if (!own) {
            fx.wave(at.x, at.y, now, { colors: ['#bfe0ff', '#dff0ff'], rings: 3, tiles: 5, duration: 1500, stagger: 260, width: 2 });
            burst(at, now, { count: 8, colors: ['#dff0ff', '#a8d0ff'], glow: true, speed: [4, 14], life: [900, 1500], rise: 18, drag: 0.4, size: [1, 2], spread: 6 });
          }
          return;
        case 'psionic':
          if (!own) {
            // The warning comes first (placefx.ts: a rising whine, an amber flash at the edge); the blast itself is a beat later.
            fx.wave(at.x, at.y, now + 170, { colors: '#ffffff', rings: 2, tiles: 8, duration: 380, stagger: 90, width: 3 });
            if (mine && !quality.reducedMotion) window.setTimeout(() => fx.flash('255, 255, 255', 0.5, 260, fx.now), 170);
          }
          return;
        default:
          return;
      }
    }
    case 'healed': case 'dew': case 'vial': {
      const at = centreOf(view, effect.hero, now);
      // Healing: the green crosses rising and the ring at the feet come from the data (a dew drop or a vial keeps the older glow).
      const own = effect.type === 'healed' && fxp.onEffect(effect, env, now);
      if (effect.amount > 0 && !own) burst(at, now, { count: 6 + Math.min(20, effect.amount), colors: HEAL, glow: true, speed: [5, 20], life: [500, 1000], rise: 26, drag: 0.4, size: [1, 1], spread: 5 });
      return;
    }
    case 'pickedUp':
      if (effect.item.kind === 'gold') burst(centreOf(view, effect.hero, now), now, { count: 10, colors: GOLD, glow: true, speed: [15, 45], life: [300, 650], rise: 20, size: [1, 1] });
      return;
    case 'teleported': {
      // Violet sparks leave where the hero stood (status.teleport.out) and gather where it lands (status.teleport.in: the moment `teleported`);
      // the burst of ours only while the designer's sheets have not come.
      const arrived = fxp.idOf(eventKey(effect));
      const hero = heroById(world, effect.hero);
      const left = centreOf(view, effect.hero, now);
      if (arrived && hero && hero.depth === view.depth && left && fxp.has('status.teleport.out')) {
        fxp.playAt('status.teleport.out', left.x / TILE, left.y / TILE, now, { shake: false, tint: false });
        fxp.playAt(arrived, cellX(hero.pos) + 0.5, cellY(hero.pos) + 0.5, now, { delay: 160, shake: false, tint: false });
        return;
      }
      burst(left, now, { count: 26, colors: ECTO, glow: true, speed: [10, 50], life: [400, 900], rise: 10, spread: 5 });
      return;
    }
    case 'mirrored':
      // The images' shimmer is the designer's minor.mirror, played with the places' looks (placefx.ts); this burst only until it has come.
      if (!fxp.idOf(eventKey(effect))) burst(centreOf(view, effect.hero, now), now, { count: 26, colors: ECTO, glow: true, speed: [10, 50], life: [400, 900], rise: 10, spread: 5 });
      return;
    case 'burst': {
      if (!here(effect.depth)) return;
      const o: Record<string, BurstOptions> = {
        fire: { count: 14, colors: FIRE, glow: true, speed: [10, 45], life: [400, 900], rise: 35, drag: 0.35, spread: 6, size: [1, 2] },
        frost: { count: 12, colors: FROST, glow: true, speed: [10, 40], life: [500, 1000], drag: 0.3, spread: 7, size: [1, 1] },
        toxic: { count: 8, colors: ['#70c040', '#a0e060', '#4a8a2a'], speed: [4, 15], life: [700, 1400], drag: 0.5, spread: 7, size: [2, 3] },
        paralytic: { count: 8, colors: ['#e8e070', '#fff8a0', '#b0a040'], speed: [4, 15], life: [700, 1400], drag: 0.5, spread: 7, size: [2, 3] },
        purity: { count: 10, colors: ['#ffffff', '#e8f4ff'], glow: true, speed: [10, 30], life: [500, 900], rise: 10, spread: 7, size: [1, 1] },
      };
      const look = o[effect.kind];
      if (!look) return;
      const r = effect.radius;
      // Flames, frost and purity are clouds of tiles from the data for as long as the burst lasts; the poisons are real gas on the floor.
      if (!fxp.onEffect(effect, env, now)) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const x = (effect.pos % WIDTH) + dx;
            const y = Math.trunc(effect.pos / WIDTH) + dy;
            if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) continue;
            fx.burst(x * TILE + TILE / 2, y * TILE + TILE / 2, now, look);
          }
        }
      }
      if (effect.kind === 'fire') fx.pulse(cellCentre(effect.pos).x, cellCentre(effect.pos).y, now, '255, 130, 50', 4 + r, 520);
      if (effect.kind === 'fire' && r >= 1) fx.shake(2, 220, now);
      if (effect.kind === 'frost') fx.flash('170, 220, 255', 0.15, 300, now);
      return;
    }
    case 'exploded': {
      if (!here(effect.depth)) return;
      const at = cellCentre(effect.pos);
      fx.burst(at.x, at.y, now, { count: 60, colors: FIRE, glow: true, speed: [50, 170], life: [250, 700], drag: 0.08, gravity: 120, size: [1, 3], spread: 4 });
      fx.burst(at.x, at.y, now, { count: 30, colors: SMOKE, speed: [10, 50], life: [900, 1700], rise: 22, drag: 0.4, size: [2, 4], spread: 10 });
      fx.burst(at.x, at.y, now, { count: 18, colors: DUST, speed: [60, 140], life: [300, 700], gravity: 320, size: [1, 2] });
      fx.splat(at.x, at.y - 4, now, ['#1c1612', '#2a2019', '#3a2c20'], 34, 13);
      fx.pulse(at.x, at.y, now, '255, 190, 100', 9, 460);
      fx.flash('255, 200, 120', 0.4, 220, now);
      fx.shake(7, 450, now);
      fx.hitStop(90);
      return;
    }
    case 'zapped': {
      if (!here(effect.depth)) return;
      // The designer's bolts (view.ts started the flight) bring their own hit, light, shake and flash when they land.
      if (fxp.owns(effect)) return;
      const at = cellCentre(effect.to);
      const colors = BOLT_GLOW[effect.bolt ?? 'magic'] ?? BOLT_GLOW.magic!;
      fx.burst(at.x, at.y, now, { count: 16, colors, glow: true, speed: [20, 80], life: [250, 600], drag: 0.2, size: [1, 2] });
      if (effect.bolt === 'lightning') {
        fx.pulse(at.x, at.y, now, '190, 225, 255', 8, 160);
        fx.flash('230, 240, 255', 0.35, 160, now);
        fx.shake(3, 220, now);
      }
      if (effect.bolt === 'fire') {
        fx.pulse(at.x, at.y, now, '255, 140, 60', 5, 300);
        fx.shake(1.5, 150, now);
      }
      return;
    }
    case 'trap':
      if (!here(effect.depth)) return;
      // The plate's burst of light, with its light, shake and flash (none when a monster set it off), from the data.
      if (fxp.onEffect(effect, env, now)) return;
      if (effect.mob) {
        // Under a monster, where the party can see it: the same plate going off, without shaking the screen
        // (LightningTrap: sparks and arcs; the rest a puff of dust off the plate).
        if (!seenCells(world, view.depth)[effect.pos]) return;
        const at = cellCentre(effect.pos);
        if (effect.kind === 'lightning') {
          fx.burst(at.x, at.y, now, { count: 18, colors: BOLT_GLOW.lightning!, glow: true, speed: [40, 120], life: [200, 450], drag: 0.2, size: [1, 2] });
          fx.flash('230, 240, 255', 0.25, 160, now);
        } else {
          fx.burst(at.x, at.y, now, { count: 10, colors: DUST, speed: [20, 60], life: [300, 600], gravity: 200 });
        }
        return;
      }
      if (effect.kind === 'lightning') {
        fx.flash('230, 240, 255', 0.5, 220, now);
        fx.shake(4, 300, now);
      } else {
        const at = cellCentre(effect.pos);
        fx.burst(at.x, at.y, now, { count: 10, colors: DUST, speed: [20, 60], life: [300, 600], gravity: 200 });
      }
      return;
    case 'bones': {
      if (!here(effect.depth)) return;
      const at = cellCentre(effect.pos);
      fx.burst(at.x, at.y, now, { count: 40, colors: BONE, speed: [40, 140], life: [400, 900], gravity: 300, drag: 0.12, size: [1, 2] });
      fx.shake(3, 260, now);
      return;
    }
    case 'avalanche': {
      if (!here(effect.depth)) return;
      // The rocks fall from three cells up (from the data); the dust goes up where they land.
      const late = fxp.onEffect(effect, env, now) ? 380 : 0;
      for (const cell of effect.cells) {
        const at = cellCentre(cell);
        fx.burst(at.x, at.y - 6, now + late, { count: 8, colors: DUST, speed: [20, 70], life: [300, 700], gravity: 380, size: [1, 3] });
      }
      fx.shake(6, 600, now + late);
      return;
    }
    case 'special': {
      const to = cellCentre(effect.to);
      if (effect.ability === 'leap') {
        fx.burst(to.x, to.y + 4, now + 150, { count: 30, colors: DUST, speed: [40, 110], life: [300, 650], gravity: 200, angle: -Math.PI / 2, cone: Math.PI, size: [1, 2] });
        fx.shake(5, 350, now + 150);
      } else if (effect.ability === 'smokeBomb') {
        const from = cellCentre(effect.from);
        if (!fxp.onEffect(effect, env, now)) fx.burst(from.x, from.y, now, { count: 40, colors: SMOKE, speed: [5, 30], life: [800, 1500], rise: 12, drag: 0.5, size: [2, 4], spread: 8 });
      } else if (effect.ability === 'moltenEarth') {
        fx.shake(3, 400, now);
      }
      return;
    }
    case 'enchanted': {
      if (!here(effect.depth)) return;
      const at = cellCentre(effect.pos);
      fx.burst(at.x, at.y, now, { count: 12, colors: effect.enchant === 'fire' ? FIRE : effect.enchant === 'shock' ? BOLT_GLOW.lightning! : SPARK, glow: true, speed: [20, 60], life: [250, 550], size: [1, 1] });
      if (effect.enchant === 'death') fx.flash('40, 0, 40', 0.4, 300, now);
      return;
    }
    case 'enraged':
      burst(centreOf(view, effect.mob, now), now, { count: 20, colors: ['#ff3030', '#ff8080'], glow: true, speed: [20, 60], life: [300, 700], rise: 10 });
      fx.shake(2, 200, now);
      return;
    case 'plantTriggered': {
      if (!here(effect.depth)) return;
      const at = cellCentre(effect.pos);
      const colors: Record<string, readonly string[]> = {
        firebloom: FIRE, icecap: FROST, sorrowmoss: ICHOR, dreamweed: ['#e0a0ff', '#ffffff'], sungrass: HEAL, earthroot: DUST,
        fadeleaf: ECTO, rotberry: ['#c03040', '#ff8090'],
      };
      fx.burst(at.x, at.y, now, { count: 20, colors: colors[effect.kind] ?? HEAL, glow: true, speed: [10, 50], life: [400, 900], rise: 15 });
      return;
    }
    case 'shattered': {
      if (!here(effect.depth)) return;
      // The splash in the potion's colour, and its puddle among the stains (from the data); the glass flies as before.
      fxp.onEffect(effect, env, now);
      const at = cellCentre(effect.pos);
      fx.burst(at.x, at.y, now, { count: 14, colors: ['#ffffff', '#cfe8ff', '#a0c8e8'], speed: [30, 90], life: [200, 450], gravity: 260, size: [1, 1] });
      return;
    }
    case 'mined': {
      if (!here(effect.depth)) return;
      // Sparks and rock chips thrown back at whoever struck, the ore's gleam, a little shake (questfx.ts).
      const at = cellCentre(effect.pos);
      const from = centreOf(view, effect.hero, now);
      minedFx(at, from ? Math.atan2(from.y - at.y, from.x - at.x) : -Math.PI / 2, now, effect.hero === myId);
      return;
    }
    case 'wraiths': {
      if (!here(effect.depth)) return;
      // Wraith.spawnAt: each wraith fades in with a draw-in of dark specks (ambientFx sees it rise). Heap.open: when no wraith can rise, the
      // curse falls on the hero who stands on the remains: six specks round them.
      for (const puppet of view.puppets.values()) {
        if (!puppet.isHero || puppet.to !== effect.pos) continue;
        const at = centreOf(view, puppet.id, now);
        if (at) fx.curse(at.x, at.y, now, 6);
      }
      return;
    }
    case 'cursed':
      // Ghost.replace: the curse is shown with its sprite, which fades in as the ghost fades out (ambientFx).
      return;
    case 'sacrifice': {
      if (!here(effect.depth)) return;
      const at = cellCentre(effect.pos);
      fx.burst(at.x, at.y, now, { count: effect.outcome === 'reward' ? 70 : 24, colors: ['#9fe0ff', '#ffffff', '#4488ee'], glow: true, speed: [10, 50], life: [700, 1500], rise: 30, drag: 0.4 });
      if (effect.outcome === 'reward') fx.flash('100, 255, 255', 0.35, 700, now);
      return;
    }
    case 'wipedOut':
      fx.flash('90, 40, 140', 0.6, 900, now);
      fx.shake(5, 700, now);
      return;
    case 'fell':
      if (effect.hero === myId) fx.shake(4, 350, now);
      return;
    case 'mobFell': {
      // A little dust off the edge after it.
      if (!here(effect.depth) || !seenCells(world, view.depth)[effect.pos]) return;
      const at = cellCentre(effect.pos);
      fx.burst(at.x, at.y + 4, now, { count: 8, colors: DUST, speed: [10, 40], life: [300, 700], gravity: 260, size: [1, 2] });
      return;
    }
    case 'bee':
      if (!here(effect.depth)) return;
      fx.burst(cellCentre(effect.from).x, cellCentre(effect.from).y, now, { count: 12, colors: ['#ffd020', '#ffe080', '#fff8d0'], glow: true, speed: [20, 70], life: [250, 500], gravity: 200 });
      return;
    case 'burnt': case 'heapBurnt': {
      if (!here(effect.depth)) return;
      const at = cellCentre(effect.pos);
      fx.burst(at.x, at.y, now, { count: 8, colors: FIRE, glow: true, speed: [5, 25], life: [500, 1000], rise: 25, drag: 0.4, spread: 6 });
      return;
    }
    default:
      return;
  }
}

/** A pool of light, in world pixels. */
export interface Light {
  x: number;
  y: number;
  radius: number;
  /** "r, g, b". */
  color: string;
  strength: number;
}

/**
 * The regions' own life (SewerLevel.Sink, PrisonLevel.Torch, CavesLevel.Vein,
 * CityLevel.Smoke, HallsLevel.Stream), on the decorated walls in sight:
 * water dripping from the sewers' pipes, the prison's torches, glints in the
 * caves' gold veins, smoke over the dwarven city, and embers rising from the
 * demon halls' streams.
 */
export function regionFx(level: Level, visible: readonly boolean[], now: number, dt: number): void {
  const r = levelRegion(level);
  const perCell = [0.6, 9, 0.5, 1.2, 2.5][r]! * (dt / 1000);
  for (let cell = 0; cell < level.map.length; cell++) {
    const terrain = level.map[cell]!;
    const source = r === 4 ? terrain === T.WATER : terrain === T.WALL_DECO;
    if (!source || !visible[cell] || Math.random() >= perCell) continue;
    const x = (cell % WIDTH) * TILE;
    const y = Math.trunc(cell / WIDTH) * TILE;
    switch (r) {
      case 0:
        fx.burst(x + 7 + Math.random() * 2, y + TILE - 2, now, { count: 1, colors: ['#9fd0e8', '#d8f0ff'], speed: [0, 2], life: [500, 700], gravity: 120, size: [1, 1], spread: 0 });
        break;
      case 1:
        fx.burst(x + 8, y + 5, now, { count: 1, colors: FIRE, glow: true, speed: [1, 5], life: [250, 500], rise: 14, drag: 0.5, size: [1, 2], spread: 1 });
        break;
      case 2:
        fx.burst(x + 2 + Math.random() * 12, y + 2 + Math.random() * 12, now, { count: 1, colors: GOLD, glow: true, speed: [0, 1], life: [300, 600], size: [1, 1], spread: 0 });
        break;
      case 3:
        fx.burst(x + 4 + Math.random() * 8, y + 4, now, { count: 1, colors: ['#5a5a5a', '#7a7a7a', '#4a4a4a'], speed: [1, 4], life: [1200, 2000], rise: 8, drag: 0.6, size: [2, 3], spread: 1 });
        break;
      default:
        fx.burst(x + Math.random() * TILE, y + TILE - 3, now, { count: 1, colors: FIRE, glow: true, speed: [1, 4], life: [600, 1000], rise: 16, drag: 0.5, size: [1, 1], spread: 0 });
    }
  }
}

/** Light this frame: the prison's torches, whatever burns, fire elementals and fists. */
export function lightsFor(level: Level, visible: readonly boolean[], view: View, now: number): Light[] {
  const lights: Light[] = [];
  const flicker = (seed: number): number => 0.85 + 0.15 * Math.sin(now / 70 + seed) * Math.sin(now / 23 + seed * 3);
  if (levelRegion(level) === 1) {
    for (let cell = 0; cell < level.map.length; cell++) {
      if (level.map[cell] !== T.WALL_DECO || !visible[cell]) continue;
      lights.push({ x: (cell % WIDTH) * TILE + 8, y: Math.trunc(cell / WIDTH) * TILE + 6, radius: 38, color: '255, 150, 60', strength: 0.22 * flicker(cell) });
    }
  }
  for (const puppet of view.puppets.values()) {
    if (!puppet.alive) continue;
    const fiery = puppet.burning || puppet.kind === 'elemental' || puppet.kind === 'burningFist';
    if (!fiery) continue;
    const { x, y } = view.position(puppet, now);
    lights.push({ x: x + 8, y: y + 8, radius: 34, color: '255, 140, 50', strength: 0.25 * flicker(x + y) });
  }
  // The designer's effects: a soft disc of each one's colour at intensity / 8.
  addFxLights(lights, now, visible);
  return lights;
}

/** Every frame: embers off whoever burns, bubbles off the poisoned, sparkles behind bolts in flight. */
/** Pixel-Mart effects' colours. */
const SPARKS = ['#fff3b0', '#ffcc66', '#ffeba4', '#ffffff'];
const FIREFLIES = ['#d8ff8a', '#fff7a0', '#b8ff6a'];
const SNOW = ['#ffffff', '#e8f4ff', '#bfe3ff'];

export function ambientFx(view: View, now: number, dt: number): void {
  const chance = (perSecond: number): boolean => Math.random() < (perSecond * dt) / 1000;
  // The sad ghost taking its leave (Ghost.die): shafts of light, four a third of a second apart, and three glinting specks.
  const leaving = view.departing;
  if (leaving) {
    view.departing = null;
    for (let k = 0; k < 4; k++) {
      for (let j = 0; j < 5; j++) fx.burst(leaving.x, leaving.y - 2 - j * 3, now + k * 300, { count: 1, colors: ['#fff6c8', '#ffffff'], glow: true, speed: [0, 1], life: [1100, 1200], rise: 6, drag: 1, size: [1, 2], spread: 1 });
    }
    for (let k = 0; k < 3; k++) fx.burst(leaving.x, leaving.y, now + k * 200, { count: 1, colors: ['#ffffff', '#e8f4ff'], glow: true, speed: [0, 3], life: [900, 1000], drag: 1, size: [1, 2], spread: 4 });
  }
  for (const puppet of view.puppets.values()) {
    if (!puppet.alive) continue;
    const { x, y } = view.position(puppet, now);
    // A wraith rising, the curse taking shape: five dark specks draw in to it (ShadowParticle.CURSE), as it fades in.
    if (!puppet.arrived) {
      puppet.arrived = true;
      fx.curse(x + TILE / 2, y + TILE / 2, now, 5);
    }
    // The curse's own cloud (CursePersonificationSprite): dark specks rising off it, one every tenth of a second.
    if (puppet.kind === 'curse' && chance(10)) {
      fx.burst(x + 3 + Math.random() * 10, y + 8, now, { count: 1, colors: ['#440044', '#330033'], speed: [32, 48], angle: -Math.PI / 2, cone: 0.4, life: [1000, 1000], drag: 1, size: [2, 3], spread: 0 });
    }
    if (puppet.burning && chance(14)) {
      fx.burst(x + 3 + Math.random() * 10, y + 6 + Math.random() * 8, now, { count: 1, colors: FIRE, glow: true, speed: [2, 8], life: [400, 800], rise: 22, drag: 0.5, size: [1, 1], spread: 0 });
    }
    // Badly wounded, a walker leaves drops behind it, and as it goes a smear along the floor, in the line of its walk: a trail.
    if (puppet.hp < puppet.ht * 0.5 && now - puppet.moveStart < STEP_MS && chance(8)) {
      const smear = goreOf(puppet.kind).smear;
      if (smear) fx.splat(x + TILE / 2, y + TILE - 7, now, [smear], 1, 2.5);
      if (fx.floor && !NO_BLOOD.has(puppet.kind)) {
        const across = Math.abs(cellX(puppet.to) - cellX(puppet.from)) >= Math.abs(cellY(puppet.to) - cellY(puppet.from));
        record.addSplat({ layer: FLOOR_LAYER, x: Math.round(x + TILE / 2) - (across ? 2 : 0), y: Math.round(y + TILE - 5) - (across ? 0 : 2), w: across ? 4 + Math.floor(Math.random() * 3) : 1, h: across ? 1 : 4 + Math.floor(Math.random() * 3), rgb: shadeOf(bloodRgb(puppet.kind), 0.7) });
      }
    }
    if (puppet.poisoned && chance(3)) {
      fx.burst(x + 4 + Math.random() * 8, y + 6, now, { count: 1, colors: ICHOR, speed: [1, 4], life: [500, 900], rise: 10, drag: 0.5, size: [1, 1], spread: 0 });
    }
    // Pixel-Mart effects a hero wears, seen by the whole party.
    const effect = puppet.look?.effect;
    if (effect === 'fireflies' && chance(2.5)) {
      // Fireflies drift about the hero, glowing.
      fx.burst(x + Math.random() * 16, y + Math.random() * 14, now, { count: 1, colors: FIREFLIES, glow: true, speed: [3, 9], life: [900, 1600], rise: 4, drag: 0.4, size: [1, 1], spread: 0 });
    }
    if (effect === 'snow' && chance(6)) {
      // Snow falls about the hero, from just above their head.
      fx.burst(x - 8 + Math.random() * 32, y - 14, now, { count: 1, colors: SNOW, speed: [2, 6], life: [900, 1400], gravity: 18, drag: 0.6, size: [1, 1], spread: 0 });
    }
  }
  for (const p of view.projectiles) {
    if (p.sprite !== null || !chance(90)) continue;
    const k = Math.min(1, (now - p.start) / p.duration);
    const x = ((p.from % WIDTH) + ((p.to % WIDTH) - (p.from % WIDTH)) * k) * TILE + TILE / 2;
    const y = (Math.trunc(p.from / WIDTH) + (Math.trunc(p.to / WIDTH) - Math.trunc(p.from / WIDTH)) * k) * TILE + TILE / 2;
    fx.burst(x, y, now, { count: 1, colors: p.color ? [`rgb(${p.color})`, '#ffffff'] : ['#90c8ff', '#ffffff'], glow: true, speed: [2, 10], life: [150, 350], size: [1, 1], spread: 1 });
  }
}

/** What a step stirs where the foot left: water splashes, grass rustles, a dry floor puffs a little dust. */
export function stepFx(terrain: number, cell: number, now: number): void {
  const x = (cell % WIDTH) * TILE + TILE / 2;
  const y = Math.trunc(cell / WIDTH) * TILE + TILE - 2;
  if (terrain >= T.WATER_TILES && terrain <= T.WATER) {
    fx.burst(x, y - 1, now, { count: 5, colors: ['#9ad4ff', '#d8f0ff', '#5fa8e0'], speed: [14, 34], life: [220, 420], gravity: 220, drag: 0.2, angle: -Math.PI / 2, cone: 1.6, size: [1, 1], spread: 3 });
  } else if (terrain === T.GRASS || terrain === T.HIGH_GRASS) {
    fx.burst(x, y - 2, now, { count: 3, colors: ['#6aa84f', '#93c47d', '#38761d'], speed: [8, 20], life: [300, 520], gravity: 120, drag: 0.3, angle: -Math.PI / 2, cone: 2.2, size: [1, 1], spread: 3 });
  } else if (terrain !== T.EMBERS) {
    fx.burst(x, y, now, { count: 2, colors: ['rgba(190, 180, 160, 0.7)', 'rgba(140, 130, 115, 0.6)'], speed: [4, 10], life: [260, 420], rise: 6, drag: 0.3, size: [1, 1], spread: 4 });
  } else {
    fx.burst(x, y, now, { count: 3, colors: ['#ff9933', '#ffcc66', '#ff5522'], glow: true, speed: [6, 14], life: [240, 420], rise: 14, drag: 0.4, size: [1, 1], spread: 3 });
  }
}

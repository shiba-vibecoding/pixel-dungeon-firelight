import { type Effect, HEIGHT, type Level, type MobKind, T, WIDTH, type World } from '@pd/core';
import { type BurstOptions, fx } from './fx';
import { TILE, type View } from './view';
import { audio } from './audio';

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

const BOSSES = new Set(['goo', 'tengu', 'dm300', 'king', 'yog']);

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
      if (!effect.hit || !to || !target) {
        if (to) burst(to, now, { count: 3, colors: ['#ffffff', '#d0d0d0'], speed: [20, 40], life: [120, 220], size: [1, 1] });
        return;
      }
      const share = Math.min(1, effect.damage / Math.max(1, target.ht));
      const angle = from ? Math.atan2(to.y - from.y, to.x - from.x) : undefined;
      const { colors, glow } = material(target.kind);
      // The «Sparks» effect: a hero's blows strike gold as well.
      if (attacker?.look?.effect === 'sparks') {
        burst(to, now, { count: 8 + Math.round(share * 12), colors: SPARKS, glow: true, speed: [40, 110], life: [180, 420], gravity: 140, drag: 0.1, size: [1, 2], angle, cone: 1.4 });
      }
      burst(to, now, {
        count: 6 + Math.round(share * 30) + Math.min(10, effect.damage), colors, glow, speed: [35, 100 + share * 90], life: [280, 680],
        gravity: 260, drag: 0.12, size: [1, 3], angle, cone: 1.7, spread: 2,
      });
      // What spilt stays on the floor a while.
      if (!glow) fx.splat(to.x, to.y, now, colors, 2 + Math.round(share * 8));
      const mine = effect.attacker === myId || effect.target === myId;
      if (effect.target === myId) {
        // The hero's own wounds: the screen's edges flush red, and the view jolts.
        fx.flash('200, 0, 0', 0.28 + share * 0.7, 380 + share * 300, now, true);
        fx.shake(1 + share * 7, 160 + share * 200, now);
        if (share >= 0.2) fx.hitStop(70);
      } else if (mine && (share >= 0.25 || target.hp - effect.damage <= 0)) {
        audio.play('hit', 0.55, 0.8);
        fx.shake(1.5 + share * 3, 160, now);
        fx.hitStop(55 + share * 50);
        // A heavy blow's number lands big.
        for (const floater of view.floaters) if (floater.start === now && floater.text === String(effect.damage)) floater.scale = 1.5;
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
      burst(at, now, { count: boss ? 90 : 28, ...material(kind), speed: [30, boss ? 160 : 120], life: [400, boss ? 1400 : 850], gravity: 180, drag: 0.15, size: [1, boss ? 4 : 3] });
      if (!material(kind).glow) fx.splat(at.x, at.y, now, material(kind).colors, boss ? 40 : 10, boss ? 14 : 7);
      // What was alive leaves as a faint wisp.
      burst(at, now, { count: boss ? 30 : 6, colors: ['#ffffff', '#d8e8ff'], glow: true, speed: [4, 14], life: [600, 1100], rise: 18, drag: 0.3, size: [1, 1] });
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
    case 'victory': {
      // The Amulet of Yendor: a shower of gold over everything in sight.
      const at = centreOf(view, effect.hero, now);
      if (!at) return;
      for (let i = 0; i < 6; i++) {
        fx.burst(at.x + (Math.random() - 0.5) * 120, at.y - 60 - Math.random() * 40, now + i * 120, { count: 30, colors: GOLD, glow: true, speed: [10, 50], life: [1200, 2200], gravity: 40, drag: 0.5, size: [1, 2], spread: 30 });
      }
      fx.flash('255, 240, 160', 0.6, 1200, now);
      fx.shake(3, 600, now);
      return;
    }
    case 'yell':
      // A boss that notices the heroes: the ground trembles.
      if (here(effect.depth) && effect.line === 'notice' && BOSSES.has(effect.kind)) {
        view.bossIntro = { kind: effect.kind, start: now };
        fx.shake(4, 700, now);
        fx.flash('120, 0, 0', 0.35, 700, now, true);
      }
      return;
    case 'levelUp': {
      const at = centreOf(view, effect.hero, now);
      burst(at, now, { count: 46, colors: GOLD, glow: true, speed: [20, 70], life: [700, 1400], rise: 40, drag: 0.4, size: [1, 2], spread: 4 });
      if (effect.hero === myId) {
        fx.flash('255, 230, 120', 0.25, 500, now);
        view.levelCard = { lvl: effect.lvl, start: now };
      }
      return;
    }
    case 'healed': case 'dew': case 'vial': {
      const at = centreOf(view, effect.hero, now);
      if (effect.amount > 0) burst(at, now, { count: 6 + Math.min(20, effect.amount), colors: HEAL, glow: true, speed: [5, 20], life: [500, 1000], rise: 26, drag: 0.4, size: [1, 1], spread: 5 });
      return;
    }
    case 'pickedUp':
      if (effect.item.kind === 'gold') burst(centreOf(view, effect.hero, now), now, { count: 10, colors: GOLD, glow: true, speed: [15, 45], life: [300, 650], rise: 20, size: [1, 1] });
      return;
    case 'teleported': case 'mirrored':
      burst(centreOf(view, effect.hero, now), now, { count: 26, colors: ECTO, glow: true, speed: [10, 50], life: [400, 900], rise: 10, spread: 5 });
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
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = (effect.pos % WIDTH) + dx;
          const y = Math.trunc(effect.pos / WIDTH) + dy;
          if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) continue;
          fx.burst(x * TILE + TILE / 2, y * TILE + TILE / 2, now, look);
        }
      }
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
      fx.flash('255, 200, 120', 0.4, 220, now);
      fx.shake(7, 450, now);
      fx.hitStop(90);
      return;
    }
    case 'zapped': {
      if (!here(effect.depth)) return;
      const at = cellCentre(effect.to);
      const colors = BOLT_GLOW[effect.bolt ?? 'magic'] ?? BOLT_GLOW.magic!;
      fx.burst(at.x, at.y, now, { count: 16, colors, glow: true, speed: [20, 80], life: [250, 600], drag: 0.2, size: [1, 2] });
      if (effect.bolt === 'lightning') {
        fx.flash('230, 240, 255', 0.35, 160, now);
        fx.shake(3, 220, now);
      }
      if (effect.bolt === 'fire') fx.shake(1.5, 150, now);
      return;
    }
    case 'trap':
      if (!here(effect.depth)) return;
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
    case 'avalanche':
      if (!here(effect.depth)) return;
      for (const cell of effect.cells) {
        const at = cellCentre(cell);
        fx.burst(at.x, at.y - 6, now, { count: 8, colors: DUST, speed: [20, 70], life: [300, 700], gravity: 380, size: [1, 3] });
      }
      fx.shake(6, 600, now);
      return;
    case 'special': {
      const to = cellCentre(effect.to);
      if (effect.ability === 'leap') {
        fx.burst(to.x, to.y + 4, now + 150, { count: 30, colors: DUST, speed: [40, 110], life: [300, 650], gravity: 200, angle: -Math.PI / 2, cone: Math.PI, size: [1, 2] });
        fx.shake(5, 350, now + 150);
      } else if (effect.ability === 'smokeBomb') {
        const from = cellCentre(effect.from);
        fx.burst(from.x, from.y, now, { count: 40, colors: SMOKE, speed: [5, 30], life: [800, 1500], rise: 12, drag: 0.5, size: [2, 4], spread: 8 });
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
      const at = cellCentre(effect.pos);
      fx.burst(at.x, at.y, now, { count: 14, colors: ['#ffffff', '#cfe8ff', '#a0c8e8'], speed: [30, 90], life: [200, 450], gravity: 260, size: [1, 1] });
      return;
    }
    case 'mined': {
      if (!here(effect.depth)) return;
      const at = cellCentre(effect.pos);
      fx.burst(at.x, at.y, now, { count: 14, colors: [...GOLD, ...DUST], glow: true, speed: [30, 90], life: [250, 550], gravity: 300 });
      fx.shake(1.5, 120, now);
      return;
    }
    case 'wraiths': case 'cursed': {
      if (!here(effect.depth)) return;
      const at = cellCentre(effect.pos);
      fx.burst(at.x, at.y, now, { count: 30, colors: VOID, glow: true, speed: [10, 40], life: [600, 1200], rise: 18, drag: 0.4, spread: 8 });
      fx.flash('60, 0, 80', 0.3, 400, now);
      return;
    }
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

const region = (depth: number): number => Math.min(4, Math.floor((depth - 1) / 5));

/**
 * The regions' own life (SewerLevel.Sink, PrisonLevel.Torch, CavesLevel.Vein,
 * CityLevel.Smoke, HallsLevel.Stream), on the decorated walls in sight:
 * water dripping from the sewers' pipes, the prison's torches, glints in the
 * caves' gold veins, smoke over the dwarven city, and embers rising from the
 * demon halls' streams.
 */
export function regionFx(level: Level, visible: readonly boolean[], now: number, dt: number): void {
  const r = region(level.depth);
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
  if (region(level.depth) === 1) {
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
  return lights;
}

/** Every frame: embers off whoever burns, bubbles off the poisoned, sparkles behind bolts in flight. */
/** Pixel-Mart effects' colours. */
const SPARKS = ['#fff3b0', '#ffcc66', '#ffeba4', '#ffffff'];
const FIREFLIES = ['#d8ff8a', '#fff7a0', '#b8ff6a'];
const SNOW = ['#ffffff', '#e8f4ff', '#bfe3ff'];

export function ambientFx(view: View, now: number, dt: number): void {
  const chance = (perSecond: number): boolean => Math.random() < (perSecond * dt) / 1000;
  for (const puppet of view.puppets.values()) {
    if (!puppet.alive) continue;
    const { x, y } = view.position(puppet, now);
    if (puppet.burning && chance(14)) {
      fx.burst(x + 3 + Math.random() * 10, y + 6 + Math.random() * 8, now, { count: 1, colors: FIRE, glow: true, speed: [2, 8], life: [400, 800], rise: 22, drag: 0.5, size: [1, 1], spread: 0 });
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

import { createItem, type Effect, type Hero, itemSprite, type World, WIDTH } from '@pd/core';
import { audio } from './audio';
import { turnAt } from './dirs';
import { fx } from './fx';
import { fxp } from './fxplayer';
import { playMs } from './fxsheet';
import { cardForItem, questCards } from './questcard';
import { pickupToast } from './questcardtext';
import { Q } from './quest-text';
import type { Puppet, View } from './view';

/*
 * What the quests look like in the world (presentation only; the core's rules and effects are untouched): the blacksmith's pick on
 * a vein of dark gold (the swing with the pickaxe in the hand, the crunch, sparks, rock chips, a little shake, and the ore that
 * pops out with a gleam and flies to the pack), the toast that counts the ore and the tokens, and the leave-takings of the
 * wandmaker, the imp and the blacksmith's forge, to stand beside the ghost's (view.ts, fx-events.ts).
 *
 * Part 13: where the designer's sheets are there (fx.json: `mined` → quest.ore.hit, then quest.ore.nugget; `smith` → quest.anvil; the forge's loop
 * is kept by places.ts), they are the look of the blow, the nugget and the hammer, in place of the sparks, chips and dust drawn here, and are
 * never drawn beside them: the older ones stay for as long as the data has not come.
 */

const TILE = 16;
const SPARK = ['#fff3b0', '#ffcc66', '#ffffff', '#ffb040'];
const ROCK = ['#8f866c', '#6e665a', '#4a443a', '#b8ad8f'];
const GOLD = ['#ffe070', '#fff6c0', '#e0a020', '#ffffff'];
const DUST = ['rgba(190, 180, 160, 0.7)', 'rgba(140, 130, 115, 0.6)'];
const ARCANE = ['#d8c8ff', '#ffffff', '#8fd0ff', '#b890ff'];
const EMBER = ['#ff7a20', '#ff4010', '#ffcf60', '#6a6a6a'];

/** How long the pickaxe stays in the hand after a swing, ms. */
export const TOOL_MS = 900;

/** How far from the middle of a vein toward the hero its face is (a wall fills its cell; the blow is seen on its face), cells. */
export const FACE = 0.85;

/** The face of a vein toward the one who struck it (`angle`: from the vein to the hero, radians), as a place in cells. */
export function faceOf(at: { x: number; y: number }, angle: number): { x: number; z: number } {
  return { x: at.x / TILE + Math.cos(angle) * FACE, z: at.y / TILE + Math.sin(angle) * FACE };
}

/** The nugget falls on the floor in front of the vein's face, a little toward the viewer so that the one who struck does not stand on it (cells). */
export const NUGGET_DROP = 0.42;

/** Where the nugget lies for a face (cells). */
export const nuggetAt = (face: { x: number; z: number }): { x: number; z: number } => ({ x: face.x, z: face.z + NUGGET_DROP });

/** How long the nugget lies gleaming on the floor before it goes to the pack, ms: the strike's frames, and then the nugget's. */
export function nuggetMs(): number {
  const hit = fxp.has('quest.ore.hit') ? fxp.lib!.fx['quest.ore.hit']! : null;
  return hit ? playMs(hit) + 380 : 160;
}

const centre = (cell: number): { x: number; y: number } => ({ x: (cell % WIDTH) * TILE + TILE / 2, y: Math.trunc(cell / WIDTH) * TILE + TILE / 2 });

/**
 * A swing of the pickaxe at the vein at `pos`: the hero turns to it and swings, with the pickaxe in his hand whatever he wields
 * otherwise (the held-weapon art has it: assets/weapons/held/pickaxe.png). Who is not shown on this depth is left alone.
 */
export function swingPick(view: View, heroId: string, pos: number, now: number): void {
  const puppet = view.puppets.get(heroId);
  if (!puppet?.alive) return;
  turnAt(puppet, puppet.to, pos, WIDTH, now);
  puppet.anim = 'attack';
  puppet.animStart = now;
  puppet.tool = 'weapon.pickaxe';
  puppet.toolUntil = now + TOOL_MS;
}

/**
 * The vein gives way: a spray of sparks and a shower of rock chips thrown back toward the hero, a puff of dust, a little shake, and a
 * moment later the gleam of the ore working loose. `angle` is the way from the vein to the hero (radians).
 */
export function minedFx(at: { x: number; y: number }, angle: number, now: number, mine = true): void {
  // The designer's: the flash and crumbs of the blow on the vein's face, its dust, and the nugget that follows it onto the floor.
  const id = fxp.idOf('mined');
  if (id) {
    const face = faceOf(at, angle);
    if (fxp.playAt(id, face.x, face.z, now, { shake: mine, tint: mine, thenAt: nuggetAt(face) })) return;
  }
  fx.burst(at.x, at.y, now, { count: 10, colors: SPARK, glow: true, speed: [50, 130], life: [180, 420], gravity: 380, angle, cone: 1.4, size: [1, 1], spread: 2 });
  fx.burst(at.x, at.y, now, { count: 12, colors: ROCK, speed: [40, 110], life: [350, 720], gravity: 430, drag: 0.1, angle, cone: 2.3, size: [1, 2], spread: 3 });
  fx.burst(at.x, at.y, now, { count: 6, colors: DUST, speed: [6, 20], life: [380, 760], rise: 8, drag: 0.4, angle, cone: 3, size: [2, 3], spread: 4 });
  fx.shake(2.2, 150, now);
  // The ore itself: a gleam of gold that rises, and a small flash where it was.
  fx.burst(at.x, at.y, now + 110, { count: 9, colors: GOLD, glow: true, speed: [8, 30], life: [600, 1100], rise: 22, drag: 0.5, size: [1, 2], spread: 3 });
  fx.pulse(at.x, at.y, now + 90, '255, 214, 100', 4, 520);
}

/** The giver goes: the figure fades while its own sparkle or smoke rises (the ghost's farewell is the model). */
function depart(view: View, puppet: Puppet, kind: 'wandmaker' | 'imp', now: number): void {
  const { x, y } = view.position(puppet, now);
  const cx = x + TILE / 2;
  const cy = y + TILE / 2;
  if (kind === 'wandmaker') {
    // He is off, somewhere: a ring of arcane sparkles, a column of them rising, a violet flash.
    puppet.fade = { start: now, ms: 1100, from: 1, to: 0 };
    audio.play('teleport', 1.15, 0.7);
    fx.burst(cx, cy, now, { count: 18, colors: ARCANE, glow: true, speed: [25, 70], life: [500, 900], drag: 0.6, size: [1, 2] });
    for (let k = 0; k < 6; k++) fx.burst(cx + (Math.random() - 0.5) * 6, cy - k * 3, now + k * 110, { count: 2, colors: ARCANE, glow: true, speed: [0, 6], life: [700, 1000], rise: 26, size: [1, 1], spread: 1 });
    fx.pulse(cx, cy, now, '170, 140, 255', 6, 760);
  } else {
    // A puff of smoke and embers, and he is gone with a wink.
    puppet.fade = { start: now, ms: 650, from: 1, to: 0 };
    audio.play('puff', 1, 0.8);
    audio.later(120, 'sparkle', 1.2, 0.5);
    fx.burst(cx, cy, now, { count: 22, colors: EMBER, glow: false, speed: [20, 60], life: [400, 800], rise: 14, drag: 0.5, size: [1, 2] });
    fx.burst(cx, cy, now, { count: 10, colors: ['#ffcf60', '#ffffff'], glow: true, speed: [10, 40], life: [300, 600], rise: 18, size: [1, 1] });
    fx.pulse(cx, cy, now, '255, 120, 50', 6, 620);
  }
}

/**
 * The wandmaker or the imp is done with the hero (the core has already taken him off the level). Held: the figure stays standing, as
 * the farewell window is up, until `releaseFarewells` (the window put away) sets him going, so the leave-taking is seen on the map and
 * not behind the window. Not held (another player's turn-in): he goes at once.
 */
export function farewell(view: View, kind: 'wandmaker' | 'imp', now: number, hold: boolean): void {
  for (const puppet of view.puppets.values()) {
    if (puppet.kind !== kind || !puppet.alive || puppet.id.endsWith('~was')) continue;
    if (hold) {
      puppet.leaving = kind;
      // Never gone while held (a fade that has not begun leaves him whole, and `sync` keeps a fade out until it is through).
      puppet.fade = { start: Infinity, ms: 1, from: 1, to: 0 };
    } else {
      depart(view, puppet, kind, now);
    }
  }
}

/** The farewell window is away: whoever waited to go goes. */
export function releaseFarewells(view: View, now: number): void {
  for (const puppet of view.puppets.values()) {
    const kind = puppet.leaving;
    if (!kind) continue;
    puppet.leaving = undefined;
    depart(view, puppet, kind, now);
  }
}

/**
 * The forge flares as the errand is handed in, and again when the reforging is done: two blows of the hammer on the anvil. The designer's
 * (quest.anvil: the white flash and the fan of sparks, with their light) or, until it has come, a spray of sparks and a glow of ours.
 */
export function forgeFlare(view: View, now: number): void {
  const anvil = fxp.idOf('smith');
  for (const puppet of view.puppets.values()) {
    if (puppet.kind !== 'blacksmith' || !puppet.alive) continue;
    const { x, y } = view.position(puppet, now);
    const cx = x + TILE / 2;
    const cy = y + TILE / 2;
    audio.play('hammer', 1, 0.8);
    audio.later(230, 'hammer', 0.9, 0.7);
    // The anvil stands at his side, where his forge burns (places.ts).
    if (anvil && fxp.playAt(anvil, cx / TILE + 0.5, cy / TILE, now, { shake: false, tint: false }) && fxp.playAt(anvil, cx / TILE + 0.5, cy / TILE, now, { delay: 230, shake: false, tint: false })) continue;
    fx.burst(cx, cy, now, { count: 16, colors: SPARK, glow: true, speed: [30, 90], life: [260, 620], gravity: 260, size: [1, 1], spread: 3 });
    fx.burst(cx, cy, now + 230, { count: 12, colors: SPARK, glow: true, speed: [30, 90], life: [260, 620], gravity: 260, size: [1, 1], spread: 3 });
    fx.pulse(cx, cy, now, '255, 150, 60', 6, 700);
  }
}

/** What the screens of main.ts give the quest effects to do their work with. */
export interface QuestIo {
  toast(text: string, options?: { tone?: 'good' }): void;
  /** A find under the HUD (the strip of what has just been picked up), with its gleam. */
  find(key: string, sprite: number, name: string): void;
  /** An item set off for the backpack from a place in the world (pixels), at a time (the visual clock). */
  launch(sprite: number, x: number, y: number, at: number): void;
  /** The name of the ore as the pack shows it. */
  oreName(): string;
}

/**
 * My own part of the quests: the ore that pops out of the vein and flies into the pack (and its toast, with the count), and the toast for
 * a quest item taken up. The counts come from the card (questcard.ts): from the world and the pack, and nothing hidden.
 */
export function questTake(effects: readonly Effect[], world: World, me: Hero, now: number, io: QuestIo): void {
  for (const effect of effects) {
    if (effect.type === 'mined' && effect.hero === me.id && effect.depth === me.depth) {
      const sprite = itemSprite(createItem('quest.ore'), world.run.labels);
      // With the designer's nugget (it gleams on the floor before the vein's face) the ore is lifted from there when the gleam is over; else it pops from the vein.
      const vein = centre(effect.pos);
      const hero = centre(me.pos);
      const face = fxp.has('quest.ore.nugget') ? nuggetAt(faceOf(vein, Math.atan2(hero.y - vein.y, hero.x - vein.x))) : null;
      const at = face ? { x: face.x * TILE, y: face.z * TILE } : vein;
      io.launch(sprite, at.x, at.y, now + (face ? nuggetMs() : 160));
      io.find('quest.ore', sprite, io.oreName());
      const card = cardForItem(questCards(world, me), 'quest.ore');
      const text = card && pickupToast(card, Q);
      if (text && card!.stage !== 'done') io.toast(text, { tone: 'good' });
    } else if (effect.type === 'pickedUp' && effect.hero === me.id && effect.item.kind !== 'quest.ore') {
      const card = cardForItem(questCards(world, me), effect.item.kind);
      const text = card && pickupToast(card, Q);
      if (text) io.toast(text, { tone: 'good' });
    }
  }
}

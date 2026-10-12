import { HEIGHT, type Level, LENGTH, T, WIDTH } from '@pd/core';
import { type Assets, frameAt, ICONS, regionOf } from './sprites';
import { type Puppet, TILE, type View } from './view';
import { bossCard, floatNumber, fxText, levelCard, slainCard } from './cards';
import { fx } from './fx';
import { quality } from './quality';
import { t } from './i18n';

/* Canvas renderer for the world, using the original 16px tiles and sprites. */

export const FONT = '"Galmuri11", "Galmuri9", ui-monospace, monospace';
/** How long a boss's title card stays up. */

export interface Camera {
  /** World pixel shown at the canvas's top-left corner. */
  x: number;
  y: number;
  zoom: number;
}

const isWater = (terrain: number): boolean => terrain >= T.WATER_TILES && terrain <= T.WATER;

/** Draws the static tile layer; water is animated underneath it. Redraw when terrain changes. */
export function bakeLevel(level: Level, assets: Assets): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * TILE;
  canvas.height = HEIGHT * TILE;
  const ctx = canvas.getContext('2d')!;
  const tiles = assets.tiles[regionOf(level.depth)]!;
  const columns = tiles.width / TILE;
  for (let i = 0; i < LENGTH; i++) {
    const terrain = level.map[i]!;
    const sx = (terrain % columns) * TILE;
    const sy = Math.trunc(terrain / columns) * TILE;
    ctx.drawImage(tiles, sx, sy, TILE, TILE, (i % WIDTH) * TILE, Math.trunc(i / WIDTH) * TILE, TILE, TILE);
  }
  return canvas;
}

function drawIcon(ctx: CanvasRenderingContext2D, assets: Assets, icon: readonly [number, number, number, number], x: number, y: number): void {
  const [sx, sy, w, h] = icon;
  ctx.drawImage(assets.icons, sx, sy, w, h, Math.round(x - w / 2), Math.round(y - h), w, h);
}

function drawPuppet(ctx: CanvasRenderingContext2D, puppet: Puppet, x: number, y: number, now: number): void {
  const { sheet, anims } = puppet.sprite;
  const anim = puppet.anim === 'idle' && puppet.pumped ? 'pump' : puppet.anim;
  const frame = frameAt(anims[anim], now - puppet.animStart);
  const sx = (frame % sheet.cols) * sheet.w;
  const sy = (Math.floor(frame / sheet.cols) + puppet.row) * sheet.h;
  // A melee lunge: forward and back again in a blink.
  const lunge = puppet.lungeStart !== undefined && now - puppet.lungeStart < LUNGE_MS ? Math.sin((Math.PI * (now - puppet.lungeStart)) / LUNGE_MS) : 0;
  const dx = Math.round(x + (TILE - sheet.w) / 2 + lunge * (puppet.lungeX ?? 0));
  const dy = Math.round(y + TILE - sheet.h + lunge * (puppet.lungeY ?? 0));

  ctx.save();
  if (puppet.invisible) ctx.globalAlpha = 0.4;
  if (!puppet.alive) {
    if (puppet.isHero) {
      ctx.globalAlpha = 0.75;
    } else {
      const left = puppet.removeAt - now;
      ctx.globalAlpha = Math.max(0, Math.min(1, left / 700));
    }
  }
  if (puppet.flip) {
    ctx.translate(dx + sheet.w, dy);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(dx, dy);
  }
  ctx.drawImage(sheet.image, sx, sy, sheet.w, sheet.h, 0, 0, sheet.w, sheet.h);
  if (now < puppet.flashUntil) {
    // Hit flash: adding the sprite onto itself brightens only its own pixels.
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(sheet.image, sx, sy, sheet.w, sheet.h, 0, 0, sheet.w, sheet.h);
    ctx.drawImage(sheet.image, sx, sy, sheet.w, sheet.h, 0, 0, sheet.w, sheet.h);
  } else if (puppet.pumped && puppet.alive) {
    // A pumped-up Goo throbs.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(now / 60);
    ctx.drawImage(sheet.image, sx, sy, sheet.w, sheet.h, 0, 0, sheet.w, sheet.h);
  }
  ctx.restore();
}

const LUNGE_MS = 150;

function drawHealth(ctx: CanvasRenderingContext2D, puppet: Puppet, x: number, y: number): void {
  const top = Math.round(y + TILE - puppet.sprite.sheet.h - 3);
  const left = Math.round(x + 2);
  const width = TILE - 4;
  ctx.fillStyle = '#000';
  ctx.fillRect(left - 0.5, top - 0.5, width + 1, 2);
  ctx.fillStyle = '#cc0000';
  ctx.fillRect(left, top, width, 1);
  ctx.fillStyle = '#00ee00';
  ctx.fillRect(left, top, Math.max(0, Math.round((width * puppet.hp) / puppet.ht)), 1);
}

export interface Scene {
  level: Level;
  baked: HTMLCanvasElement;
  visible: readonly boolean[];
  explored: readonly boolean[];
  /** Items lying around, with their sprite index in items.png. */
  heaps: ReadonlyArray<{ pos: number; sprite: number }>;
  /** Plants growing here, with their index in plants.png. */
  plants?: ReadonlyArray<{ pos: number; index: number }>;
  /** Clouds of gas: how much is in each cell, and its colour. */
  gas?: ReadonlyArray<{ pos: number; volume: number; color: string }>;
  /** Mind vision: every monster on the level shows. */
  seeAll: boolean;
  /** Where an altar's sacrificial fire burns, while it does. */
  altar?: number;
  /** The hero's position in world pixels, around which the view is lit. */
  focus?: { x: number; y: number };
  /** Pools of light: torches and whatever burns. */
  lights?: ReadonlyArray<{ x: number; y: number; radius: number; color: string; strength: number }>;
  /** The hero has fallen: how far the world has drained of colour, 0 to 1. */
  mourning?: number;
  /** The middle of the band the HUD and toolbar leave free, in device pixels: cards are centred there. */
  middle?: number;
}

export function render(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  view: View,
  myId: string,
  assets: Assets,
  camera: Camera,
  now: number,
): void {
  const { level, baked, visible, explored } = scene;
  const { canvas } = ctx;
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(camera.zoom, 0, 0, camera.zoom, -camera.x * camera.zoom, -camera.y * camera.zoom);

  // Slowly drifting water under the transparent parts of water tiles.
  const water = assets.water[regionOf(level.depth)]!;
  const pattern = ctx.createPattern(water, 'repeat')!;
  const drift = (now / 120) % water.width;
  pattern.setTransform(new DOMMatrix().translate(drift, drift * 0.5));
  ctx.fillStyle = pattern;
  for (let i = 0; i < LENGTH; i++) {
    if (isWater(level.map[i]!)) {
      ctx.fillRect((i % WIDTH) * TILE, Math.trunc(i / WIDTH) * TILE, TILE, TILE);
    }
  }
  ctx.drawImage(baked, 0, 0);

  // Items on the floor, remembered (and dimmed by the fog) once seen.
  for (const plant of scene.plants ?? []) {
    if (!explored[plant.pos]) continue;
    ctx.drawImage(assets.plants, plant.index * 16, 0, 16, 16, (plant.pos % WIDTH) * TILE, Math.trunc(plant.pos / WIDTH) * TILE, 16, 16);
  }
  for (const heap of scene.heaps) {
    if (!explored[heap.pos]) continue;
    const bob = visible[heap.pos] ? Math.round(Math.sin(now / 300 + heap.pos) * 0.6) : 0;
    ctx.drawImage(
      assets.items, (heap.sprite % 8) * 16, Math.floor(heap.sprite / 8) * 16, 16, 16,
      (heap.pos % WIDTH) * TILE, Math.trunc(heap.pos / WIDTH) * TILE - 1 + bob, 16, 16,
    );
  }

  // The sacrificial fire: a flickering blue flame on its pedestal (SacrificialParticle).
  if (scene.altar !== undefined && explored[scene.altar]) {
    const x = (scene.altar % WIDTH) * TILE + TILE / 2;
    const y = Math.trunc(scene.altar / WIDTH) * TILE + TILE / 2;
    const flicker = 0.75 + 0.25 * Math.sin(now / 90) * Math.sin(now / 37);
    const glow = ctx.createRadialGradient(x, y - 3, 0, x, y - 3, 9);
    glow.addColorStop(0, `rgba(200, 240, 255, ${0.9 * flicker})`);
    glow.addColorStop(0.4, `rgba(68, 136, 238, ${0.6 * flicker})`);
    glow.addColorStop(1, 'rgba(68, 136, 238, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 9, y - 12, 18, 18);
  }

  // Freshly discovered secrets glow for a moment.
  for (const flash of view.flashes) {
    const fade = 1 - (now - flash.start) / (flash.duration ?? 600);
    ctx.fillStyle = `rgba(${flash.color ?? '255, 255, 200'}, ${0.6 * fade})`;
    ctx.fillRect((flash.cell % WIDTH) * TILE, Math.trunc(flash.cell / WIDTH) * TILE, TILE, TILE);
  }

  // Gas where it can be seen, thicker where there is more of it, slowly swirling.
  for (const cloud of scene.gas ?? []) {
    if (!visible[cloud.pos]) continue;
    const swirl = 0.85 + 0.15 * Math.sin(now / 400 + cloud.pos);
    ctx.fillStyle = `rgba(${cloud.color}, ${Math.min(0.55, 0.12 + cloud.volume / 120) * swirl})`;
    ctx.fillRect((cloud.pos % WIDTH) * TILE, Math.trunc(cloud.pos / WIDTH) * TILE, TILE, TILE);
  }

  // Pools of warm light, added onto what is lit (the dark then covers what is not in sight).
  ctx.globalCompositeOperation = 'lighter';
  // Light effects (quality.ts): no glowing pools, which cost a gradient each.
  for (const light of quality.light ? [] : scene.lights ?? []) {
    const glow = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.radius);
    glow.addColorStop(0, `rgba(${light.color}, ${light.strength})`);
    glow.addColorStop(1, `rgba(${light.color}, 0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(light.x - light.radius, light.y - light.radius, light.radius * 2, light.radius * 2);
  }
  ctx.globalCompositeOperation = 'source-over';

  // Fog of war: unexplored cells are black, remembered ones are dimmed.
  for (let i = 0; i < LENGTH; i++) {
    if (visible[i]) continue;
    ctx.fillStyle = explored[i] ? 'rgba(0, 0, 0, 0.55)' : '#000';
    ctx.fillRect((i % WIDTH) * TILE, Math.trunc(i / WIDTH) * TILE, TILE, TILE);
  }

  // Splats on the floor, where it can be seen.
  const seen = (x: number, y: number): boolean => visible[Math.trunc(y / TILE) * WIDTH + Math.trunc(x / TILE)] === true;
  fx.drawDecals(ctx, now, seen);

  // Characters, back to front. Monsters only show where the party can see.
  const shown = [...view.puppets.values()]
    .filter((puppet) => puppet.isHero || scene.seeAll || visible[puppet.to] || visible[puppet.from])
    .map((puppet) => ({ puppet, ...view.position(puppet, now) }))
    .sort((a, b) => Number(a.puppet.alive) - Number(b.puppet.alive) || a.y - b.y);
  for (const { puppet, x, y } of shown) drawPuppet(ctx, puppet, x, y, now);

  for (const { puppet, x, y } of shown) {
    if (!puppet.alive) continue;
    const top = y + TILE - puppet.sprite.sheet.h - 1;
    if (puppet.sleeping) {
      drawIcon(ctx, assets, ICONS.sleep, x + TILE - 2, top + Math.sin(now / 400) * 1.5);
    } else if (now < puppet.alertUntil) {
      drawIcon(ctx, assets, ICONS.alert, x + TILE / 2, top - 2);
    }
    if (puppet.hp < puppet.ht && !(puppet.isHero && puppet.id === myId)) drawHealth(ctx, puppet, x, y);
  }

  // Thrown weapons and magic bolts in flight.
  for (const p of view.projectiles) {
    const k = Math.min(1, (now - p.start) / p.duration);
    const x = ((p.from % WIDTH) + ((p.to % WIDTH) - (p.from % WIDTH)) * k) * TILE + TILE / 2;
    const y = (Math.trunc(p.from / WIDTH) + (Math.trunc(p.to / WIDTH) - Math.trunc(p.from / WIDTH)) * k) * TILE + TILE / 2;
    if (p.sprite === null) {
      ctx.fillStyle = `rgba(${p.color ?? '120, 180, 255'}, 0.5)`;
      ctx.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
    } else {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(k * Math.PI * 4);
      ctx.drawImage(assets.items, (p.sprite % 8) * 16, Math.floor(p.sprite / 8) * 16, 16, 16, -8, -8, 16, 16);
      ctx.restore();
    }
  }

  fx.draw(ctx, now, seen);

  // Floating numbers and words, drawn at screen resolution so text stays crisp.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Fallen, the hero sees the world drain of colour.
  if (scene.mourning) {
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = `rgba(128, 128, 128, ${scene.mourning})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(0, 0, 0, ${scene.mourning * 0.3})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  // Device pixels per CSS pixel: the cards' sizes are in CSS pixels, as in the design system.
  const px = canvas.width / (canvas.clientWidth || canvas.width);
  // Companions' names above their heads, in the colour co-op wears everywhere.
  for (const { puppet, x, y } of shown) {
    if (!puppet.label || !puppet.alive) continue;
    const sx = (x + TILE / 2 - camera.x) * camera.zoom;
    const sy = (y + TILE - puppet.sprite.sheet.h - 2 - camera.y) * camera.zoom;
    fxText(ctx, puppet.label, sx, sy, px, { font: 'small', scale: 1.5, color: '#5ec8c0', shadow: 0, alpha: 0.9 });
  }
  ctx.globalAlpha = 1;

  // Numbers and words rising over characters (PD.fx.number): damage red, healing green, words in their colour.
  for (const floater of view.floaters) {
    const sx = (floater.x - camera.x) * camera.zoom;
    const sy = (floater.y - camera.y) * camera.zoom;
    const numeric = /^\d+$/.test(floater.text);
    const kind = numeric ? ((floater.scale ?? 1) > 1 ? 'big' : 'damage') : /^\+\d+$/.test(floater.text) ? 'heal' : 'word';
    floatNumber(ctx, floater.text, kind, floater.color, sx, sy, now - floater.start, px);
  }
  ctx.globalAlpha = 1;

  // The hero's light: the edges of the view sink into the dark (not in light effects: a full-screen gradient).
  if (scene.focus && !quality.light) {
    const fx0 = (scene.focus.x - camera.x) * camera.zoom;
    const fy0 = (scene.focus.y - camera.y) * camera.zoom;
    const inner = TILE * camera.zoom * 3;
    const outer = Math.max(canvas.width, canvas.height) * 0.7;
    const shade = ctx.createRadialGradient(fx0, fy0, inner, fx0, fy0, outer);
    shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
    shade.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  fx.drawScreen(ctx, canvas.width, canvas.height, now);

  const middle = scene.middle ?? canvas.height / 2;

  // My level-up: the new level, golden, three tiles over the hero.
  const card = view.levelCard;
  if (card && scene.focus) {
    const x = (scene.focus.x - camera.x) * camera.zoom;
    const y = (scene.focus.y - camera.y) * camera.zoom - TILE * camera.zoom * 3;
    if (!levelCard(ctx, t.levelCard(card.lvl), x, y, now - card.start, px)) view.levelCard = null;
  }

  // A boss's title card as it notices the party: its name and epithet on a band across the free middle.
  const intro = view.bossIntro;
  if (intro && !bossCard(ctx, t.mobs[intro.kind].toUpperCase(), t.bossEpithets[intro.kind] ?? '', middle, canvas.width, now - intro.start, px)) {
    view.bossIntro = null;
  }

  // «Boss slain», white for a frame, then gold.
  if (view.bannerStart > 0 && !slainCard(ctx, t.bossDown, canvas.width / 2, middle, now - view.bannerStart, px)) view.bannerStart = 0;
}

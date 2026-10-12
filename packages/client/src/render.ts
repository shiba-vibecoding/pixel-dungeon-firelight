import { HEIGHT, type Level, LENGTH, T, WIDTH } from '@pd/core';
import { type Assets, frameAt, ICONS } from './sprites';
import { type Puppet, TILE, type View } from './view';

/* Canvas renderer for the world, using the original 16px tiles and sprites. */

export const FONT = '"Pixelify Sans", ui-monospace, monospace';

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
  const columns = assets.tiles.width / TILE;
  for (let i = 0; i < LENGTH; i++) {
    const terrain = level.map[i]!;
    const sx = (terrain % columns) * TILE;
    const sy = Math.trunc(terrain / columns) * TILE;
    ctx.drawImage(assets.tiles, sx, sy, TILE, TILE, (i % WIDTH) * TILE, Math.trunc(i / WIDTH) * TILE, TILE, TILE);
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
  const sy = Math.floor(frame / sheet.cols) * sheet.h;
  const dx = Math.round(x + (TILE - sheet.w) / 2);
  const dy = Math.round(y + TILE - sheet.h);

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
  /** Mind vision: every monster on the level shows. */
  seeAll: boolean;
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
  const pattern = ctx.createPattern(assets.water, 'repeat')!;
  const drift = (now / 120) % assets.water.width;
  pattern.setTransform(new DOMMatrix().translate(drift, drift * 0.5));
  ctx.fillStyle = pattern;
  for (let i = 0; i < LENGTH; i++) {
    if (isWater(level.map[i]!)) {
      ctx.fillRect((i % WIDTH) * TILE, Math.trunc(i / WIDTH) * TILE, TILE, TILE);
    }
  }
  ctx.drawImage(baked, 0, 0);

  // Items on the floor, remembered (and dimmed by the fog) once seen.
  for (const heap of scene.heaps) {
    if (!explored[heap.pos]) continue;
    const bob = visible[heap.pos] ? Math.round(Math.sin(now / 300 + heap.pos) * 0.6) : 0;
    ctx.drawImage(
      assets.items, (heap.sprite % 8) * 16, Math.floor(heap.sprite / 8) * 16, 16, 16,
      (heap.pos % WIDTH) * TILE, Math.trunc(heap.pos / WIDTH) * TILE - 1 + bob, 16, 16,
    );
  }

  // Freshly discovered secrets glow for a moment.
  for (const flash of view.flashes) {
    ctx.fillStyle = `rgba(255, 255, 200, ${0.6 * (1 - (now - flash.start) / 600)})`;
    ctx.fillRect((flash.cell % WIDTH) * TILE, Math.trunc(flash.cell / WIDTH) * TILE, TILE, TILE);
  }

  // Fog of war: unexplored cells are black, remembered ones are dimmed.
  for (let i = 0; i < LENGTH; i++) {
    if (visible[i]) continue;
    ctx.fillStyle = explored[i] ? 'rgba(0, 0, 0, 0.55)' : '#000';
    ctx.fillRect((i % WIDTH) * TILE, Math.trunc(i / WIDTH) * TILE, TILE, TILE);
  }

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
      ctx.fillStyle = 'rgba(120, 180, 255, 0.5)';
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

  // Floating numbers and words, drawn at screen resolution so text stays crisp.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `${Math.round(6 * camera.zoom)}px ${FONT}`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, camera.zoom);
  for (const floater of view.floaters) {
    const age = (now - floater.start) / 1200;
    const sx = (floater.x - camera.x) * camera.zoom;
    const sy = (floater.y - 2 - age * 14 - camera.y) * camera.zoom;
    ctx.globalAlpha = age < 0.6 ? 1 : (1 - age) / 0.4;
    ctx.strokeStyle = '#000';
    ctx.strokeText(floater.text, sx, sy);
    ctx.fillStyle = floater.color;
    ctx.fillText(floater.text, sx, sy);
  }
  ctx.globalAlpha = 1;

  // "Boss slain" banner, fading in and out.
  const age = now - view.bannerStart;
  if (view.bannerStart > 0 && age < 4000) {
    const banner = assets.bossBanner;
    const scale = camera.zoom;
    ctx.globalAlpha = Math.min(1, age / 300, (4000 - age) / 600);
    ctx.drawImage(
      banner,
      Math.round(canvas.width / 2 - (banner.width * scale) / 2),
      Math.round(canvas.height / 3 - (banner.height * scale) / 2),
      banner.width * scale,
      banner.height * scale,
    );
    ctx.globalAlpha = 1;
  }
}

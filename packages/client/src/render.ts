import { HEIGHT, type HeroClass, type Level, LENGTH, T, WIDTH } from '@pd/core';

/* Canvas renderer for the original pixel art: 16px tiles, 12x15 hero frames. */

export const TILE = 16;
const HERO_W = 12;
const HERO_H = 15;

export interface Sprites {
  tiles: HTMLImageElement;
  water: HTMLImageElement;
  heroes: Record<HeroClass, HTMLImageElement>;
}

export interface Camera {
  /** World pixel shown at the canvas's top-left corner. */
  x: number;
  y: number;
  zoom: number;
}

export interface HeroView {
  heroClass: HeroClass;
  /** Position in world pixels (interpolated while walking). */
  x: number;
  y: number;
  flip: boolean;
  local: boolean;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${url}`));
    image.src = url;
  });
}

export async function loadSprites(base: string): Promise<Sprites> {
  const [tiles, water, warrior, mage, rogue, huntress] = await Promise.all(
    ['tiles0', 'water0', 'warrior', 'mage', 'rogue', 'ranger'].map((name) => loadImage(`${base}${name}.png`)),
  );
  return { tiles: tiles!, water: water!, heroes: { warrior: warrior!, mage: mage!, rogue: rogue!, huntress: huntress! } };
}

const isWater = (terrain: number): boolean => terrain >= T.WATER_TILES && terrain <= T.WATER;

/** Draws the static tile layer once per level; water is animated underneath it. */
export function bakeLevel(level: Level, sprites: Sprites): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * TILE;
  canvas.height = HEIGHT * TILE;
  const ctx = canvas.getContext('2d')!;
  const columns = sprites.tiles.width / TILE;
  for (let i = 0; i < LENGTH; i++) {
    const terrain = level.map[i]!;
    const sx = (terrain % columns) * TILE;
    const sy = Math.trunc(terrain / columns) * TILE;
    ctx.drawImage(sprites.tiles, sx, sy, TILE, TILE, (i % WIDTH) * TILE, Math.trunc(i / WIDTH) * TILE, TILE, TILE);
  }
  return canvas;
}

export function render(
  ctx: CanvasRenderingContext2D,
  level: Level,
  baked: HTMLCanvasElement,
  visible: readonly boolean[],
  explored: readonly boolean[],
  heroes: readonly HeroView[],
  sprites: Sprites,
  camera: Camera,
  time: number,
): void {
  const { canvas } = ctx;
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(camera.zoom, 0, 0, camera.zoom, -camera.x * camera.zoom, -camera.y * camera.zoom);

  // Slowly drifting water under the transparent parts of water tiles.
  const pattern = ctx.createPattern(sprites.water, 'repeat')!;
  const drift = (time / 120) % sprites.water.width;
  pattern.setTransform(new DOMMatrix().translate(drift, drift * 0.5));
  ctx.fillStyle = pattern;
  for (let i = 0; i < LENGTH; i++) {
    if (isWater(level.map[i]!)) {
      ctx.fillRect((i % WIDTH) * TILE, Math.trunc(i / WIDTH) * TILE, TILE, TILE);
    }
  }

  ctx.drawImage(baked, 0, 0);

  // Fog of war: unexplored cells are black, remembered ones are dimmed.
  for (let i = 0; i < LENGTH; i++) {
    if (visible[i]) continue;
    ctx.fillStyle = explored[i] ? 'rgba(0, 0, 0, 0.55)' : '#000';
    ctx.fillRect((i % WIDTH) * TILE, Math.trunc(i / WIDTH) * TILE, TILE, TILE);
  }

  const ordered = [...heroes].sort((a, b) => a.y - b.y);
  for (const hero of ordered) {
    const image = sprites.heroes[hero.heroClass];
    const dx = Math.round(hero.x + (TILE - HERO_W) / 2);
    const dy = Math.round(hero.y + TILE - HERO_H - 1);
    if (hero.flip) {
      ctx.save();
      ctx.translate(dx + HERO_W, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(image, 0, 0, HERO_W, HERO_H, 0, 0, HERO_W, HERO_H);
      ctx.restore();
    } else {
      ctx.drawImage(image, 0, 0, HERO_W, HERO_H, dx, dy, HERO_W, HERO_H);
    }
  }
}

import {
  act, addHero, cellX, cellY, createWorld, DEEPEST_AVAILABLE, exploredCells, findPath, type Hero, type HeroClass,
  HEIGHT, heroById, levelAt, visibleCells, WIDTH,
} from '@pd/core';
import { bakeLevel, type Camera, type HeroView, loadSprites, render, TILE } from './render';

/* Single-player playground for the new core: walk the generated sewers. */

const STEP_MS = 110;
const HERO_CLASSES: readonly HeroClass[] = ['warrior', 'mage', 'rogue', 'huntress'];

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || Math.floor(Math.random() * 2 ** 31);
const heroClass = (HERO_CLASSES as readonly string[]).includes(params.get('hero') ?? '')
  ? (params.get('hero') as HeroClass)
  : 'warrior';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const hud = document.getElementById('hud')!;

const world = createWorld(seed);
const me = addHero(world, { id: 'me', name: 'You', heroClass });
const sprites = await loadSprites(`${import.meta.env.BASE_URL}assets/`);

// The tile layer is re-baked whenever the world changes (doors open/close).
let baked = bakeLevel(levelAt(world, me.depth), sprites);
let bakedTurn = -1;
let visible: boolean[] = [];

// Walking: queued path cells, one step per STEP_MS, sprite slides between cells.
let queue: number[] = [];
let lastStep = 0;
let from = me.pos;
let flip = false;

function cellDistance(a: number, b: number): number {
  return Math.max(Math.abs(cellX(a) - cellX(b)), Math.abs(cellY(a) - cellY(b)));
}

function hero(): Hero {
  return heroById(world, 'me')!;
}

function step(now: number): void {
  if (queue.length === 0 || now - lastStep < STEP_MS) return;
  const current = hero();
  const next = queue.shift()!;
  from = current.pos;
  if (!act(world, 'me', { type: 'move', to: next }).ok) {
    queue = [];
    return;
  }
  if (cellX(next) !== cellX(from)) flip = cellX(next) < cellX(from);
  lastStep = now;

  const level = levelAt(world, current.depth);
  if (queue.length === 0 && current.pos === level.exit) {
    if (act(world, 'me', { type: 'descend' }).ok) {
      from = current.pos;
    }
  }
}

function walkTo(target: number): void {
  const current = hero();
  const level = levelAt(world, current.depth);
  queue = findPath(level, current.pos, target, new Set(), exploredCells(world, current.depth)) ?? [];
}

canvas.addEventListener('pointerdown', (event) => {
  const rect = canvas.getBoundingClientRect();
  const scale = canvas.width / rect.width;
  const wx = camera.x + ((event.clientX - rect.left) * scale) / camera.zoom;
  const wy = camera.y + ((event.clientY - rect.top) * scale) / camera.zoom;
  const x = Math.floor(wx / TILE);
  const y = Math.floor(wy / TILE);
  if (x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT) {
    walkTo(x + y * WIDTH);
  }
});

const KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0],
  KeyQ: [-1, -1], KeyE: [1, -1], KeyZ: [-1, 1], KeyC: [1, 1],
};
addEventListener('keydown', (event) => {
  const dir = KEYS[event.code];
  if (dir) {
    const current = hero();
    queue = [current.pos + dir[0] + dir[1] * WIDTH];
    event.preventDefault();
  }
});

const camera: Camera = { x: 0, y: 0, zoom: 2 };

function resize(): void {
  const dpr = Math.min(devicePixelRatio || 1, 3);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  // About 13 tiles across the narrow side, at an integer zoom for crisp pixels.
  camera.zoom = Math.max(1, Math.floor(Math.min(canvas.width, canvas.height) / (TILE * 13)));
}
addEventListener('resize', resize);
resize();

function frame(now: number): void {
  step(now);
  const current = hero();
  if (world.turn !== bakedTurn) {
    if (bakedTurn >= 0 && cellDistance(from, current.pos) > 1) from = current.pos;
    baked = bakeLevel(levelAt(world, current.depth), sprites);
    visible = visibleCells(world, current.depth);
    bakedTurn = world.turn;
  }

  const t = Math.min(1, (now - lastStep) / STEP_MS);
  const x = (cellX(from) + (cellX(current.pos) - cellX(from)) * t) * TILE;
  const y = (cellY(from) + (cellY(current.pos) - cellY(from)) * t) * TILE;

  // Follow the hero, but never show the void beyond the map edges.
  const viewW = canvas.width / camera.zoom;
  const viewH = canvas.height / camera.zoom;
  const clamp = (value: number, view: number, size: number): number =>
    view >= size ? (size - view) / 2 : Math.min(Math.max(value, 0), size - view);
  camera.x = Math.round(clamp(x + TILE / 2 - viewW / 2, viewW, WIDTH * TILE));
  camera.y = Math.round(clamp(y + TILE / 2 - viewH / 2, viewH, HEIGHT * TILE));

  const heroes: HeroView[] = [{ heroClass: current.heroClass, x, y, flip, local: true }];
  render(ctx, levelAt(world, current.depth), baked, visible, exploredCells(world, current.depth), heroes, sprites, camera, now);

  hud.textContent =
    `Depth ${current.depth}/${DEEPEST_AVAILABLE}  ·  seed ${seed}  ·  ${current.heroClass}\n` +
    `Tap a cell or use arrows/WASD; reach > to descend`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  // Debug handle for the browser console.
  Object.assign(window, { __pd: { world, camera } });
}

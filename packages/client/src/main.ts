import {
  cellX, cellY, DEEPEST_AVAILABLE, exploredCells, findPath, type Hero, type HeroClass, HEIGHT, levelAt,
  visibleCells, WIDTH, type World,
} from '@pd/core';
import { bakeLevel, type Camera, type HeroView, loadSprites, render, TILE } from './render';
import { localSession, onlineSession, type Session } from './session';

/*
 * Pixel Dungeon client. Offline by default; with ?room=<name> it joins a co-op
 * room on the server (VITE_SERVER_URL, ws://127.0.0.1:8787 in development).
 */

const STEP_MS = 110;
const HERO_CLASSES: readonly HeroClass[] = ['warrior', 'mage', 'rogue', 'huntress'];

const params = new URLSearchParams(location.search);
const heroClass = (HERO_CLASSES as readonly string[]).includes(params.get('hero') ?? '')
  ? (params.get('hero') as HeroClass)
  : 'warrior';

function playerId(): string {
  const key = 'pd-player-id';
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

const room = params.get('room');
const session: Session = room
  ? onlineSession({
      server: import.meta.env.VITE_SERVER_URL ?? 'ws://127.0.0.1:8787',
      room,
      // ?player= lets two tabs of one browser act as different players.
      playerId: params.get('player') ?? playerId(),
      name: params.get('name') ?? 'Hero',
      heroClass,
    })
  : localSession(Number(params.get('seed')) || Math.floor(Math.random() * 2 ** 31), heroClass);

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const hud = document.getElementById('hud')!;
const sprites = await loadSprites(`${import.meta.env.BASE_URL}assets/`);

// Walking: the queued path is sent one step at a time; online, the next step
// waits until the server has confirmed the previous one.
let queue: number[] = [];
let lastSent = 0;
let descendWhenArrived = false;

function me(world: World): Hero | undefined {
  return world.heroes.find((hero) => hero.id === session.myId);
}

function step(world: World, now: number): void {
  const hero = me(world);
  if (!hero || session.waiting) return;

  if (queue.length === 0) {
    // Arrived on the stairs at the end of a walk: go down.
    if (descendWhenArrived && hero.pos === levelAt(world, hero.depth).exit) {
      session.send({ type: 'descend' });
    }
    descendWhenArrived = false;
    return;
  }
  if (now - lastSent < STEP_MS) return;

  const next = queue.shift()!;
  lastSent = now;
  descendWhenArrived = queue.length === 0 && next === levelAt(world, hero.depth).exit;
  session.send({ type: 'move', to: next });
}

canvas.addEventListener('pointerdown', (event) => {
  const world = session.world;
  const hero = world && me(world);
  if (!world || !hero) return;
  const rect = canvas.getBoundingClientRect();
  const scale = canvas.width / rect.width;
  const x = Math.floor((camera.x + ((event.clientX - rect.left) * scale) / camera.zoom) / TILE);
  const y = Math.floor((camera.y + ((event.clientY - rect.top) * scale) / camera.zoom) / TILE);
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  const others = new Set(world.heroes.filter((h) => h !== hero && h.depth === hero.depth).map((h) => h.pos));
  queue = findPath(levelAt(world, hero.depth), hero.pos, x + y * WIDTH, others, exploredCells(world, hero.depth)) ?? [];
});

const KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0],
  KeyQ: [-1, -1], KeyE: [1, -1], KeyZ: [-1, 1], KeyC: [1, 1],
};
addEventListener('keydown', (event) => {
  const dir = KEYS[event.code];
  const hero = session.world && me(session.world);
  if (dir && hero) {
    queue = [hero.pos + dir[0] + dir[1] * WIDTH];
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

// Smooth movement for every hero: slide from the previous cell to the current one.
interface Motion {
  from: number;
  to: number;
  depth: number;
  start: number;
  flip: boolean;
}
const motions = new Map<string, Motion>();

function heroView(hero: Hero, now: number, local: boolean): HeroView {
  let motion = motions.get(hero.id);
  if (!motion || motion.depth !== hero.depth) {
    motion = { from: hero.pos, to: hero.pos, depth: hero.depth, start: 0, flip: false };
    motions.set(hero.id, motion);
  } else if (motion.to !== hero.pos) {
    const flip = cellX(hero.pos) !== cellX(motion.to) ? cellX(hero.pos) < cellX(motion.to) : motion.flip;
    motion = { from: motion.to, to: hero.pos, depth: hero.depth, start: now, flip };
    motions.set(hero.id, motion);
  }
  const t = Math.min(1, (now - motion.start) / STEP_MS);
  return {
    heroClass: hero.heroClass,
    x: (cellX(motion.from) + (cellX(motion.to) - cellX(motion.from)) * t) * TILE,
    y: (cellY(motion.from) + (cellY(motion.to) - cellY(motion.from)) * t) * TILE,
    flip: motion.flip,
    local,
  };
}

let baked: HTMLCanvasElement | null = null;
let bakedKey = '';
let visible: boolean[] = [];

function frame(now: number): void {
  requestAnimationFrame(frame);
  const world = session.world;
  const hero = world && me(world);
  if (!world || !hero) {
    hud.textContent = session.status;
    return;
  }
  step(world, now);

  const level = levelAt(world, hero.depth);
  const key = `${hero.depth}:${world.turn}`;
  if (key !== bakedKey) {
    baked = bakeLevel(level, sprites);
    visible = visibleCells(world, hero.depth);
    bakedKey = key;
  }

  const views = world.heroes
    .filter((other) => other.depth === hero.depth)
    .map((other) => heroView(other, now, other.id === hero.id));
  const mine = views.find((view) => view.local)!;

  // Keep the hero centred: near the map edges the void shows, but the hero
  // never ends up under the thumbs or the HUD.
  camera.x = Math.round(mine.x + TILE / 2 - canvas.width / camera.zoom / 2);
  camera.y = Math.round(mine.y + TILE / 2 - canvas.height / camera.zoom / 2);

  render(ctx, level, baked!, visible, exploredCells(world, hero.depth), views, sprites, camera, now);

  const party = world.heroes
    .map((h) => `${session.online.includes(h.id) ? '●' : '○'} ${h.name} (${h.heroClass}) d${h.depth}`)
    .join('\n');
  hud.textContent = `Depth ${hero.depth}/${DEEPEST_AVAILABLE} · ${session.status}\n${party}`;
}
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  // Debug handle for the browser console.
  Object.assign(window, { __pd: { session, camera } });
}

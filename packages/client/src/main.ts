import {
  adjacent, blockers, cellX, cellY, createWorld, DEEPEST_AVAILABLE, type Effect, exploredCells, findPath, type Hero,
  heroById, type HeroClass, HEIGHT, isAlive, levelAt, mobById, visibleCells, WIDTH, type World,
} from '@pd/core';
import { Hud } from './hud';
import { t } from './i18n';
import { bakeLevel, type Camera, render } from './render';
import { hideOverlay, overlayOpen, showDeath, showHelp, showMenu, showTitle, toast } from './screens';
import { forgetSolo, loadSolo, onlineSession, type Session, soloSession } from './session';
import { loadAssets } from './sprites';
import { haptic, initData, initTelegram, inTelegram, invitedRoom, shareInvite, telegramName } from './telegram';
import { STEP_MS, TILE, View } from './view';

/*
 * Pixel Dungeon client: title screen, then a solo run (kept in local storage),
 * the daily dungeon, or a co-op room on the server (VITE_SERVER_URL).
 */

const HERO_CLASSES: readonly HeroClass[] = ['warrior', 'mage', 'rogue', 'huntress'];
const SOLO_SLOT = 'pd-solo';
const SERVER: string = import.meta.env.VITE_SERVER_URL ?? (import.meta.env.DEV ? `ws://${location.hostname}:8787` : '');

initTelegram('#1f1d1d');

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const assets = await loadAssets(`${import.meta.env.BASE_URL}assets/`);
await document.fonts.load('16px "Pixelify Sans"').catch(() => undefined);
document.getElementById('loading')?.remove();

const view = new View(assets);
const hud = new Hud(assets);
const camera: Camera = { x: 0, y: 0, zoom: 2 };

/* Preferences */

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not kept; fine.
  }
}

let heroClass: HeroClass = (HERO_CLASSES as readonly string[]).includes(stored('pd-class') ?? '')
  ? (stored('pd-class') as HeroClass)
  : 'warrior';
let playerName = stored('pd-name') ?? '';

function playerId(): string {
  // ?player= lets two tabs of one browser act as different players in development.
  const forced = new URLSearchParams(location.search).get('player');
  if (forced) return forced;
  let id = stored('pd-player-id');
  if (!id) {
    id = crypto.randomUUID();
    store('pd-player-id', id);
  }
  return id;
}

/** Same seed for everyone on the same (UTC) day. */
function dailySeed(): number {
  const day = new Date().toISOString().slice(0, 10);
  let hash = 2166136261;
  for (const char of day) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 1) % 2 ** 31;
}

const randomSeed = (): number => Math.floor(Math.random() * 2 ** 31);

function newRoomId(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => alphabet[b % alphabet.length]).join('');
}

/* Sessions */

let session: Session | null = null;
let room: string | null = null;
let seenGeneration = -1;
let deathShown = -1;

function setRoomInUrl(id: string | null): void {
  const url = new URL(location.href);
  if (id) url.searchParams.set('room', id);
  else url.searchParams.delete('room');
  history.replaceState(null, '', url);
}

function enterGame(next: Session, roomId: string | null): void {
  session?.close();
  session = next;
  room = roomId;
  setRoomInUrl(roomId);
  seenGeneration = -1;
  deathShown = -1;
  walk.reset();
  view.log = [];
  view.say(t.welcome);
  hideOverlay();
}

function startSolo(mode: 'continue' | 'new' | 'daily'): void {
  if (mode === 'new') forgetSolo(SOLO_SLOT);
  const daily = mode === 'daily';
  const seed = daily ? dailySeed() : randomSeed();
  enterGame(soloSession(daily ? null : SOLO_SLOT, heroClass, () => (daily ? seed : randomSeed())), null);
}

function startOnline(roomId: string): void {
  enterGame(
    onlineSession({
      server: SERVER,
      room: roomId,
      playerId: playerId(),
      name: playerName.trim() || telegramName() || 'Hero',
      heroClass,
      initData: initData(),
      text: { connecting: t.connecting, reconnecting: t.reconnecting, replaced: t.replaced },
    }),
    roomId,
  );
}

function toTitle(): void {
  session?.close();
  session = null;
  room = null;
  setRoomInUrl(null);
  const invited = invitedRoom();
  showTitle({
    heroClass,
    invitedRoom: invited && SERVER ? invited : null,
    hasSave: loadSolo(SOLO_SLOT) !== null,
    coopAvailable: Boolean(SERVER),
    askName: inTelegram ? null : playerName,
    onClass: (value) => {
      heroClass = value;
      store('pd-class', value);
    },
    onName: (value) => {
      playerName = value;
      store('pd-name', value);
    },
    onContinue: () => startSolo('continue'),
    onSolo: () => startSolo('new'),
    onCoop: () => {
      const id = newRoomId();
      startOnline(id);
      void invite(id);
    },
    onJoin: () => startOnline(invited!),
    onDaily: () => startSolo('daily'),
  });
}

async function invite(id: string): Promise<void> {
  const result = await shareInvite(id, t.inviteText);
  if (result === 'copied') toast(t.linkCopied);
}

function openMenu(): void {
  showMenu({
    room,
    onResume: hideOverlay,
    onInvite: () => {
      hideOverlay();
      if (room) void invite(room);
    },
    onHelp: () => showHelp(hideOverlay),
    onExit: toTitle,
  });
}

/* Walking: a path is sent one step at a time; each waits for the last to be done. */

const walk = {
  queue: [] as number[],
  /** Monster to walk up to and hit. */
  chase: null as string | null,
  stairs: null as 'descend' | 'ascend' | null,
  lastSent: 0,
  reset(): void {
    this.queue = [];
    this.chase = null;
    this.stairs = null;
  },
};

/** Awake monsters the party could see last frame; a new one interrupts walking. */
let threats = new Set<string>();

function send(action: Parameters<Session['send']>[0], now: number): void {
  walk.lastSent = now;
  session!.send(action);
}

function step(world: World, now: number, visible: readonly boolean[]): void {
  const me = heroById(world, session!.myId);
  if (!me || !isAlive(me) || session!.busy || overlayOpen() || now - walk.lastSent < STEP_MS) return;
  const level = levelAt(world, me.depth);

  if (walk.chase) {
    const mob = mobById(world, me.depth, walk.chase);
    if (!mob || !visible[mob.pos]) {
      walk.chase = null;
    } else if (adjacent(me.pos, mob.pos)) {
      walk.chase = null;
      send({ type: 'attack', target: mob.id }, now);
      return;
    } else {
      const path = findPath(level, me.pos, mob.pos, occupiedCells(world, me.depth, mob.pos), exploredCells(world, me.depth));
      if (!path || path.length < 2) {
        walk.chase = null;
        return;
      }
      send({ type: 'move', to: path[0]! }, now);
      return;
    }
  }

  if (walk.queue.length > 0) {
    const next = walk.queue.shift()!;
    if (!adjacent(me.pos, next) || occupiedCells(world, me.depth).has(next)) {
      walk.reset();
      return;
    }
    send({ type: 'move', to: next }, now);
    return;
  }

  if (walk.stairs) {
    const stairs = walk.stairs;
    walk.stairs = null;
    useStairs(world, stairs, now);
  }
}

function useStairs(world: World, stairs: 'descend' | 'ascend', now: number): void {
  const me = heroById(world, session!.myId)!;
  const level = levelAt(world, me.depth);
  if (stairs === 'descend' && me.pos === level.exit) {
    if (me.depth >= DEEPEST_AVAILABLE) view.say(t.tooDeep, '#ffff44', now);
    else send({ type: 'descend' }, now);
  } else if (stairs === 'ascend' && me.pos === level.entrance && me.depth > 1) {
    send({ type: 'ascend' }, now);
  }
}

/** Cells taken by living characters on a depth, except `except`. */
function occupiedCells(world: World, depth: number, except = -1): Set<number> {
  const cells = new Set<number>();
  for (const hero of world.heroes) {
    if (hero.depth === depth && isAlive(hero) && hero.id !== session!.myId) cells.add(hero.pos);
  }
  for (const mob of world.floors[depth]?.mobs ?? []) cells.add(mob.pos);
  cells.delete(except);
  return cells;
}

function handleMyEffects(effects: readonly Effect[], myId: string): void {
  for (const effect of effects) {
    if ((effect.type === 'interrupted' && effect.hero === myId) || (effect.type === 'attack' && effect.target === myId)) {
      walk.queue = [];
      walk.stairs = null;
    }
  }
}

/* Input */

function act(type: 'wait' | 'search'): void {
  const world = session?.world;
  if (!world || session!.busy) return;
  walk.reset();
  send({ type }, performance.now());
}

function tapCell(cell: number): void {
  const world = session?.world;
  const me = world && heroById(world, session!.myId);
  if (!world || !me || !isAlive(me)) return;
  const level = levelAt(world, me.depth);
  const visible = visibleCells(world, me.depth);
  const explored = exploredCells(world, me.depth);
  walk.reset();

  if (cell === me.pos) {
    if (me.pos === level.exit) useStairs(world, 'descend', performance.now());
    else if (me.pos === level.entrance && me.depth > 1) useStairs(world, 'ascend', performance.now());
    else act('search');
    return;
  }
  const mob = world.floors[me.depth]?.mobs.find((m) => m.pos === cell);
  if (mob && visible[cell]) {
    walk.chase = mob.id;
    return;
  }
  if (!explored[cell]) return;
  walk.queue = findPath(level, me.pos, cell, occupiedCells(world, me.depth), explored) ?? [];
  if (cell === level.exit) walk.stairs = 'descend';
  else if (cell === level.entrance && me.depth > 1) walk.stairs = 'ascend';
}

canvas.addEventListener('pointerdown', (event) => {
  if (!session?.world || overlayOpen()) return;
  const rect = canvas.getBoundingClientRect();
  const px = (event.clientX - rect.left) * (canvas.width / rect.width);
  const py = (event.clientY - rect.top) * (canvas.height / rect.height);
  const button = hud.hit(px, py);
  if (button === 'wait' || button === 'search') act(button);
  else if (button === 'help') showHelp(hideOverlay);
  else if (button === 'menu') openMenu();
  if (button || hud.covers(px, py)) return;

  const x = Math.floor((camera.x + px / camera.zoom) / TILE);
  const y = Math.floor((camera.y + py / camera.zoom) / TILE);
  if (x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT) tapCell(x + y * WIDTH);
});

const KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0],
  KeyQ: [-1, -1], KeyE: [1, -1], KeyZ: [-1, 1], KeyC: [1, 1],
  Numpad8: [0, -1], Numpad2: [0, 1], Numpad4: [-1, 0], Numpad6: [1, 0],
  Numpad7: [-1, -1], Numpad9: [1, -1], Numpad1: [-1, 1], Numpad3: [1, 1],
};

addEventListener('keydown', (event) => {
  const world = session?.world;
  const me = world && heroById(world, session!.myId);
  if (!world || !me || overlayOpen()) {
    if (event.code === 'Escape' && session && overlayOpen()) hideOverlay();
    return;
  }
  const dir = KEYS[event.code];
  if (dir) {
    tapCell(me.pos + dir[0] + dir[1] * WIDTH);
  } else if (event.code === 'Space' || event.code === 'Numpad5' || event.code === 'Period') {
    act('wait');
  } else if (event.code === 'KeyF') {
    act('search');
  } else if (event.code === 'Enter') {
    tapCell(me.pos);
  } else if (event.code === 'Escape') {
    openMenu();
  } else {
    return;
  }
  event.preventDefault();
});

/* Layout */

function resize(): void {
  const dpr = Math.min(devicePixelRatio || 1, 3);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  // About 12 tiles across the narrow side, at an integer zoom for crisp pixels.
  camera.zoom = Math.max(1, Math.round(Math.min(canvas.width, canvas.height) / (TILE * 12)));
  hud.layout(canvas.width, canvas.height);
  document.documentElement.style.setProperty('--px', String(hud.ui / dpr));
}
addEventListener('resize', resize);
resize();

/* Frame loop */

/** Stands in for the hero while an online session is still connecting. */
const placeholderHero: Hero = {
  id: '', name: '', heroClass: 'warrior', depth: 1, pos: 0, hp: 1, ht: 1, str: 10, lvl: 1, exp: 0,
  attackSkill: 0, defenseSkill: 0, time: 0, intent: null, regen: 0,
};

let baked: HTMLCanvasElement | null = null;
let bakedKey = '';
let visible: boolean[] = [];
let busySince = 0;

/** A quiet dungeon behind the title screen. */
const backdrop = (() => {
  const world = createWorld(20240501);
  const level = levelAt(world, 1);
  return { level, baked: bakeLevel(level, assets) };
})();

function drawBackdrop(now: number): void {
  const { level } = backdrop;
  const span = WIDTH * TILE;
  camera.x = Math.round(span / 2 - canvas.width / camera.zoom / 2 + Math.sin(now / 9000) * 60);
  camera.y = Math.round(span / 2 - canvas.height / camera.zoom / 2 + Math.cos(now / 11000) * 40);
  const all = new Array<boolean>(level.map.length).fill(true);
  const none = new View(assets);
  render(ctx, level, backdrop.baked, all, all, none, '', assets, camera, now);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(15, 13, 13, 0.6)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function frame(now: number): void {
  requestAnimationFrame(frame);
  tick(now);
}

function tick(now: number): void {
  if (!session) {
    drawBackdrop(now);
    return;
  }
  const world = session.world;
  const me = world && heroById(world, session.myId);
  if (!world || !me) {
    drawBackdrop(now);
    hud.draw(ctx, { me: placeholderHero, party: [], online: [], waitingFor: [], status: session.status, log: [] }, now);
    return;
  }

  if (session.generation !== seenGeneration || me.depth !== view.depth) {
    if (session.generation !== seenGeneration) deathShown = -1;
    seenGeneration = session.generation;
    view.reset(me.depth);
    walk.reset();
    bakedKey = '';
    threats = new Set();
  }

  const level = levelAt(world, me.depth);
  const key = `${me.depth}:${world.turn}:${session.generation}`;
  if (key !== bakedKey) {
    baked = bakeLevel(level, assets);
    visible = visibleCells(world, me.depth);
    bakedKey = key;

    // A newly spotted awake monster stops a walk, as in the original.
    const inSight = new Set(
      (world.floors[me.depth]?.mobs ?? []).filter((m) => m.state !== 'sleeping' && visible[m.pos]).map((m) => m.id),
    );
    if ([...inSight].some((id) => !threats.has(id))) {
      walk.queue = [];
      walk.stairs = null;
    }
    threats = inSight;
  }

  const effects = session.drain();
  if (effects.length > 0) {
    view.apply(effects, world, session.myId, now);
    handleMyEffects(effects, session.myId);
  }
  view.sync(world, now);
  step(world, now, visible);

  const mine = view.puppets.get(me.id);
  const at = mine ? view.position(mine, now) : { x: cellX(me.pos) * TILE, y: cellY(me.pos) * TILE };
  camera.x = Math.round(at.x + TILE / 2 - canvas.width / camera.zoom / 2);
  camera.y = Math.round(at.y + TILE / 2 - canvas.height / camera.zoom / 2);
  render(ctx, level, baked!, visible, exploredCells(world, me.depth), view, session.myId, assets, camera, now);

  // Who the dungeon is waiting for, once my action has been queued for a moment.
  if (session.busy) busySince ||= now;
  else busySince = 0;
  const waitingFor =
    busySince && now - busySince > 400
      ? blockers(world).filter((id) => id !== me.id).map((id) => heroById(world, id)?.name ?? '?')
      : [];
  const status = session.status || (!isAlive(me) && !world.over ? `${t.youDied}. ${t.youDiedCoop}` : '');
  hud.draw(
    ctx,
    {
      me,
      party: session.mode === 'online' ? world.heroes.filter((h) => h.id !== me.id) : [],
      online: session.online,
      waitingFor,
      status,
      log: view.log,
    },
    now,
  );

  if (world.over && deathShown !== session.generation) {
    deathShown = session.generation;
    const solo = session.mode === 'solo';
    window.setTimeout(() => {
      if (!session?.world?.over) return;
      haptic('error');
      showDeath({
        title: solo ? t.youDied : t.partyFell,
        text: t.soloFell(me.depth),
        restartLabel: solo ? t.tryAgain : t.restartRun,
        onRestart: () => {
          session?.restart();
          hideOverlay();
        },
        onExit: toTitle,
      });
    }, 1200);
  }
}

requestAnimationFrame(frame);

const invited = invitedRoom();
if (invited && SERVER && new URLSearchParams(location.search).has('room')) {
  // Reloading a page that was in a room goes straight back in.
  startOnline(invited);
} else {
  toTitle();
}

if (import.meta.env.DEV) {
  // Debug handle for the browser console. advance() runs frames on a virtual
  // clock, for automated tests in hidden tabs where animation frames never fire.
  let virtual = performance.now();
  const advance = (ms: number): void => {
    virtual = Math.max(virtual, performance.now());
    for (let t = 0; t < ms; t += 33) tick((virtual += 33));
  };
  Object.assign(window, { __pd: { get session() { return session; }, camera, view, walk, advance, resize } });
}

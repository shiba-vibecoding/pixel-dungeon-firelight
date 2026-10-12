import {
  adjacent, blockers, buyPrice, cellX, cellY, createHero, createWorld, type Effect, exploredCells, findPath, HEAP_SPRITES,
  type Hero, type Item,
  heroById, type HeroClass, HEIGHT, isAlive, isHungry, isStarving, itemDef, itemSprite, levelAt, mobById, type MobKind, T,
  visibleCells, wandMaxCharges, WIDTH,
  type World,
} from '@pd/core';
import * as core from '@pd/core';
import { audio } from './audio';
import { BUFF_ICONS, heroBuffs, Hud } from './hud';
import { t } from './i18n';
import { bakeLevel, type Camera, render } from './render';
import { type DailyBoard, fetchDaily, type Identity, submitDaily } from './leaderboard';
import {
  hideOverlay, overlayOpen, showBackpack, showDailyBoard, showGhost, showHelp, showHero, showMenu, showRunEnd, showSell,
  showSign, showTitle, showTrade, toast,
} from './screens';
import { forgetSolo, loadSolo, onlineSession, type Session, soloSession } from './session';
import { loadAssets } from './sprites';
import {
  backButton, haptic, initData, initTelegram, inTelegram, invitedRoom, launchedForDaily, onLayoutChange, shareDaily,
  shareInvite, telegramName,
} from './telegram';
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

// ?hero= and ?name= override the saved choices (handy for testing several players).
const query = new URLSearchParams(location.search);
const savedClass = query.get('hero') ?? stored('pd-class') ?? '';
let heroClass: HeroClass = (HERO_CLASSES as readonly string[]).includes(savedClass) ? (savedClass as HeroClass) : 'warrior';
let playerName = query.get('name') ?? stored('pd-name') ?? '';

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
  audio.playMusic('game');
  // Telegram's back button opens the menu, or closes whatever window is open.
  backButton(() => (overlayOpen() ? hideOverlay() : openMenu()));
  view.log = [];
  view.say(t.welcome);
  hideOverlay();
}

/** The current run is the daily dungeon, whose results go to the leaderboard. */
let dailyRun = false;

/** Today's daily run has its own save slot, so a reload of the Mini App does not lose it. */
const dailySlot = (): string => `pd-daily-${new Date().toISOString().slice(0, 10)}`;

// Runs of past days are of no use any more.
try {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('pd-daily-') && key !== dailySlot()) localStorage.removeItem(key);
  }
} catch {
  // Storage unavailable: nothing to clean.
}

function startSolo(mode: 'continue' | 'new' | 'daily'): void {
  if (mode === 'new') forgetSolo(SOLO_SLOT);
  const daily = mode === 'daily';
  const seed = daily ? dailySeed() : randomSeed();
  enterGame(soloSession(daily ? dailySlot() : SOLO_SLOT, heroClass, () => (daily ? seed : randomSeed())), null);
  dailyRun = daily;
}

/** Who I am on the leaderboard: Telegram proves it; elsewhere a remembered id. */
function identity(): Identity {
  return { initData: initData(), id: playerId(), name: playerName.trim() || telegramName() || 'Hero' };
}

function dailyBoard(): Promise<DailyBoard | null> {
  return fetchDaily(SERVER, stored('pd-board-id') ?? undefined);
}

/** Sends a finished daily run and returns today's board. */
async function submitRun(world: World, me: Hero): Promise<DailyBoard | null> {
  const board = await submitDaily(SERVER, identity(), {
    heroClass: me.heroClass,
    depth: Object.keys(world.levels).length,
    level: me.lvl,
    gold: me.gold,
    won: world.victory,
  });
  if (board?.you) store('pd-board-id', board.you);
  return board;
}

function startOnline(roomId: string): void {
  dailyRun = false;
  enterGame(
    onlineSession({
      server: SERVER,
      room: roomId,
      playerId: playerId(),
      name: playerName.trim() || telegramName() || 'Hero',
      heroClass,
      initData: initData(),
      text: { connecting: t.connecting, reconnecting: t.reconnecting, replaced: t.replaced, full: t.partyFull },
    }),
    roomId,
  );
}

function toTitle(): void {
  session?.close();
  session = null;
  room = null;
  setRoomInUrl(null);
  audio.playMusic('theme');
  backButton(null);
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
    onDailyBoard: SERVER ? () => showDailyBoard(dailyBoard(), toTitle) : undefined,
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
  /** Pick up what lies at the end of the walk. */
  pickup: false,
  /** Resting until healed (a long press on the hourglass), stopped by any danger. */
  resting: false,
  lastSent: 0,
  reset(): void {
    this.queue = [];
    this.chase = null;
    this.stairs = null;
    this.pickup = false;
    this.resting = false;
  },
};

const heapAt = (world: World, depth: number, pos: number): boolean =>
  (world.floors[depth]?.heaps ?? []).some((heap) => heap.pos === pos);

/** Aiming a thrown weapon or a wand: the next tap on the map picks the target. */
let aim: { index: number; kind: 'throw' | 'zap' } | null = null;

/** The backpack slot shown in the quickslot: the first thrown weapon or wand. */
function quickIndex(hero: Hero): number {
  return hero.items.findIndex((item) => {
    const category = itemDef(item.kind).category;
    return category === 'missile' || category === 'wand';
  });
}

function toggleQuickslot(): void {
  const world = session?.world;
  const me = world && heroById(world, session!.myId);
  if (!me) return;
  if (aim) {
    aim = null;
    return;
  }
  const index = quickIndex(me);
  if (index < 0) return;
  const item = me.items[index]!;
  if (item.charges === 0) {
    view.say(t.noCharges, '#cccccc');
    return;
  }
  walk.reset();
  aim = { index, kind: itemDef(item.kind).category === 'wand' ? 'zap' : 'throw' };
}

/** Awake monsters the party could see last frame; a new one interrupts walking. */
let threats = new Set<string>();

function send(action: Parameters<Session['send']>[0], now: number): void {
  const me = session?.world && heroById(session.world, session.myId);
  if (action.type === 'move' && me && me.rooted > 0) {
    walk.reset();
    view.say(t.rooted, '#ffff44');
    return;
  }
  walk.lastSent = now;
  session!.send(action);
}

function step(world: World, now: number, visible: readonly boolean[]): void {
  const me = heroById(world, session!.myId);
  // Resting turns are not paced like steps: there is nothing to animate.
  const pace = walk.resting ? 0 : STEP_MS;
  if (!me || !isAlive(me) || session!.busy || overlayOpen() || now - walk.lastSent < pace) return;
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

  if (walk.pickup) {
    walk.pickup = false;
    if (heapAt(world, me.depth, me.pos)) {
      takeHere(world, me, now);
      return;
    }
  }

  if (walk.resting) {
    if (isStarving(me)) {
      walk.resting = false;
      view.say(t.tooHungryToRest, '#ff4444');
    } else if (me.hp >= me.ht || threats.size > 0) {
      walk.resting = false;
    } else {
      send({ type: 'wait' }, now);
      return;
    }
  }

  if (walk.stairs) {
    const stairs = walk.stairs;
    walk.stairs = null;
    useStairs(world, stairs, now);
  }
}

/** Picks up what lies here, or offers a shop's ware for sale. */
function takeHere(world: World, me: Hero, now: number): void {
  const heap = world.floors[me.depth]?.heaps.find((h) => h.pos === me.pos);
  if (!heap) return;
  if (heap.kind === 'forSale') openTrade(world, me, heap.items[0]!);
  else send({ type: 'pickup' }, now);
}

function openTrade(world: World, me: Hero, item: Item): void {
  walk.reset();
  showTrade({
    world, hero: me, item, price: buyPrice(item, me.depth, world.known.includes(item.kind)),
    onBuy: () => send({ type: 'buy' }, performance.now()),
    onClose: hideOverlay,
  });
}

/** The shopkeeper's offer for the pack; it stays open while selling. */
let selling = false;

function openShop(): void {
  const world = session?.world;
  const me = world && heroById(world, session!.myId);
  if (!world || !me) return;
  walk.reset();
  selling = true;
  showSell({
    world, hero: me,
    onSell: (index) => send({ type: 'sell', item: index }, performance.now()),
    onClose: () => {
      selling = false;
      hideOverlay();
    },
  });
}

function useStairs(world: World, stairs: 'descend' | 'ascend', now: number): void {
  const me = heroById(world, session!.myId)!;
  const level = levelAt(world, me.depth);
  if (stairs === 'descend' && me.pos === level.exit) {
    send({ type: 'descend' }, now);
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
    if (effect.type === 'ghost' && effect.hero === myId) talkWithGhost(effect.line);
    if (effect.type === 'shop' && effect.hero === myId) openShop();
    if (effect.type === 'sold' && effect.hero === myId && selling && overlayOpen()) openShop();
    const hurt =
      (effect.type === 'attack' && effect.target === myId) ||
      (effect.type === 'hurt' && effect.who === myId) ||
      (effect.type === 'hunger' && effect.hero === myId && effect.state === 'starving');
    if ((effect.type === 'interrupted' && effect.hero === myId) || hurt) {
      walk.queue = [];
      walk.stairs = null;
      walk.resting = false;
    }
  }
}

function talkWithGhost(line: 'intro' | 'remind' | 'reward' | 'farewell'): void {
  const world = session?.world;
  const me = world && heroById(world, session!.myId);
  if (!world || !me) return;
  audio.play('ghost');
  walk.reset();
  const quest = world.quest;
  showGhost({
    world,
    hero: me,
    text: t.ghost[line],
    reward:
      line === 'reward' && quest
        ? {
            weapon: quest.weapon,
            armor: quest.armor,
            onChoose: (choice) => send({ type: 'reward', choice }, performance.now()),
          }
        : undefined,
    onClose: hideOverlay,
  });
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

  if (aim) {
    const shot = aim;
    aim = null;
    if (cell !== me.pos && me.items[shot.index]) send({ type: shot.kind, item: shot.index, target: cell }, performance.now());
    return;
  }

  if (cell === me.pos) {
    if (heapAt(world, me.depth, me.pos)) takeHere(world, me, performance.now());
    else if (me.pos === level.exit) useStairs(world, 'descend', performance.now());
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
  if (level.map[cell] === T.LOCKED_DOOR && !me.items.some((i) => i.kind === 'key.iron' && i.depth === me.depth)) {
    view.say(t.locked, '#ff8800');
    return;
  }
  if (level.map[cell] === T.BARRICADE) {
    view.say(t.barricade, '#ff8800');
    return;
  }
  walk.queue = findPath(level, me.pos, cell, occupiedCells(world, me.depth), explored) ?? [];
  if (walk.queue.length === 0) return;
  walk.pickup = heapAt(world, me.depth, cell);
  if (cell === level.exit) walk.stairs = 'descend';
  else if (cell === level.entrance && me.depth > 1) walk.stairs = 'ascend';
}

function openHero(): void {
  const world = session?.world;
  const me = world && heroById(world, session!.myId);
  if (!world || !me) return;
  walk.reset();
  aim = null;
  showHero({ hero: me, buffs: heroBuffs(me), onClose: hideOverlay });
}

function openBackpack(): void {
  const world = session?.world;
  const me = world && heroById(world, session!.myId);
  if (!world || !me) return;
  walk.reset();
  aim = null;
  showBackpack({
    world,
    hero: me,
    onAction: (action) => send(action, performance.now()),
    onAim: (index, kind) => {
      aim = { index, kind };
    },
    onClose: hideOverlay,
  });
}

canvas.addEventListener('pointerdown', (event) => {
  if (!session?.world || overlayOpen()) return;
  const rect = canvas.getBoundingClientRect();
  const px = (event.clientX - rect.left) * (canvas.width / rect.width);
  const py = (event.clientY - rect.top) * (canvas.height / rect.height);
  const me = heroById(session.world, session.myId);
  const button = hud.hit(px, py, Boolean(me && quickIndex(me) >= 0));
  if (button) audio.play('click');
  if (button && button !== 'quick') aim = null;
  if (button === 'quick') toggleQuickslot();
  else if (button === 'wait') pressWait();
  else if (button === 'search') act(button);
  else if (button === 'help') showHelp(hideOverlay);
  else if (button === 'backpack') openBackpack();
  else if (button === 'menu') openMenu();
  else if (button === 'hero') openHero();
  if (button || hud.covers(px, py)) return;

  const x = Math.floor((camera.x + px / camera.zoom) / TILE);
  const y = Math.floor((camera.y + py / camera.zoom) / TILE);
  if (x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT) tapCell(x + y * WIDTH);
});

function startResting(): void {
  const world = session?.world;
  const me = world && heroById(world, session!.myId);
  walk.reset();
  if (me && isStarving(me)) {
    view.say(t.tooHungryToRest, '#ff4444');
    return;
  }
  walk.resting = true;
  view.say(t.resting, '#cccccc');
}

/* The hourglass: a tap waits a turn, holding it rests until healed (as in the original). */
let waitPress: { timer: number; long: boolean } | null = null;

function pressWait(): void {
  const press = {
    long: false,
    timer: window.setTimeout(() => {
      press.long = true;
      startResting();
    }, 400),
  };
  waitPress = press;
}

function releaseWait(): void {
  if (!waitPress) return;
  clearTimeout(waitPress.timer);
  if (!waitPress.long) act('wait');
  waitPress = null;
}

addEventListener('pointerup', releaseWait);
addEventListener('pointercancel', releaseWait);

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
  } else if (event.code === 'KeyR') {
    startResting();
  } else if (event.code === 'KeyF') {
    act('search');
  } else if (event.code === 'KeyI') {
    openBackpack();
  } else if (event.code === 'KeyG') {
    if (heapAt(world, me.depth, me.pos)) takeHere(world, me, performance.now());
  } else if (event.code === 'Enter') {
    tapCell(me.pos);
  } else if (event.code === 'Escape') {
    if (aim) aim = null;
    else openMenu();
  } else if (event.code === 'KeyT') {
    toggleQuickslot();
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
  const safe = getComputedStyle(document.getElementById('safe-area')!);
  hud.layout(canvas.width, canvas.height, parseFloat(safe.paddingTop) * dpr || 0, parseFloat(safe.paddingBottom) * dpr || 0);
  document.documentElement.style.setProperty('--px', String(hud.ui / dpr));
}
addEventListener('resize', resize);
onLayoutChange(() => requestAnimationFrame(resize));
resize();

/* Frame loop */

/** Stands in for the hero while an online session is still connecting. */
const placeholderHero: Hero = createHero({ id: '', name: '', heroClass: 'warrior' }, 1, 0, 0);

let baked: HTMLCanvasElement | null = null;
let bakedKey = '';
let visible: boolean[] = [];
let busySince = 0;

/** A quiet dungeon behind the title screen. */
const backdrop = (() => {
  const world = createWorld(20240501);
  const level = levelAt(world, 1);
  const all = new Array<boolean>(level.map.length).fill(true);
  return { level, baked: bakeLevel(level, assets), all, view: new View(assets) };
})();

/** Where my hero was last frame, for footstep and stairs sounds. */
let lastPlace = { generation: -1, depth: 0, pos: -1 };

function drawBackdrop(now: number): void {
  const { level, all } = backdrop;
  const span = WIDTH * TILE;
  camera.x = Math.round(span / 2 - canvas.width / camera.zoom / 2 + Math.sin(now / 9000) * 60);
  camera.y = Math.round(span / 2 - canvas.height / camera.zoom / 2 + Math.cos(now / 11000) * 40);
  render(
    ctx, { level, baked: backdrop.baked, visible: all, explored: all, heaps: [], seeAll: false },
    backdrop.view, '', assets, camera, now,
  );
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
    hud.draw(
      ctx,
      {
        me: placeholderHero, party: [], online: [], waitingFor: [], status: session.status, log: [], buffs: [], quick: null,
        keys: 0,
      },
      now,
    );
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

  // Footsteps, doors and stairs of my own hero.
  if (lastPlace.generation === session.generation && isAlive(me)) {
    if (me.depth !== lastPlace.depth) {
      audio.play('descend');
      // GameScene's greetings: the depth, a new region, and the level's feeling.
      view.say(me.depth > lastPlace.depth ? t.descended(me.depth) : t.ascended(me.depth));
      if (me.depth === 6 && lastPlace.depth === 5) view.say(t.enterPrison, '#ffff44');
      const feeling = t.feelings[level.feeling];
      if (feeling && me.depth > lastPlace.depth) view.say(feeling, '#ffff44');
    } else if (me.pos !== lastPlace.pos) {
      const terrain = level.map[me.pos]!;
      audio.play(terrain >= T.WATER_TILES && terrain <= T.WATER ? 'water' : 'step', 1, 0.5);
      if (terrain === T.OPEN_DOOR) audio.play('door_open', 1, 0.6);
      // Stepping onto a sign reads it.
      const tip = t.signs[me.depth - 1];
      if (terrain === T.SIGN && tip) {
        walk.reset();
        showSign(tip, hideOverlay);
      }
    }
  }
  lastPlace = { generation: session.generation, depth: me.depth, pos: me.pos };

  const key = `${me.depth}:${world.turn}:${session.generation}`;
  if (key !== bakedKey) {
    baked = bakeLevel(level, assets);
    visible = visibleCells(world, me.depth);
    bakedKey = key;

    // A newly spotted awake monster stops a walk, as in the original.
    const inSight = new Set(
      (world.floors[me.depth]?.mobs ?? [])
        .filter((m) => m.state !== 'sleeping' && m.state !== 'passive' && visible[m.pos])
        .map((m) => m.id),
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
  view.sync(world, now, session.myId);
  step(world, now, visible);

  const mine = view.puppets.get(me.id);
  const at = mine ? view.position(mine, now) : { x: cellX(me.pos) * TILE, y: cellY(me.pos) * TILE };
  camera.x = Math.round(at.x + TILE / 2 - canvas.width / camera.zoom / 2);
  camera.y = Math.round(at.y + TILE / 2 - canvas.height / camera.zoom / 2);
  const heaps = (world.floors[me.depth]?.heaps ?? []).map((heap) => ({
    pos: heap.pos,
    sprite: heap.kind === 'heap' || heap.kind === 'forSale' ? itemSprite(heap.items[0]!, world.run.labels) : HEAP_SPRITES[heap.kind],
  }));
  const scene = {
    level, baked: baked!, visible, explored: exploredCells(world, me.depth), heaps, seeAll: me.mindVision > 0,
  };
  render(ctx, scene, view, session.myId, assets, camera, now);

  // Who the dungeon is waiting for, once my action has been queued for a moment.
  if (session.busy) busySince ||= now;
  else busySince = 0;
  const waitingFor =
    busySince && now - busySince > 400
      ? blockers(world).filter((id) => id !== me.id).map((id) => heroById(world, id)?.name ?? '?')
      : [];
  const status =
    session.status || (!isAlive(me) && !world.over ? `${t.youDied}. ${t.youDiedCoop}` : aim ? t.chooseTarget : '');
  const quick = quickIndex(me);
  const quickItem = me.items[quick];
  hud.draw(
    ctx,
    {
      me,
      party: session.mode === 'online' ? world.heroes.filter((h) => h.id !== me.id) : [],
      online: session.online,
      waitingFor,
      status,
      log: view.log,
      buffs: heroBuffs(me).map((buff) => BUFF_ICONS[buff.name]),
      keys: me.items.filter((i) => i.kind === 'key.iron' && i.depth === me.depth).length,
      quick: quickItem
        ? {
            sprite: itemSprite(quickItem, world.run.labels),
            label:
              quickItem.charges !== undefined
                ? `${quickItem.charges}/${wandMaxCharges(quickItem)}`
                : quickItem.qty > 1 ? String(quickItem.qty) : '',
            aiming: aim !== null,
          }
        : null,
    },
    now,
  );

  if (world.over && deathShown !== session.generation) {
    deathShown = session.generation;
    const solo = session.mode === 'solo';
    const victory = world.victory;
    if (victory) {
      audio.play('levelup');
      haptic('success');
    }
    // A finished daily run goes to today's leaderboard.
    const daily =
      dailyRun && SERVER
        ? (() => {
            const depth = Object.keys(world.levels).length;
            const score = (me.gold + me.lvl * depth * 100) * (victory ? 2 : 1);
            return {
              score,
              board: submitRun(world, me),
              onShare: () => {
                void shareDaily(t.shareText(score, depth)).then((result) => {
                  if (result === 'copied') toast(t.linkCopied);
                });
              },
            };
          })()
        : undefined;
    window.setTimeout(() => {
      if (!session?.world?.over) return;
      if (!victory) haptic('error');
      const cause = me.killedBy && (t.causes[me.killedBy] ?? t.mobs[me.killedBy as MobKind] ?? me.killedBy);
      showRunEnd({
        victory,
        title: victory ? t.victory : solo ? t.youDied : t.partyFell,
        text: victory ? t.victoryText : t.soloFell(me.depth),
        details: [...(!victory && cause ? [t.killedBy(cause)] : []), t.runStats(me.lvl, me.gold, me.kills)],
        restartLabel: victory ? t.newRun : solo ? t.tryAgain : t.restartRun,
        onRestart: () => {
          session?.restart();
          hideOverlay();
        },
        onExit: toTitle,
        daily,
      });
    }, 1200);
  }
}

requestAnimationFrame(frame);

const invited = invitedRoom();
if (invited && SERVER && new URLSearchParams(location.search).has('room')) {
  // Reloading a page that was in a room goes straight back in.
  startOnline(invited);
} else if (launchedForDaily()) {
  // Opened from a shared daily result: straight into today's dungeon.
  startSolo('daily');
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
  /** Runs frames in real time for `ms`, so a screenshot right after shows a consistent frame. */
  const play = async (ms: number): Promise<void> => {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      tick(performance.now());
      await new Promise((resolve) => setTimeout(resolve, 33));
    }
  };
  Object.assign(window, { __pd: { get session() { return session; }, camera, view, walk, advance, play, resize, core } });
}

import {
  adjacent, blockers, buyPrice, cellX, cellY, createHero, createWorld, type Effect, exploredCells, F, findPath, hasFlag,
  HEAP_SPRITES,
  type Hero, type Item,
  heroById, type HeroClass, HEIGHT, isAlive, isHungry, isStarving, itemDef, itemSprite, levelAt, mobById, type MobKind,
  ORE_WANTED, PLANT_KINDS, type SmithLine, T,
  visibleCells, wandMaxCharges, WIDTH,
  type World, charAt, swapsWithHero,
} from '@pd/core';
import * as core from '@pd/core';
import './ui.css';
import './game.css';
import { mobDescription, plantText, tileText, wellText } from './examine';
import { quickIndex, quickUse } from './quickslot';
import { fx } from './fx';
import { ambientFx, effectFx, lightsFor, regionFx } from './fx-events';
/** The visual clock's last reading, for frame-to-frame particle steps. */
let lastVisual = 0;
/** When my hero fell, on the visual clock, or 0 while alive. */
let fallenAt = 0;
import { BADGES, type BadgeId, badgeText, checkBadges, countGame } from './badges';
import { audio } from './audio';
import { heroBuffs, Hud, type HudStatus } from './hud';
import { capitalize, t } from './i18n';
import { itemInfo, itemName } from './itemtext';
import { bakeLevel, type Camera, render } from './render';
import { type DailyBoard, fetchDaily, type Identity, submitDaily } from './leaderboard';
import {
  armorTier, closeOverlay, hideOverlay, overlayOpen, portrait, setAssets, showBackpack, showConfirm, showReforge, showDailyBoard, showHelp, showHero,
  showHistory, showMenu, showRankings, showQuest, showRunEnd, showBadges, showInfo, showSell, showSign, showTitle, showTrade, slot, toast,
} from './screens';
import { quality } from './quality';
import { sharePicture } from './share';
import { rankings, recordRun, runScore } from './rankings';
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
/*
 * The loading screen (the design's .pd-loading): the logo, a running warrior,
 * a bar in steps and a tip. If the sprites cannot be had, a window says so
 * and offers to try again.
 */
const loading = document.getElementById('loading')!;
const progress = document.createElement('div');
const progressText = document.createElement('p');
{
  const tips = [2, 7, 8, 9, 10];
  const tip = t.helpText[tips[Math.floor(Math.random() * tips.length)]!] ?? '';
  loading.className = 'pd-loading';
  loading.setAttribute('aria-busy', 'true');
  progress.className = 'pd-progress';
  progress.setAttribute('role', 'progressbar');
  progressText.className = 'pd-loading-text';
  progressText.textContent = t.loadingSprites(0);
  const logo = Object.assign(document.createElement('div'), { className: 'pd-logo' });
  logo.append(Object.assign(document.createElement('img'), { src: 'assets/banner-title.png', alt: 'Pixel Dungeon' }));
  const runner = Object.assign(document.createElement('div'), { className: 'pd-runner' });
  const hint = Object.assign(document.createElement('p'), { className: 'pd-loading-tip' });
  hint.append(Object.assign(document.createElement('b'), { textContent: t.tip }), ` ${tip}`);
  loading.replaceChildren(logo, runner, progress, progressText, hint);
}
const assets = await loadAssets(`${import.meta.env.BASE_URL}assets/`, (done) => {
  const percent = Math.round(done * 100);
  progress.style.setProperty('--v', String(done));
  progressText.textContent = t.loadingSprites(percent);
}).catch((error: unknown) => {
  const box = document.createElement('section');
  box.className = 'pd-window narrow';
  box.setAttribute('role', 'alertdialog');
  const retry = Object.assign(document.createElement('button'), { className: 'pd-button primary', textContent: t.retry, onclick: () => location.reload() });
  box.append(
    Object.assign(document.createElement('div'), { className: 'pd-error-icon' }),
    Object.assign(document.createElement('h2'), { className: 'pd-heading center', textContent: t.noConnection }),
    Object.assign(document.createElement('p'), { className: 'pd-info center', textContent: t.noConnectionText }),
    retry,
    Object.assign(document.createElement('p'), { className: 'pd-note center', textContent: String(error instanceof Error ? error.message : error) }),
  );
  const overlay = document.getElementById('overlay')!;
  overlay.replaceChildren(box);
  overlay.classList.add('open');
  throw error;
});
await Promise.all([document.fonts.load('18px Galmuri11'), document.fonts.load('15px Galmuri9')]).catch(() => undefined);
loading.remove();
setAssets(assets);

const view = new View(assets);
const hud = new Hud({
  hero: () => openHero(),
  menu: () => openMenu(),
  wait: () => {
    aim = null;
    examining = false;
    act('wait');
  },
  rest: () => startResting(),
  search: () => {
    aim = null;
    examining = false;
    act('search');
  },
  // The info button: the next tap on the map examines that cell.
  examine: () => {
    aim = null;
    examining = !examining;
  },
  quick: () => {
    examining = false;
    toggleQuickslot();
  },
  backpack: () => {
    examining = false;
    openBackpack();
  },
  history: () => showHistory(view.log, hideOverlay),
  buff: (name, turns) => toast(turns ? `${t.buffs[name]} (${t.turnsLeft(turns)})` : t.buffs[name]),
  mate: (id) => {
    const hero = session?.world && heroById(session.world, id);
    if (hero) toast(`${hero.name} · ${t.classes[hero.heroClass]} · ${t.newDepth(hero.depth)}`, { tone: 'ally' });
  },
});
/** Something was picked up since the backpack was last opened. */
let newLoot = false;
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
/** My hero just jumped into a chasm: the next change of depth is a fall. */
let justFell = false;

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
  backButton(() => (overlayOpen() ? closeOverlay() : openMenu()));
  hud.show(true);
  newLoot = false;
  view.log = [];
  view.say(t.welcome);
  hideOverlay();
  // The very first game opens with how to play.
  if (!stored('pd-seen-help')) {
    store('pd-seen-help', '1');
    showHelp(hideOverlay);
  }
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
  hud.show(false);
  const invited = invitedRoom();
  const saved = loadSolo(SOLO_SLOT)?.heroes[0];
  showTitle({
    heroClass,
    invitedRoom: invited && SERVER ? invited : null,
    save: saved ? { heroClass: saved.heroClass, lvl: saved.lvl, depth: saved.depth } : null,
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
    onRankings: () => showRankings(rankings(), toTitle),
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
    onBadges: () => showBadges(hideOverlay),
    onEffects: (full) => {
      quality.setMode(full ? 'full' : 'light');
      resize();
    },
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
  (world.floors[depth]?.heaps ?? []).some((heap) => heap.pos === pos && heap.kind !== 'hidden');

/** Aiming a thrown weapon or a wand: the next tap on the map picks the target. */
let aim: { index: number; kind: 'throw' | 'zap' | 'special' } | null = null;

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
  const use = quickUse(item.kind);
  if (use === 'use') send({ type: 'use', item: index }, performance.now());
  else if (use) aim = { index, kind: use };
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
  // Charmed, the hero cannot bring themselves to strike the charmer: say so rather than do nothing.
  if (action.type === 'attack' && me && me.charmed > 0 && me.charmedBy === action.target) {
    walk.reset();
    view.say(t.charmedNoAttack, '#ffff44');
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
      const path = findPath(
        level, me.pos, mob.pos, occupiedCells(world, me.depth, mob.pos), exploredCells(world, me.depth), (me.levitating ?? 0) > 0,
      );
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
  if (!heap || heap.kind === 'hidden') return;
  // A locked or crystal chest wants the level's golden key; through crystal one sees what it holds.
  const locked = heap.kind === 'lockedChest' || heap.kind === 'crystalChest';
  if (locked && !me.items.some((i) => i.kind === 'key.golden' && i.depth === me.depth)) {
    view.say(heap.kind === 'crystalChest' ? t.crystalChest(itemName(world, heap.items[0]!)) : t.lockedChest, '#ff8800');
    return;
  }
  if (heap.kind === 'forSale') openTrade(world, me, heap.items[0]!);
  else send({ type: 'pickup' }, now);
}

function openTrade(world: World, me: Hero, item: Item): void {
  walk.reset();
  showTrade({
    world, hero: me, item,
    price: buyPrice(item, me.depth, world.known.includes(item.kind), me.rings.some((ring) => ring.kind === 'ring.haggler')),
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
  // The ghost and magic sheep step aside: the hero swaps places with them.
  for (const mob of world.floors[depth]?.mobs ?? []) if (!swapsWithHero(mob)) cells.add(mob.pos);
  cells.delete(except);
  return cells;
}

/** Badges earned just now: a toast and the original's fanfare for each. */
function announceBadges(ids: readonly BadgeId[]): void {
  for (const id of ids) {
    audio.play('badge');
    toast(t.badgeEarned(badgeText(id)), { tone: 'badge', badge: BADGES.find((b) => b.id === id)?.image });
  }
}

function handleMyEffects(effects: readonly Effect[], myId: string): void {
  const world = session?.world;
  const me = world && heroById(world, myId);
  if (world && me) announceBadges([...countGame(world.run.seed), ...checkBadges(world, me, effects)]);
  for (const effect of effects) {
    if (effect.type === 'ghost' && effect.hero === myId) talkWithGhost(effect.line, effect.errand);
    if (effect.type === 'ratKing' && effect.hero === myId) talkWithRatKing(effect.line);
    if (effect.type === 'wandmaker' && effect.hero === myId) talkWithWandmaker(effect.line);
    if (effect.type === 'imp' && effect.hero === myId) talkWithImp(effect.line);
    if (effect.type === 'smith' && effect.hero === myId) talkWithSmith(effect.line);
    if (effect.type === 'shop' && effect.hero === myId) openShop();
    if (effect.type === 'fell' && effect.hero === myId) justFell = true;
    // Hero.interrupt: an item breaking stops whatever the hero was doing.
    if (effect.type === 'worn' && effect.hero === myId && effect.state === 'broken') walk.reset();
    if (effect.type === 'pickedUp' && effect.hero === myId && effect.item.kind !== 'gold') newLoot = true;
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

function talkWithGhost(line: 'intro' | 'remind' | 'reward' | 'farewell', errand: 'rose' | 'rat' | 'curse'): void {
  const world = session?.world;
  const me = world && heroById(world, session!.myId);
  if (!world || !me) return;
  audio.play('ghost');
  walk.reset();
  const quest = world.quest;
  // Each errand has its own words; the curse is only taken on if the hero says yes.
  const text =
    line === 'farewell' ? t.ghost.farewell
    : errand === 'rat' ? t.ghostRat[line]
    : errand === 'curse' ? (line === 'reward' ? t.ghostCurse.reward(t.classes[me.heroClass]) : t.ghostCurse.intro)
    : t.ghost[line];
  showQuest({
    world,
    hero: me,
    who: 'ghost',
    text,
    offers: line === 'reward' && quest ? [quest.weapon, quest.armor] : [],
    onChoose: (index) => send({ type: 'reward', choice: index === 0 ? 'weapon' : 'armor' }, performance.now()),
    ...(errand === 'curse' && line === 'intro'
      ? { answers: [{ label: t.ghostCurse.yes, onAnswer: () => send({ type: 'faceCurse' }, performance.now()) }, { label: t.ghostCurse.no, onAnswer: () => undefined }] }
      : {}),
    onClose: hideOverlay,
  });
}

/** RatKing.interact: a few words, and back to his kingdom. */
function talkWithRatKing(line: 'notSleeping' | 'busy'): void {
  const world = session?.world;
  const me = world && heroById(world, session!.myId);
  if (!world || !me) return;
  walk.reset();
  showQuest({ world, hero: me, who: 'ratKing', text: t.ratKing[line], onClose: hideOverlay });
}

function talkWithWandmaker(line: 'intro' | 'remind' | 'reward' | 'farewell'): void {
  const world = session?.world;
  const me = world && heroById(world, session!.myId);
  if (!world || !me) return;
  walk.reset();
  const quest = world.wandQuest;
  showQuest({
    world,
    hero: me,
    who: 'wandmaker',
    // He may be after a rotberry seed rather than corpse dust.
    text: quest?.wants === 'berry' && line === 'intro' ? t.wandmaker.introBerry
      : quest?.wants === 'berry' && line === 'remind' ? t.wandmaker.remindBerry
      : quest?.wants === 'fish' && line === 'intro' ? t.wandmaker.introFish
      : quest?.wants === 'fish' && line === 'remind' ? t.wandmaker.remindFish
      : t.wandmaker[line],
    offers: line === 'reward' && quest ? [quest.battle, quest.utility] : [],
    onChoose: (index) => send({ type: 'wandReward', choice: index === 0 ? 'battle' : 'utility' }, performance.now()),
    onClose: hideOverlay,
  });
}

function talkWithSmith(line: SmithLine): void {
  const world = session?.world;
  const me = world && heroById(world, session!.myId);
  const quest = world?.smithQuest;
  if (!world || !me || !quest) return;
  walk.reset();
  const text =
    line === 'intro' ? t.smith.intro[quest.wants]
    : line === 'noGold' ? t.smith.noGold(ORE_WANTED)
    : t.smith[line];
  // Done with the errand: his services are on offer at once.
  if (line === 'completed' || line === 'reforge') {
    showReforge({
      world, hero: me, text,
      onReforge: (first, second) => send({ type: 'reforge', first, second }, performance.now()),
      onClose: hideOverlay,
    });
    return;
  }
  showQuest({ world, hero: me, who: 'blacksmith', text, onClose: hideOverlay });
}

function talkWithImp(line: 'intro' | 'remind' | 'reward' | 'farewell'): void {
  const world = session?.world;
  const me = world && heroById(world, session!.myId);
  const quest = world?.impQuest;
  if (!world || !me || !quest) return;
  walk.reset();
  const text =
    line === 'intro' ? t.imp.intro[quest.prey]
    : line === 'remind' ? t.imp.remind[quest.prey]
    : line === 'reward' ? t.imp.reward
    : t.imp.farewell(t.classes[me.heroClass]);
  showQuest({
    world,
    hero: me,
    who: 'imp',
    text,
    offers: line === 'reward' ? [quest.reward] : [],
    onChoose: () => send({ type: 'impReward' }, performance.now()),
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
  // The tapped cell lights up for a blink: the tap was taken.
  if (explored[cell]) view.flashes.push({ cell, start: fx.time(performance.now()), color: aim ? '255, 120, 80' : '255, 255, 255', duration: 260 });

  if (aim) {
    const shot = aim;
    aim = null;
    if (shot.kind === 'special') send({ type: 'special', target: cell }, performance.now());
    else if (cell !== me.pos && me.items[shot.index]) send({ type: shot.kind, item: shot.index, target: cell }, performance.now());
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
  // A vein of dark gold beside the hero, with the blacksmith's pickaxe at hand: mine it.
  const pickaxe = me.weapon?.kind === 'weapon.pickaxe' || me.items.some((i) => i.kind === 'weapon.pickaxe');
  if (level.map[cell] === T.WALL_DECO && adjacent(me.pos, cell) && pickaxe && me.depth >= 11 && me.depth <= 15) {
    send({ type: 'mine' }, performance.now());
    return;
  }
  // Chasm.heroJump: a chasm right beside the hero asks whether to jump in; floating, one drifts over it.
  const floating = (me.levitating ?? 0) > 0;
  if (hasFlag(level.map[cell]!, F.PIT) && !floating) {
    if (adjacent(me.pos, cell)) {
      showConfirm(t.chasm, t.jumpQuestion, t.jumpYes, t.jumpNo, () => send({ type: 'jump', to: cell }, performance.now()), hideOverlay);
    }
    return;
  }
  if (level.map[cell] === T.LOCKED_DOOR && !me.items.some((i) => i.kind === 'key.iron' && i.depth === me.depth)) {
    view.say(t.locked, '#ff8800');
    return;
  }
  // Hero.handle: the way down from a boss's depth wants its skeleton key.
  if (level.map[cell] === T.LOCKED_EXIT && !me.items.some((i) => i.kind === 'key.skeleton' && i.depth === me.depth)) {
    view.say(t.exitLocked, '#ff8800');
    return;
  }
  if (level.map[cell] === T.BARRICADE) {
    view.say(t.barricade, '#ff8800');
    return;
  }
  // The alchemy pot: what it is for, then walk up to it as usual.
  if (level.map[cell] === T.ALCHEMY) view.say(t.alchemyPot, '#ffff44');
  walk.queue = findPath(level, me.pos, cell, occupiedCells(world, me.depth), explored, floating) ?? [];
  if (walk.queue.length === 0) {
    // No way around a known trap: walk up to it and say so; a tap on the trap itself steps onto it.
    const risky = findPath(level, me.pos, cell, occupiedCells(world, me.depth), explored, floating, true);
    const trap = risky?.findIndex((c) => c !== cell && hasFlag(level.map[c]!, F.AVOID)) ?? -1;
    if (risky && trap >= 0) {
      walk.queue = risky.slice(0, trap);
      view.say(t.trapInTheWay, '#ff8800');
    }
    return;
  }
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
  newLoot = false;
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
  // The HUD, log and toolbar are HTML over the canvas: what reaches here is a tap on the map.
  const rect = canvas.getBoundingClientRect();
  const px = (event.clientX - rect.left) * (canvas.width / rect.width);
  const py = (event.clientY - rect.top) * (canvas.height / rect.height);

  const x = Math.floor((camera.x + px / camera.zoom) / TILE);
  const y = Math.floor((camera.y + py / camera.zoom) / TILE);
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  if (examining) {
    examining = false;
    examineCell(x + y * WIDTH);
    return;
  }
  tapCell(x + y * WIDTH);
});

/** The examine tool is on: the next tap on the map tells what is there. */
let examining = false;

/** What is at a cell: a monster or hero in sight, an item lying there, or the terrain. */
function examineCell(pos: number): void {
  const world = session?.world;
  const me = world && heroById(world, session!.myId);
  if (!world || !me) return;
  if (!exploredCells(world, me.depth)[pos]) {
    view.say(t.examineUnknown, '#cccccc');
    return;
  }
  const seen = visibleCells(world, me.depth)[pos];
  const char = seen ? charAt(world, me.depth, pos) : undefined;
  if (char && 'kind' in char) {
    const state = char.state === 'passive' ? '' : t.mobStates[char.state] ?? '';
    const health = char.state === 'passive' ? '' : t.examineHealth(Math.max(0, char.hp), char.ht);
    showInfo(t.mobs[char.kind], [mobDescription(char), state], hideOverlay, {
      icon: portrait(char.kind),
      ...(health ? { health: [Math.max(0, char.hp), char.ht] as const } : {}),
    });
    return;
  }
  if (char) {
    showInfo(char.name, [`${capitalize(t.classes[char.heroClass])}, ${t.levelShort} ${char.lvl}`], hideOverlay, {
      icon: portrait(char.heroClass, armorTier(char)),
      health: [Math.max(0, char.hp), char.ht],
    });
    return;
  }
  const heap = world.floors[me.depth]?.heaps.find((h) => h.pos === pos && h.kind !== 'hidden');
  if (heap && (seen || heap.kind !== 'heap')) {
    if (heap.kind === 'heap' || heap.kind === 'forSale') {
      const item = heap.items[0]!;
      showInfo(itemName(world, item), itemInfo(world, me, item), hideOverlay, { icon: slot(world, item, { hero: me }) });
    } else {
      showInfo(t.heapNames[heap.kind] ?? '', [], hideOverlay);
    }
    return;
  }
  const plant = world.floors[me.depth]?.plants?.find((p) => p.pos === pos);
  const level = levelAt(world, me.depth);
  const { name, desc } = plant ? plantText(plant.kind) : tileText(level.map[pos]!);
  const well = level.map[pos] === T.WELL ? level.wells.find((w) => w.pos === pos) : undefined;
  showInfo(name, [well ? wellText(well.water) : desc], hideOverlay);
}

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
    if (event.code === 'Escape' && session && overlayOpen()) closeOverlay();
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
  // Light effects draw a coarser canvas: pixel art stays crisp, there are just fewer pixels to fill.
  const dpr = Math.min(devicePixelRatio || 1, quality.light ? 1.5 : 3);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  // About 12 tiles across the narrow side, at an integer zoom for crisp pixels.
  camera.zoom = Math.max(1, Math.round(Math.min(canvas.width, canvas.height) / (TILE * 12)));
}

/** Toasts appear just under the HUD, however tall it has grown (buffs, companions, a notice). */
let hudBottom = -1;

function placeToasts(): void {
  const bottom = Math.round(hud.height());
  if (bottom === hudBottom) return;
  hudBottom = bottom;
  document.documentElement.style.setProperty('--hud-bottom', `${bottom}px`);
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

/** When the last game frame was drawn, for telling a phone that struggles. */
let lastFrame = 0;

/** The middle of the free band, in device pixels, eased from frame to frame; -1 until known. */
let freeMiddle = -1;
let freeDepth = 0;

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
    hud.update(
      {
        me: placeholderHero, party: [], online: [], log: [], buffs: [], quick: null,
        status: session.status ? { kind: session.status === t.reconnecting ? 'reconnecting' : 'connecting', text: session.status } : null,
        keys: 0, examining: false, newLoot: false,
      },
      false,
    );
    placeToasts();
    return;
  }

  // A phone that cannot keep up gets light effects («auto» in quality.ts).
  if (quality.frame(now - lastFrame)) {
    resize();
    toast(t.effectsLightened);
  }
  lastFrame = now;
  // The visual clock: real time, slowed for a moment by a heavy blow's hit-stop.
  const vnow = fx.time(now);
  if (isAlive(me)) fallenAt = 0;
  const dt = lastVisual ? vnow - lastVisual : 0;
  lastVisual = vnow;

  if (session.generation !== seenGeneration || me.depth !== view.depth) {
    if (session.generation !== seenGeneration) deathShown = -1;
    seenGeneration = session.generation;
    view.reset(me.depth);
    fx.reset();
    walk.reset();
    bakedKey = '';
    threats = new Set();
  }

  const level = levelAt(world, me.depth);

  // Footsteps, doors and stairs of my own hero.
  if (lastPlace.generation === session.generation && isAlive(me)) {
    if (me.depth !== lastPlace.depth) {
      audio.play(justFell ? 'falling' : 'descend');
      // A new depth comes up out of the dark.
      fx.flash('0, 0, 0', 1, 650, vnow);
      // GameScene's greetings: the depth, a new region, and the level's feeling.
      view.say(justFell ? t.fell(me.depth) : me.depth > lastPlace.depth ? t.descended(me.depth) : t.ascended(me.depth));
      justFell = false;
      if (me.depth === 6 && lastPlace.depth === 5) view.say(t.enterPrison, '#ffff44');
      if (me.depth === 11 && lastPlace.depth === 10) view.say(t.enterCaves, '#ffff44');
      if (me.depth === 16 && lastPlace.depth === 15) view.say(t.enterCity, '#ffff44');
      if (me.depth === 21 && lastPlace.depth === 20) view.say(t.enterHalls, '#ffff44');
      if (me.depth === 26 && lastPlace.depth === 25) view.say(t.enterLast, '#ffff44');
      const feeling = t.feelings[level.feeling];
      if (feeling && me.depth > lastPlace.depth) view.say(feeling, '#ffff44');
    } else if (me.pos !== lastPlace.pos) {
      const terrain = level.map[me.pos]!;
      audio.play(terrain >= T.WATER_TILES && terrain <= T.WATER ? 'water' : 'step', 1, 0.5);
      if (terrain === T.OPEN_DOOR) audio.play('door_open', 1, 0.6);
      // Stepping onto a sign reads it.
      // Below the last shop the signs burst into flames as one reads them (Sign.read).
      const tip = t.signs[me.depth - 1] ?? t.signBurns;
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
    view.apply(effects, world, session.myId, vnow);
    for (const effect of effects) effectFx(effect, view, world, session.myId, vnow);
    handleMyEffects(effects, session.myId);
  }
  view.sync(world, vnow, session.myId);
  step(world, now, visible);
  fx.update(vnow, dt);
  ambientFx(view, vnow, dt);
  regionFx(level, visible, vnow, dt);

  const mine = view.puppets.get(me.id);
  const at = mine ? view.position(mine, vnow) : { x: cellX(me.pos) * TILE, y: cellY(me.pos) * TILE };
  const kick = fx.shakeOffset(vnow);
  // The hero stands in the middle of the band the HUD and the toolbar leave free, not of the screen.
  // When that band changes (a buff, a notice, companions), the view glides there rather than jumps.
  const free = hud.freeZone();
  const wanted = ((free.top + free.bottom) / 2) * (canvas.height / (canvas.clientHeight || 1));
  freeMiddle = freeMiddle < 0 || view.depth !== freeDepth ? wanted : freeMiddle + (wanted - freeMiddle) * Math.min(1, dt / 140);
  freeDepth = view.depth;
  const middle = freeMiddle;
  camera.x = Math.round(at.x + TILE / 2 - canvas.width / camera.zoom / 2) + kick.x;
  camera.y = Math.round(at.y + TILE / 2 - middle / camera.zoom) + kick.y;
  // What lies hidden (the phantom fish) is not drawn until found.
  const heaps = (world.floors[me.depth]?.heaps ?? []).filter((heap) => heap.kind !== 'hidden').map((heap) => ({
    pos: heap.pos,
    sprite: heap.kind === 'heap' || heap.kind === 'forSale' ? itemSprite(heap.items[0]!, world.run.labels) : HEAP_SPRITES[heap.kind],
  }));
  const plants = (world.floors[me.depth]?.plants ?? []).map((p) => ({ pos: p.pos, index: PLANT_KINDS.indexOf(p.kind) }));
  // Clouds of gas: green toxic, yellow paralytic.
  const clouds = world.floors[me.depth]?.gas ?? {};
  const gas = [
    ...(clouds.toxic ?? []).map(([pos, volume]) => ({ pos, volume, color: '80, 200, 60' })),
    ...(clouds.paralytic ?? []).map(([pos, volume]) => ({ pos, volume, color: '230, 220, 70' })),
  ];
  const scene = {
    level, baked: baked!, visible, explored: exploredCells(world, me.depth), heaps, plants, gas, seeAll: me.mindVision > 0,
      ...((world.floors[me.depth]?.altar?.volume ?? 0) > 0 ? { altar: world.floors[me.depth]!.altar!.pos } : {}),
    focus: { x: at.x + TILE / 2, y: at.y + TILE / 2 },
    lights: lightsFor(level, visible, view, vnow),
    mourning: isAlive(me) ? 0 : Math.min(1, (vnow - (fallenAt ||= vnow)) / 1200),
    middle,
  };
  render(ctx, scene, view, session.myId, assets, camera, vnow);

  // Who the dungeon is waiting for, once my action has been queued for a moment.
  if (session.busy) busySince ||= now;
  else busySince = 0;
  const waitingFor =
    busySince && now - busySince > 400
      ? blockers(world).filter((id) => id !== me.id).map((id) => heroById(world, id)?.name ?? '?')
      : [];
  const quick = quickIndex(me);
  const quickItem = me.items[quick];
  const cancelChoice = (): void => {
    aim = null;
    examining = false;
  };
  // One state at a time, the most pressing: the connection, death, a target to choose, examining, companions.
  const aimed = aim && aim.index >= 0 ? me.items[aim.index] : undefined;
  const status: HudStatus | null =
    session.status ? { kind: session.status === t.reconnecting ? 'reconnecting' : 'connecting', text: session.status }
    : !isAlive(me) && !world.over ? { kind: 'dead', text: `${t.youDied}. ${t.youDiedCoop}` }
    : aim ? { kind: 'target', text: t.chooseTarget, cancel: { label: t.cancel, onClick: cancelChoice }, ...(aimed ? { item: itemSprite(aimed, world.run.labels) } : {}) }
    : examining ? { kind: 'examine', text: t.examinePrompt, cancel: { label: t.cancel, onClick: cancelChoice } }
    : waitingFor.length > 0 ? { kind: 'waiting', text: t.waitingShort, names: waitingFor }
    : null;
  hud.update(
    {
      me,
      party: session.mode === 'online' ? world.heroes.filter((h) => h.id !== me.id) : [],
      online: session.online,
      status,
      log: view.log,
      buffs: heroBuffs(me),
      examining,
      newLoot,
      keys: me.items.filter((i) => (i.kind === 'key.iron' || i.kind === 'key.skeleton') && i.depth === me.depth).length,
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
    walk.resting,
  );
  placeToasts();

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
            const board = submitRun(world, me);
            return {
              score,
              board,
              // The day's result as a picture where the phone can share files, as text and a link elsewhere.
              onShare: () => {
                void (async () => {
                  const text = t.shareText(score, depth);
                  const killer = me.killedBy && (t.causes[me.killedBy] ?? t.mobs[me.killedBy as MobKind] ?? me.killedBy);
                  const shared = await sharePicture({
                    name: me.name || playerName || telegramName() || t.heroLabel, heroClass: me.heroClass, level: me.lvl, depth, score,
                    place: (await board)?.rank ?? null, won: victory, cause: killer ? capitalize(t.killedBy(killer)) : t.soloFell(me.depth),
                  }, text);
                  if (!shared && (await shareDaily(text)) === 'copied') toast(t.linkCopied);
                })();
              },
            };
          })()
        : undefined;
    window.setTimeout(() => {
      if (!session?.world?.over) return;
      if (!victory) haptic('error');
      const cause = me.killedBy && (t.causes[me.killedBy] ?? t.mobs[me.killedBy as MobKind] ?? me.killedBy);
      // Rankings: the run takes its place among this device's best.
      const deepest = Object.keys(world.levels).length;
      const gold = me.stats?.gold ?? me.gold;
      const place = recordRun({
        key: `${world.run.seed}:${me.id}:${world.turn}`,
        score: runScore(gold, me.lvl, deepest, victory),
        name: me.name || playerName || telegramName() || t.heroLabel,
        heroClass: me.heroClass,
        lvl: me.lvl,
        depth: deepest,
        gold,
        won: victory,
        cause: cause ? capitalize(cause) : '',
        mode: dailyRun ? 'daily' : solo ? 'solo' : 'coop',
        date: Date.now(),
      });
      showRunEnd({
        place,
        victory,
        title: victory ? t.victory : solo ? t.youDied : t.partyFell,
        cause: victory ? t.victoryText : [t.soloFell(me.depth), cause ? t.killedBy(cause) : ''].filter(Boolean).join(' '),
        hero: { name: me.name || playerName || telegramName() || t.heroLabel, heroClass: me.heroClass, lvl: me.lvl, depth: me.depth, gold: me.gold, kills: me.kills },
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
  Object.assign(window, { __pd: { get session() { return session; }, camera, view, walk, advance, play, resize, core, fx } });
}

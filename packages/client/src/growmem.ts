import { type Effect, type Hero, itemDef, type Item, type ItemKind, type Mob, type MobKind, MOBS, type World } from '@pd/core';
import { type ChronicleEntry, chronicleOf, descent } from './growth';
import type { StorageLike } from './savestore';

/*
 * What the client remembers of a run for the screens of part 11 (the core keeps none of it, and no rule changes): which things
 * are new in the pack, the notes the player wrote, the looks of potions and scrolls (colours, runes, gems, woods) they have met,
 * how often each was used, their own ticks and crosses, the monsters met, the chronicle and the hero's growth by depth.
 *
 * Kept per run in local storage under one small key (a few KB): written a moment after a change and when the page is left,
 * never in the way of the saved run — a write that does not fit lets go of the records of other runs and then gives up in silence
 * (savestore.ts evictable lists these keys first). The pure part (reducers) takes the effects the core sends; nothing here asks the
 * world for what the player does not know: a look is kept as «potion:7», never joined with the kind it hides under.
 */

export const GROW_PREFIX = 'pd-grow:';
const MAX_CHRONICLE = 400;
const MAX_NOTE = 80;
const MAX_RUNS = 2;

export interface Beast {
  /** The first depth where the player saw it (0: not seen yet, only felt). */
  first: number;
  kills: number;
  /** The hardest blow of it the hero took. */
  hit: number;
}

export interface DepthSnap {
  depth: number;
  lvl: number;
  ht: number;
  str: number;
}

/** Ticks and crosses of the elimination view: a guess (✓), ruled out (×), a doubt (?). */
export type Mark = 'tick' | 'x' | 'q';

export interface GrowMem {
  v: 1;
  /** When it was last written (ms): the oldest run's record is the first to go. */
  at: number;
  /** Item keys not yet looked at since they were picked up. */
  fresh: string[];
  /** Kinds of things ever held (stackable things are new once; gear every time). */
  had: string[];
  notes: Record<string, string>;
  /** Looks met: «potion:7», «scroll:3», «ring:0», «wand:11». */
  looks: string[];
  /** Uses by look (drunk, read, thrown) and by kind for the rest. */
  uses: Record<string, number>;
  marks: Record<string, Mark>;
  beasts: Partial<Record<MobKind, Beast>>;
  chronicle: ChronicleEntry[];
  depths: DepthSnap[];
}

export const emptyMem = (): GrowMem => ({ v: 1, at: 0, fresh: [], had: [], notes: {}, looks: [], uses: {}, marks: {}, beasts: {}, chronicle: [], depths: [] });

/* ---------- keys ---------- */

const HIDES = new Set(['potion', 'scroll', 'ring', 'wand']);

/** Whether a kind goes by a look until the party has learned it (potions, scrolls, rings, wands). */
export const hidesKind = (kind: ItemKind): boolean => HIDES.has(itemDef(kind).category);

/** «potion:7»: the look this run gives a kind (null for a kind with a face of its own). Never shown beside the kind of an unknown one. */
export function lookKey(world: World, kind: ItemKind): string | null {
  return hidesKind(kind) ? `${itemDef(kind).category}:${world.run.labels[kind] ?? 0}` : null;
}

/** What an item is remembered by: the look for a thing that hides its kind, the kind for the rest. */
export const itemKey = (world: World, item: Item): string => lookKey(world, item.kind) ?? item.kind;

/** Things that come in stacks: a second one of a kind already held is not new. */
const STACKS = new Set(['potion', 'scroll', 'food', 'seed', 'missile', 'gold']);
export const stacks = (kind: ItemKind): boolean => STACKS.has(itemDef(kind).category);

/* ---------- reducers (pure but for the memory they are handed) ---------- */

export interface Moment {
  depth: number;
  turn: number;
}

const add = <T>(list: T[], value: T): void => {
  if (!list.includes(value)) list.push(value);
};

/** Notes the look of a potion, scroll, ring or wand as seen; true if the memory did not have it. */
export function seeLook(mem: GrowMem, world: World, kind: ItemKind): boolean {
  const key = lookKey(world, kind);
  if (!key || mem.looks.includes(key)) return false;
  mem.looks.push(key);
  return true;
}

const use = (mem: GrowMem, world: World, kind: ItemKind): void => {
  const key = lookKey(world, kind) ?? kind;
  mem.uses[key] = (mem.uses[key] ?? 0) + 1;
};

/** What one of the core's effects does to the memory (only the hero's own, `me`). Returns the chronicle entry it wrote, if any. */
export function remember(mem: GrowMem, world: World, effect: Effect, me: string, at: Moment): ChronicleEntry | null {
  switch (effect.type) {
    case 'pickedUp': {
      if (effect.hero !== me || effect.item.kind === 'gold') break;
      const kind = effect.item.kind;
      seeLook(mem, world, kind);
      if (!stacks(kind) || !mem.had.includes(kind)) add(mem.fresh, itemKey(world, effect.item));
      add(mem.had, kind);
      break;
    }
    case 'used':
      if (effect.hero === me) {
        use(mem, world, effect.kind);
        seeLook(mem, world, effect.kind);
      }
      break;
    case 'shattered':
      // A potion thrown: it was seen, and used.
      if (effect.hero === me) {
        use(mem, world, effect.kind);
        seeLook(mem, world, effect.kind);
      }
      break;
    case 'died':
      if (effect.who !== me && effect.by === me && effect.kind) {
        const beast = (mem.beasts[effect.kind] ??= { first: at.depth, kills: 0, hit: 0 });
        beast.kills++;
        if (!beast.first) beast.first = at.depth;
      }
      break;
    default:
      break;
  }
  const entry = chronicleOf(effect, me, at, mem.chronicle);
  if (entry) {
    mem.chronicle.push(entry);
    if (mem.chronicle.length > MAX_CHRONICLE) mem.chronicle.splice(0, mem.chronicle.length - MAX_CHRONICLE);
  }
  return entry;
}

/** A blow the hero took: the hardest of each kind of monster is remembered (true if this one is). */
export function remembersHit(mem: GrowMem, kind: MobKind | undefined, damage: number, depth: number): boolean {
  if (!kind || damage <= 0 || !isBeast(kind)) return false;
  const beast = (mem.beasts[kind] ??= { first: depth, kills: 0, hit: 0 });
  if (damage <= beast.hit) return false;
  beast.hit = damage;
  return true;
}

/** Monsters that are not met as foes (no experience, nothing to fight): the bestiary leaves them out. */
export const isBeast = (kind: MobKind): boolean => (MOBS[kind]?.exp ?? 0) > 0 || (MOBS[kind]?.maxLvl ?? 0) > 0;

/** What the hero sees on their floor: monsters (the bestiary) and the things lying in view (their looks). True if anything was new. */
export function sees(mem: GrowMem, world: World, hero: Hero, visible: readonly boolean[]): boolean {
  const floor = world.floors[hero.depth];
  if (!floor) return false;
  let news = false;
  for (const mob of floor.mobs) {
    if (!visible[mob.pos] || mob.hp <= 0 || (mob as Mob).image || !isBeast(mob.kind)) continue;
    const known = mem.beasts[mob.kind];
    if (!known) {
      mem.beasts[mob.kind] = { first: hero.depth, kills: 0, hit: 0 };
      news = true;
    } else if (!known.first) {
      known.first = hero.depth;
      news = true;
    }
  }
  for (const heap of floor.heaps) {
    if (!visible[heap.pos] || (heap.kind !== 'heap' && heap.kind !== 'forSale')) continue;
    for (const item of heap.items) if (seeLook(mem, world, item.kind)) news = true;
  }
  return news;
}

/** The hero arrives on a depth: a snapshot for «by depth», and the chronicle's line when it is the deepest yet. */
export function arrives(mem: GrowMem, hero: Hero, turn: number): boolean {
  const entry = descent(hero.depth, turn, mem.chronicle);
  if (entry) mem.chronicle.push(entry);
  const first = !mem.depths.some((d) => d.depth === hero.depth);
  if (first) mem.depths.push({ depth: hero.depth, lvl: hero.lvl, ht: hero.ht, str: hero.str });
  return !!entry || first;
}

/** Writes a note (an empty text takes it away); returns the text kept. */
export function writeNote(mem: GrowMem, key: string, text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE);
  if (clean) mem.notes[key] = clean;
  else delete mem.notes[key];
  return clean;
}

/** A tick/cross cycles ∅ → ✓ → × → ? → ∅. */
export function cycleMark(mem: GrowMem, look: string, kind: ItemKind): Mark | null {
  const key = `${look}|${kind}`;
  const order: Array<Mark | undefined> = [undefined, 'tick', 'x', 'q'];
  const next = order[(order.indexOf(mem.marks[key]) + 1) % order.length];
  if (next) mem.marks[key] = next;
  else delete mem.marks[key];
  return next ?? null;
}

/* ---------- the store ---------- */

/** The run a record belongs to is the rest of its key: «pd-grow:<seed>:<id>». */
export const growKeyInfo = (key: string): { run: string } | null => (key.startsWith(GROW_PREFIX) ? { run: key.slice(GROW_PREFIX.length) } : null);

export class GrowStore {
  constructor(private readonly storage: StorageLike | null) {}

  load(run: string): GrowMem {
    try {
      const raw = this.storage?.getItem(GROW_PREFIX + run);
      if (!raw) return emptyMem();
      const saved = JSON.parse(raw) as Partial<GrowMem>;
      if (saved?.v !== 1) return emptyMem();
      return { ...emptyMem(), ...saved, v: 1 };
    } catch {
      return emptyMem();
    }
  }

  /** Writes the record; when the storage refuses, the records of other runs go first, then this one waits for the next time. */
  save(run: string, mem: GrowMem): boolean {
    const s = this.storage;
    if (!s) return false;
    mem.at = Date.now();
    const text = JSON.stringify(mem);
    const key = GROW_PREFIX + run;
    try {
      s.setItem(key, text);
      return true;
    } catch {
      // Full: other runs' records are the least needed.
    }
    for (const other of this.keys().filter((k) => k !== key)) {
      try {
        s.removeItem(other);
        s.setItem(key, text);
        return true;
      } catch {
        // Not enough yet.
      }
    }
    return false;
  }

  /** Keeps this run's record and the newest other one; the rest are let go (a new run begun). */
  prune(run: string): void {
    const s = this.storage;
    if (!s) return;
    try {
      const others = this.keys()
        .filter((k) => k !== GROW_PREFIX + run)
        .map((key) => ({ key, at: (JSON.parse(s.getItem(key) ?? '{}') as { at?: number }).at ?? 0 }))
        .sort((a, b) => b.at - a.at);
      for (const old of others.slice(MAX_RUNS - 1)) s.removeItem(old.key);
    } catch {
      // Nothing to prune.
    }
  }

  forget(run: string): void {
    try {
      this.storage?.removeItem(GROW_PREFIX + run);
    } catch {
      // Gone anyway.
    }
  }

  private keys(): string[] {
    const s = this.storage;
    const out: string[] = [];
    if (!s) return out;
    try {
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k?.startsWith(GROW_PREFIX)) out.push(k);
      }
    } catch {
      // Nothing to list.
    }
    return out;
  }
}

/* ---------- the memory of the run being played ---------- */

type Listener = () => void;

export class Grow {
  private store = new GrowStore(null);
  private run = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private mem: GrowMem = emptyMem();
  private readonly listeners = new Set<Listener>();
  /** Bumped by every change: screens that cache can tell. */
  version = 0;

  setStore(store: GrowStore): void {
    this.store = store;
  }

  /** The run being played (null before one is bound). */
  where(): string | null {
    return this.run || null;
  }

  /** Brings the run's record up; the run left is saved first. `fresh`: a run just begun, any record under its key is stale. */
  bind(run: string, fresh: boolean): void {
    if (run === this.run && !fresh) return;
    this.flush();
    this.run = run;
    if (fresh) this.store.forget(run);
    this.mem = this.store.load(run);
    this.store.prune(run);
    this.version++;
    this.changed();
  }

  get data(): GrowMem {
    return this.mem;
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Something changed in the memory: screens are told, the store is written in a moment. */
  touch(): void {
    this.version++;
    this.changed();
    this.saveSoon();
  }

  private changed(): void {
    for (const l of this.listeners) l();
  }

  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.run) this.store.save(this.run, this.mem);
  }

  private saveSoon(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.run) this.store.save(this.run, this.mem);
    }, 1500);
  }

  /* — what the screens ask — */

  isFresh(world: World, item: Item): boolean {
    return this.mem.fresh.includes(itemKey(world, item));
  }

  noteOf(world: World, item: Item): string | undefined {
    return this.mem.notes[itemKey(world, item)];
  }

  setNote(key: string, text: string): string {
    const kept = writeNote(this.mem, key, text);
    this.touch();
    return kept;
  }

  /** Things a point of strength just made light enough (a feather by their strength until the first look): this session only. */
  private lights = new Set<Item>();

  setLight(items: readonly Item[]): void {
    this.lights = new Set(items);
    this.version++;
  }

  isLight(item: Item): boolean {
    return this.lights.has(item);
  }

  /** The whole pack has been looked at: the fresh marks and the feathers go. */
  seenAll(): void {
    this.lights = new Set();
    if (this.mem.fresh.length === 0) return;
    this.mem.fresh = [];
    this.touch();
  }

  seenItem(world: World, item: Item): void {
    const at = this.mem.fresh.indexOf(itemKey(world, item));
    if (at < 0) return;
    this.mem.fresh.splice(at, 1);
    this.touch();
  }
}

export const grow = new Grow();

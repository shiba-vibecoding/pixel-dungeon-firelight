import { describe, expect, it } from 'vitest';
import { type Action, applyEvent, distance, findPath, heroById, isAlive, levelAt, RULES_VERSION, type ServerMessage, type World } from '@pd/core';
import { step } from '../../core/test/runner';

/*
 * A co-op party played by bots against a running server, as real players on
 * real networks would: each bot thinks a little before acting, now and then
 * looks away for a while, and every message is delayed both ways. It measures
 * what players feel (how long an action takes to come back, how often the
 * party stalls) and checks that every bot's world stays the room's.
 *
 * Off by default. Run against `wrangler dev` (no BOT_TOKEN, so ids are trusted):
 *   PD_SIM=ws://127.0.0.1:8787 PD_SIM_BOTS=4 PD_SIM_SECONDS=90 PD_SIM_LATENCY=150 npx vitest run packages/server/test/coop-sim.test.ts
 */

const SERVER = process.env.PD_SIM;
const BOTS = Number(process.env.PD_SIM_BOTS ?? 4);
const SECONDS = Number(process.env.PD_SIM_SECONDS ?? 60);
/** One way, in ms; a little jitter is added. */
const LATENCY = Number(process.env.PD_SIM_LATENCY ?? 120);
/** Chance per action of looking away, and for how long (ms). */
const IDLE_CHANCE = Number(process.env.PD_SIM_IDLE ?? 0.04);
const IDLE_MS: readonly [number, number] = [3000, 15000];
const THINK_MS: readonly [number, number] = [120, 450];
const CLASSES = ['warrior', 'mage', 'rogue', 'huntress'] as const;
/** The party keeps together, as friends do: the others follow the first bot (PD_SIM_TOGETHER=0 lets each roam). */
const TOGETHER = process.env.PD_SIM_TOGETHER !== '0';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const between = ([a, b]: readonly [number, number]): number => a + Math.random() * (b - a);
const lag = (): number => LATENCY * (0.8 + Math.random() * 0.6);

interface Stats {
  acts: number;
  /** Time from sending an action to seeing it applied, ms. */
  rtt: number[];
  rejected: Record<string, number>;
  desyncs: number;
  snapshots: number;
  idleMs: number;
  deaths: number;
}

class Bot {
  world: World | null = null;
  seq = 0;
  inFlight: { at: number } | null = null;
  firstDiff = '';
  readonly stats: Stats = { acts: 0, rtt: [], rejected: {}, desyncs: 0, snapshots: 0, idleMs: 0, deaths: 0 };
  private socket!: WebSocket;
  private open = false;

  constructor(readonly id: string, private readonly room: string, private readonly heroClass: string) {}

  connect(): Promise<void> {
    const url = `${SERVER}/room/${this.room}?hero=${this.heroClass}&v=${RULES_VERSION}&id=${this.id}&name=${this.id}`;
    this.socket = new WebSocket(url);
    return new Promise((resolve, reject) => {
      this.socket.onopen = () => {
        this.open = true;
        resolve();
      };
      this.socket.onerror = () => reject(new Error(`${this.id}: cannot connect to ${SERVER}`));
      this.socket.onclose = () => {
        this.open = false;
      };
      // Every message comes in late, as over a phone's network.
      this.socket.onmessage = (event) => {
        const data = String(event.data);
        setTimeout(() => this.receive(data), lag());
      };
    });
  }

  private send(text: string): void {
    setTimeout(() => {
      if (this.open) this.socket.send(text);
    }, lag());
  }

  private receive(data: string): void {
    if (data === 'pong') return;
    const message = JSON.parse(data) as ServerMessage;
    switch (message.type) {
      case 'snapshot':
        // A snapshot that is not the first must match what this bot had worked out itself.
        // Compared by content: the room's world comes out of storage with its keys in another order.
        if (this.world && message.seq === this.seq && canonical(this.world) !== canonical(message.world)) {
          this.stats.desyncs++;
          if (!this.firstDiff) this.firstDiff = diff(this.world, message.world);
        }
        this.world = message.world;
        this.seq = message.seq;
        this.inFlight = null;
        this.stats.snapshots++;
        break;
      case 'event': {
        if (!this.world || message.seq !== this.seq + 1) {
          this.send(JSON.stringify({ type: 'sync' }));
          return;
        }
        const result = applyEvent(this.world, message.event);
        this.seq = message.seq;
        if (!result.ok) {
          this.stats.desyncs++;
          this.send(JSON.stringify({ type: 'sync' }));
          return;
        }
        if (message.event.type === 'act' && message.event.heroId === this.id && this.inFlight) {
          this.stats.rtt.push(performance.now() - this.inFlight.at);
          this.inFlight = null;
        }
        break;
      }
      case 'rejected':
        this.stats.rejected[message.reason] = (this.stats.rejected[message.reason] ?? 0) + 1;
        this.inFlight = null;
        break;
      default:
        break;
    }
  }

  /** Plays until the time is up: think, act, wait for the room; sometimes look away. */
  async play(until: number): Promise<void> {
    let wasAlive = true;
    while (performance.now() < until) {
      await sleep(between(THINK_MS));
      const world = this.world;
      const me = world && heroById(world, this.id);
      if (!world || !me || this.inFlight || world.over) continue;
      if (!isAlive(me)) {
        if (wasAlive) this.stats.deaths++;
        wasAlive = false;
        continue;
      }
      wasAlive = true;
      if (Math.random() < IDLE_CHANCE) {
        const idle = between(IDLE_MS);
        this.stats.idleMs += idle;
        await sleep(idle);
        continue;
      }
      let action: Action;
      try {
        action = this.follow(world) ?? step(world, this.id);
      } catch {
        action = { type: 'wait' };
      }
      this.inFlight = { at: performance.now() };
      this.stats.acts++;
      this.send(JSON.stringify({ type: 'act', action }));
    }
  }

  /** A step towards the leader when too far behind (with no fight at hand); null otherwise. */
  private follow(world: World): Action | null {
    const leader = heroById(world, 'bot0');
    const me = heroById(world, this.id)!;
    if (!TOGETHER || this.id === 'bot0' || !leader || !isAlive(leader) || leader.depth !== me.depth) return null;
    if (distance(leader.pos, me.pos) <= 3) return null;
    const floor = world.floors[me.depth];
    if (floor?.mobs.some((mob) => mob.state === 'hunting' && distance(mob.pos, me.pos) <= 2)) return null;
    const path = findPath(levelAt(world, me.depth), me.pos, leader.pos, new Set(floor?.mobs.map((mob) => mob.pos)));
    return path && path.length > 1 ? { type: 'move', to: path[0]! } : null;
  }

  async checkSync(): Promise<void> {
    // Ask for the room's world once all is quiet and compare.
    await sleep(LATENCY * 4 + 500);
    this.send(JSON.stringify({ type: 'sync' }));
    await sleep(LATENCY * 4 + 1500);
  }

  close(): void {
    this.socket.close(1000);
  }
}

/** JSON with every object's keys sorted. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : v);
}

/** Where two worlds first differ, as a path and the two values. */
function diff(a: unknown, b: unknown, path = ''): string {
  if (JSON.stringify(a) === JSON.stringify(b)) return '';
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return `${path}: ${JSON.stringify(a)?.slice(0, 120)} vs ${JSON.stringify(b)?.slice(0, 120)}`;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const found = diff((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`);
    if (found) return found;
  }
  return `${path}: key order`;
}

const quantile = (values: number[], q: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!);
};

describe.skipIf(!SERVER)('co-op party against a live server', () => {
  it('plays smoothly and stays in step', async () => {
    const room = `sim${Date.now().toString(36)}`;
    const bots = Array.from({ length: BOTS }, (_, i) => new Bot(`bot${i}`, room, CLASSES[i % CLASSES.length]!));
    for (const bot of bots) {
      await bot.connect();
      await sleep(300);
    }
    const until = performance.now() + SECONDS * 1000;
    await Promise.all(bots.map((bot) => bot.play(until)));
    await Promise.all(bots.map((bot) => bot.checkSync()));
    const lines = bots.map((bot) => {
      const s = bot.stats;
      const slow = s.rtt.filter((t) => t > 1000).length;
      const me = bot.world && heroById(bot.world, bot.id);
      return `${bot.id}: acts ${s.acts}, rtt p50 ${quantile(s.rtt, 0.5)} p90 ${quantile(s.rtt, 0.9)} p99 ${quantile(s.rtt, 0.99)} max ${quantile(s.rtt, 1)} ms, `
        + `>1s ${slow} (${Math.round((100 * slow) / Math.max(1, s.rtt.length))}%), idle ${Math.round(s.idleMs / 1000)} s, depth ${me?.depth}, `
        + `deaths ${s.deaths}, desyncs ${s.desyncs}, rejected ${JSON.stringify(s.rejected)}${bot.firstDiff ? `
   first difference ${bot.firstDiff}` : ''}`;
    });
    process.stdout.write(`\nCO-OP SIM ${BOTS} bots, ${SECONDS} s, ${LATENCY} ms each way, room ${room}\n${lines.join('\n')}\n`);
    for (const bot of bots) bot.close();
    for (const bot of bots) expect(bot.stats.desyncs).toBe(0);
  }, (SECONDS + 60) * 1000);
});

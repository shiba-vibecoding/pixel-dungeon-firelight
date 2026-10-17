import { createItem, fingerprint, heroById, Rng, type World } from '@pd/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { leaving } from '../src/leave';
import { journalKey, journalKey2, twinKey } from '../src/savestore';
import { KEY, canon, events, FakeServer, installGlobals, kill, openPage, type Page, reload, turn } from './pagekit';
import { MemStorage } from './savekit';
import { memoryMirror } from '../src/mirror';

vi.mock('../src/update', () => ({ reloadForUpdate: vi.fn() }));

/*
 * The kill test: a scripted game is played through the real session (savestore.ts, session.ts) with the real server logic behind a
 * fake network, and at random points the page is killed: its memory thrown away, whatever it was in the middle of never finished.
 * A new page then opens on what the dead one stored, as the game does at start, and the world it finds must be the last turn the
 * dead page completed (or the turn it was in the middle of) — to the last cell — with the server and the device agreeing after.
 */

beforeEach(() => {
  vi.useFakeTimers();
  installGlobals();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const settle = async (ms = 0): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms);
};

const eventsOf = (type: string): number => events.filter((e) => e.type === type).length;

/** One killing trial: `turns` turns of the bot, with kills at random points and in the middle of random writes. */
async function trial(seed: number, checked: boolean, turns: number, mirrored = false): Promise<{ kills: number; midWrite: number; restored: number; tailLost: number }> {
  const rng = Rng.seeded(seed);
  const server = checked ? new FakeServer() : null;
  let storage = new MemStorage();
  storage.quiet = true;
  // IndexedDB, as the browser keeps it: whatever the pages gave it stays, whatever happened to localStorage.
  const mirror = mirrored ? memoryMirror() : undefined;
  let page: Page = await openPage(storage, server, { seed: 700 + seed, mirror });
  const stats = { kills: 0, midWrite: 0, restored: 0, tailLost: 0 };
  let armedAt = -1;

  const arm = (): void => {
    const mode = (['drop', 'after', 'torn'] as const)[rng.int(3)]!;
    armedAt = page.storage.writes + rng.int(4);
    page.storage.fault = (_key, _value, nth) => (nth === armedAt ? mode : undefined);
  };

  /** The page died (a killing fault, or a clean kill): a new one opens on what is stored, and the world it finds is checked. */
  const restart = async (before: string | null, after: string): Promise<void> => {
    kill(page);
    stats.kills++;
    // (Time passes between one page and the next.)
    await settle(3);
    // The whole app killed (not only the page): the browser had not yet written the last changes of localStorage to the disk, which is
    // how a webview loses up to a minute of them. The mirror (IndexedDB) has them.
    let found: MemStorage;
    if (mirrored && rng.int(100) < 45) {
      found = page.storage.cloneAt(Math.max(0, page.storage.ops.length - rng.int(150)));
      stats.tailLost++;
    } else {
      found = reload(page);
    }
    found.quiet = true;
    storage = found;
    events.length = 0;
    page = await openPage(storage, server, { seed: 700 + seed, mirror });
    await settle(0);
    const got = canon(page.session.world!);
    const ok = got === after || (before !== null && got === before);
    expect(ok, `seed ${seed} ${checked ? 'checked' : 'local'}: restored world is neither the last turn nor the one in flight (turn ${page.session.world!.turn}; after ${(JSON.parse(after) as World).turn})`).toBe(true);
    // A run only the device's own, or a server in step with it: no copy of the server's came to replace the device's.
    expect(eventsOf('pd-run-restored'), `seed ${seed}: the server sent its copy`).toBe(0);
    expect(eventsOf('pd-save-recovered'), `seed ${seed}: told something was recovered`).toBe(0);
    expect(eventsOf('pd-save-failed')).toBe(0);
  };

  for (let i = 0; i < turns; i++) {
    const world = page.session.world!;
    if (world.over) break;
    const roll = rng.int(100);
    if (armedAt < 0 && roll < 12) arm();
    const before = armedAt >= 0 ? canon(world) : null;
    if (roll < 74) {
      turn(page);
    } else if (roll < 82) {
      await settle(9000);
    } else if (roll < 86 && server) {
      server.mode = (['offline', 'lost-reply', 'ok'] as const)[rng.int(3)]!;
    } else if (roll < 92) {
      leaving('hidden');
      await settle(0);
    } else if (roll < 96) {
      await settle(70_000);
    } else {
      // A clean kill between turns.
      await restart(null, canon(page.session.world!));
      continue;
    }
    if (page.storage.dead) {
      stats.midWrite++;
      armedAt = -1;
      await restart(before, canon(page.session.world!));
    }
  }

  // The end: the network is up, the page stays, everything is sent. Device and server must agree to the last cell.
  if (server) {
    server.mode = 'ok';
    await settle(70_000);
    leaving('hidden');
    await settle(70_000);
    const run = server.run!;
    const world = page.session.world!;
    expect(run.seq, `seed ${seed}: the server took ${run.seq} of ${world.turn} moves`).toBe(world.turn);
    expect(fingerprint(run.world)).toBe(fingerprint(world));
    expect(page.session.checked?.offline).toBe(false);
  }
  stats.restored = eventsOf('pd-run-restored');
  page.session.close();
  return stats;
}

describe('kill test: the restored world is the last completed turn', () => {
  it('a run played on the device alone, killed at random points and in the middle of random writes', async () => {
    let kills = 0;
    let midWrite = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const stats = await trial(seed, false, 150);
      kills += stats.kills;
      midWrite += stats.midWrite;
    }
    console.log(`local runs: ${kills} kills, ${midWrite} of them in the middle of a write`);
    expect(kills).toBeGreaterThan(25);
    expect(midWrite).toBeGreaterThan(4);
  });

  it('a checked run, with a flaky network (offline, lost answers) between the device and the server', async () => {
    let kills = 0;
    let midWrite = 0;
    for (let seed = 101; seed <= 110; seed++) {
      const stats = await trial(seed, true, 150);
      kills += stats.kills;
      midWrite += stats.midWrite;
    }
    console.log(`checked runs: ${kills} kills, ${midWrite} of them in the middle of a write`);
    expect(kills).toBeGreaterThan(25);
    expect(midWrite).toBeGreaterThan(4);
  });
});

describe('kill test: the whole app killed, and the browser had not written the last changes of localStorage', () => {
  it('the mirror (IndexedDB) has every turn: a run on the device alone, the last 0 to 150 writes of localStorage lost with the process', async () => {
    let kills = 0;
    let lost = 0;
    for (let seed = 201; seed <= 208; seed++) {
      const stats = await trial(seed, false, 150, true);
      kills += stats.kills;
      lost += stats.tailLost;
    }
    console.log(`local runs with the mirror: ${kills} kills, ${lost} of them with the tail of localStorage lost`);
    expect(lost).toBeGreaterThan(12);
  });

  it('the same for a checked run, with a flaky network', async () => {
    let lost = 0;
    for (let seed = 301; seed <= 308; seed++) lost += (await trial(seed, true, 150, true)).tailLost;
    console.log(`checked runs with the mirror: ${lost} kills with the tail of localStorage lost`);
    expect(lost).toBeGreaterThan(12);
  });

  it('without the mirror, localStorage alone loses them (the limit of the platform, and why the mirror is there)', async () => {
    const page = await openPage(new MemStorage(), null);
    for (let i = 0; i < 30; i++) turn(page);
    const turns = page.session.world!.turn;
    kill(page);
    const found = page.storage.cloneAt(Math.max(0, page.storage.ops.length - 12));
    const next = await openPage(found, null);
    expect(next.session.world!.turn).toBeLessThan(turns);
  });

  it('a mirror that is further on than localStorage is taken, and one that is behind or empty is not', async () => {
    const mirror = memoryMirror();
    const page = await openPage(new MemStorage(), null, { mirror });
    for (let i = 0; i < 40; i++) turn(page);
    const world = canon(page.session.world!);
    kill(page);
    // localStorage wiped by the platform altogether: the mirror is the run.
    const next = await openPage(new MemStorage(), null, { mirror });
    expect(canon(next.session.world!)).toBe(world);
    expect(next.plan).toBe('resume-local');
    // The player goes on, kills it, and an older mirror (say IndexedDB failed for a while) does not take the place of localStorage.
    for (let i = 0; i < 10; i++) turn(next);
    const ahead = canon(next.session.world!);
    kill(next);
    const stale = memoryMirror(new Map([...mirror.data].filter(([k]) => k.startsWith('pd-solo~o'))));
    const third = await openPage(reload(next), null, { mirror: stale });
    expect(canon(third.session.world!)).toBe(ahead);
    // A mirror that cannot answer is waited for only so long (the tests' clock is fake: it does not wait here at all).
    const none = await openPage(reload(third), null, { mirror: memoryMirror(new Map()) });
    expect(canon(none.session.world!)).toBe(canon(third.session.world!));
  });
});

describe('the server copy', () => {
  /** A checked run played `count` turns. */
  async function played(server: FakeServer, count: number, storage = new MemStorage()): Promise<Page> {
    const page = await openPage(storage, server);
    for (let i = 0; i < count; i++) turn(page);
    return page;
  }

  it('keeps the moves the server has not taken, through a kill in the middle of a flush, and sends them at the next start', async () => {
    const server = new FakeServer();
    server.mode = 'offline';
    // (A run begun while the server was there; then the network goes.)
    server.mode = 'ok';
    const storage = new MemStorage();
    const page = await openPage(storage, server);
    server.mode = 'offline';
    for (let i = 0; i < 30; i++) turn(page);
    await settle(9000);
    expect(page.session.checked?.offline).toBe(true);
    const world = canon(page.session.world!);
    kill(page);
    // The network is back for the next page: the log it finds is sent whole.
    server.mode = 'ok';
    const next = await openPage(reload(page), server);
    await settle(1000);
    expect(canon(next.session.world!)).toBe(world);
    expect(server.run!.seq).toBe(next.session.world!.turn);
    expect(fingerprint(server.run!.world)).toBe(fingerprint(next.session.world!));
    expect(eventsOf('pd-run-restored')).toBe(0);
  });

  it('survives a kill when the server took the moves but the answer was lost: they are not played twice', async () => {
    const server = new FakeServer();
    const storage = new MemStorage();
    const page = await openPage(storage, server);
    for (let i = 0; i < 12; i++) turn(page);
    server.mode = 'lost-reply';
    await settle(9000);
    // The server has them all; the page never heard.
    expect(server.run!.seq).toBe(page.session.world!.turn);
    const world = canon(page.session.world!);
    kill(page);
    server.mode = 'ok';
    const next = await openPage(reload(page), server);
    await settle(1000);
    expect(canon(next.session.world!)).toBe(world);
    expect(server.run!.seq).toBe(next.session.world!.turn);
    expect(next.session.checked?.offline).toBe(false);
    expect(eventsOf('pd-run-restored')).toBe(0);
  });

  it('sends what is left when the page is hidden, in a request that survives the page', async () => {
    const server = new FakeServer();
    const page = await openPage(new MemStorage(), server);
    for (let i = 0; i < 9; i++) turn(page);
    leaving('hidden');
    await settle(0);
    const last = server.calls.at(-1)!;
    expect(last).toMatchObject({ op: 'sync', keepalive: true, actions: 9 });
    expect(server.run!.seq).toBe(9);
    // Two ways of leaving in a row do not send the same moves twice over.
    leaving('pagehide');
    leaving('freeze');
    await settle(0);
    expect(server.calls.filter((c) => c.keepalive).length).toBeLessThanOrEqual(2);
  });

  it('puts the server\'s copy in the place of a device whose stretch the server refuses, says so, and goes on', async () => {
    const server = new FakeServer();
    const page = await played(server, 6);
    await settle(9000);
    // The device\'s copy parts from the rules (an edited hero): the next stretch cannot be replayed.
    heroById(page.session.world!, 'me')!.ht = 999;
    heroById(page.session.world!, 'me')!.hp = 999;
    for (let i = 0; i < 10; i++) turn(page);
    await settle(9000);
    const restored = events.filter((e) => e.type === 'pd-run-restored');
    expect(restored).toHaveLength(1);
    expect((restored[0]!.detail as { reason: string }).reason).toBe('parted');
    expect(fingerprint(page.session.world!)).toBe(fingerprint(server.run!.world));
    expect(heroById(page.session.world!, 'me')!.ht).toBe(5000);
    // No loop: the calls that follow are quiet.
    const calls = server.calls.length;
    await settle(120_000);
    expect(server.calls.length - calls).toBeLessThanOrEqual(1);
    // And the server's copy is what was saved: a kill and a reopen find it.
    const world = canon(page.session.world!);
    kill(page);
    const next = await openPage(reload(page), server);
    await settle(1000);
    expect(canon(next.session.world!)).toBe(world);
    expect(eventsOf('pd-run-restored')).toBe(1);
    // The player goes on from there.
    for (let i = 0; i < 10; i++) turn(next);
    await settle(9000);
    expect(server.run!.seq).toBe(next.session.world!.turn);
  });

  it('brings a device that is behind (the run went on elsewhere) to the server\'s copy, with the reason', async () => {
    const server = new FakeServer();
    const storage = new MemStorage();
    const phone = await played(server, 8, storage);
    await settle(9000);
    const phoneSave = storage.clone();
    // The player goes on at the computer.
    const computer = await openPage(new MemStorage(), server, { copy: 'computer' });
    for (let i = 0; i < 15; i++) turn(computer);
    await settle(9000);
    const ahead = server.run!.seq;
    expect(ahead).toBeGreaterThan(8);
    // The phone, killed long ago, opens its old save: the server\'s copy is the run.
    kill(phone);
    events.length = 0;
    const reopened = await openPage(phoneSave, server, { copy: 'phone-2' });
    await settle(1000);
    const restored = events.filter((e) => e.type === 'pd-run-restored');
    expect(restored).toHaveLength(1);
    expect((restored[0]!.detail as { reason: string }).reason).toBe('out of step');
    expect(fingerprint(reopened.session.world!)).toBe(fingerprint(server.run!.world));
  });

  it('opens a run that is over but whose end the server has not heard, and tells the server', async () => {
    const server = new FakeServer();
    server.sturdy = false;
    const storage = new MemStorage();
    const page = await openPage(storage, server);
    // Played to the end (a hero without armour, waiting; the fake clock lets the sync go out as it would).
    for (let i = 0; i < 4000 && !page.session.world!.over; i++) {
      page.session.send({ type: 'wait' });
      if (i % 40 === 0) await settle(9000);
      // The network goes down for the last stretch: the end is on the device only.
      if (i === 100) server.mode = 'offline';
    }
    expect(page.session.world!.over).toBe(true);
    await settle(9000);
    kill(page);
    server.mode = 'ok';
    const next = await openPage(reload(page), server);
    await settle(1000);
    expect(next.plan).toBe('resume-checked');
    expect(next.session.world!.over).toBe(true);
    expect(server.run!.finished).toBeDefined();
    expect(server.run!.seq).toBe(next.session.world!.turn);
  });
});

describe('a window that was open', () => {
  it('brings back the item selector of an unknown scroll just read, and the turn it was read on', async () => {
    const server = new FakeServer();
    server.prepare = (world) => {
      heroById(world, 'me')!.items.push(createItem('scroll.upgrade'));
    };
    const page = await openPage(new MemStorage(), server);
    for (let i = 0; i < 7; i++) turn(page);
    const me = heroById(page.session.world!, 'me')!;
    const index = me.items.findIndex((item) => item.kind === 'scroll.upgrade');
    expect(index).toBeGreaterThanOrEqual(0);
    page.session.send({ type: 'use', item: index });
    expect(me.pendingScroll?.kind).toBe('scroll.upgrade');
    const turnOfReading = page.session.world!.turn;
    // The app is put away and killed with the selector open.
    leaving('hidden');
    kill(page);
    const next = await openPage(reload(page), server);
    await settle(0);
    const there = heroById(next.session.world!, 'me')!;
    expect(next.session.world!.turn).toBe(turnOfReading);
    expect(there.pendingScroll?.kind).toBe('scroll.upgrade');
    expect(canon(next.session.world!)).toBe(canon(page.session.world!));
    // Nothing else may be done meanwhile (the rules refuse it); answering goes on from there.
    next.session.send({ type: 'wait' });
    expect(next.session.world!.turn).toBe(turnOfReading);
    // (Upgrade the weapon in hand: a warrior starts with one.)
    next.session.send({ type: 'scrollTarget', on: 'weapon' });
    expect(heroById(next.session.world!, 'me')!.pendingScroll).toBeUndefined();
    // And the answer is kept in its turn.
    kill(next);
    const last = await openPage(reload(next), server);
    expect(canon(last.session.world!)).toBe(canon(next.session.world!));
  });
});

describe('what the player is told', () => {
  it('nothing when nothing was lost', async () => {
    const server = new FakeServer();
    const page = await openPage(new MemStorage(), server);
    for (let i = 0; i < 20; i++) turn(page);
    kill(page);
    events.length = 0;
    await openPage(reload(page), server);
    expect(events.map((e) => e.type).filter((type) => type.startsWith('pd-'))).toEqual([]);
  });

  it('that the run came from the spare copy, when the newest snapshot is damaged (and the run goes on from there)', async () => {
    const storage = new MemStorage();
    const page = await openPage(storage, null);
    for (let i = 0; i < 90; i++) turn(page);
    const world = page.session.world!;
    kill(page);
    const found = reload(page);
    // The newest snapshot of the two is damaged; its twin is a few dozen turns older.
    const newest = [KEY, twinKey(KEY)].sort((a, b) => found.getItem(b)!.length - found.getItem(a)!.length)[0]!;
    const text = found.getItem(newest)!;
    found.data.set(newest, text.slice(0, 900) + 'garbage' + text.slice(907));
    events.length = 0;
    const next = await openPage(found, null);
    expect(next.session.world!.turn).toBeLessThan(world.turn);
    expect(events.filter((e) => e.type === 'pd-save-recovered').map((e) => e.detail)).toEqual(['backup']);
    // It goes on, and its new save stands.
    for (let i = 0; i < 20; i++) turn(next);
    kill(next);
    events.length = 0;
    const again = await openPage(reload(next), null);
    expect(canon(again.session.world!)).toBe(canon(next.session.world!));
    expect(events.filter((e) => e.type === 'pd-save-recovered')).toEqual([]);
  });

  it('that the last moves are missing, when the journal is damaged', async () => {
    const page = await openPage(new MemStorage(), null);
    for (let i = 0; i < 20; i++) turn(page);
    kill(page);
    const found = reload(page);
    for (const key of [journalKey(KEY), journalKey2(KEY)]) if (found.getItem(key)) found.data.set(key, 'broken');
    events.length = 0;
    const next = await openPage(found, null);
    expect(events.filter((e) => e.type === 'pd-save-recovered').map((e) => e.detail)).toEqual(['journal']);
    expect(next.session.world!.turn).toBeLessThanOrEqual(20);
  });

  it('asks the server when nothing on the device can be read, and does not call the run lost', async () => {
    const server = new FakeServer();
    const page = await openPage(new MemStorage(), server);
    for (let i = 0; i < 25; i++) turn(page);
    await settle(9000);
    kill(page);
    const found = reload(page);
    for (const key of [KEY, twinKey(KEY), journalKey(KEY), journalKey2(KEY)]) if (found.getItem(key)) found.data.set(key, '{"half');
    const next = await openPage(found, server);
    expect(next.plan).toBe('server');
    expect(fingerprint(next.session.world!)).toBe(fingerprint(server.run!.world));
    expect(next.session.world!.turn).toBe(server.run!.seq);
  });

  it('keeps a checked run when the server cannot be reached at all (no way to it this time), and sends its moves when it can', async () => {
    const server = new FakeServer();
    const page = await openPage(new MemStorage(), server);
    for (let i = 0; i < 10; i++) turn(page);
    await settle(9000);
    kill(page);
    // A start with no init data: a way to the server is not there. The run is carried on, not thrown away, and its moves are kept.
    const blind = await openPage(reload(page), null);
    expect(blind.plan).toBe('resume-offline');
    for (let i = 0; i < 6; i++) turn(blind);
    await settle(9000);
    expect(blind.session.checked?.offline).toBe(true);
    kill(blind);
    const next = await openPage(reload(blind), server);
    expect(next.plan).toBe('resume-checked');
    await settle(1000);
    expect(server.run!.seq).toBe(next.session.world!.turn);
    expect(fingerprint(server.run!.world)).toBe(fingerprint(next.session.world!));
    expect(eventsOf('pd-run-restored')).toBe(0);
  });
});

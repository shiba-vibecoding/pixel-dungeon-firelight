import { fingerprint } from '@pd/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REQUEST_TIMEOUT_MS, runApi } from '../src/checked';
import { Lease } from '../src/instance';
import { leaseKey, setEvictContext, twinKey, journalKey } from '../src/savestore';
import { planStart } from '../src/startplan';
import { KEY, canon, events, FakeServer, installGlobals, kill, openPage, reload, turn } from './pagekit';
import { MemStorage } from './savekit';

vi.mock('../src/update', () => ({ reloadForUpdate: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  installGlobals();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setEvictContext(() => null);
});

const settle = async (ms = 0): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms);
};
const count = (type: string): number => events.filter((e) => e.type === type).length;
/** What another window of the origin hears when this one writes the lease (the storage event). */
const storageEvent = (key: string): void => {
  dispatchEvent(Object.assign(new Event('storage'), { key }));
};

describe('two copies of the game on one device', () => {
  it('the newer takes the run; the older stands aside, plays nothing and writes nothing', async () => {
    const storage = new MemStorage();
    const older = await openPage(storage, null, { copy: 'older' });
    for (let i = 0; i < 12; i++) turn(older);
    const newer = await openPage(storage, null, { copy: 'newer' });
    // The newer one found the run where the older left it.
    expect(canon(newer.session.world!)).toBe(canon(older.session.world!));
    // The older does not know yet; it finds out the moment it is asked to act, and does not act.
    const before = canon(older.session.world!);
    const writes = storage.writes;
    older.session.send({ type: 'wait' });
    expect(older.session.superseded).toBe('window');
    expect(count('pd-superseded')).toBe(1);
    expect(canon(older.session.world!)).toBe(before);
    expect(storage.writes).toBe(writes);
    // Nothing more it is asked to do changes anything.
    for (let i = 0; i < 5; i++) older.session.send({ type: 'wait' });
    expect(canon(older.session.world!)).toBe(before);
    expect(storage.writes).toBe(writes);
    // The newer plays on, and its play is what is kept.
    for (let i = 0; i < 20; i++) turn(newer);
    kill(newer);
    const found = await openPage(reload(newer), null, { copy: 'third' });
    expect(canon(found.session.world!)).toBe(canon(newer.session.world!));
  });

  it('hears of it at once by the storage event, before it is asked to act', async () => {
    const storage = new MemStorage();
    const older = await openPage(storage, null, { copy: 'older' });
    for (let i = 0; i < 5; i++) turn(older);
    await openPage(storage, null, { copy: 'newer' });
    expect(older.session.superseded).toBeNull();
    storageEvent(leaseKey(KEY));
    expect(older.session.superseded).toBe('window');
    // Other keys\' events do not matter.
    storageEvent('pd-sound');
    expect(count('pd-superseded')).toBe(1);
  });

  it('takes the run back, reading what the newer copy kept, and the newer then stands aside', async () => {
    const storage = new MemStorage();
    const first = await openPage(storage, null, { copy: 'first' });
    for (let i = 0; i < 10; i++) turn(first);
    const second = await openPage(storage, null, { copy: 'second' });
    for (let i = 0; i < 25; i++) turn(second);
    first.session.send({ type: 'wait' });
    expect(first.session.superseded).toBe('window');
    // The older copy\'s world is behind; taking back does not overwrite the newer\'s progress with it.
    const theirs = canon(second.session.world!);
    first.session.takeBack!();
    expect(first.session.superseded).toBeNull();
    expect(canon(first.session.world!)).toBe(theirs);
    expect(count('pd-taken-back')).toBe(1);
    // It plays on; the other, asked to act, finds the run gone.
    for (let i = 0; i < 6; i++) turn(first);
    second.session.send({ type: 'wait' });
    expect(second.session.superseded).toBe('window');
    expect(canon(second.session.world!)).toBe(theirs);
    kill(first);
    const found = await openPage(reload(first), null, { copy: 'third' });
    expect(canon(found.session.world!)).toBe(canon(first.session.world!));
  });

  it('does not stand aside for a run it closed: the title screen lets the lease go', async () => {
    const storage = new MemStorage();
    const page = await openPage(storage, null, { copy: 'a' });
    for (let i = 0; i < 3; i++) turn(page);
    page.session.close();
    expect(storage.getItem(leaseKey(KEY))).toBeNull();
    const next = await openPage(storage, null, { copy: 'b' });
    turn(next);
    expect(count('pd-superseded')).toBe(0);
    // The closed one is no copy of the game at all any more.
    page.session.send({ type: 'wait' });
    expect(next.session.superseded).toBeNull();
  });

  it('a lease whose storage cannot be read leaves the run where it is', () => {
    const storage = new MemStorage();
    const lost = vi.fn();
    const lease = new Lease(storage, KEY, lost, [], 'me');
    lease.claim();
    expect(lease.held()).toBe(true);
    storage.removeItem(leaseKey(KEY));
    expect(lease.held()).toBe(true);
    storage.setItem(leaseKey(KEY), 'not json');
    expect(lease.check()).toBe(true);
    storage.setItem(leaseKey(KEY), JSON.stringify({ id: 'other', at: 1 }));
    expect(lease.check()).toBe(false);
    expect(lost).toHaveBeenCalledTimes(1);
    // Told once, and still lost until it claims again.
    expect(lease.check()).toBe(false);
    expect(lost).toHaveBeenCalledTimes(1);
    lease.claim();
    expect(lease.check()).toBe(true);
  });

  it('a lease hears a bus too', () => {
    const storage = new MemStorage();
    let deliver: (message: string) => void = () => undefined;
    const bus = { post: () => undefined, listen: (callback: (message: string) => void) => ((deliver = callback), () => undefined) };
    const lost = vi.fn();
    const lease = new Lease(storage, KEY, lost, [bus], 'me');
    lease.claim();
    storage.setItem(leaseKey(KEY), JSON.stringify({ id: 'other', at: 1 }));
    deliver(leaseKey(KEY));
    expect(lost).toHaveBeenCalledTimes(1);
  });
});

describe('two devices on one checked run', () => {
  it('the older device is told by the server, plays nothing, and takes the run back with the server\'s word on it', async () => {
    const server = new FakeServer();
    const phone = await openPage(new MemStorage(), server, { copy: 'phone' });
    for (let i = 0; i < 10; i++) turn(phone);
    await settle(9000);
    // The player opens the game on the computer: it carries the run on from the server and claims it.
    const computer = await openPage(new MemStorage(), server, { copy: 'computer' });
    await settle(0);
    expect(computer.plan).toBe('server');
    for (let i = 0; i < 14; i++) turn(computer);
    await settle(9000);
    expect(server.run!.owner).toBe('computer');
    const seq = server.run!.seq;
    // The phone plays a few turns it believes in; the server takes none of them.
    for (let i = 0; i < 4; i++) turn(phone);
    await settle(9000);
    expect(phone.session.superseded).toBe('device');
    expect(server.run!.seq).toBe(seq);
    expect(count('pd-superseded')).toBe(1);
    // It stands still from then on.
    const frozen = canon(phone.session.world!);
    const calls = server.calls.length;
    phone.session.send({ type: 'wait' });
    await settle(120_000);
    expect(canon(phone.session.world!)).toBe(frozen);
    expect(server.calls.length).toBe(calls);
    // «Play here»: the phone claims the run; the server, which has the computer\'s moves, sends its copy, and says why.
    phone.session.takeBack!();
    await settle(0);
    expect(phone.session.superseded).toBeNull();
    expect(server.run!.owner).toBe('phone');
    expect(fingerprint(phone.session.world!)).toBe(fingerprint(server.run!.world));
    const restored = events.filter((e) => e.type === 'pd-run-restored');
    expect(restored).toHaveLength(1);
    expect((restored[0]!.detail as { reason: string; lost: number }).reason).toBe('out of step');
    // The computer is the one that is told now.
    turn(computer);
    await settle(9000);
    expect(computer.session.superseded).toBe('device');
    // And the phone goes on, as the one that holds the run.
    for (let i = 0; i < 6; i++) turn(phone);
    await settle(9000);
    expect(server.run!.seq).toBe(phone.session.world!.turn);
    expect(fingerprint(server.run!.world)).toBe(fingerprint(phone.session.world!));
  });

  it('a device that was displaced with nothing played in between takes the run back as it was', async () => {
    const server = new FakeServer();
    const phone = await openPage(new MemStorage(), server, { copy: 'phone' });
    for (let i = 0; i < 10; i++) turn(phone);
    await settle(9000);
    const computer = await openPage(new MemStorage(), server, { copy: 'computer' });
    await settle(9000);
    turn(phone);
    await settle(9000);
    expect(phone.session.superseded).toBe('device');
    // The computer did not move: the phone\'s unsent turn is taken when it claims.
    phone.session.takeBack!();
    await settle(9000);
    expect(count('pd-run-restored')).toBe(0);
    expect(server.run!.seq).toBe(phone.session.world!.turn);
    expect(phone.session.superseded).toBeNull();
    kill(computer);
  });
});

describe('the quota, with the game at play', () => {
  it('keeps every turn of a run on a device that is nearly full, by letting the bodies and blood go', async () => {
    // A device with room for the run and little else, whose gore records and caches have taken the rest.
    const server = new FakeServer();
    const probe = await openPage(new MemStorage(), server);
    for (let i = 0; i < 170; i++) turn(probe);
    const snapshotSize = probe.storage.getItem(KEY)?.length ?? probe.storage.getItem(twinKey(KEY))!.length;
    kill(probe);
    const storage = new MemStorage(Math.round(snapshotSize * 2.2));
    storage.setItem('pd-badges', '{"seen":[1,2,3]}');
    storage.setItem('pd-shop2', 'c'.repeat(3000));
    for (let depth = 1; depth <= 40; depth++) {
      try {
        storage.setItem(`pd-gore:7:run:${depth}`, 'g'.repeat(6000));
      } catch {
        break;
      }
    }
    setEvictContext(() => ({ run: '7:run', depth: 1 }));
    const page = await openPage(storage, new FakeServer());
    for (let i = 0; i < 160; i++) turn(page);
    expect(count('pd-save-failed')).toBe(0);
    expect(storage.getItem('pd-badges')).toBe('{"seen":[1,2,3]}');
    const gore = [...storage.data.keys()].filter((k) => k.startsWith('pd-gore:'));
    expect(gore.length).toBeLessThan(40);
    kill(page);
    const found = await openPage(reload(page), new FakeServer());
    expect(canon(found.session.world!)).toBe(canon(page.session.world!));
    expect(count('pd-save-recovered')).toBe(0);
  });

  it('says so, once, when the device has no room for the run at all, and goes on playing', async () => {
    const storage = new MemStorage(2000);
    const page = await openPage(storage, null);
    for (let i = 0; i < 20; i++) turn(page);
    expect(count('pd-save-failed')).toBeGreaterThan(0);
    expect(page.session.world!.turn).toBeGreaterThan(10);
  });

  it('never loses a journal to a snapshot that cannot be written: the journal alone carries the turns', async () => {
    const probe = await openPage(new MemStorage(), null);
    for (let i = 0; i < 10; i++) turn(probe);
    const size = probe.storage.getItem(KEY)?.length ?? probe.storage.getItem(twinKey(KEY))!.length;
    kill(probe);
    // Room for a single snapshot and its small journals: the second snapshot never fits.
    const storage = new MemStorage(Math.round(size * 1.3));
    const page = await openPage(storage, null);
    for (let i = 0; i < 40; i++) turn(page);
    expect(storage.getItem(journalKey(KEY))).not.toBeNull();
    kill(page);
    const found = await openPage(reload(page), null);
    expect(canon(found.session.world!)).toBe(canon(page.session.world!));
  });
});

describe('the start', () => {
  it('carries a kept run on, whatever the server says first; takes the server\'s when nothing usable is kept', () => {
    const none = { kept: false, check: false, stale: false, api: false };
    expect(planStart({ ...none, kept: true, api: true })).toBe('resume-local');
    expect(planStart({ ...none, kept: true, check: true, api: true })).toBe('resume-checked');
    // A checked run and no way to the server: not thrown away.
    expect(planStart({ ...none, kept: true, check: true })).toBe('resume-offline');
    expect(planStart({ ...none, kept: true })).toBe('resume-local');
    expect(planStart({ ...none, api: true })).toBe('server');
    expect(planStart(none)).toBe('local-new');
    // Yesterday\'s daily is not carried on.
    expect(planStart({ kept: true, check: true, stale: true, api: true })).toBe('server');
    expect(planStart({ kept: true, check: true, stale: true, api: false })).toBe('local-new');
  });
});

describe('the requests', () => {
  const jsonResponse = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });

  it('name the copy of the game and whether it claims the run', async () => {
    const fetched: Array<{ url: string; body: Record<string, unknown>; keepalive: boolean }> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      fetched.push({ url, body: JSON.parse(init.body as string) as Record<string, unknown>, keepalive: Boolean(init.keepalive) });
      return jsonResponse({ seq: 3 });
    });
    const api = runApi('ws://127.0.0.1:1', () => ({ id: 'dev' }), true)!;
    const meta = { id: 'r', slot: 'dungeon' as const, seq: 3, ranked: true };
    await api.sync(meta, [], null, false, { sid: 'abc', claim: true });
    await api.sync(meta, [], null, true);
    expect(fetched[0]!.body).toMatchObject({ op: 'sync', run: 'r', from: 3, sid: 'abc', claim: true });
    expect(fetched[1]!.body.sid).toBeUndefined();
    expect(fetched[1]!.keepalive).toBe(true);
  });

  it('give up on a request that never answers, so that the next can go', async () => {
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const api = runApi('ws://127.0.0.1:1', () => ({ id: 'dev' }), true)!;
    const answer = api.sync({ id: 'r', slot: 'dungeon', seq: 0, ranked: true }, [], null);
    await settle(REQUEST_TIMEOUT_MS + 1);
    await expect(answer).resolves.toBe('offline');
  });

  it('send a refused keepalive request as a beacon, which the browser sends after the page is gone', async () => {
    const beacons: Array<{ url: string; type: string }> = [];
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('keepalive body too large');
    });
    vi.stubGlobal('navigator', { sendBeacon: (url: string, blob: Blob) => (beacons.push({ url, type: blob.type }), true) });
    const api = runApi('ws://127.0.0.1:1', () => ({ id: 'dev' }), true)!;
    const answer = await api.sync({ id: 'r', slot: 'dungeon', seq: 0, ranked: true }, [], null, true);
    expect(answer).toBe('offline');
    expect(beacons).toEqual([{ url: 'http://127.0.0.1:1/run', type: 'text/plain' }]);
  });
});

import { fingerprint, RULES_VERSION, type World } from '@pd/core';
import { describe, expect, it } from 'vitest';
import {
  BUDGET_CHARS, checksum, decodeSnapshot, encodeSnapshot, evictable, forgetSlot, JOURNAL_MAX, journalKey, journalKey2, putWithRoom, readSlot, SAVE_VERSION,
  hydrate, pruneMirror, type SavedCheck, setEvictContext, setMirror, SlotKeeper, slotOfKey, trimToBudget, twinKey, usage,
} from '../src/savestore';
import { memoryMirror } from '../src/mirror';
import { Killed, MemStorage, newWorld, play, sameWorld, viaJson } from './savekit';

const KEY = 'pd-solo';

/** A world played some turns, and the actions that took it there. */
function played(seed: number, turns: number): { world: World; actions: ReturnType<typeof play>[] } {
  const world = newWorld(seed);
  const actions = [];
  for (let i = 0; i < turns; i++) actions.push(play(world));
  return { world, actions };
}

const gore = (run: string, depth: number, size = 1000): [string, string] => [`pd-gore:${run}:${depth}`, 'x'.repeat(size)];

describe('the snapshot text', () => {
  it('reads back what was written, with its checksum and generation', () => {
    const { world } = played(1, 30);
    const text = encodeSnapshot(world, null, 7, 1234);
    const decoded = decodeSnapshot(text);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.gen).toBe(7);
      expect(decoded.at).toBe(1234);
      expect(decoded.save.version).toBe(SAVE_VERSION);
      expect(decoded.save.rules).toBe(RULES_VERSION);
      expect(sameWorld(decoded.save.world, world)).toBe(true);
    }
  });

  it('is still one JSON object of the earlier shape, so an older page can read it', () => {
    const { world } = played(2, 5);
    const parsed = JSON.parse(encodeSnapshot(world, null, 1)) as { version: number; world: World };
    expect(parsed.version).toBe(SAVE_VERSION);
    expect(parsed.world.turn).toBe(world.turn);
  });

  it('refuses a text that was cut short, or changed in a single character', () => {
    const { world } = played(3, 20);
    const text = encodeSnapshot(world, null, 2);
    expect(decodeSnapshot(text.slice(0, text.length >> 1)).ok).toBe(false);
    expect(decodeSnapshot(text.slice(0, -1)).ok).toBe(false);
    const flipped = text.slice(0, 500) + (text[500] === '1' ? '2' : '1') + text.slice(501);
    expect(decodeSnapshot(flipped).ok).toBe(false);
    expect(decodeSnapshot('').ok).toBe(false);
    expect(decodeSnapshot('not json at all').ok).toBe(false);
    expect(decodeSnapshot('{"version":40}').ok).toBe(false);
  });

  it('reads a save of the earlier build, which had no checksum', () => {
    const { world } = played(4, 10);
    const old = JSON.stringify({ version: SAVE_VERSION, world });
    const decoded = decodeSnapshot(old);
    expect(decoded.ok && decoded.legacy && decoded.gen === 0).toBe(true);
    const storage = new MemStorage();
    storage.setItem(KEY, old);
    const read = readSlot(storage, KEY);
    expect(read.run && sameWorld(read.run.world, world)).toBe(true);
    expect(read.recovered).toBeNull();
    // A legacy save cut short does not parse: damaged, nothing to carry on.
    storage.setItem(KEY, old.slice(0, 100));
    expect(readSlot(storage, KEY)).toMatchObject({ run: null, damaged: true });
  });

  it('has a checksum that differs for texts that differ', () => {
    expect(checksum('abc')).not.toBe(checksum('abd'));
    expect(checksum('')).toBe(checksum(''));
  });
});

describe('a slot: snapshots and the journal', () => {
  it('puts a snapshot on one twin and the next on the other, and carries on from the newest', () => {
    const storage = new MemStorage();
    const keeper = new SlotKeeper(storage, KEY);
    const { world } = played(5, 3);
    expect(keeper.snapshot(world, null)).toBe(true);
    expect(storage.getItem(twinKey(KEY))).not.toBeNull();
    expect(storage.getItem(KEY)).toBeNull();
    play(world);
    expect(keeper.snapshot(world, null)).toBe(true);
    expect(storage.getItem(KEY)).not.toBeNull();
    expect(decodeSnapshot(storage.getItem(KEY)!)).toMatchObject({ ok: true, gen: 2 });
    expect(decodeSnapshot(storage.getItem(twinKey(KEY))!)).toMatchObject({ ok: true, gen: 1 });
    const read = readSlot(storage, KEY);
    expect(read.gen).toBe(2);
    expect(read.run && sameWorld(read.run.world, world)).toBe(true);
    expect(read.recovered).toBeNull();
  });

  it('keeps every turn in a small journal and plays it on the snapshot', () => {
    const storage = new MemStorage();
    const keeper = new SlotKeeper(storage, KEY);
    const world = newWorld(6);
    keeper.snapshot(world, null);
    for (let i = 0; i < 25; i++) {
      const action = play(world)!;
      expect(keeper.note(action, world, null)).toBe(true);
      // The moment a turn is taken, a reload would find it.
      const read = readSlot(storage.clone(), KEY);
      expect(read.run && sameWorld(read.run.world, world)).toBe(true);
      expect(read.replayed).toBe(i + 1);
    }
    expect(keeper.pending).toBe(true);
    expect(readSlot(storage, KEY).recovered).toBeNull();
  });

  it('writes a few hundred bytes a turn, not the world (the size and time of a turn)', () => {
    const storage = new MemStorage();
    const keeper = new SlotKeeper(storage, KEY);
    const world = newWorld(7);
    for (let i = 0; i < 400; i++) play(world);
    keeper.snapshot(world, null);
    const snapshotChars = keeper.lastBytes;
    const times: number[] = [];
    let biggest = 0;
    for (let i = 0; i < JOURNAL_MAX - 1; i++) {
      const action = play(world)!;
      keeper.note(action, world, null);
      biggest = Math.max(biggest, keeper.lastBytes);
      times.push(keeper.lastWriteMs);
    }
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`save cost: snapshot ${Math.round(snapshotChars / 1024)} KB; the journal after ${JOURNAL_MAX - 1} turns ${biggest} chars; mean ${mean.toFixed(3)} ms a turn (fingerprint included)`);
    expect(biggest).toBeLessThan(6000);
    expect(biggest).toBeLessThan(snapshotChars / 20);
  });

  it('makes a new snapshot when the journal is full, and the journal starts over empty', () => {
    const storage = new MemStorage();
    const keeper = new SlotKeeper(storage, KEY);
    const world = newWorld(8);
    keeper.snapshot(world, null);
    for (let i = 0; i < JOURNAL_MAX + 5; i++) keeper.note(play(world)!, world, null);
    expect(readSlot(storage, KEY).gen).toBe(2);
    expect(keeper.pending).toBe(true);
    const read = readSlot(storage, KEY);
    // (The 61st turn made a snapshot of its own: four are left in the journal.)
    expect(read.replayed).toBe(4);
    expect(read.run && sameWorld(read.run.world, world)).toBe(true);
  });

  it('carries the server\'s standing: the moves not yet sent, trimmed as the server takes them', () => {
    const storage = new MemStorage();
    const keeper = new SlotKeeper(storage, KEY);
    const world = newWorld(9);
    const check: SavedCheck = { meta: { id: 'run-1', slot: 'dungeon', seq: 0, ranked: true }, log: [] };
    keeper.snapshot(world, check);
    for (let i = 0; i < 12; i++) {
      const action = play(world)!;
      check.log.push(action);
      keeper.note(action, world, check);
    }
    let read = readSlot(storage.clone(), KEY);
    expect(read.run?.check?.log).toHaveLength(12);
    expect(read.run?.check?.meta.seq).toBe(0);
    // The server takes eight of them.
    check.log.splice(0, 8);
    check.meta.seq = 8;
    keeper.ack(world, check);
    read = readSlot(storage.clone(), KEY);
    expect(read.run?.check?.log).toEqual(check.log);
    expect(read.run?.check?.meta.seq).toBe(8);
    expect(read.run && sameWorld(read.run.world, world)).toBe(true);
    // And on, past a snapshot.
    for (let i = 0; i < JOURNAL_MAX; i++) {
      const action = play(world)!;
      check.log.push(action);
      keeper.note(action, world, check);
    }
    read = readSlot(storage.clone(), KEY);
    expect(read.run?.check?.log).toEqual(check.log);
  });

  it('forgets a slot: both snapshots and the journal', () => {
    const storage = new MemStorage();
    const keeper = new SlotKeeper(storage, KEY);
    const world = newWorld(10);
    keeper.snapshot(world, null);
    keeper.snapshot(world, null);
    keeper.note(play(world)!, world, null);
    storage.setItem('pd-other', 'keep');
    forgetSlot(storage, KEY);
    expect([...storage.data.keys()]).toEqual(['pd-other']);
    expect(readSlot(storage, KEY)).toMatchObject({ run: null, damaged: false });
  });

  it('knows a slot\'s companions by their keys', () => {
    expect(slotOfKey('pd-daily-2026-10-17~j')).toBe('pd-daily-2026-10-17');
    expect(slotOfKey('pd-solo~2')).toBe('pd-solo');
    expect(slotOfKey('pd-solo')).toBe('pd-solo');
  });
});

describe('damage', () => {
  /** A slot with two snapshots and a few turns in its journal. */
  function slot(): { storage: MemStorage; world: World; before: World } {
    const storage = new MemStorage();
    const keeper = new SlotKeeper(storage, KEY);
    const world = newWorld(11);
    for (let i = 0; i < 10; i++) play(world);
    keeper.snapshot(world, null);
    for (let i = 0; i < 10; i++) play(world);
    const before = viaJson(world);
    keeper.snapshot(world, null);
    for (let i = 0; i < 6; i++) keeper.note(play(world)!, world, null);
    return { storage, world, before };
  }

  it('falls back to the other snapshot when the newest is corrupt, and says that something was lost', () => {
    const { storage, before } = slot();
    // The newest (generation 2) is at KEY.
    const text = storage.getItem(KEY)!;
    storage.data.set(KEY, text.slice(0, 700) + 'ZZZZ' + text.slice(704));
    const read = readSlot(storage, KEY);
    expect(read.run).not.toBeNull();
    expect(read.recovered).toBe('backup');
    // The generation-1 snapshot, 10 turns before generation 2.
    expect(read.run!.world.turn).toBeLessThan(before.turn);
  });

  it('falls back when the newest snapshot is truncated or emptied', () => {
    for (const damage of [(t: string) => t.slice(0, t.length >> 1), () => '', () => '{', () => 'null', () => '[]']) {
      const { storage, before } = slot();
      storage.data.set(KEY, damage(storage.getItem(KEY)!));
      const read = readSlot(storage, KEY);
      expect(read.run).not.toBeNull();
      expect(read.recovered).toBe('backup');
      expect(read.run!.world.turn).toBeLessThan(before.turn);
    }
  });

  it('says nothing when only the old backup is damaged: nothing was lost', () => {
    const { storage, world } = slot();
    storage.data.set(twinKey(KEY), 'garbage');
    const read = readSlot(storage, KEY);
    expect(read.recovered).toBeNull();
    expect(read.run && sameWorld(read.run.world, world)).toBe(true);
  });

  const journalKeys = [journalKey(KEY), journalKey2(KEY)];
  /** Rewrites what a journal says (under a good checksum). */
  const forge = (storage: MemStorage, key: string, edit: (body: Record<string, unknown>) => void): void => {
    const text = storage.getItem(key)!;
    const body = JSON.parse(text.slice(text.indexOf('|') + 1)) as Record<string, unknown>;
    edit(body);
    const forged = JSON.stringify(body);
    storage.data.set(key, `${checksum(forged)}|${forged}`);
  };

  it('plays the snapshot alone, and says so, when the journal is damaged', () => {
    const { storage, world } = slot();
    for (const key of journalKeys) storage.data.set(key, storage.getItem(key)!.slice(0, -5) + '12345');
    const read = readSlot(storage, KEY);
    expect(read.recovered).toBe('journal');
    expect(read.run!.world.turn).toBe(world.turn - 6);
  });

  it('loses only the turn in flight, and says nothing, when the last journal write was cut short', () => {
    const { storage, world } = slot();
    // The newest journal is the one written last: the 6th turn went to ~k (writes alternate from ~j: the snapshot, then turns 1..6).
    const newest = [...journalKeys].sort((x, y) => (readSlot(storage, KEY) && storage.getItem(y)!.length - storage.getItem(x)!.length))[0]!;
    storage.data.set(newest, storage.getItem(newest)!.slice(0, 40));
    const read = readSlot(storage, KEY);
    expect(read.recovered).toBeNull();
    expect(read.run!.world.turn).toBe(world.turn - 1);
  });

  it('plays the journal before when the newest does not come to where it said, and says a move was lost', () => {
    const { storage, world } = slot();
    const newest = [...journalKeys].sort((x, y) => storage.getItem(y)!.length - storage.getItem(x)!.length)[0]!;
    forge(storage, newest, (body) => {
      body.f = 'ffffffffffffff';
    });
    const read = readSlot(storage, KEY);
    expect(read.recovered).toBe('journal');
    expect(read.run!.world.turn).toBe(world.turn - 1);
  });

  it('plays the snapshot alone, and says so, when no journal comes to where it said', () => {
    const { storage, world } = slot();
    for (const key of journalKeys) forge(storage, key, (body) => { body.f = 'ffffffffffffff'; });
    const read = readSlot(storage, KEY);
    expect(read.recovered).toBe('journal');
    expect(read.run!.world.turn).toBe(world.turn - 6);
    // The snapshot is whole: the failed plays did not leave their marks on it.
    const snapshot = decodeSnapshot(storage.getItem(KEY)!);
    expect(snapshot.ok && fingerprint(read.run!.world) === fingerprint(snapshot.save.world)).toBe(true);
  });

  it('ignores a journal of an older generation (what a kill leaves between a snapshot and its journal)', () => {
    const { storage, world } = slot();
    const old = journalKeys.map((key) => storage.getItem(key)!);
    const keeper = new SlotKeeper(storage, KEY, 2);
    keeper.snapshot(world, null);
    // The journals the kill left behind belong to generation 2; generation 3 is whole.
    journalKeys.forEach((key, i) => storage.data.set(key, old[i]!));
    const read = readSlot(storage, KEY);
    expect(read.recovered).toBeNull();
    expect(read.replayed).toBe(0);
    expect(read.run && sameWorld(read.run.world, world)).toBe(true);
  });

  it('plays a journal written under other rules (the game was updated while the moves waited), as long as it comes to its fingerprint', () => {
    const { storage, world } = slot();
    for (const key of journalKeys) forge(storage, key, (body) => { body.r = RULES_VERSION - 1; });
    const read = readSlot(storage, KEY);
    expect(read.recovered).toBeNull();
    expect(read.run && sameWorld(read.run.world, world)).toBe(true);
    // If the new rules changed what the moves do, the fingerprint says so, and the snapshot stands (told of).
    for (const key of journalKeys) forge(storage, key, (body) => { body.r = RULES_VERSION - 1; body.f = 'ffffffffffffff'; });
    const changed = readSlot(storage, KEY);
    expect(changed.recovered).toBe('journal');
    expect(changed.run!.world.turn).toBe(world.turn - 6);
  });

  it('reports a damaged pair as damaged, with no run', () => {
    const { storage } = slot();
    storage.data.set(KEY, 'x');
    storage.data.set(twinKey(KEY), '{"version":40');
    const read = readSlot(storage, KEY);
    expect(read).toMatchObject({ run: null, damaged: true });
  });

  it('reports nothing for a slot that was never used', () => {
    expect(readSlot(new MemStorage(), KEY)).toMatchObject({ run: null, damaged: false, recovered: null, stale: null });
  });

  it('migrates or refuses a run of another version', () => {
    const { world } = played(13, 5);
    const storage = new MemStorage();
    storage.setItem(KEY, JSON.stringify({ version: SAVE_VERSION - 1, world }));
    const read = readSlot(storage, KEY);
    expect(read.run).toBeNull();
    expect(read.stale).toMatchObject({ depth: 1 });
    expect(read.damaged).toBe(false);
  });

  it('survives a kill in every write of a snapshot and a turn: the last whole turn is found', () => {
    // The page is killed at the nth write; the storage it leaves is read by a fresh page.
    for (const mode of ['drop', 'torn'] as const) {
      for (let nth = 0; nth < 40; nth++) {
        const storage = new MemStorage();
        const keeper = new SlotKeeper(storage, KEY);
        const world = newWorld(14);
        let last = viaJson(world);
        storage.writes = 0;
        storage.fault = (_k, _v, n) => (n === nth ? mode : undefined);
        try {
          keeper.snapshot(world, null);
          last = viaJson(world);
          for (let i = 0; i < JOURNAL_MAX + 8; i++) {
            const action = play(world)!;
            // The turn counts as saved once the call returned.
            keeper.note(action, world, null);
            last = viaJson(world);
          }
        } catch (error) {
          if (!(error instanceof Killed)) throw error;
        }
        storage.fault = null;
        const read = readSlot(storage.clone(), KEY);
        if (read.run === null) {
          // Killed before the first snapshot ever stood: there was no run to find.
          expect(storage.writes).toBeLessThanOrEqual(2);
          continue;
        }
        // The world found is the last completed turn, or the one the kill interrupted (its journal write landed whole, 'torn' excepted).
        const got = read.run.world;
        expect(got.turn === last.turn || got.turn === last.turn + 1, `mode ${mode} write ${nth}: found turn ${got.turn}, last ${last.turn}`).toBe(true);
        if (got.turn === last.turn) expect(sameWorld(got, last)).toBe(true);
      }
    }
  });
});

describe('the quota', () => {
  const ctx = { run: 'seed:run', depth: 5 };

  it('lets go of the bodies and blood of other runs, then far depths, then caches, then this depth, in that order', () => {
    setEvictContext(() => ctx);
    const storage = new MemStorage();
    for (const [k, v] of [
      gore('seed:run', 5), gore('seed:run', 4), gore('seed:run', 1), gore('seed:run', 9, 200),
      gore('old:run', 2, 3000), gore('older:run', 7, 500),
    ]) storage.setItem(k, v);
    for (const k of ['pd-shop2', 'pd-mart-owned', 'pd-window']) storage.setItem(k, 'cache');
    for (const k of ['pd-badges', 'pd-rankings', 'pd-sound', KEY, twinKey(KEY), journalKey(KEY), 'pd-daily-2026-10-17']) storage.setItem(k, 'precious');
    const order = evictable(storage);
    expect(order).toEqual([
      'pd-gore:old:run:2', 'pd-gore:older:run:7',
      'pd-gore:seed:run:1', 'pd-gore:seed:run:9', 'pd-gore:seed:run:4',
      'pd-shop2', 'pd-mart-owned', 'pd-window',
      'pd-gore:seed:run:5',
    ]);
    setEvictContext(() => null);
  });

  it('never offers a saved run, the badges, the rankings or the settings', () => {
    const storage = new MemStorage();
    for (const k of ['pd-badges', 'pd-rankings', 'pd-sound', 'pd-lang', KEY, twinKey(KEY), journalKey(KEY), 'pd-daily-x', `${KEY}~o`, 'pd-bones']) storage.setItem(k, 'v');
    expect(evictable(storage)).toEqual([]);
  });

  it('keeps the save when the storage is full: the gore goes, the retry succeeds', () => {
    setEvictContext(() => ctx);
    const world = newWorld(15);
    for (let i = 0; i < 300; i++) play(world);
    const size = encodeSnapshot(world, null, 1).length;
    // Room for a snapshot and its twin, the journal and a little more; everything else is gore.
    const storage = new MemStorage(size * 2 + 5000);
    for (let d = 1; d <= 20; d++) {
      const [k, v] = gore('seed:run', d, 3000);
      try {
        storage.setItem(k, v);
      } catch {
        break;
      }
    }
    storage.setItem('pd-badges', '{"a":1}');
    const keeper = new SlotKeeper(storage, KEY);
    expect(keeper.snapshot(world, null)).toBe(true);
    expect(keeper.snapshot(world, null)).toBe(true);
    for (let i = 0; i < 20; i++) expect(keeper.note(play(world)!, world, null)).toBe(true);
    const read = readSlot(storage, KEY);
    expect(read.run && sameWorld(read.run.world, world)).toBe(true);
    expect(storage.getItem('pd-badges')).toBe('{"a":1}');
    // The record of the depth being played is the last to go.
    const left = [...storage.data.keys()].filter((k) => k.startsWith('pd-gore:'));
    expect(left.length).toBeLessThan(20);
    setEvictContext(() => null);
  });

  it('rotates its two snapshots in place: a third and a fourth need no room beyond the two', () => {
    const world = newWorld(16);
    for (let i = 0; i < 200; i++) play(world);
    const size = encodeSnapshot(world, null, 1).length;
    // Room for two snapshots (with a little growth) and a journal, not three.
    const storage = new MemStorage(Math.round(size * 2.5));
    const keeper = new SlotKeeper(storage, KEY);
    for (let i = 0; i < 6; i++) {
      expect(keeper.snapshot(world, null)).toBe(true);
      play(world);
      play(world);
    }
    const read = readSlot(storage, KEY);
    expect(read.gen).toBe(6);
    expect(read.recovered).toBeNull();
  });

  it('reports failure, and loses nothing already kept, when nothing at all fits', () => {
    const world = newWorld(17);
    for (let i = 0; i < 100; i++) play(world);
    const size = encodeSnapshot(world, null, 1).length;
    const storage = new MemStorage(size + 2000);
    const keeper = new SlotKeeper(storage, KEY);
    expect(keeper.snapshot(world, null)).toBe(true);
    const kept = viaJson(world);
    // The device fills up with something that is not ours to take.
    storage.setItem('pd-stranger', 'y'.repeat(storage.capacity - storage.total() - 'pd-stranger'.length));
    for (let i = 0; i < 30; i++) play(world);
    expect(keeper.snapshot(world, null)).toBe(false);
    const read = readSlot(storage, KEY);
    expect(read.run && sameWorld(read.run.world, kept)).toBe(true);
  });

  it('fails turns quickly, not slowly, when the storage refuses everything (a private window)', () => {
    const storage = new MemStorage();
    storage.fault = () => 'quota';
    const keeper = new SlotKeeper(storage, KEY);
    const world = newWorld(18);
    expect(keeper.snapshot(world, null)).toBe(false);
    const writes = storage.writes;
    for (let i = 0; i < 20; i++) expect(keeper.note(play(world)!, world, null)).toBe(false);
    // One refused snapshot in the first turn, then the pause: few writes, not three a turn.
    expect(storage.writes - writes).toBeLessThan(25 * 2);
  });

  it('a budget check trims gore and caches above the budget, and leaves the saves', () => {
    setEvictContext(() => ctx);
    const storage = new MemStorage();
    storage.setItem(KEY, 'S'.repeat(400_000));
    storage.setItem(twinKey(KEY), 'T'.repeat(400_000));
    for (let d = 1; d <= 26; d++) storage.setItem(...gore('seed:run', d, 60_000));
    storage.setItem('pd-shop2', 'c'.repeat(20_000));
    storage.setItem('pd-badges', 'b');
    expect(usage(storage)).toBeGreaterThan(BUDGET_CHARS);
    const removed = trimToBudget(storage);
    expect(removed.length).toBeGreaterThan(0);
    expect(usage(storage)).toBeLessThanOrEqual(BUDGET_CHARS);
    expect(storage.getItem(KEY)).not.toBeNull();
    expect(storage.getItem(twinKey(KEY))).not.toBeNull();
    expect(storage.getItem('pd-badges')).toBe('b');
    // The farthest depths went first; the one being played stays.
    expect(storage.getItem('pd-gore:seed:run:5')).not.toBeNull();
    expect(storage.getItem('pd-gore:seed:run:26')).toBeNull();
    // Under budget: nothing is touched.
    expect(trimToBudget(storage)).toEqual([]);
    setEvictContext(() => null);
  });

  it('putWithRoom retries after each eviction and gives up when nothing is left to give', () => {
    setEvictContext(() => null);
    const storage = new MemStorage(1500);
    storage.setItem(...gore('a:b', 1, 500));
    storage.setItem(...gore('a:b', 2, 500));
    expect(putWithRoom(storage, 'pd-save', 'v'.repeat(900))).toBe(true);
    expect(storage.getItem('pd-gore:a:b:1')).toBeNull();
    expect(putWithRoom(storage, 'pd-save2', 'w'.repeat(5000))).toBe(false);
  });
});

describe('the mirror', () => {
  const withMirror = async <T>(body: (mirror: ReturnType<typeof memoryMirror>) => Promise<T> | T): Promise<T> => {
    const mirror = memoryMirror();
    setMirror(mirror);
    try {
      return await body(mirror);
    } finally {
      setMirror(null);
    }
  };

  it('is given every write of a slot, the snapshots and the journals, and forgets with it', async () => {
    await withMirror((mirror) => {
      const storage = new MemStorage();
      const keeper = new SlotKeeper(storage, KEY);
      const world = newWorld(21);
      keeper.snapshot(world, null);
      keeper.note(play(world)!, world, null);
      keeper.note(play(world)!, world, null);
      for (const key of [twinKey(KEY), journalKey(KEY), journalKey2(KEY)]) expect(mirror.data.get(key)).toBe(storage.getItem(key));
      keeper.drop();
      expect([...mirror.data.keys()]).toEqual([]);
    });
  });

  it('keeps a run safe when localStorage is full: the mirror has it', async () => {
    await withMirror(async (mirror) => {
      const world = newWorld(22);
      for (let i = 0; i < 100; i++) play(world);
      const storage = new MemStorage(5000);
      const keeper = new SlotKeeper(storage, KEY);
      expect(keeper.snapshot(world, null)).toBe(true);
      expect(storage.getItem(twinKey(KEY))).toBeNull();
      // A start finds it there.
      const fresh = new MemStorage();
      expect(await hydrate(fresh, KEY)).toBe('mirror');
      const read = readSlot(fresh, KEY);
      expect(read.run && sameWorld(read.run.world, world)).toBe(true);
      expect(mirror.data.size).toBeGreaterThan(0);
    });
  });

  it('is taken when it is further on, in the same run, and not when it is behind or the same', async () => {
    await withMirror(async (mirror) => {
      const storage = new MemStorage();
      const keeper = new SlotKeeper(storage, KEY);
      const world = newWorld(23);
      keeper.snapshot(world, null);
      for (let i = 0; i < 8; i++) keeper.note(play(world)!, world, null);
      // The same: nothing to do.
      expect(await hydrate(storage, KEY)).toBe('local');
      // The browser lost the last writes of localStorage.
      const behind = storage.cloneAt(storage.ops.length - 5);
      expect(readSlot(behind, KEY).run!.world.turn).toBeLessThan(world.turn);
      expect(await hydrate(behind, KEY)).toBe('mirror');
      expect(readSlot(behind, KEY).run && sameWorld(readSlot(behind, KEY).run!.world, world)).toBe(true);
      // The mirror is behind (IndexedDB failed for a while): localStorage stands.
      const stale = new Map(mirror.data);
      for (let i = 0; i < 6; i++) keeper.note(play(world)!, world, null);
      mirror.data.clear();
      for (const [k, v] of stale) mirror.data.set(k, v);
      expect(await hydrate(storage, KEY)).toBe('local');
      expect(readSlot(storage, KEY).run!.world.turn).toBe(world.turn);
    });
  });

  it('lets the clock decide between two runs: the numbers of a run begun anew start over', async () => {
    await withMirror(async (mirror) => {
      // An old run, far on, left in the mirror; the player has since begun another (written later), and localStorage has it.
      const old = newWorld(24);
      for (let i = 0; i < 60; i++) play(old);
      const oldKeeper = new SlotKeeper(new MemStorage(), KEY, 0, () => 1000);
      for (let i = 0; i < 20; i++) oldKeeper.snapshot(old, null);
      const fresh = newWorld(25);
      const storage = new MemStorage();
      const keeper = new SlotKeeper(storage, KEY, 0, () => 5000);
      keeper.snapshot(fresh, null);
      expect(await hydrate(storage, KEY)).toBe('local');
      // The other way: the new run is in the mirror only (localStorage lost it and shows the old one).
      const oldStorage = new MemStorage();
      mirror.data.clear();
      const k = new SlotKeeper(oldStorage, KEY, 0, () => 1000);
      k.snapshot(old, null);
      const mirrorOnly = new Map(mirror.data);
      mirror.data.clear();
      const newer = new SlotKeeper(new MemStorage(), KEY, 0, () => 9000);
      newer.snapshot(fresh, null);
      expect(mirror.data.size).toBeGreaterThan(0);
      expect(await hydrate(oldStorage, KEY)).toBe('mirror');
      expect(readSlot(oldStorage, KEY).run!.world.run.seed).toBe(fresh.run.seed);
      expect(mirrorOnly.size).toBeGreaterThan(0);
    });
  });

  it('lets go of the days gone by, and of nothing else', async () => {
    await withMirror(async (mirror) => {
      for (const key of ['pd-daily-2026-10-15', 'pd-daily-2026-10-15~2', 'pd-daily-2026-10-17', 'pd-daily-2026-10-17~j', 'pd-solo', 'pd-solo~2']) mirror.data.set(key, 'x');
      const gone = await pruneMirror((slot) => slot === 'pd-daily-2026-10-17');
      expect(gone.sort()).toEqual(['pd-daily-2026-10-15', 'pd-daily-2026-10-15~2']);
      expect([...mirror.data.keys()].sort()).toEqual(['pd-daily-2026-10-17', 'pd-daily-2026-10-17~j', 'pd-solo', 'pd-solo~2']);
    });
  });

  it('answers a mirror that is slow only so long, and never throws', async () => {
    const stuck = { put: () => undefined, remove: () => undefined, read: () => new Promise<Record<string, string>>(() => undefined), keys: () => new Promise<string[]>(() => undefined) };
    setMirror(stuck);
    try {
      expect(await hydrate(new MemStorage(), KEY, 20)).toBe('local');
      setMirror({ ...stuck, read: () => Promise.reject(new Error('blocked')) });
      expect(await hydrate(new MemStorage(), KEY)).toBe('local');
    } finally {
      setMirror(null);
    }
  });
});

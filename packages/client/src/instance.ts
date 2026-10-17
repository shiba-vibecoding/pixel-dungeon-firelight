import { leaseKey, type StorageLike } from './savestore';

/*
 * Two copies of the game open on one run. On one device (two tabs, two Telegram windows of the same origin) the run is held by a
 * lease kept in local storage next to it: whoever starts playing a run takes the lease; the older copy finds out by a storage
 * event, a broadcast message, or at the latest the next time it is about to act or write (it asks the lease first). The older
 * copy does not play on and does not write: it stands «open in another window» until the player takes the run back (which reads
 * the newer copy's save, so nothing the newer copy did is overwritten). On two devices the server's session token does the same
 * (runs.ts: a sync names the device, and the server answers «taken» to an older one).
 */

/** Names this page load: a lease and the server's token for a run are held by it. */
export const INSTANCE: string = (() => {
  const bytes = new Uint8Array(9);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('');
})();

/** What a page can hear a lease change by, besides reading the storage. */
export interface Bus {
  post(message: string): void;
  /** Calls back with every message other pages post; returns a way to stop. */
  listen(callback: (message: string) => void): () => void;
  /** Done with it. */
  close?(): void;
}

interface LeaseText {
  id: string;
  at: number;
}

export class Lease {
  private readonly name: string;
  private off: Array<() => void> = [];
  private lost = false;

  /**
   * @param storage where the lease is kept
   * @param key the run's slot
   * @param onLost called once when another page takes the lease
   * @param buses ways of hearing about it at once (a BroadcastChannel; the storage event): the lease is checked when they speak
   */
  constructor(
    private readonly storage: StorageLike,
    key: string,
    private readonly onLost: () => void,
    private readonly buses: Bus[] = [],
    private readonly id: string = INSTANCE,
    private readonly now: () => number = Date.now,
  ) {
    this.name = leaseKey(key);
    for (const bus of buses) this.off.push(bus.listen((message) => message === this.name && this.check()));
  }

  private owner(): LeaseText | null {
    try {
      const raw = this.storage.getItem(this.name);
      return raw ? (JSON.parse(raw) as LeaseText) : null;
    } catch {
      return null;
    }
  }

  /** This page takes the run (a newer copy takes over). */
  claim(): void {
    this.lost = false;
    try {
      this.storage.setItem(this.name, JSON.stringify({ id: this.id, at: this.now() } satisfies LeaseText));
    } catch {
      // A storage that cannot hold even this: there is no one to share it with either.
    }
    for (const bus of this.buses) bus.post(this.name);
  }

  /** Whether this page still holds the run. A storage that cannot be read, or holds no lease, leaves it here. */
  held(): boolean {
    if (this.lost) return false;
    const owner = this.owner();
    return !owner || owner.id === this.id;
  }

  /** Looks at the lease and, if another page has taken it, says so (once). */
  check(): boolean {
    if (this.lost) return false;
    if (this.held()) return true;
    this.lost = true;
    this.onLost();
    return false;
  }

  /** Lets go of the run (back to the title): the lease is removed if it is still this page's. */
  release(): void {
    for (const off of this.off) off();
    this.off = [];
    for (const bus of this.buses) bus.close?.();
    try {
      const owner = this.owner();
      if (!owner || owner.id === this.id) this.storage.removeItem(this.name);
    } catch {
      // Nothing was held.
    }
  }
}

/** The ways a browser page can hear of a lease: a BroadcastChannel, and the storage event (fired in the other pages of the origin). */
export function browserBuses(): Bus[] {
  const buses: Bus[] = [];
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('pd-run');
      buses.push({
        post: (message) => channel.postMessage(message),
        close: () => channel.close(),
        listen: (callback) => {
          const handler = (event: MessageEvent): void => callback(String(event.data));
          channel.addEventListener('message', handler);
          return () => channel.removeEventListener('message', handler);
        },
      });
    }
  } catch {
    // None: the storage event and the check before acting do it.
  }
  if (typeof addEventListener === 'function') {
    buses.push({
      post: () => undefined,
      listen: (callback) => {
        const handler = (event: StorageEvent): void => {
          if (event.key) callback(event.key);
        };
        addEventListener('storage', handler);
        return () => removeEventListener('storage', handler);
      },
    });
  }
  return buses;
}

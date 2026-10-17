/*
 * A second place for a run to be kept, for the way of leaving that local storage cannot survive: the whole app killed. Writing to
 * localStorage is synchronous for the page, but the browser puts it on disk later — Chromium's webviews hold a change for 5 s, and
 * after the first commit they are rate limited to about one a minute — so a process killed (the phone's memory manager, the app
 * swiped away from the recents, a flat battery) loses up to a minute of turns, however the page wrote them. IndexedDB is handed
 * to the browser at once and written out by it as soon as the transaction ends (to the operating system, which keeps it
 * through the process's death). So every write of a run to localStorage (savestore.ts) is also given to IndexedDB, without
 * waiting for it; and the start-up looks at both (hydrate) and takes the newer.
 *
 * Where there is no IndexedDB, or it fails (a private window, a blocked profile), the mirror simply is not there.
 */

export interface Mirror {
  /** Keeps a value (not waited for: writes happen in the order they were asked). */
  put(key: string, value: string): void;
  remove(keys: readonly string[]): void;
  /** The values of these keys that are kept. */
  read(keys: readonly string[]): Promise<Record<string, string>>;
}

const DB = 'pd-saves';
const STORE = 'kv';

/** The browser's IndexedDB as a mirror, or null where there is none. */
export function idbMirror(): Mirror | null {
  if (typeof indexedDB === 'undefined') return null;
  let opened: Promise<IDBDatabase | null> | null = null;
  const open = (): Promise<IDBDatabase | null> =>
    (opened ??= new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore(STORE);
        };
        request.onsuccess = () => {
          const db = request.result;
          // Another page wants to upgrade it, or the browser is closing it: let go, and open again at the next use.
          db.onversionchange = () => {
            db.close();
            opened = null;
          };
          db.onclose = () => {
            opened = null;
          };
          resolve(db);
        };
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    }));
  const write = (change: (store: IDBObjectStore) => void): void => {
    void open().then((db) => {
      if (!db) return;
      try {
        change(db.transaction(STORE, 'readwrite').objectStore(STORE));
      } catch {
        // The database was closed under us: the next write opens it again.
        opened = null;
      }
    });
  };
  return {
    put: (key, value) => write((store) => store.put(value, key)),
    remove: (keys) => write((store) => {
      for (const key of keys) store.delete(key);
    }),
    read: (keys) =>
      open().then(
        (db) =>
          new Promise<Record<string, string>>((resolve) => {
            const found: Record<string, string> = {};
            if (!db) return resolve(found);
            try {
              const transaction = db.transaction(STORE, 'readonly');
              const store = transaction.objectStore(STORE);
              for (const key of keys) {
                const request = store.get(key);
                request.onsuccess = () => {
                  if (typeof request.result === 'string') found[key] = request.result;
                };
              }
              transaction.oncomplete = () => resolve(found);
              transaction.onerror = transaction.onabort = () => resolve({});
            } catch {
              resolve({});
            }
          }),
      ),
  };
}

/** A mirror in memory (the tests'): `data` is what has been kept. */
export function memoryMirror(shared = new Map<string, string>()): Mirror & { data: Map<string, string> } {
  return {
    data: shared,
    put: (key, value) => void shared.set(key, value),
    remove: (keys) => {
      for (const key of keys) shared.delete(key);
    },
    read: async (keys) => Object.fromEntries(keys.flatMap((key) => (shared.has(key) ? [[key, shared.get(key)!]] : []))),
  };
}

import { onActiveChange, onViewportChange } from './telegram';

/*
 * The ways a page is left, gathered in one place so that whatever must be written before it is gone is written on every one of
 * them: the tab or Mini App hidden (visibilitychange), the page going (pagehide, and beforeunload where pagehide does not come),
 * the browser freezing it (Page Lifecycle `freeze`: a page put to sleep in the background may never wake), and Telegram's own
 * events: `deactivated` (Bot API 8.0: the app minimised), and the viewport changing (a swipe down starts the app's folding: in
 * older Telegrams it is the only sign before the webview is put away). A handler must be synchronous and quick: only
 * synchronous storage writes and keepalive requests survive a page that is going.
 */

export type LeaveReason = 'hidden' | 'pagehide' | 'beforeunload' | 'freeze' | 'deactivated' | 'viewport';

const handlers = new Set<(reason: LeaveReason) => void>();
const late = new Set<(reason: LeaveReason) => void>();

/**
 * Calls back whenever the page is being left or put away; returns a way to stop listening. A `last` handler comes after the rest:
 * what is only nice to keep (the bodies and blood of a fight) goes after the run itself has been written.
 */
export function onLeave(handler: (reason: LeaveReason) => void, last = false): () => void {
  const set = last ? late : handlers;
  set.add(handler);
  return () => set.delete(handler);
}

let lastViewport = 0;

/** Tells every handler (exported for the tests and for a caller that knows better, such as a crash screen). */
export function leaving(reason: LeaveReason): void {
  for (const handler of [...handlers, ...late]) {
    try {
      handler(reason);
    } catch (error) {
      console.error(error);
    }
  }
}

if (typeof document !== 'undefined' && typeof addEventListener === 'function') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') leaving('hidden');
  });
  addEventListener('pagehide', () => leaving('pagehide'));
  addEventListener('beforeunload', () => leaving('beforeunload'));
  document.addEventListener('freeze', () => leaving('freeze'));
  onActiveChange((active) => {
    if (!active) leaving('deactivated');
  });
  // A swipe down fires this over and over: once in a couple of seconds is enough.
  onViewportChange(() => {
    const now = Date.now();
    if (now - lastViewport < 2000) return;
    lastViewport = now;
    leaving('viewport');
  });
}

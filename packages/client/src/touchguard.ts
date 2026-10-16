/*
 * Protection from accidental touches on the map. A phone is held by its edges and often lies on a palm, a thumb strays onto the
 * gesture bar, the app comes back from the background under a finger that was already on its way: none of that is a tap. Pure
 * rules here, no DOM and no clock of their own (main.ts feeds pointers with their timestamps, test/touchguard.test.ts runs it
 * under a virtual one). The guard sits in front of the map's pointer handlers only: the HUD and the toolbar are page elements
 * over the canvas and never reach it, so their buttons are never held back.
 *
 *   - a contact bigger than a fingertip (the platform's `width`/`height`, where it reports them) is a palm: the map never sees
 *     it, and no tap counts while it is down;
 *   - a touch that lands within 12 CSS pixels of the left and right edges or the bottom one (more where the phone or Telegram
 *     says the system takes more: safe areas) is a grip, not a tap; it is not counted as a second finger, or a thumb holding
 *     the phone would swallow every tap;
 *   - the first touch within 400 ms of the app coming back from the background is dropped;
 *   - a tap that begins or ends with another finger down is not a tap (two fingers are a pinch; the camera already treats them so).
 *
 * A mouse is exempt from all of it. The player can turn the guard off in the settings.
 */

/** A touch this close to the screen's left, right and bottom edges is ignored (CSS pixels). */
export const EDGE_PX = 12;
/** A contact wider or taller than this is a palm, not a fingertip (CSS pixels): a fingertip reports 20-60 on phones, a palm 120 and more. */
export const PALM_PX = 100;
/** The first touch within this long of coming back to the app is dropped (ms). */
export const RESUME_MS = 400;

export type Reason = 'palm' | 'edge' | 'resume';

/** A pointer coming down: where (CSS pixels, in the window), how big a contact, what kind, when. */
export interface Contact {
  id: number;
  x: number;
  y: number;
  /** The contact's size, CSS pixels; 0 or 1 when the platform does not say. */
  width: number;
  height: number;
  /** PointerEvent.pointerType: 'touch', 'pen' or 'mouse'. */
  kind: string;
  /** Milliseconds, on the clock `resumed` uses. */
  time: number;
}

/** The window (CSS pixels) and the room the system claims at its sides and bottom (the safe areas). */
export interface Screen {
  width: number;
  height: number;
  left: number;
  right: number;
  bottom: number;
}

interface Down {
  /** Whether it counts as a finger on the screen for the others (a grip does not). */
  counts: boolean;
  /** Not for the map: the guard kept it away from the camera. */
  blocked: Reason | null;
  /** Another finger was down at some moment of its life: it is not a tap. */
  contested: boolean;
}

export class TouchGuard {
  /** The settings' switch. */
  enabled = true;
  /** How many touches were held back, by reason (for the problem report). */
  readonly held: Record<Reason, number> = { palm: 0, edge: 0, resume: 0 };

  private resumedAt = -Infinity;
  private resumePending = false;
  private readonly down = new Map<number, Down>();

  /** The app came back from the background at `time`: the first touch within `RESUME_MS` is dropped. */
  resumed(time: number): void {
    this.resumedAt = time;
    this.resumePending = true;
  }

  /** The app left the background: touches that were down are gone with it. */
  reset(): void {
    this.down.clear();
  }

  /**
   * A pointer came down. Returns why the map must not see it, or null when it may. A pointer that passes while another finger is
   * down is let through (a pinch needs both) but neither is a tap any more.
   */
  press(contact: Contact, screen: Screen): Reason | null {
    const entry: Down = { counts: true, blocked: null, contested: false };
    if (this.enabled && contact.kind !== 'mouse') {
      if (Math.max(contact.width, contact.height) > PALM_PX) entry.blocked = 'palm';
      else if (isEdge(contact, screen)) {
        entry.blocked = 'edge';
        entry.counts = false;
      } else if (this.resumePending && contact.time - this.resumedAt >= 0 && contact.time - this.resumedAt <= RESUME_MS) {
        entry.blocked = 'resume';
        entry.counts = false;
      }
      // Whether or not this was it, a touch has come since the return: the window for the first one is over.
      if (this.resumePending && contact.time - this.resumedAt > RESUME_MS) this.resumePending = false;
      if (entry.blocked === 'resume') this.resumePending = false;
      if (entry.counts) {
        for (const other of this.down.values()) {
          if (!other.counts) continue;
          other.contested = true;
          entry.contested = true;
        }
      }
      if (entry.blocked) this.held[entry.blocked]++;
    } else if (contact.kind !== 'mouse') {
      // Off: nothing is held back, but fingers are still counted, so switching it on mid-gesture is harmless.
      for (const other of this.down.values()) {
        other.contested = true;
        entry.contested = true;
      }
    }
    this.down.set(contact.id, entry);
    return entry.blocked;
  }

  /** Whether the pointer was kept from the map (so its moves and lift are not the camera's either). */
  blocked(id: number): boolean {
    return this.down.get(id)?.blocked != null;
  }

  /**
   * The pointer went up (or was cancelled). Returns whether the tap the camera makes of it may be acted on: not for a held-back
   * pointer, and not for one that shared the screen with another finger.
   */
  release(id: number): boolean {
    const entry = this.down.get(id);
    this.down.delete(id);
    if (!entry) return true;
    if (!this.enabled) return true;
    return entry.blocked === null && !entry.contested;
  }
}

function isEdge(contact: Contact, screen: Screen): boolean {
  const left = Math.max(EDGE_PX, screen.left);
  const right = Math.max(EDGE_PX, screen.right);
  const bottom = Math.max(EDGE_PX, screen.bottom);
  return contact.x < left || contact.x > screen.width - right || contact.y > screen.height - bottom;
}

const KEY = 'pd-touch-guard';

/** Whether the guard is on (the settings): on unless the player turned it off. */
export const touchGuardSetting = {
  on: ((): boolean => {
    try {
      return localStorage.getItem(KEY) !== 'off';
    } catch {
      return true;
    }
  })(),
  set(on: boolean): void {
    this.on = on;
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      // For this session only.
    }
  },
};

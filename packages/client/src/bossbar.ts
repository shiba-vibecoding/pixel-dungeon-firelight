/*
 * The boss's health bar under the HUD (the designer's, fl-p13.css; the rest in fl-boss.css): its icon, its name, and a long bar with a
 * pale «ghost» behind the fill, the health just lost, which waits a moment and then catches up slowly, so the size of a blow is seen. A
 * heal (the machine mending) lifts the fill at once and flashes it green with a word. The ghost is `HpGhost`, plain numbers for the
 * tests (test/bossbar.test.ts); the bar is the page element that shows it, changed only when a number has moved by a pixel.
 */

/** How long the ghost waits after a blow before it starts to follow, ms; and how fast it follows (the share of the bar a second). */
export const GHOST_HOLD_MS = 420;
export const GHOST_RATE = 0.09;
/** And the pull on it that grows with the gap, so a big blow's ghost does not drag for ten seconds. */
export const GHOST_PULL = 0.55;

/** The health a bar shows and the trail of what was lost, as shares of the whole (0 to 1). */
export class HpGhost {
  /** The health. */
  hp = 1;
  /** The most recent health lost, still shown as a pale strip behind the fill: never under `hp`. */
  ghost = 1;
  /** A heal just lifted the fill (for the flash), and when. */
  healedAt = -1e9;
  /** A blow just landed (for the flash), and when. */
  hitAt = -1e9;
  private holdUntil = 0;
  private started = false;

  /** Where the bar starts: full, or at the share the fight is found at. */
  reset(frac = 1): void {
    this.hp = this.ghost = clamp(frac);
    this.holdUntil = 0;
    this.healedAt = this.hitAt = -1e9;
    this.started = false;
  }

  /**
   * One frame: the health is now `frac`, `dt` ms since the last frame. `calm` (reduced motion) lets the ghost go at once after its wait,
   * with no slow slide. Returns whether anything moved.
   */
  update(frac: number, now: number, dt: number, calm = false): boolean {
    frac = clamp(frac);
    const was = `${this.hp}/${this.ghost}`;
    if (!this.started) {
      // The first sight of the boss: no trail for what was lost before the bar came.
      this.started = true;
      this.hp = this.ghost = frac;
      return true;
    }
    if (frac < this.hp - 1e-6) {
      // Wounded: the strip left behind starts where the fill was (or stays where it was, if it has not caught up yet).
      this.ghost = Math.max(this.ghost, this.hp);
      this.holdUntil = now + GHOST_HOLD_MS;
      this.hitAt = now;
    } else if (frac > this.hp + 1e-6) {
      // Mended: the fill rises at once and the strip goes with it.
      this.healedAt = now;
      this.ghost = frac;
    }
    this.hp = frac;
    if (this.ghost > this.hp && now >= this.holdUntil) {
      if (calm) this.ghost = this.hp;
      else {
        const gap = this.ghost - this.hp;
        this.ghost = Math.max(this.hp, this.ghost - (GHOST_RATE + gap * GHOST_PULL) * (dt / 1000));
      }
    }
    return was !== `${this.hp}/${this.ghost}`;
  }
}

const clamp = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  made.className = className;
  if (text !== undefined) made.textContent = text;
  return made;
}

/** What the bar is told when a boss takes the stage. */
export interface BarBoss {
  /** `goo`, `tengu`...: the bar's icon comes with it (the designer's fl-p13.css: `.fl-bossbar.goo`). */
  kind: string;
  name: string;
  /** The line after the name (the epithet). */
  epithet?: string;
}

/**
 * The bar is the designer's (fl-p13.css: the frame, the icon and the colours of the bar; `--v` the health, `--was` the pale trace of what
 * was just lost); this class fills it, and drives the trace itself, easing it down from `HpGhost` (fl-boss.css puts the stylesheet's own
 * transition away), so it waits and then catches up slowly.
 */
export class BossBar {
  private readonly root = node('div', 'fl-bossbar');
  private readonly icon = node('span', 'icon');
  private readonly name = node('span', 'who');
  private readonly small = node('small', '');
  private readonly note = node('em', 'note');
  private readonly track = node('div', 'track');
  private shown = { v: -1, was: -1 };
  private noteUntil = 0;
  private on = false;
  private hideTimer = 0;
  private stripAt = 0;

  constructor(host: HTMLElement) {
    this.root.setAttribute('aria-hidden', 'true');
    this.root.hidden = true;
    const title = node('div', 'name');
    title.append(this.name, this.small, this.note);
    this.track.append(node('i', 'trace'), node('i', 'fill'), node('i', 'ticks'));
    this.root.append(this.icon, title, this.track);
    host.append(this.root);
  }

  /** Takes the stage: drops in under the HUD. */
  show(boss: BarBoss): void {
    window.clearTimeout(this.hideTimer);
    this.root.className = `fl-bossbar ${boss.kind}`;
    this.name.textContent = boss.name;
    this.small.textContent = boss.epithet ?? '';
    this.note.textContent = '';
    this.shown = { v: -1, was: -1 };
    this.root.hidden = false;
    // The drop-in of the designer's CSS plays from the start each time.
    this.root.style.animation = 'none';
    void this.root.offsetWidth;
    this.root.style.animation = '';
    this.on = true;
    this.strip();
  }

  /** What hangs under the bar (the toasts, the net strip) is pushed down by the bar's own height. */
  private strip(): void {
    const h = this.root.hidden ? 0 : Math.ceil(this.root.getBoundingClientRect().height) + 6;
    document.documentElement.style.setProperty('--boss-strip', `${h}px`);
  }

  get visible(): boolean {
    return this.on;
  }

  /** Where the bar ends on the page (px), for what hangs from it. */
  bottom(): number {
    return this.root.getBoundingClientRect().bottom;
  }

  /** Puts the bar's numbers on screen (only what changed, a pixel's worth). */
  draw(g: HpGhost, now: number, rage: boolean): void {
    if (!this.on) return;
    const v = Math.round(g.hp * 400) / 400;
    const was = Math.round(g.ghost * 400) / 400;
    if (v !== this.shown.v) {
      this.shown.v = v;
      this.root.style.setProperty('--v', String(v));
    }
    if (was !== this.shown.was) {
      this.shown.was = was;
      this.root.style.setProperty('--was', String(was));
    }
    const hit = now - g.hitAt < 140;
    const heal = now - g.healedAt < 900;
    const cl = this.root.classList;
    cl.toggle('rage', rage);
    cl.toggle('hit', hit && !heal);
    cl.toggle('heal', heal);
    if (this.on && now - this.stripAt > 500) {
      this.stripAt = now;
      this.strip();
    }
    if (this.noteUntil && now >= this.noteUntil) {
      this.noteUntil = 0;
      this.note.textContent = '';
    }
  }

  /** A word at the end of the name's line for a while (a phase, the machine mending): empty puts it away. */
  say(text: string, now: number, ms: number): void {
    this.note.textContent = text;
    this.noteUntil = text ? now + ms : 0;
  }

  /** The boss is down: the bar greys and goes after a moment. */
  fall(ms = 1600): void {
    if (!this.on) return;
    this.root.classList.add('dead');
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.hide(), ms);
  }

  hide(): void {
    window.clearTimeout(this.hideTimer);
    if (!this.on) return;
    this.on = false;
    this.root.hidden = true;
    document.documentElement.style.setProperty('--boss-strip', '0px');
  }

  /** Away at once (a new floor, a new run). */
  clear(): void {
    window.clearTimeout(this.hideTimer);
    this.on = false;
    this.root.hidden = true;
    this.root.classList.remove('dead', 'heal', 'hit', 'rage');
    document.documentElement.style.setProperty('--boss-strip', '0px');
  }
}

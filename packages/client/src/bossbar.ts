/*
 * The boss's health bar at the top of the screen (fl-boss.css): its portrait, its name, and a long bar with a pale «ghost» behind the
 * fill, the health just lost, which waits a moment and then catches up slowly, so the size of a blow is seen. Notches on the bar mark
 * the phases (a quarter, a half, three quarters). A heal (the machine mending) lifts the fill at once and flashes it green with a word.
 * The ghost is `HpGhost`, plain numbers for the tests (test/bossbar.test.ts); the bar is the page element that shows it, changed only
 * when a number has moved by a pixel.
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
  /** `goo`, `tengu`...: the bar's colours come with it (fl-boss.css). */
  kind: string;
  name: string;
  portrait: string;
  accent: string;
  /** The word on the bar for a phase, when there is one (the machine's mending). */
  epithet?: string;
}

export class BossBar {
  private readonly root = node('div', 'fl-bossbar');
  private readonly face = node('img', 'fl-bossbar-face');
  private readonly name = node('span', 'fl-bossbar-name');
  private readonly note = node('span', 'fl-bossbar-note');
  private readonly track = node('div', 'fl-bossbar-track');
  private readonly ghostEl = node('i', 'fl-bossbar-ghost');
  private readonly fillEl = node('i', 'fl-bossbar-fill');
  private readonly numbers = node('span', 'fl-bossbar-num');
  private shown = { fill: -1, ghost: -1, text: '' };
  private noteUntil = 0;
  private on = false;
  private hideTimer = 0;

  constructor(host: HTMLElement) {
    this.root.setAttribute('aria-hidden', 'true');
    this.face.alt = '';
    const head = node('div', 'fl-bossbar-head');
    head.append(this.name, this.note);
    this.track.append(this.ghostEl, this.fillEl);
    for (const at of [25, 50, 75]) {
      const notch = node('b', `fl-bossbar-notch${at === 50 ? ' half' : ''}`);
      notch.style.left = `${at}%`;
      this.track.append(notch);
    }
    this.track.append(this.numbers);
    const main = node('div', 'fl-bossbar-main');
    main.append(head, this.track);
    this.root.append(this.face, main);
    host.append(this.root);
  }

  /** Takes the stage: slides in under the HUD. */
  show(boss: BarBoss): void {
    window.clearTimeout(this.hideTimer);
    this.root.dataset.boss = boss.kind;
    this.root.style.setProperty('--boss', boss.accent);
    this.face.src = boss.portrait;
    this.name.textContent = boss.name;
    this.note.textContent = boss.epithet ?? '';
    this.shown = { fill: -1, ghost: -1, text: '' };
    this.root.classList.remove('dead', 'heal', 'hit', 'rage', 'out');
    // The page measures it before the class lands, so the slide is seen.
    void this.root.offsetWidth;
    this.root.classList.add('on');
    this.on = true;
    document.documentElement.style.setProperty('--boss-strip', '46px');
  }

  get visible(): boolean {
    return this.on;
  }

  /** Where the bar ends on the page (px), for what hangs from it. */
  bottom(): number {
    return this.root.getBoundingClientRect().bottom;
  }

  /** Puts the bar's numbers on screen (only what changed). */
  draw(g: HpGhost, hp: number, ht: number, now: number, rage: boolean): void {
    if (!this.on) return;
    const fill = Math.round(g.hp * 500) / 5;
    const ghost = Math.round(g.ghost * 500) / 5;
    if (fill !== this.shown.fill) {
      this.shown.fill = fill;
      this.fillEl.style.width = `${fill}%`;
    }
    if (ghost !== this.shown.ghost) {
      this.shown.ghost = ghost;
      this.ghostEl.style.width = `${ghost}%`;
    }
    const text = `${Math.max(0, Math.ceil(hp))}/${ht}`;
    if (text !== this.shown.text) {
      this.shown.text = text;
      this.numbers.textContent = text;
    }
    this.root.classList.toggle('rage', rage);
    // A blow lights the fill for a moment; a mending turns it green for longer.
    const hit = now - g.hitAt < 140;
    const heal = now - g.healedAt < 900;
    this.root.classList.toggle('hit', hit && !heal);
    this.root.classList.toggle('heal', heal);
    if (this.noteUntil && now >= this.noteUntil) {
      this.noteUntil = 0;
      this.note.textContent = '';
      this.note.classList.remove('lit');
    }
  }

  /** A word beside the name for a while (a phase, the machine mending): `text` empty puts it away. */
  say(text: string, now: number, ms: number): void {
    this.note.textContent = text;
    this.note.classList.toggle('lit', text !== '');
    this.noteUntil = text ? now + ms : 0;
  }

  /** The boss is down: the bar empties, greys and goes after a moment. */
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
    this.root.classList.remove('on');
    this.root.classList.add('out');
    document.documentElement.style.setProperty('--boss-strip', '0px');
  }

  /** Away at once (a new floor, a new run). */
  clear(): void {
    window.clearTimeout(this.hideTimer);
    this.on = false;
    this.root.classList.remove('on', 'dead', 'heal', 'hit', 'rage');
    this.root.classList.remove('out');
    document.documentElement.style.setProperty('--boss-strip', '0px');
  }
}

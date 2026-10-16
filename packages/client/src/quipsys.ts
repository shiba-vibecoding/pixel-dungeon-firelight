import type { Effect, Hero } from '@pd/core';
import { audio } from './audio';
import { lang } from './i18n';
import { lazy } from './lazy';
import { FADE_MS, holdFor, LAST_WORDS_HOLD_MS, type Moment, POP_MS, QuipPicker, type QuipClass, quipMode, type QuipData } from './quips';
import { QuipWatch } from './quipwatch';

/*
 * The hero's quips on the screen: the turn's effects go to the watch (what happened), the picker (whether and what to say), then the
 * bubble over the hero's head and a muted line in the log. The lines are a chunk of their own, fetched in the language shown.
 * The bubble is timed by the frame clock (it waits while a window covers the game); main.ts tells the draw pace while it is up.
 */

/** The log's muted colour for a quip (view.ts gives it the «quip» tone). */
export const QUIP_LOG_COLOR = '#9a9a8c';

const data = lazy<QuipData>(() => (lang === 'ru' ? import('./quips-ru').then((m) => m.ruQuips) : import('./quips-en').then((m) => m.enQuips)));

/** The hero's head on the interface layer, and the layer's size (both in its own units). */
export interface QuipAnchor {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Gap between the bubble's tail and the hero's head. */
const GAP = 10;
const MARGIN = 8;

class QuipSystem {
  private readonly watch = new QuipWatch();
  private picker: QuipPicker | null = null;
  private say: (text: string) => void = () => undefined;
  private host: HTMLElement | null = null;
  private node: HTMLElement | null = null;
  private body: HTMLElement | null = null;
  private shownAt = 0;
  private lastFrame = 0;
  private hold = 0;
  private last = false;
  private shown = false;
  private measured = { w: 0, h: 0 };
  /** What was said last, for the dev console and the tests of the page. */
  lastLine = '';

  /** @param say puts a line in the game's log */
  init(host: HTMLElement, say: (text: string) => void): void {
    this.host = host;
    this.say = say;
    // Fetched in the spare time of the first screen; a quip before it has come is simply not said.
    void data.get().catch(() => undefined);
  }

  /** A new run: the watch forgets its kills and the thieves. */
  reset(): void {
    this.watch.reset();
    this.picker?.reset();
    this.hide();
  }

  /** The bubble is on screen (or waiting behind a window): the map is drawn at full pace meanwhile. */
  get active(): boolean {
    return this.shown;
  }

  /** How much longer the death window waits, ms: the last words are still being said. */
  deathDelay(): number {
    return this.shown && this.last ? 2300 : 0;
  }

  /** The effects of a turn: what the hero did in them may be worth a word. */
  effects(effects: readonly Effect[], me: Hero, turn: number, now: number): void {
    if (effects.length === 0 || quipMode.value === 'off') return;
    const moment = this.watch.read(effects, me, turn);
    if (moment) this.offer(moment, me.heroClass, now);
  }

  /** A moment the effects do not tell (going down): said, or not, by the picker's rules. */
  offer(moment: Moment, heroClass: QuipClass, now: number): void {
    const lines = data.ready();
    if (!lines) return;
    this.picker ??= new QuipPicker(lines);
    const line = this.picker.offer(moment, heroClass, now);
    if (line === null) return;
    this.lastLine = line;
    this.say(`«${line}»`);
    this.show(line, now, moment === 'death');
  }

  private show(text: string, now: number, last: boolean): void {
    if (!this.host) return;
    if (!this.node) {
      const node = document.createElement('div');
      node.className = 'pd-quip';
      node.setAttribute('aria-hidden', 'true');
      const body = document.createElement('div');
      body.className = 'pd-quip-body';
      node.append(body);
      this.host.append(node);
      this.node = node;
      this.body = body;
    }
    const node = this.node;
    this.body!.textContent = text;
    this.hold = last ? LAST_WORDS_HOLD_MS : holdFor(text);
    this.last = last;
    this.shownAt = this.lastFrame = now;
    this.shown = true;
    node.hidden = false;
    node.classList.remove('out', 'pop');
    node.classList.toggle('last', last);
    // Out of sight until the frame places it: it must not show for a frame at the wrong place.
    node.style.visibility = 'hidden';
    this.measured = { w: node.offsetWidth, h: node.offsetHeight };
    // The pop restarts even if the last bubble was still up.
    void node.offsetWidth;
    node.classList.add('pop');
    audio.play('quip', 1, 0.5);
  }

  private hide(): void {
    this.shown = false;
    if (this.node) this.node.hidden = true;
  }

  /**
   * Once a frame while the bubble is up. `anchor`: the hero's head on the interface layer. `covered`: a window is over the game, and
   * the bubble waits (its time stops) rather than speak over it.
   */
  frame(now: number, anchor: QuipAnchor, covered: boolean): void {
    const node = this.node;
    if (!this.shown || !node) return;
    const dt = Math.max(0, now - this.lastFrame);
    this.lastFrame = now;
    if (covered) {
      this.shownAt += dt;
      node.style.visibility = 'hidden';
      return;
    }
    const age = now - this.shownAt;
    if (age >= POP_MS + this.hold + FADE_MS) {
      this.hide();
      return;
    }
    if (age >= POP_MS + this.hold) node.classList.add('out');
    node.style.visibility = '';
    const { w, h } = this.measured;
    const left = Math.min(Math.max(anchor.x - w / 2, MARGIN), Math.max(MARGIN, anchor.w - w - MARGIN));
    const top = Math.max(MARGIN, anchor.y - h - GAP);
    const tail = Math.min(Math.max(anchor.x - left, 12), Math.max(12, w - 12));
    node.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    node.style.setProperty('--tail', `${Math.round(tail)}px`);
  }
}

export const quipSys = new QuipSystem();

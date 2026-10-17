import type { Hero, Item, MobKind, World } from '@pd/core';
import { audio } from './audio';
import { capitalize, t } from './i18n';
import { itemInfo, itemName } from './itemtext';
import { quality } from './quality';
import type { QuestId } from './questcard';
import { PORTRAIT_OF, rewardKind } from './questart';
import type { Mood } from './questtalk';
import { Q } from './quest-text';
import { button, el, itemIcon, mobSprite, show, slot, windowOf } from './screens';
import { frameAt } from './sprites';
import { schedule, shown } from './typewriter';

/*
 * A word with a quest giver, as the fork stages it: the giver's portrait of the designer's (part 13: the calm, pleased or annoyed face of the
 * moment, in its niche; the Rat King has none and keeps his idle sprite in a frame of its own), the words coming out letter by letter with a blip (a tap brings the rest out at once), a few little replies for the player to tap
 * (cosmetic: «Fine», «Later», «And what do I get?» only close the window or ask the giver for a word more), and, when a reward is
 * earned, the «quest complete» line with its fanfare and the reward cards coming up one after another.
 * What is really chosen (the ghost's gift, the wandmaker's wand, the curse's yes and no) is passed in as it always was, untouched.
 */

/** Each giver's voice: the playing rate of the blip (low for the troll, high for the imp). */
export const VOICE_RATE: Readonly<Record<QuestId, number>> = { ghost: 0.8, wandmaker: 1.15, smith: 0.55, imp: 1.45 };

/** A reply the player taps: a label, and what the giver says back (the reply is then used up). */
export interface TalkReply {
  label: string;
  answer?: string;
}

export interface TalkOptions {
  world: World;
  hero: Hero;
  id: QuestId;
  kind: MobKind;
  text: string;
  /** Cosmetic replies; the first closes the window (the yes), the rest ask for a word more or close. */
  replies?: readonly TalkReply[];
  /** The label of the one button of a farewell. */
  bye?: string;
  /** Rewards on offer, one of which the hero may take. */
  offers?: readonly Item[];
  onChoose?(index: number): void;
  /** A real question (the curse's yes and no): no cross, the first answer is the yes. */
  answers?: ReadonlyArray<{ label: string; onAnswer(): void }>;
  /** The errand is done: the banner and the fanfare when the words are out. */
  complete?: boolean;
  /** The face of the portrait for this moment (calm when not said). */
  mood?: Mood;
  onClose(): void;
}

const reduced = (): boolean => quality.reducedMotion;

/**
 * The giver's face: the designer's portrait in its niche, in the mood of the moment, with a `speaks` class while it talks (the face
 * bobs a pixel). A giver without a portrait (the Rat King) is shown as his own idle sprite in the old frame.
 */
export function talkFace(kind: MobKind, id: QuestId, mood: Mood = 'calm'): { node: HTMLElement; talking(on: boolean): void } {
  const npc = PORTRAIT_OF[kind];
  if (!npc) return talkFrame(kind, id);
  const node = el('div', { className: `fl-portrait ${npc} ${mood}` });
  // The window's title names who it is; the picture is only a face.
  node.setAttribute('aria-hidden', 'true');
  return { node, talking: (on) => node.classList.toggle('speaks', on) };
}

/** The giver in its frame: a canvas that idles on the giver's own animation, and a `talking` class while it speaks. */
export function talkFrame(kind: MobKind, id: QuestId): { node: HTMLElement; talking(on: boolean): void } {
  const sprite = mobSprite(kind);
  const node = el('div', { className: `fl-qframe ${id}` });
  const stage = el('div', { className: 'fl-qstage' });
  node.append(stage, el('i', { className: 'fl-qmote a' }), el('i', { className: 'fl-qmote b' }), el('i', { className: 'fl-qmote c' }));
  if (sprite) {
    const { sheet } = sprite;
    const canvas = el('canvas', { width: sheet.w, height: sheet.h });
    const scale = Math.max(1, Math.min(6, Math.floor(76 / Math.max(sheet.w, sheet.h))));
    canvas.style.width = `${sheet.w * scale}px`;
    canvas.style.height = `${sheet.h * scale}px`;
    stage.append(canvas);
    const c = canvas.getContext('2d');
    const start = performance.now();
    let last = -1;
    const draw = (): void => {
      if (!c) return;
      const frame = frameAt(sprite.anims.idle, performance.now() - start);
      if (frame === last) return;
      last = frame;
      c.clearRect(0, 0, sheet.w, sheet.h);
      c.drawImage(sheet.image, (frame % sheet.cols) * sheet.w, Math.floor(frame / sheet.cols) * sheet.h, sheet.w, sheet.h, 0, 0, sheet.w, sheet.h);
    };
    draw();
    // The idle animation plays while the window is up; the loop ends with the window.
    const loop = (): void => {
      if (!node.isConnected) return;
      draw();
      requestAnimationFrame(loop);
    };
    if (!reduced() && typeof requestAnimationFrame === 'function') requestAnimationFrame(loop);
  }
  return { node, talking: (on) => node.classList.toggle('talking', on) };
}

/** The speech: a paragraph whose letters come out on the typewriter's schedule; `skip` brings the rest out at once. */
export class Speech {
  readonly node: HTMLElement;
  private readonly out = document.createTextNode('');
  private readonly rest = el('span', { className: 'fl-speech-rest' });
  private times: ReturnType<typeof schedule> = schedule('');
  private text = '';
  private startAt = 0;
  private count = 0;
  private frame = 0;
  private finished = true;
  private onDone: (() => void) | null = null;

  constructor(private readonly rate: number, private readonly onTalking: (on: boolean) => void) {
    this.node = el('p', { className: 'pd-speech fl-speech' }, this.out, this.rest);
    this.node.setAttribute('aria-live', 'polite');
  }

  get done(): boolean {
    return this.finished;
  }

  /** Starts a line. Under reduced motion (and for a screen reader's sake: the whole line is in the node's text) it is out at once. */
  start(text: string, onDone: () => void): void {
    cancelAnimationFrame(this.frame);
    this.text = text;
    this.times = schedule(text);
    this.count = 0;
    this.onDone = onDone;
    this.finished = false;
    this.startAt = performance.now();
    this.render(0);
    if (reduced() || typeof requestAnimationFrame !== 'function') {
      this.skip();
      return;
    }
    this.onTalking(true);
    const step = (): void => {
      if (this.finished) return;
      // The window went away (closed, or another put up): nothing more to type.
      if (!this.node.isConnected) {
        this.finished = true;
        this.onTalking(false);
        return;
      }
      const n = shown(this.times, performance.now() - this.startAt);
      if (n > this.count) {
        const ch = this.text[n - 1]!;
        if (ch.trim() !== '' && n % 3 === 0) audio.play('talkBlip', this.rate, 0.35);
        this.render(n);
      }
      if (n >= this.text.length) this.finish();
      else this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  /** A tap: the rest comes out at once. */
  skip(): void {
    if (this.finished) return;
    this.render(this.text.length);
    this.finish();
  }

  private finish(): void {
    cancelAnimationFrame(this.frame);
    this.finished = true;
    this.onTalking(false);
    this.onDone?.();
  }

  /** The letters out, and the rest laid out unseen so that the window does not grow as the words come. */
  private render(n: number): void {
    this.count = n;
    this.out.data = this.text.slice(0, n);
    this.rest.textContent = this.text.slice(n);
  }
}

/** The reward cards: the same as ever (the item, what it is, «Take»), coming up one after another once the words are out. */
function rewardCards(options: TalkOptions): HTMLElement | null {
  const offers = options.offers ?? [];
  if (offers.length === 0) return null;
  const { hero } = options;
  // The rewards are shown for what they are.
  const world = { ...options.world, known: [...options.world.known, ...offers.map((item) => item.kind)] };
  const card = (item: Item, index: number): HTMLElement => {
    // The reward stands on its giver's podium of light (the designer's reward.png); the item is drawn on it.
    const podium = rewardKind(options.id, index);
    const cell = podium ? el('div', { className: `fl-reward-slot ${podium}`, ariaLabel: capitalize(itemName(world, item)) }, itemIcon(world, item)) : slot(world, item, { hero });
    const node = el(
      'div',
      { className: 'pd-reward fl-reveal' },
      cell,
      el('div', { className: 'pd-reward-name', textContent: capitalize(itemName(world, item)) }),
      el('div', { className: 'pd-reward-desc', textContent: itemInfo(world, hero, item).join(' ') }),
      button(t.take, () => {
        options.onChoose?.(index);
        options.onClose();
      }, offers.length === 1 ? 'primary small' : 'small'),
    );
    node.style.setProperty('--n', String(index));
    return node;
  };
  return el('div', { className: 'pd-rewards fl-rewards' }, ...offers.map(card));
}

/** The dialogue with a quest giver. */
export function showTalk(options: TalkOptions): void {
  const { id, kind } = options;
  const frame = talkFace(kind, id, options.mood);
  const speech = new Speech(VOICE_RATE[id], frame.talking);
  const banner = options.complete
    ? el('div', { className: 'fl-qbanner' }, el('i', { className: 'fl-qstar' }), el('span', { textContent: Q.talk.done }), el('i', { className: 'fl-qstar' }))
    : null;
  const cards = rewardCards(options);
  const hint = el('div', { className: 'pd-note fl-speech-hint', textContent: Q.talk.skip });
  const replies = el('div', { className: 'fl-replies' });
  const body = el('div', { className: 'pd-scroll pd-stack fl-talk' }, speech.node, hint, banner, cards);
  const real = options.answers ?? [];
  const box = windowOf(
    { title: capitalize(t.mobs[kind]), sub: Q.role[id], icon: frame.node, onClose: real.length > 0 ? undefined : options.onClose, className: `fl-talk-window${PORTRAIT_OF[kind] ? ' fl-dialog' : ''} ${id}` },
    body,
    replies,
  );

  // The replies are laid out from the start (the window does not grow when they come) and shown once the words are out; each one
  // that asks for a word more is used up as it is asked.
  const spent = new Set<number>();
  const buildReplies = (): void => {
    replies.classList.remove('shown');
    replies.replaceChildren();
    if (real.length > 0) {
      replies.append(
        el('div', { className: 'pd-confirm-actions' }, ...real.map((answer, i) => button(answer.label, () => {
          answer.onAnswer();
          options.onClose();
        }, i === 0 ? 'primary' : 'quiet'))),
      );
      return;
    }
    if (options.bye) {
      replies.append(button(options.bye, options.onClose, 'primary'));
      return;
    }
    const list = options.replies ?? [];
    if (list.length === 0) return;
    const [yes, ...others] = list;
    // The yes on top, then what can still be asked, then the way out.
    replies.append(button(yes!.label, options.onClose, 'primary'));
    const row = el('div', { className: 'fl-reply-grid' });
    for (const reply of others) {
      const index = list.indexOf(reply);
      if (reply.answer === undefined) continue;
      if (spent.has(index)) continue;
      row.append(button(reply.label, () => {
        spent.add(index);
        hint.classList.remove('gone');
        buildReplies();
        speech.start(reply.answer!, showReplies);
      }, 'small'));
    }
    if (row.childElementCount > 0) replies.append(row);
    // The way out sits alone at the bottom.
    for (const reply of others) if (reply.answer === undefined) replies.append(button(reply.label, options.onClose, 'quiet small'));
  };
  const showReplies = (): void => {
    hint.classList.add('gone');
    replies.classList.add('shown');
  };
  buildReplies();

  let played = false;
  const reveal = (): void => {
    showReplies();
    // The reward: the line, the fanfare, the cards one after another (once, however many lines the giver says).
    if ((options.complete || (options.offers?.length ?? 0) > 0) && !played) {
      played = true;
      audio.play('questFanfare', 1, 0.8);
      audio.duck(0.5, 1400);
      box.classList.add('revealed');
      gleam(box);
    }
  };
  const onTap = (): void => speech.skip();
  speech.node.addEventListener('pointerdown', onTap);
  hint.addEventListener('pointerdown', onTap);
  // The window stays whole until the words are out.
  show(box, real.length > 0 ? null : options.onClose);
  speech.start(options.text, reveal);
}

/** A glint across the window: sparks from the banner (pure CSS, a few short-lived nodes). */
function gleam(box: HTMLElement): void {
  if (reduced()) return;
  const flash = el('i', { className: 'fl-qflash' });
  box.append(flash);
  setTimeout(() => flash.remove(), 900);
}

/** The same dialogue for the blacksmith's reforging window: the portrait frame and the speech to hand to `showReforge`. */
export function smithTalk(id: QuestId, kind: MobKind, text: string, complete: boolean, mood: Mood = 'calm'): { icon: HTMLElement; speech: HTMLElement; sub: string } {
  const frame = talkFace(kind, id, mood);
  const speech = new Speech(VOICE_RATE[id], frame.talking);
  const node = el('div', { className: 'fl-talk smith-talk' }, speech.node);
  if (complete) node.append(el('div', { className: 'fl-qbanner' }, el('i', { className: 'fl-qstar' }), el('span', { textContent: Q.talk.done }), el('i', { className: 'fl-qstar' })));
  speech.node.addEventListener('pointerdown', () => speech.skip());
  // The window is put up around these after this returns: the typing starts a moment later, when they are on the screen.
  queueMicrotask(() => {
    speech.start(text, () => {
      if (complete) {
        audio.play('questFanfare', 1, 0.8);
        audio.duck(0.5, 1400);
        node.classList.add('revealed');
      }
    });
  });
  return { icon: frame.node, speech: node, sub: Q.role[id] };
}

import { FURY_LEVEL, type Hero, isAlive, isHungry, isStarving, maxExp, STARVING } from '@pd/core';
import { audio } from './audio';
import { t } from './i18n';
import { AVATAR, sprites } from './screens';
import type { LogLine } from './view';

/*
 * The in-game HUD in the design system's markup (docs/design/system): the
 * status band on top (portrait, health, experience, satiety, depth, keys,
 * menu, buffs, companions), the log and the toolbar at the bottom. The
 * middle of the screen stays free for the map and its effects.
 */

/** Buff icons in buffs.png (BuffIndicator). */
export const BUFF_ICONS = {
  mindVision: 0, fire: 2, poison: 3, paralysis: 4, hunger: 5, starvation: 6, slow: 7, ooze: 8, roots: 11, invisible: 12,
  weakness: 14, combo: 17, fury: 18, healing: 19, bark: 20, charm: 21, light: 22, cripple: 23, barkskin: 24, dizzy: 29,
  levitation: 1, blindness: 16, immunity: 25, deferred: 28, bleeding: 26, sacrifice: 31,
} as const;
export type BuffName = keyof typeof BUFF_ICONS;

/** What ails or helps a hero, with the turns it has left where that is known (BuffIndicator). */
export function heroBuffs(me: Hero): Array<{ name: BuffName; turns?: number }> {
  const turns = (left: number): number => Math.ceil(left);
  return [
    ...(me.mindVision > 0 ? [{ name: 'mindVision' as const, turns: turns(me.mindVision) }] : []),
    ...(me.invisible > 0 ? [{ name: 'invisible' as const, turns: turns(me.invisible) }] : []),
    ...(me.ooze >= 0 ? [{ name: 'ooze' as const }] : []),
    ...(me.poison > 0 ? [{ name: 'poison' as const, turns: turns(me.poison) }] : []),
    ...(me.burning > 0 ? [{ name: 'fire' as const, turns: turns(me.burning) }] : []),
    ...(me.paralysed > 0 ? [{ name: 'paralysis' as const, turns: turns(me.paralysed) }] : []),
    ...(me.rooted > 0 ? [{ name: 'roots' as const, turns: turns(me.rooted) }] : []),
    ...(me.slowed > 0 ? [{ name: 'slow' as const, turns: turns(me.slowed) }] : []),
    ...(me.weakened > 0 ? [{ name: 'weakness' as const, turns: turns(me.weakened) }] : []),
    ...(me.crippled > 0 ? [{ name: 'cripple' as const, turns: turns(me.crippled) }] : []),
    ...(me.charmed > 0 ? [{ name: 'charm' as const, turns: turns(me.charmed) }] : []),
    ...(me.light > 0 ? [{ name: 'light' as const, turns: turns(me.light) }] : []),
    ...(me.dizzy > 0 ? [{ name: 'dizzy' as const, turns: turns(me.dizzy) }] : []),
    ...((me.levitating ?? 0) > 0 ? [{ name: 'levitation' as const, turns: turns(me.levitating!) }] : []),
    ...((me.gasImmune ?? 0) > 0 ? [{ name: 'immunity' as const, turns: turns(me.gasImmune!) }] : []),
    ...((me.blind ?? 0) > 0 ? [{ name: 'blindness' as const, turns: turns(me.blind!) }] : []),
    ...((me.deferred ?? 0) > 0 ? [{ name: 'deferred' as const, turns: turns(me.deferred!) }] : []),
    ...((me.bleeding ?? 0) > 0 ? [{ name: 'bleeding' as const }] : []),
    ...((me.marked ?? 0) > 0 ? [{ name: 'sacrifice' as const, turns: turns(me.marked!) }] : []),
    ...(me.sungrass !== undefined && me.sungrass === me.pos ? [{ name: 'healing' as const }] : []),
    ...(me.earthroot && me.earthroot.pos === me.pos ? [{ name: 'bark' as const }] : []),
    ...(me.subclass === 'gladiator' && me.combo >= 3 && me.time <= me.comboUntil ? [{ name: 'combo' as const }] : []),
    ...(me.subclass === 'berserker' && me.hp > 0 && me.hp <= me.ht * FURY_LEVEL ? [{ name: 'fury' as const }] : []),
    ...(me.barkskin > 0 ? [{ name: 'barkskin' as const, turns: turns(me.barkskin) }] : []),
    ...(isStarving(me) ? [{ name: 'starvation' as const }] : isHungry(me) ? [{ name: 'hunger' as const }] : []),
  ];
}

export interface HudHandlers {
  hero(): void;
  menu(): void;
  /** A tap on the hourglass: wait a turn. */
  wait(): void;
  /** Holding it: rest until healed. */
  rest(): void;
  search(): void;
  examine(): void;
  quick(): void;
  backpack(): void;
  history(): void;
  /** A tap on a buff icon: what it is. */
  buff(name: BuffName, turns?: number): void;
  /** A tap on a companion. */
  mate(id: string): void;
}

export interface HudState {
  me: Hero;
  /** Other heroes in the party, for the co-op roster. */
  party: Hero[];
  online: readonly string[];
  /** A passing state under the HUD (connecting, waiting for companions, choosing a target). */
  notice: string;
  /** Shown beside the notice: e.g. cancelling the choice of a target. */
  cancel: { label: string; onClick(): void } | null;
  log: readonly LogLine[];
  buffs: ReadonlyArray<{ name: BuffName; turns?: number }>;
  /** The quickslot: a thrown weapon or a wand, ready to use. */
  quick: { sprite: number; label: string; aiming: boolean } | null;
  /** Iron keys for the current depth. */
  keys: number;
  examining: boolean;
  /** Something new in the backpack since it was last opened. */
  newLoot: boolean;
}

/** How long a log line stays, and how many are shown at once (three on short screens). */
const LOG_MS = 8000;
const HOLD_MS = 600;

type Child = Node | string | null | undefined | false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children) if (child) node.append(child);
  return node;
}

function icon(sprite: string, width?: number, height?: number): HTMLElement {
  const node = el('i', 'pd-icon');
  node.style.backgroundImage = `var(--spr-${sprite})`;
  if (width) node.style.width = `${width}px`;
  if (height) node.style.height = `${height}px`;
  return node;
}

/** A toolbar glyph from toolbar.png, cut by the design system (--w/--h: its size in pixels). */
function glyph(sprite: string, w: number, h: number): HTMLElement {
  const node = icon(sprite);
  node.style.setProperty('--w', String(w));
  node.style.setProperty('--h', String(h));
  return node;
}

export class Hud {
  readonly root: HTMLElement;
  private readonly band: HTMLElement;
  private readonly avatar: HTMLElement;
  private readonly level: HTMLElement;
  private readonly hp: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly xp: HTMLElement;
  private readonly food: HTMLElement;
  private readonly depth: Text;
  private readonly keys: Text;
  private readonly buffBox: HTMLElement;
  private readonly mates: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly log: HTMLElement;
  private readonly more: HTMLElement;
  private readonly tools: Record<'wait' | 'search' | 'examine' | 'quick' | 'bag', HTMLButtonElement>;
  /** What each part last showed, so the DOM is only touched when something changed. */
  private shown: Record<string, string> = {};
  private hold: { start: number; timer: number; fired: boolean } | null = null;

  constructor(private readonly handlers: HudHandlers) {
    this.root = document.getElementById('ui')!;
    const tap = (fn: () => void) => (): void => {
      audio.play('click');
      fn();
    };

    const avatarButton = el('button', 'pd-avatar');
    avatarButton.ariaLabel = t.heroLabel;
    this.avatar = el('i');
    avatarButton.append(this.avatar);
    avatarButton.onclick = tap(() => handlers.hero());
    this.level = el('span', 'pd-hero-lvl');
    this.hpText = el('span', 'pd-bar-text');
    this.hp = el('div', 'pd-bar', this.hpText);
    this.xp = el('div', 'pd-bar thin xp');
    this.food = el('div', 'pd-bar thin food');
    this.depth = document.createTextNode('');
    this.keys = document.createTextNode('');
    const menu = el('button', 'pd-menu');
    menu.ariaLabel = t.menu;
    menu.onclick = tap(() => handlers.menu());
    this.buffBox = el('div', 'pd-buffs');
    this.mates = el('div', 'pd-mates');
    this.notice = el('div', 'pd-hud-notice');
    this.band = el(
      'header',
      'pd-hud',
      el(
        'div',
        'pd-hud-main',
        el('div', 'pd-avatar-wrap', avatarButton, this.level),
        el(
          'div',
          'pd-hud-bars',
          this.hp,
          el(
            'div',
            'pd-bars-small',
            el('div', 'pd-bar-pair', icon('star'), this.xp),
            el('div', 'pd-bar-pair', icon('food'), this.food),
          ),
        ),
        el(
          'div',
          'pd-hud-side',
          el('span', 'pd-stat', icon('depth'), this.depth),
          el('span', 'pd-stat', icon('key', 14, 18), this.keys),
        ),
        menu,
      ),
      this.buffBox,
      this.mates,
      this.notice,
    );

    this.more = el('button', 'pd-log-more', t.history);
    this.more.onclick = tap(() => handlers.history());
    this.log = el('div', 'pd-log', this.more);

    const tool = (label: string, className: string, ...content: Child[]): HTMLButtonElement => {
      const node = el('button', `pd-tool${className ? ` ${className}` : ''}`, ...content);
      node.ariaLabel = label;
      return node;
    };
    this.tools = {
      wait: tool(t.waitLabel, '', glyph('tool-wait', 12, 12)),
      search: tool(t.searchLabel, '', glyph('tool-search', 12, 12)),
      examine: tool(t.examineLabel, '', glyph('tool-info', 8, 12)),
      quick: tool(t.quickLabel, 'quick empty'),
      bag: tool(t.backpack, 'bag', glyph('tool-backpack', 14, 15)),
    };
    this.tools.search.onclick = tap(() => handlers.search());
    this.tools.examine.onclick = tap(() => handlers.examine());
    this.tools.quick.onclick = tap(() => handlers.quick());
    this.tools.bag.onclick = tap(() => handlers.backpack());
    this.holdToRest(this.tools.wait);
    const toolbar = el('nav', 'pd-toolbar', ...Object.values(this.tools));
    toolbar.ariaLabel = t.actionsLabel;

    this.root.replaceChildren(this.band, this.log, toolbar);
  }

  /** The hourglass: a tap waits a turn; holding it fills a bar in steps, then rests until healed. */
  private holdToRest(button: HTMLButtonElement): void {
    const stop = (): void => {
      if (!this.hold) return;
      clearInterval(this.hold.timer);
      button.classList.remove('holding');
      button.style.removeProperty('--hold');
      this.hold = null;
    };
    button.addEventListener('pointerdown', () => {
      stop();
      audio.play('click');
      button.classList.remove('resting');
      const hold = { start: performance.now(), fired: false, timer: 0 };
      hold.timer = window.setInterval(() => {
        const v = Math.min(1, (performance.now() - hold.start) / HOLD_MS);
        button.style.setProperty('--hold', String(Math.floor(v * 8) / 8));
        if (v >= 1 && !hold.fired) {
          hold.fired = true;
          clearInterval(hold.timer);
          button.classList.remove('holding');
          this.handlers.rest();
        }
      }, 30);
      button.classList.add('holding');
      this.hold = hold;
    });
    button.addEventListener('pointerup', () => {
      const hold = this.hold;
      stop();
      if (hold && !hold.fired) this.handlers.wait();
    });
    button.addEventListener('pointerleave', stop);
    button.addEventListener('pointercancel', stop);
  }

  show(on: boolean): void {
    this.root.hidden = !on;
  }

  /** Sets a part's content only when it changed. */
  private changed(key: string, value: string): boolean {
    if (this.shown[key] === value) return false;
    this.shown[key] = value;
    return true;
  }

  update(state: HudState, resting: boolean): void {
    const { me } = state;
    const dead = !isAlive(me);
    if (this.changed('av', `${me.heroClass}`)) this.avatar.style.setProperty('--av', String(AVATAR[me.heroClass]));
    if (this.changed('lvl', String(me.lvl))) this.level.textContent = String(me.lvl);
    const hp = Math.max(0, me.hp);
    if (this.changed('hp', `${hp}/${me.ht}/${me.poison > 0}`)) {
      this.hp.style.setProperty('--v', String(hp / me.ht));
      this.hp.classList.toggle('low', hp <= me.ht / 4);
      this.hp.classList.toggle('poisoned', me.poison > 0);
      this.hpText.textContent = `${hp}/${me.ht}`;
    }
    if (this.changed('xp', `${me.exp}/${maxExp(me)}`)) this.xp.style.setProperty('--v', String(Math.min(1, me.exp / maxExp(me))));
    if (this.changed('food', String(Math.round(me.hunger)))) {
      this.food.style.setProperty('--v', String(Math.max(0, 1 - me.hunger / STARVING)));
      this.food.classList.toggle('hungry', isHungry(me) && !isStarving(me));
      this.food.classList.toggle('starving', isStarving(me));
    }
    if (this.changed('depth', String(me.depth))) this.depth.data = String(me.depth);
    if (this.changed('keys', String(state.keys))) this.keys.data = String(state.keys);
    this.avatar.parentElement!.classList.toggle('dead', dead);

    const buffKey = state.buffs.map((b) => `${b.name}:${b.turns !== undefined && b.turns <= 3 ? 'f' : ''}`).join(',');
    if (this.changed('buffs', buffKey)) {
      this.buffBox.replaceChildren(
        ...state.buffs.map((buff) => {
          const glyphNode = el('i');
          glyphNode.dataset.b = String(BUFF_ICONS[buff.name]);
          const node = el('button', `pd-buff${buff.turns !== undefined && buff.turns <= 3 ? ' fading' : ''}`, glyphNode);
          node.ariaLabel = t.buffs[buff.name];
          node.onclick = () => this.handlers.buff(buff.name, buff.turns);
          return node;
        }),
      );
      sprites(this.buffBox);
    }

    const mateKey = state.party
      .map((h) => `${h.id}:${h.name}:${h.heroClass}:${Math.max(0, h.hp)}/${h.ht}:${h.depth}:${state.online.includes(h.id)}`)
      .join('|') + `@${me.depth}`;
    if (this.changed('mates', mateKey)) {
      this.mates.hidden = state.party.length === 0;
      this.mates.replaceChildren(
        ...state.party.map((hero) => {
          const face = el('i', 'pd-mate-face');
          face.style.setProperty('--av', String(AVATAR[hero.heroClass]));
          const bar = el('div', 'pd-bar');
          bar.style.setProperty('--v', String(Math.max(0, hero.hp) / hero.ht));
          const away = hero.depth !== me.depth || !state.online.includes(hero.id);
          const node = el(
            'button',
            `pd-mate${!isAlive(hero) ? ' dead' : away ? ' away' : ''}`,
            face,
            el('span', 'pd-mate-name', hero.name),
            bar,
            el('span', 'pd-mate-depth', String(hero.depth)),
          );
          node.onclick = () => this.handlers.mate(hero.id);
          return node;
        }),
      );
    }

    if (this.changed('notice', `${state.notice}|${state.cancel?.label ?? ''}`)) {
      this.notice.hidden = !state.notice;
      this.notice.replaceChildren(el('span', '', state.notice));
      if (state.cancel) {
        const cancel = el('button', 'pd-button quiet', state.cancel.label);
        const onClick = state.cancel.onClick;
        cancel.onclick = () => {
          audio.play('click');
          onClick();
        };
        this.notice.append(cancel);
      }
    }

    this.updateLog(state.log);

    const quick = state.quick;
    if (this.changed('quick', quick ? `${quick.sprite}:${quick.label}:${quick.aiming}` : '')) {
      const button = this.tools.quick;
      button.classList.toggle('empty', !quick);
      button.classList.toggle('targeting', Boolean(quick?.aiming));
      if (quick) {
        const item = el('i', 'pd-item');
        item.dataset.i = String(quick.sprite);
        button.replaceChildren(item);
        if (quick.label) button.append(el('span', 'pd-qty', quick.label));
        sprites(button);
      } else {
        button.replaceChildren();
      }
    }
    this.tools.examine.classList.toggle('active', state.examining);
    this.tools.bag.classList.toggle('alert', state.newLoot);
    this.tools.wait.classList.toggle('resting', resting);
    for (const button of Object.values(this.tools)) button.disabled = dead;
  }

  /** The last few lines, older ones dimmer; each goes out after a while and frees the band. */
  private updateLog(log: readonly LogLine[]): void {
    const now = performance.now();
    const max = innerHeight < 700 ? 3 : 4;
    const lines = log.filter((line) => now - line.time < LOG_MS).slice(-max);
    const key = lines.map((line) => `${line.time}:${line.count ?? 1}`).join(',');
    if (!this.changed('log', key)) return;
    this.log.hidden = lines.length === 0;
    this.log.replaceChildren(
      ...lines.map((line, i) => {
        const row = el('div', `pd-log-line${line.tone ? ` ${line.tone}` : ''}`, line.text);
        if ((line.count ?? 1) > 1) row.append(el('span', 'pd-n', `×${line.count}`));
        row.dataset.age = String(Math.min(3, lines.length - 1 - i));
        return row;
      }),
      this.more,
    );
  }

  /** The band of the screen left for the map, in CSS pixels from the top: between the HUD and the log or toolbar. */
  freeZone(): { top: number; bottom: number } {
    if (this.root.hidden) return { top: 0, bottom: innerHeight };
    const top = this.band.getBoundingClientRect().bottom;
    const toolbar = this.root.querySelector('.pd-toolbar')!.getBoundingClientRect().top;
    return { top, bottom: toolbar };
  }

  /** The HUD's height, for toasts to appear under it. */
  height(): number {
    return this.root.hidden ? 0 : this.band.getBoundingClientRect().bottom;
  }
}

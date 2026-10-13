import { type Hero, type HeroClass, type Item, itemDef, itemSprite, type World } from '@pd/core';
import { audio } from './audio';
import { capitalize, locale, t } from './i18n';
import { itemInfo, itemName } from './itemtext';
import { AVATAR, el, hideOverlay, show, showInfo, slot, sprites, stats } from './screens';

/*
 * The arena of waves' windows, in design system v14's markup (docs/design/system/migration.md
 * «Арена волн»): the title's entry, the choice of alone or with friends, the reward after a
 * wave (three cards, one to take), and the end of an arena run. The best wave held is kept
 * on this device.
 */

const BEST_KEY = 'pd-arena-best';

/** The most waves held in the arena on this device, or null before the first arena run. */
export function arenaBest(): number | null {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    return raw === null ? null : Number(raw) || 0;
  } catch {
    return null;
  }
}

/** Keeps a run's waves if they beat the record; true if they did. */
export function recordArena(waves: number): boolean {
  const best = arenaBest();
  if (best !== null && waves <= best) return false;
  try {
    localStorage.setItem(BEST_KEY, String(waves));
  } catch {
    // Not kept; the record is still worth telling.
  }
  return best !== null || waves > 0;
}

/** «Яма Йендора · рекорд: волна 12» with the wave in bold, or «новый режим». */
function entryLine(best: number | null): HTMLElement {
  const small = el('small', {});
  if (best === null) {
    small.textContent = t.arena.entryNew;
    return small;
  }
  const [before = '', after = ''] = t.arena.entryBest.split('{n}');
  small.append(before, el('b', { textContent: t.arena.waveWord(best) }), after);
  return small;
}

/** The title's entry into the arena, under «Play with friends». */
export function arenaEntry(best: number | null, onOpen: () => void): HTMLButtonElement {
  return el(
    'button',
    {
      className: 'pd-button pd-mode-btn',
      onclick: () => {
        audio.play('click');
        onOpen();
      },
    },
    el('i', { className: 'pd-mode-ico' }),
    el('span', { className: 'pd-mode-text', textContent: t.arena.title }, entryLine(best)),
  );
}

export interface ArenaPickOptions {
  best: number | null;
  onStart(): void;
  onClose(): void;
}

/** «Wave arena»: what it is, the record, and into it. */
export function showArenaPick(options: ArenaPickOptions): void {
  // A strip of the arena's own frames: the gate, the brazier, the crowd, the banner (arena1.png, ×2).
  const art = el('div', { className: 'pd-arena-art' });
  for (const [x, y] of [[0, 0], [32, 32], [0, 64], [32, 128], [32, 64], [64, 32], [96, 0]] as const) {
    const frame = el('i');
    frame.style.backgroundPosition = `${-x}px ${-y}px`;
    art.append(frame);
  }
  const choice = (label: string, sub: string, className: string, act: () => void): HTMLButtonElement =>
    el(
      'button',
      {
        className: `pd-button ${className} stacked`.trim(),
        onclick: () => {
          audio.play('click');
          act();
        },
      },
      label,
      el('span', { className: 'pd-btn-sub', textContent: sub }),
    );
  const emblem = el('span', { className: 'pd-mode-ico' });
  emblem.style.cssText = 'width:32px;height:32px';
  const head = el(
    'div',
    { className: 'pd-window-head' },
    emblem,
    el('div', { className: 'pd-titles' }, el('h2', { className: 'pd-heading', textContent: t.arena.title }), el('span', { className: 'pd-sub', textContent: t.arena.sub })),
    el('button', {
      className: 'pd-close',
      ariaLabel: t.close,
      onclick: () => {
        audio.play('click');
        options.onClose();
      },
    }),
  );
  const box = el(
    'section',
    { className: 'pd-window narrow' },
    head,
    el(
      'div',
      { className: 'pd-arena-pick' },
      art,
      el('ul', { className: 'pd-arena-rules' }, ...t.arena.rules.map((rule) => el('li', { textContent: rule }))),
      options.best !== null && el('span', { className: 'pd-record', textContent: t.arena.best(options.best) }),
      el(
        'div',
        { className: 'pd-actions' },
        choice(t.arena.solo, t.arena.soloSub, 'primary big', options.onStart),
      ),
    ),
  );
  box.setAttribute('role', 'dialog');
  show(box, options.onClose);
}

/**
 * How rare a reward looks: upgrades, strength, might, an ankh, +2 and better, enchanted or inscribed gear are
 * legendary; rings, wands, +1 gear, a honeypot, psionic blast and recharging rare.
 */
const LEGENDS: ReadonlySet<string> = new Set(['scroll.upgrade', 'potion.strength', 'scroll.enchantment', 'potion.experience', 'potion.might', 'ankh']);
const RARES: ReadonlySet<string> = new Set(['honeypot', 'scroll.psionicBlast', 'scroll.recharging']);

export function rarity(item: Item): 'common' | 'rare' | 'legend' {
  const category = itemDef(item.kind).category;
  if (LEGENDS.has(item.kind)) return 'legend';
  if (item.level >= 2 || item.enchant || item.glyph) return 'legend';
  if (category === 'ring' || category === 'wand' || item.level === 1 || RARES.has(item.kind)) return 'rare';
  return 'common';
}

export interface RewardOptions {
  world: World;
  hero: Hero;
  /** The wave just beaten (0: the opening gift). */
  wave: number;
  items: readonly Item[];
  /** In a party, each picks their own. */
  coop: boolean;
  onTake(index: number): void;
}

/**
 * The reward after a wave: three cards; a tap picks one, a second tap (or «Take») takes it.
 * No cross: a reward is to be taken. Holding a card tells what it is.
 */
export function showArenaReward(options: RewardOptions): void {
  const { hero, items } = options;
  // The rewards are shown for what they are, as the ghost's are.
  const world = { ...options.world, known: [...options.world.known, ...items.map((item) => item.kind)] };
  let chosen = -1;
  const take = el('button', { className: 'pd-button primary', textContent: t.arena.take, disabled: true });
  const cards = items.map((item, index) => {
    const rare = rarity(item);
    const icon = el('i', { className: 'pd-item' });
    icon.dataset.i = String(itemSprite(item, world.run.labels));
    const card = el(
      'button',
      { className: `pd-loot${rare === 'common' ? '' : ` ${rare}`}` },
      el('span', { className: 'pd-slot' }, icon),
      el('span', { className: 'pd-loot-name', textContent: capitalize(itemName(world, item)) }),
      el('span', { className: 'pd-rarity', textContent: t.arena.rarity[rare] }),
    );
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', 'false');
    // Holding a card: what the item is (and back to the choice).
    let timer = 0;
    let held = false;
    card.addEventListener('pointerdown', () => {
      held = false;
      timer = window.setTimeout(() => {
        held = true;
        audio.play('click');
        showInfo(itemName(world, item), itemInfo(world, hero, item), () => showArenaReward(options), { icon: slot(world, item, { hero }) });
      }, 450);
    });
    for (const end of ['pointerup', 'pointerleave', 'pointercancel'] as const) card.addEventListener(end, () => window.clearTimeout(timer));
    card.onclick = () => {
      if (held) return;
      audio.play('click');
      if (chosen === index) {
        finish();
        return;
      }
      chosen = index;
      cards.forEach((other, i) => other.setAttribute('aria-checked', String(i === index)));
      take.disabled = false;
    };
    return card;
  });
  const finish = (): void => {
    if (chosen < 0) return;
    hideOverlay();
    options.onTake(chosen);
  };
  take.onclick = () => {
    audio.play('click');
    finish();
  };
  const grid = el('div', { className: 'pd-loot3' }, ...cards);
  grid.setAttribute('role', 'radiogroup');
  const box = el(
    'section',
    { className: 'pd-window' },
    el(
      'div',
      { className: 'pd-window-head' },
      el(
        'div',
        { className: 'pd-titles' },
        el('h2', { className: 'pd-heading', textContent: t.arena.rewardTitle }),
        el('span', { className: 'pd-sub', textContent: options.wave > 0 ? t.arena.rewardFor(options.wave) : t.arena.giftFor }),
      ),
    ),
    grid,
    options.coop && el('p', { className: 'pd-loot-note', textContent: t.arena.rewardNote }),
    el('div', { className: 'pd-actions' }, take),
  );
  box.setAttribute('role', 'dialog');
  show(box, null);
  sprites(box);
}

export interface ArenaEndOptions {
  solo: boolean;
  /** The wave the party fell on, and the waves held. */
  wave: number;
  cleared: number;
  region: string;
  kills: number;
  score: number;
  /** A new record on this device, or the record to beat. */
  newRecord: boolean;
  best: number | null;
  /** Co-op: everyone's kills and score, mine first. */
  party: ReadonlyArray<{ name: string; heroClass: HeroClass; kills: number; score: number; me: boolean }>;
  /** How the server scored the run (rankui.ts rankingBlock). */
  ranking?: HTMLElement;
  /** Opens the boards; absent without checked runs. */
  onBoards?: () => void;
  onAgain(): void;
  onShare(): void;
  onExit(): void;
}

/** The end of an arena run: «The party fell», where, the record, the numbers, and the party's rows in co-op. */
export function showArenaEnd(options: ArenaEndOptions): void {
  const number = (n: number): string => n.toLocaleString(locale);
  const party = !options.solo && options.party.length > 0
    ? el(
      'div',
      { className: 'pd-arena-party' },
      el('div', { className: 'head' }, el('span'), el('span'), el('span', { textContent: t.arena.statKills }), el('span', { textContent: t.arena.statScore })),
      ...options.party.map((row) => {
        const face = el('i');
        face.style.setProperty('--av', String(AVATAR[row.heroClass]));
        return el(
          'div',
          { className: row.me ? 'me' : '' },
          face,
          el('span', { textContent: row.name }),
          el('span', { textContent: String(row.kills) }),
          el('span', { textContent: number(row.score) }),
        );
      }),
    )
    : null;
  const button = (label: string, className: string, act: () => void): HTMLButtonElement =>
    el('button', {
      className: `pd-button ${className}`.trim(),
      textContent: label,
      onclick: () => {
        audio.play('click');
        act();
      },
    });
  const box = el(
    'section',
    { className: 'pd-window pd-runend arena' },
    el('h2', { className: 'pd-display', textContent: options.solo ? t.arena.soloEnd : t.arena.partyEnd }),
    el('p', { className: 'pd-cause', textContent: t.arena.endCause(options.wave, options.region) }),
    options.newRecord
      ? el('span', { className: 'pd-record new', textContent: t.arena.newRecord })
      : options.best !== null && el('span', { className: 'pd-record', textContent: t.arena.best(options.best) }),
    stats([
      [t.arena.statWaves, String(options.cleared)],
      [t.arena.statKills, String(options.kills)],
      [t.arena.statScore, number(options.score), 'gold'],
    ]),
    party,
    options.ranking,
    el(
      'div',
      { className: 'pd-actions' },
      button(t.arena.again, 'primary', options.onAgain),
      button(t.arena.share, '', options.onShare),
      options.onBoards ? button(t.ranked.title, '', options.onBoards) : null,
      button(t.toMenu, 'quiet', options.onExit),
    ),
  );
  box.setAttribute('role', 'dialog');
  show(box, null);
}


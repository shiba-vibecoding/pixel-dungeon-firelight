import { challengeMultiplier, createItem, HEAP_SPRITES, type Hero, type Item, itemDef, type ItemKind, ITEMS, itemSprite, RoomType, T, type World } from '@pd/core';
import { audio } from './audio';
import { BRIGHTNESS_DEFAULT, BRIGHTNESS_MAX, BRIGHTNESS_MIN, brightness } from './brightness';
import { CHALLENGE_MASKS, countChallenges } from './challenge-info';
import { fx } from './fx';
import { capitalize, lang, locale, t } from './i18n';
import { itemInfo, itemName } from './itemtext';
import { smooth } from './pace';
import { QUIP_MODES, quipMode } from './quips';
import { type FxMode, quality } from './quality';
import { el, info, show, sprites, windowOf } from './screens';
import { canFullscreen, haptics, isFullscreen, openExternal, setFullscreen } from './telegram';
import { hints } from './hints';
import { confirmDanger } from './mistap';
import { confirmRisky } from './riskyuse';

/*
 * The windows around the game rather than in it (design system v9): the
 * settings, the about window, the challenges and the journal with its catalog.
 */

const SOURCE_URL = 'https://github.com/shiba-vibecoding/pixel-dungeon-telegram';
const ORIGIN_URL = 'http://pixeldungeon.watabou.ru';
/** A page served beside the game (privacy.html, terms.html), as a full address for Telegram's browser. */
const page = (name: string): string => new URL(name, document.baseURI).href;

declare const __BUILD__: { commit: string; date: string } | undefined;
/** The build, stamped by Vite: the commit and the day it was built. */
const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : { commit: 'dev', date: new Date().toISOString().slice(0, 10) };

const click = (): void => audio.play('click');

/* Controls */

/** A level in five steps of 44 px: a tap on a step sets it; on the only lit first step, silence. */
function stepsRow(label: string, get: () => number, set: (volume: number) => void, sample: () => void): HTMLElement {
  const value = el('span', { className: 'pd-set-value' });
  const box = el('div', { className: 'pd-steps' });
  box.setAttribute('role', 'slider');
  box.setAttribute('aria-label', label);
  box.setAttribute('aria-valuemin', '0');
  box.setAttribute('aria-valuemax', '100');
  const paint = (): void => {
    const lit = Math.round(get() * 5);
    [...box.children].forEach((node, i) => {
      node.classList.toggle('on', i < lit);
      node.setAttribute('aria-pressed', String(i < lit));
    });
    box.classList.toggle('off', lit === 0);
    box.setAttribute('aria-valuenow', String(lit * 20));
    value.textContent = lit ? `${lit * 20}%` : t.meta.off;
  };
  for (let i = 0; i < 5; i++) {
    const step = el('button', {
      className: 'pd-step',
      ariaLabel: `${label} ${(i + 1) * 20}%`,
      onclick: () => {
        const lit = Math.round(get() * 5);
        set(lit === 1 && i === 0 ? 0 : (i + 1) / 5);
        paint();
        sample();
      },
    });
    box.append(step);
  }
  paint();
  return el(
    'div',
    { className: 'pd-set-row' },
    el('span', { className: 'pd-set-label' }, el('span', { className: 'pd-info', textContent: label }), value),
    box,
  );
}

/** One of a few choices (a radio group of segments). */
function segments<V extends string>(choices: ReadonlyArray<readonly [V, string]>, value: V, onChange: (v: V) => void, inline = false): HTMLElement {
  const box = el('div', { className: `pd-seg${inline ? ' inline' : ''}` });
  box.setAttribute('role', 'radiogroup');
  const paint = (current: V): void => {
    [...box.children].forEach((node) => node.setAttribute('aria-checked', String((node as HTMLElement).dataset.v === current)));
  };
  for (const [v, label] of choices) {
    const option = el('button', {
      className: 'pd-seg-opt',
      textContent: label,
      onclick: () => {
        click();
        paint(v);
        onChange(v);
      },
    });
    option.dataset.v = v;
    option.setAttribute('role', 'radio');
    box.append(option);
  }
  paint(value);
  return box;
}

/** A row that turns something on or off. */
function switchRow(label: string, note: string | null, on: boolean, onChange: (on: boolean) => void): HTMLElement {
  const row = el(
    'button',
    {
      className: 'pd-switch',
      onclick: () => {
        const next = row.getAttribute('aria-checked') !== 'true';
        click();
        row.setAttribute('aria-checked', String(next));
        onChange(next);
      },
    },
    el(
      'span',
      { className: 'pd-set-label' },
      el('span', { className: 'pd-info', textContent: label }),
      note && el('span', { className: 'pd-set-value', textContent: note }),
    ),
    el('span', { className: 'pd-switch-box' }),
  );
  row.setAttribute('role', 'switch');
  row.setAttribute('aria-checked', String(on));
  return row;
}

/** A row that leads somewhere: another window, or (ext) a page outside the game. */
function linkRow(label: string, onClick: () => void, external = false, sub?: string): HTMLElement {
  return el(
    'button',
    {
      className: `pd-linkrow${external ? ' ext' : ''}`,
      onclick: () => {
        click();
        onClick();
      },
    },
    el('span', {}, label, sub && el('small', { textContent: sub })),
  );
}

/** The hero's name as a field in a row of the settings. */
function nameRow(name: { value: string; set(value: string): void }): HTMLElement {
  const input = el('input', {
    id: 'pd-name', className: 'pd-input', value: name.value, maxLength: 20, placeholder: t.yourName,
    oninput: () => name.set(input.value),
  });
  return el('div', { className: 'pd-set-row stack' }, el('label', { className: 'pd-info', htmlFor: 'pd-name', textContent: t.nameRow }), input, el('span', { className: 'pd-set-value', textContent: t.nameNote }));
}

/** A slider with a wide range: its value as a percentage beside the label, and a way back to the default. Applies as it moves. */
function sliderRow(label: string, note: string | null, range: { min: number; max: number; step: number; def: number }, get: () => number, set: (value: number) => void): HTMLElement {
  const value = el('span', { className: 'pd-set-value' });
  const input = el('input', { className: 'pd-range', type: 'range', min: String(range.min * 100), max: String(range.max * 100), step: String(range.step * 100) });
  input.setAttribute('aria-label', label);
  const back = el('button', { className: 'pd-mini', textContent: t.meta.byDefault });
  const paint = (): void => {
    const v = get();
    input.value = String(Math.round(v * 100));
    input.style.setProperty('--fill', `${((v - range.min) / (range.max - range.min)) * 100}%`);
    input.setAttribute('aria-valuetext', `${Math.round(v * 100)}%`);
    value.textContent = `${Math.round(v * 100)}%`;
    back.hidden = Math.abs(v - range.def) < 0.005;
  };
  input.oninput = () => {
    set(Number(input.value) / 100);
    paint();
  };
  back.onclick = () => {
    click();
    set(range.def);
    paint();
  };
  paint();
  return el(
    'div',
    { className: 'pd-set-row stack slider' },
    el('span', { className: 'pd-set-label' }, el('span', { className: 'pd-info', textContent: label }), el('span', { className: 'pd-set-meter' }, value, back)),
    input,
    note && el('span', { className: 'pd-set-value', textContent: note }),
  );
}

const group = (head: string | null, ...rows: Array<HTMLElement | null | false>): HTMLElement =>
  el('section', { className: 'pd-set-group' }, head && el('h3', { className: 'pd-set-head', textContent: head }), ...rows);

/* Settings */

export interface SettingsOptions {
  onClose(): void;
  /** The effects changed: the canvas is sized anew. */
  onEffects(mode: FxMode): void;
  /** Asked to erase everything on this device (see eraseDevice), once confirmed. */
  onReset(): void;
  /** The bot's reminders (in Telegram): on now, and the switch; absent elsewhere. */
  reminders?: { on: boolean; set(on: boolean): void };
  /** «What's new», the news of the version again. */
  onNews?(): void;
  /** «Report a problem»; absent without the server. */
  onReport?(): void;
  /** The hero's name, outside Telegram (where it is not known); the camp has no field for it. */
  name?: { value: string; set(value: string): void };
}

/** The settings, from the title's corner or the menu in a run. */
export function showSettings(options: SettingsOptions): void {
  const fxNote = info(t.meta.fxNotes[quality.mode], 'pd-note');
  const reopen = (): void => showSettings(options);

  // Game: what is asked and told while playing.
  const game = group(
    t.meta.game,
    options.name ? nameRow(options.name) : null,
    switchRow(t.safe.settings.danger, t.safe.settings.dangerNote, confirmDanger.on, (on) => confirmDanger.set(on)),
    switchRow(t.safe.settings.risky, t.safe.settings.riskyNote, confirmRisky.on, (on) => confirmRisky.set(on)),
    switchRow(t.meta.hints, t.meta.hintsNote, hints.enabled, (on) => hints.setEnabled(on)),
    options.reminders ? switchRow(t.ranked.remindersSwitch, t.ranked.remindersNote, options.reminders.on, (on) => options.reminders!.set(on)) : null,
    linkRow(t.meta.hintsAgain, () => {
      hints.reset();
      hints.setEnabled(true);
      reopen();
    }),
  );

  // Graphics: the picture, and how much it costs.
  const modes: ReadonlyArray<readonly [FxMode, string]> = (['auto', 'full', 'light'] as const).map((m) => [m, t.meta.fxModes[m]] as const);
  const graphics = group(
    t.meta.graphics,
    sliderRow(
      t.meta.brightness, t.meta.brightnessNote,
      { min: BRIGHTNESS_MIN, max: BRIGHTNESS_MAX, step: 0.05, def: BRIGHTNESS_DEFAULT }, () => brightness.value, (v) => brightness.set(v),
    ),
    el(
      'div',
      { className: 'pd-set-row stack' },
      el('span', { className: 'pd-info', textContent: t.meta.effects }),
      segments(modes, quality.mode, (mode) => {
        quality.setMode(mode);
        fxNote.textContent = t.meta.fxNotes[mode];
        options.onEffects(mode);
      }),
      fxNote,
    ),
    switchRow(t.meta.smooth, t.meta.smoothNote, smooth.on, (on) => smooth.set(on)),
    stepsRow(t.meta.shake, () => quality.shake, (v) => quality.setShake(v), () => fx.shake(3, 240, fx.now)),
    canFullscreen() && switchRow(t.fullscreen, null, isFullscreen(), (on) => setFullscreen(on)),
  );

  // Sound: ours only, with the levels and the mute (a level of 0).
  const level = (volume: number): number => (audio.enabled ? volume : 0);
  // An older «sound off» switch counts as silence here; any step brings the sound back.
  const louder = (set: (volume: number) => void) => (volume: number): void => {
    if (volume > 0 && !audio.enabled) audio.setEnabled(true);
    set(volume);
  };
  const sound = group(
    t.meta.sound,
    stepsRow(t.musicVolume, () => level(audio.musicVolume), louder((v) => audio.setMusicVolume(v)), () => undefined),
    stepsRow(t.soundVolume, () => level(audio.soundVolume), louder((v) => audio.setSoundVolume(v)), () => audio.play('coin', 1, 0.6)),
    switchRow(t.meta.vibration, t.meta.vibrationNote, haptics.on, (on) => haptics.set(on)),
  );

  // Language and the hero's words.
  // The three words are of unequal length: the buttons take what they need, not a third each.
  const quipChoice = segments(QUIP_MODES.map((m) => [m, t.meta.quipModes[m]] as const), quipMode.value, (mode) => quipMode.set(mode));
  quipChoice.classList.add('fit');
  const words = group(
    t.meta.langQuips,
    el(
      'div',
      { className: 'pd-set-row' },
      el('span', { className: 'pd-info', textContent: t.meta.language }),
      segments([['ru', 'Русский'], ['en', 'English']] as const, lang, (next) => {
        if (next === lang) return;
        try {
          localStorage.setItem('pd-lang', next);
        } catch {
          return;
        }
        // Every word on the page is chosen at load: load it again in the other language.
        location.reload();
      }, true),
    ),
    el(
      'div',
      { className: 'pd-set-row stack' },
      el('span', { className: 'pd-info', textContent: t.meta.quips }),
      quipChoice,
      info(t.meta.quipsNote, 'pd-note'),
    ),
  );

  // The account side: the news, the report, the about, the documents, and wiping the device.
  const account = group(
    t.meta.account,
    options.onNews ? linkRow(t.news.row, () => options.onNews!()) : null,
    options.onReport ? linkRow(t.report.title, () => options.onReport!()) : null,
    linkRow(t.meta.about, () => showAbout(reopen)),
    linkRow(t.meta.privacy, () => openExternal(page('privacy.html')), true),
    linkRow(t.meta.terms, () => openExternal(page('terms.html')), true),
  );
  const reset = el(
    'section',
    { className: 'pd-set-group danger' },
    el('button', { className: 'pd-button danger', textContent: t.meta.reset, onclick: () => (click(), confirmReset(reopen, options.onReset)) }),
  );
  show(
    windowOf(
      { title: t.meta.settings, onClose: options.onClose, className: 'settings' },
      el('div', { className: 'pd-scroll pd-settings' }, game, graphics, sound, words, account, reset),
    ),
    options.onClose,
  );
}

function confirmReset(onCancel: () => void, onDone: () => void): void {
  const cancel = el('button', { className: 'pd-button quiet', textContent: t.meta.cancel, onclick: () => (click(), onCancel()) });
  const box = windowOf(
    { narrow: true },
    el('h2', { className: 'pd-heading center', textContent: t.meta.resetTitle }),
    info(t.meta.resetText, 'pd-info center'),
    info(t.meta.resetKeep, 'pd-note center'),
    el(
      'div',
      { className: 'pd-confirm-row' },
      cancel,
      el('button', {
        className: 'pd-button danger',
        textContent: t.meta.resetYes,
        onclick: () => {
          click();
          onDone();
        },
      }),
    ),
  );
  box.classList.add('pd-confirm2');
  show(box, onCancel);
  cancel.focus();
}

/* About */

export function showAbout(onClose: () => void): void {
  const credits = el('dl', { className: 'pd-credits' });
  for (const [what, who, more] of t.meta.credits) {
    credits.append(
      el('div', { className: 'pd-credit' }, el('dt', { textContent: what }), el('dd', {}, who, more && el('small', { textContent: more }))),
    );
  }
  show(
    windowOf(
      { title: t.meta.about, onClose },
      el(
        'div',
        { className: 'pd-scroll pd-about' },
        el(
          'div',
          { className: 'pd-about-logo' },
          el('img', { src: 'assets/banner-title.png', alt: t.gameName }),
          el('span', { className: 'pd-logo-sub', textContent: t.meta.subtitle }),
          el('span', { className: 'pd-set-value', textContent: t.meta.basedOn }),
          el('span', { className: 'pd-build', textContent: t.meta.build(BUILD.commit, BUILD.date) }),
        ),
        credits,
        el(
          'div',
          {},
          linkRow(t.meta.source, () => openExternal(SOURCE_URL), true, SOURCE_URL.replace('https://', '')),
          linkRow(t.meta.origin, () => openExternal(ORIGIN_URL), true, ORIGIN_URL.replace('http://', '')),
        ),
        el('p', { className: 'pd-legal', textContent: t.meta.legal }),
      ),
    ),
    onClose,
  );
}

/* Challenges */

export interface ChallengesOptions {
  mask: number;
  /** Challenges open after the first victory (the original's VICTORY badge). */
  unlocked: boolean;
  onChange(mask: number): void;
  onClose(): void;
}

/** WndChallenges: seven switches, locked until the first victory. */
export function showChallenges(options: ChallengesOptions): void {
  let mask = options.unlocked ? options.mask : 0;
  // How many are on, and what they do to the score (core daily.ts challengeMultiplier).
  const onText = (m: number): string =>
    countChallenges(m) > 0 ? `${t.meta.challengesOn(countChallenges(m))} · ${t.ranked.scoreTimes(challengeMultiplier(m).toLocaleString(locale))}` : t.meta.challengesOn(0);
  const sub = el('span', { className: 'pd-note', textContent: onText(mask) });
  const list = el('div', { className: `pd-challenges${options.unlocked ? '' : ' locked'}` });
  if (!options.unlocked) list.append(el('p', { className: 'pd-lockplate' }, el('span', { textContent: t.meta.challengesLocked })));
  t.meta.challengeList.forEach(([name, desc], i) => {
    const bit = CHALLENGE_MASKS[i]!;
    const icon = el('i', { className: 'pd-ch-icon' });
    icon.style.setProperty('--c', String(i));
    const row = el(
      'button',
      {
        className: 'pd-challenge',
        onclick: () => {
          if (!options.unlocked) return;
          click();
          mask ^= bit;
          row.setAttribute('aria-checked', String(Boolean(mask & bit)));
          sub.textContent = onText(mask);
          options.onChange(mask);
        },
      },
      icon,
      el(
        'span',
        { className: 'pd-ch-text' },
        el('span', { className: 'pd-ch-name', textContent: name }),
        el('span', { className: 'pd-ch-desc', textContent: desc }),
      ),
      el('span', { className: 'pd-switch-box' }),
    );
    row.setAttribute('role', 'switch');
    row.setAttribute('aria-checked', String(Boolean(mask & bit)));
    if (!options.unlocked) row.setAttribute('aria-disabled', 'true');
    list.append(row);
  });
  const box = windowOf({ title: t.meta.challenges, onClose: options.onClose }, el('div', { className: 'pd-scroll' }, list), info(t.meta.challengesFoot, 'pd-note center'));
  box.querySelector('.pd-titles')?.append(sub);
  show(box, options.onClose);
}

/* Journal */

/** Journal.Feature, in the order of journal.png. */
const enum Feature {
  WellOfHealth, WellOfAwareness, WellOfTransmutation, Sacrifice, Alchemy, Garden, Statue, Ghost, Wandmaker, Troll, Imp,
}

const WELLS: Readonly<Record<string, Feature>> = {
  health: Feature.WellOfHealth, awareness: Feature.WellOfAwareness, transmutation: Feature.WellOfTransmutation,
};

export interface JournalEntry {
  feature: number;
  depth: number;
  /** Used up, slain or done with: kept in the list, dimmed. */
  done: boolean;
}

/**
 * What the party has come across, depth by depth (Journal.add): wells,
 * the altar, alchemy pots, gardens, the statue and the dungeon's people,
 * once a cell of theirs has been seen.
 */
export function journalEntries(world: World): JournalEntry[] {
  const entries: JournalEntry[] = [];
  for (const key of Object.keys(world.levels)) {
    const depth = Number(key);
    const level = world.levels[depth]!;
    const floor = world.floors[depth];
    const seen = world.explored[depth];
    if (!seen) continue;
    const add = (feature: Feature, done = false): void => {
      if (!entries.some((e) => e.feature === feature && e.depth === depth)) entries.push({ feature, depth, done });
    };
    for (const well of level.wells) if (seen[well.pos]) add(WELLS[well.water] ?? Feature.WellOfHealth);
    const altar = floor?.altar ?? level.altar;
    if (altar && seen[altar.pos]) add(Feature.Sacrifice, altar.volume <= 0);
    if (level.map.some((terrain, cell) => terrain === T.ALCHEMY && seen[cell])) add(Feature.Alchemy);
    for (const room of level.rooms) {
      if (room.type !== RoomType.GARDEN) continue;
      if (roomSeen(room, seen, level.map.length)) add(Feature.Garden);
    }
    if (level.statue !== undefined && seen[level.statue]) {
      add(Feature.Statue, !(floor?.mobs ?? []).some((mob) => mob.kind === 'statue'));
    }
    const met = (kind: string): boolean => (floor?.mobs ?? []).some((mob) => mob.kind === kind && seen[mob.pos]);
    if (world.quest?.depth === depth && (world.quest.given || met('ghost'))) add(Feature.Ghost, world.quest.done);
    if (world.wandQuest?.depth === depth && (world.wandQuest.given || met('wandmaker'))) add(Feature.Wandmaker, world.wandQuest.done);
    if (world.smithQuest?.depth === depth && (world.smithQuest.given || (level.blacksmith !== undefined && seen[level.blacksmith]))) {
      add(Feature.Troll, world.smithQuest.done);
    }
    if (world.impQuest?.depth === depth && (world.impQuest.given || met('imp'))) add(Feature.Imp, world.impQuest.done);
  }
  return entries.sort((a, b) => a.depth - b.depth || a.feature - b.feature);
}

function roomSeen(room: { left: number; top: number; right: number; bottom: number }, seen: readonly boolean[], length: number): boolean {
  const width = Math.round(Math.sqrt(length));
  for (let y = room.top + 1; y < room.bottom; y++) {
    for (let x = room.left + 1; x < room.right; x++) if (seen[y * width + x]) return true;
  }
  return false;
}

/** What the catalog lists, by tab, and the silhouette an unknown one shows (items.png). */
const CATALOG: ReadonlyArray<{ category: 'potion' | 'scroll' | 'ring' | 'wand'; silhouette: number }> = [
  { category: 'potion', silhouette: 56 },
  { category: 'scroll', silhouette: 40 },
  { category: 'ring', silhouette: 72 },
  { category: 'wand', silhouette: 68 },
];

export interface JournalOptions {
  world: World;
  hero: Hero;
  onClose(): void;
}

/** WndJournal and WndCatalogus in one window: the notes, and every potion, scroll, ring and wand. */
export function showJournal(options: JournalOptions, tab: 'notes' | 'catalog' | 'guide' = 'notes', category = 0, entry?: string): void {
  const { world, hero } = options;
  const reopen = (nextTab: 'notes' | 'catalog' | 'guide', nextCategory = category): void => showJournal(options, nextTab, nextCategory);
  // A guide entry has a page of its own, with the way back to the list in this tab.
  if (tab === 'guide' && entry) {
    showGuideEntry(entry, () => reopen('guide'), options.onClose);
    return;
  }
  const tabs = el('div', { className: 'pd-tabs' });
  tabs.setAttribute('role', 'tablist');
  for (const [id, label] of [['notes', t.meta.notes], ['catalog', t.meta.catalog], ['guide', t.guide.tab]] as const) {
    const node = el('button', { className: 'pd-tab', textContent: label, onclick: () => (click(), reopen(id)) });
    node.setAttribute('role', 'tab');
    node.setAttribute('aria-selected', String(id === tab));
    tabs.append(node);
  }
  if (tab === 'guide') {
    show(windowOf({ title: t.meta.journal, onClose: options.onClose, className: 'wide pd-guide-window' }, tabs, ...guideList((id) => showJournal(options, 'guide', category, id))), options.onClose);
    return;
  }
  const body = tab === 'notes' ? notesView(world, hero) : catalogView(options, category, (next) => reopen('catalog', next));
  show(
    windowOf({ title: t.meta.journal, onClose: options.onClose, className: 'wide' }, tabs, el('div', { className: 'pd-scroll' }, body)),
    options.onClose,
  );
}

/** The guide alone, as the camp opens it (the journal's «Памятка» tab, without the world a run has). */
export function showGuide(onClose: () => void, entry?: string): void {
  if (entry) {
    showGuideEntry(entry, () => showGuide(onClose), onClose);
    return;
  }
  show(windowOf({ title: t.guide.tab, onClose, className: 'wide pd-guide-window' }, ...guideList((id) => showGuide(onClose, id))), onClose);
}

/** What the player has read of the guide, kept on this device (a gold dot marks the rest). */
const GUIDE_READ_KEY = 'pd-guide-read';
function guideRead(): Set<string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(GUIDE_READ_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}
function markGuideRead(id: string): void {
  try {
    const read = guideRead();
    if (read.has(id)) return;
    read.add(id);
    localStorage.setItem(GUIDE_READ_KEY, JSON.stringify([...read]));
  } catch {
    // Private mode: the dots just stay.
  }
}

/** The guide's entries: the questions asked most, and the trap colours last. */
function guideItems(): ReadonlyArray<{ id: string; title: string; text: string }> {
  const G = t.guide;
  return [...G.entries, { id: 'traps', title: G.trapColourTitle, text: G.trapColourText }];
}

/** An entry's picture: an item of items.png (or the chest, for mimics), the well, the challenge cup or a trap's colour. */
const GUIDE_ICONS: Readonly<Record<string, ItemKind | number>> = {
  hunger: 'food.ration', ankh: 'ankh', curses: 'ring.mending', uncurse: 'scroll.removeCurse', haggler: 'ring.haggler', mimics: HEAP_SPRITES.mimic,
  seeds: 'seed.sungrass', score: 'quest.amulet', vial: 'vial', alchemy: 'potion.healing', search: 'ring.detection',
};
function guideIcon(id: string, big: boolean): HTMLElement {
  const icon = GUIDE_ICONS[id];
  if (icon !== undefined) {
    const node = el('i', { className: 'pd-item' });
    node.dataset.i = String(typeof icon === 'number' ? icon : itemSprite(createItem(icon), {}));
    node.style.setProperty('--u', big ? '3px' : '2px');
    return node;
  }
  if (id === 'well') {
    const node = el('i', { className: 'pd-guide-img' });
    node.style.backgroundImage = 'var(--spr-guide-well)';
    return node;
  }
  if (id === 'challenges') {
    const node = el('i', { className: 'pd-guide-img' });
    node.style.backgroundImage = 'var(--spr-challenge-on)';
    return node;
  }
  const node = el('i', { className: 'pd-trapc' });
  node.style.setProperty('--c', '1');
  return node;
}

/** A text in sentences: a full stop, a space and a capital, a bracket or a quote begin the next. */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-ZА-ЯЁ«“(])/u).map((part) => part.trim()).filter(Boolean);
}

/** The list: a count line, then a row for each entry (icon, title with a gold dot while unread, a line, a chevron). */
function guideList(open: (id: string) => void): HTMLElement[] {
  const items = guideItems();
  const read = guideRead();
  const count = el('p', { className: 'pd-cat-count', textContent: t.guide.count(items.length, items.filter((item) => read.has(item.id)).length) });
  const list = el('ul', { className: 'pd-guide-list' });
  for (const item of items) {
    const chev = el('i', { className: 'pd-chev' });
    chev.setAttribute('aria-hidden', 'true');
    const row = el(
      'button',
      { className: `pd-guide-row${read.has(item.id) ? ' read' : ''}`, onclick: () => (click(), open(item.id)) },
      el('span', { className: 'pd-guide-ico' }, guideIcon(item.id, false)),
      el('span', { className: 'pd-spell-text' }, el('b', { textContent: item.title }), el('small', { textContent: sentences(item.text)[0] ?? '' })),
      chev,
    );
    list.append(el('li', {}, row));
  }
  sprites(list);
  return [count, el('div', { className: 'pd-scroll' }, list)];
}

/** An entry's page: «‹ Guide» and the cross, the big picture and the title, then the text, points and notes (opened = read). */
function showGuideEntry(id: string, back: () => void, onClose: () => void): void {
  const G = t.guide;
  const item = guideItems().find((entry) => entry.id === id);
  if (!item) return back();
  markGuideRead(id);
  const body = el('div', { className: 'pd-scroll pd-guide-page' });
  if (id === 'traps') {
    body.append(info(G.trapColourText));
    const legend = el('ul', { className: 'pd-trap-legend' });
    // Trap.RED ... Trap.BLACK, as the swatches show them; the spent black one last.
    G.trapColours.forEach(([name, what], i) => {
      const swatch = el('i', { className: 'pd-trapc' });
      swatch.style.setProperty('--c', String(i));
      legend.append(el('li', { className: i === 8 ? 'spent' : '' }, swatch, el('span', {}, el('b', { textContent: capitalize(name) }), el('small', { textContent: capitalize(what) }))));
    });
    body.append(legend, info(G.trapColourNote, 'pd-note'));
  } else {
    const [lead, ...rest] = sentences(item.text);
    body.append(info(lead ?? item.text));
    if (rest.length > 1) body.append(el('ul', { className: 'pd-guide-points' }, ...rest.map((point) => el('li', { textContent: point }))));
    else if (rest.length === 1) body.append(info(rest[0]!));
  }
  const iconBox = el('span', { className: 'pd-guide-ico big' }, guideIcon(id, true));
  const box = windowOf(
    { title: item.title, icon: iconBox, onClose, className: 'wide pd-guide-window' },
    el('button', { className: 'pd-back', textContent: G.tab, onclick: () => (click(), back()) }),
    body,
  );
  sprites(box);
  show(box, onClose);
}

function notesView(world: World, hero: Hero): HTMLElement {
  const entries = journalEntries(world);
  if (entries.length === 0) return el('p', { className: 'pd-empty pd-note center', textContent: t.meta.journalEmpty });
  const list = el('div', { className: 'pd-journal' });
  for (const entry of entries) {
    const icon = el('i', { className: 'pd-jicon' });
    icon.style.setProperty('--j', String(entry.feature));
    list.append(
      el(
        'div',
        { className: `pd-jrow${entry.depth === hero.depth ? ' here' : ''}${entry.done ? ' done' : ''}` },
        icon,
        el('span', { className: 'pd-jname', textContent: t.meta.features[entry.feature] ?? '' }),
        el('span', { className: 'pd-jdepth', textContent: String(entry.depth) }),
      ),
    );
  }
  return list;
}

function catalogView(options: JournalOptions, category: number, choose: (category: number) => void): HTMLElement {
  const { world, hero } = options;
  const tabs = el('div', { className: 'pd-tabs compact' });
  tabs.setAttribute('role', 'tablist');
  t.meta.categories.forEach((label, i) => {
    const node = el('button', { className: 'pd-tab', textContent: label, onclick: () => (click(), choose(i)) });
    node.setAttribute('role', 'tab');
    node.setAttribute('aria-selected', String(i === category));
    tabs.append(node);
  });
  const { category: kind, silhouette } = CATALOG[category]!;
  const kinds = (Object.keys(ITEMS) as ItemKind[]).filter((k) => itemDef(k).category === kind);
  const known = kinds.filter((k) => world.known.includes(k));
  const detail = el('div', { className: 'pd-cat-detail' });
  const grid = el('div', { className: 'pd-grid pd-catalog' });
  grid.setAttribute('role', 'listbox');
  const pick = (k: ItemKind, slot: HTMLElement): void => {
    grid.querySelectorAll('.selected').forEach((node) => node.classList.remove('selected'));
    slot.classList.add('selected');
    const isKnown = world.known.includes(k);
    const item = { kind: k, qty: 1, level: 0 } as Item;
    detail.className = `pd-cat-detail${isKnown ? '' : ' unknown'}`;
    detail.replaceChildren(
      itemIcon(isKnown ? itemSprite(item, world.run.labels) : silhouette, !isKnown),
      el('span', {}, el('b', { textContent: t.items[k] }), el('small', { textContent: isKnown ? t.meta.identified : t.meta.notIdentified })),
    );
    sprites(detail);
  };
  for (const k of kinds) {
    const isKnown = world.known.includes(k);
    const item = { kind: k, qty: 1, level: 0 } as Item;
    const slot = el('button', {
      className: `pd-slot${isKnown ? '' : ' unknown'}`,
      ariaLabel: t.items[k],
      onclick: () => {
        click();
        if (isKnown && slot.classList.contains('selected')) {
          // A second tap on a known one reads it, and comes back here.
          showItemText(options, item, () => showJournal(options, 'catalog', category));
          return;
        }
        pick(k, slot);
      },
    }, itemIcon(isKnown ? itemSprite(item, world.run.labels) : silhouette, !isKnown));
    slot.setAttribute('role', 'option');
    grid.append(slot);
  }
  void hero;
  return el(
    'div',
    {},
    tabs,
    el('div', { className: 'pd-cat-count', textContent: t.meta.known(known.length, kinds.length) }),
    grid,
    detail,
  );
}

function itemIcon(sprite: number, silhouette: boolean): HTMLElement {
  const icon = el('i', { className: `pd-item${silhouette ? ' silhouette' : ''}` });
  icon.dataset.i = String(sprite);
  return icon;
}

function showItemText(options: JournalOptions, item: Item, onClose: () => void): void {
  const { world, hero } = options;
  const lines = itemInfo(world, hero, item);
  show(
    windowOf(
      { title: itemName(world, item), icon: el('div', { className: 'pd-slot' }, itemIcon(itemSprite(item, world.run.labels), false)), onClose },
      ...lines.map((line) => info(line)),
    ),
    onClose,
  );
}

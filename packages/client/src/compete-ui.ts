import { audio } from './audio';
import { image as campImage, ready as campReady, SHEET } from './camp';
import { itemById } from './catalog';
import type { BoardEntry, BoardWorn } from './checked';
import { fill, formatNumber, type Lang } from './compete-text';
import { artUrl, compete, sayWord, tierOf, titleOf, word } from './compete';
import { type CardHandle, type CardKind, heroCard, lookOfEntry } from './herocard';
import { flItem, onFlChange, flCatalog } from './flart';
import { lang } from './i18n';
import { L } from './i18n-shop';
import { el } from './screens';
import { paintName, titlePlate } from './shopart';
import type { VirtualRow } from './vlist';

/*
 * The pieces the competitions' windows are made of (design part 7, fl-compete.css): the window with its head, tabs, a hero card's
 * stage, a board's row and the podium, a title's small plate, a hero's class icon. Each takes data and gives a node (and, for what holds
 * a hero card, a way to let it go).
 */

export const number = (n: number): string => formatNumber(n, lang);
export const tx = (path: string, values: Readonly<Record<string, string | number>> = {}): string => fill(word(lang, path), values);
export const txn = (path: string, n: number, values: Readonly<Record<string, string | number>> = {}): string => sayWord(lang, path, n, values);

/** A row of a board is this tall, with the gap under it (the list is virtual: it counts in rows of one height). */
export const ROW_H = 56;
export const ROW_GAP = 2;

const monitor = (): boolean => typeof matchMedia === 'function' && matchMedia('(min-width: 900px)').matches;
export const wide = monitor;

/* ---- The window ---- */

export interface Shell {
  win: HTMLElement;
  /** Puts a new head in: a title, a line under it, and a way back if there is one. */
  head(title: string, sub?: string | null, back?: (() => void) | null): void;
  /** Replaces everything under the head. */
  set(...nodes: Node[]): void;
}

/** The window of the competitions: `section.pd-window.fl-mart.fl-compete`, a head to be filled, then what the caller puts in. */
export function competeShell(onClose: () => void): Shell {
  const win = el('section', { className: 'pd-window fl-mart fl-compete' });
  win.setAttribute('role', 'dialog');
  let current: HTMLElement | null = null;
  return {
    win,
    set(...nodes) {
      win.replaceChildren(...(current ? [current] : []), ...nodes);
    },
    head(title, sub, back) {
      const row = el('div', { className: 'fl-mart-head' });
      if (back) {
        const b = el('button', { className: 'pd-button quiet small fl-back', ariaLabel: tx('back') }, '<', el('span', { className: 'lbl', textContent: ` ${tx('back')}` }));
        b.onclick = () => {
          audio.play('click');
          back();
        };
        row.append(b);
      }
      row.append(el('div', { className: 'pd-titles' }, el('h2', { className: 'pd-heading', textContent: title }), sub ? el('div', { className: 'fl-motto', textContent: sub }) : null));
      const x = el('button', { className: 'fl-close', ariaLabel: tx('close'), textContent: '×' });
      x.onclick = () => {
        audio.play('click');
        onClose();
      };
      row.append(x);
      if (current?.isConnected) current.replaceWith(row);
      else win.prepend(row);
      current = row;
    },
  };
}

/** A row of tabs (the game's own `.pd-tabs`). */
export function tabsBar<K extends string>(keys: readonly K[], current: K, labels: Readonly<Record<K, string>>, onSelect: (key: K) => void): HTMLElement {
  const bar = el('div', { className: 'pd-tabs compact' });
  bar.setAttribute('role', 'tablist');
  for (const key of keys) {
    const tab = el('button', { className: 'pd-tab', textContent: labels[key] });
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(key === current));
    tab.dataset.tab = key;
    tab.onclick = () => {
      audio.play('click');
      onSelect(key);
    };
    bar.append(tab);
  }
  return bar;
}

/** Marks which tab of a bar is chosen. */
export function chooseTab(bar: HTMLElement, key: string): void {
  for (const node of bar.children) node.setAttribute('aria-selected', String((node as HTMLElement).dataset.tab === key));
}

/* ---- Small pictures ---- */

/** An image of the art folder drawn at a whole multiple of its pixels (nearest). */
export function art(path: string, scale = 2, className = ''): HTMLImageElement {
  const img = el('img', { className, alt: '', decoding: 'async' });
  img.addEventListener('load', () => {
    img.style.width = `${img.naturalWidth * scale}px`;
    img.style.height = `${img.naturalHeight * scale}px`;
  }, { once: true });
  img.src = artUrl(path);
  return img;
}

/** A hero's class icon: the class sheet's first armour, standing (12 x 15), `scale` screen pixels to an art pixel. */
export function classIcon(heroClass: string, scale = 2): HTMLCanvasElement {
  const canvas = Object.assign(document.createElement('canvas'), { width: 12, height: 15 });
  canvas.style.width = `${12 * scale}px`;
  canvas.style.height = `${15 * scale}px`;
  canvas.setAttribute('aria-hidden', 'true');
  const sheet = SHEET[heroClass];
  if (!sheet) return canvas;
  const image = campImage(`${sheet}.png`);
  const draw = (): void => {
    const g = canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(image, 0, 15, 12, 15, 0, 0, 12, 15);
  };
  if (campReady(image)) draw();
  else image.addEventListener('load', draw, { once: true });
  return canvas;
}

/** The league's small mark (9 x 9) for a row; a step the data does not know shows the first. */
export function tierMini(key: string | undefined): HTMLElement {
  const tier = tierOf(key);
  if (!tier) return el('i', { className: 'fl-mini' });
  const img = art(tier.mini, 2, 'fl-mini');
  img.title = tier.name[lang];
  return img;
}

/** A title's small plate (the shop's titles and the honours of the competitions); null for an id nothing knows. */
export function titleBadge(id: string | undefined, small = true, locked = false): HTMLElement | null {
  if (!id) return null;
  const item = itemById(id);
  if (item?.category === 'title') {
    const plate = titlePlate(item, item.name[L]);
    plate.classList.toggle('small', small);
    plate.classList.toggle('locked', locked);
    // The shop's records of the art come with its catalogue: a plate made before it is dressed when it arrives.
    if (!flCatalog()) {
      const stop = onFlChange(() => {
        if (!flCatalog()) return;
        stop();
        const dressed = titlePlate(item, item.name[L]);
        plate.className = `${dressed.className}${small ? ' small' : ''}${locked ? ' locked' : ''}`;
        plate.replaceChildren(...dressed.childNodes);
        const source = (dressed as HTMLElement).style.borderImageSource;
        if (source) plate.style.borderImageSource = source;
      });
    }
    return plate;
  }
  const honour = titleOf(id);
  if (!honour) return null;
  const plate = el('span', { className: `fl-title-plate ${honour.rarity === 'legend' || honour.rarity === 'legendary' ? 'legend' : honour.rarity}${small ? ' small' : ''}${locked ? ' locked' : ''}` });
  plate.style.borderImageSource = `url("${artUrl(honour.plate)}")`;
  plate.append(el('span', {}, art(honour.icon, small ? 1 : 2)), el('span', { textContent: honour.name[lang as Lang] }));
  return plate;
}

/** A name in the colour its item gives it (the shop's `fl-name-*`); the colours come with the shop's catalogue, a name made before is painted then. */
export function nameNode(name: string, colourId: string | undefined, tag: 'b' | 'span' = 'b'): HTMLElement {
  const node = el(tag, { className: 'fl-name', textContent: name });
  const item = colourId ? itemById(colourId) : undefined;
  const colour = item?.category === 'namecolor' ? item : undefined;
  if (colour) {
    paintName(node, colour);
    if (!flCatalog() || !flItem(colour.id)) {
      const stop = onFlChange(() => {
        if (!flCatalog()) return;
        stop();
        paintName(node, colour);
      });
    }
  }
  return node;
}

/* ---- A hero's stage ---- */

/** A hero card in a box the page lays out (`.fl-stage`): the canvas draws the frame itself. */
export function stage(look: Parameters<typeof heroCard>[0], kind: CardKind, animate: boolean, extra = ''): { node: HTMLElement; card: CardHandle } {
  const card = heroCard(look, { kind, animate, className: 'pd-card-row' });
  return { node: el('span', { className: `fl-stage ${kind}${extra ? ` ${extra}` : ''}` }, card.canvas), card };
}

/* ---- Rows and the podium ---- */

/** What a row says of a player, from a board's entry (or the player's own data in the shape of one). */
export interface RowData {
  entry: BoardEntry;
  place: number | null;
  /** The value to show big, and the small unit beside the line under it. */
  value: string;
  unit: string;
  me?: boolean;
  friend?: boolean;
  zone?: 'up' | 'down';
  /** The card moves (the top three, my own row). */
  moving?: boolean;
  /** No title plate and no friend chip (a narrow aside). */
  compact?: boolean;
  /** An override of the league mark (circles and leagues know the room's step). */
  tier?: string;
  /** What a click does (the profile of the one named: nothing for a public board). */
  onClick?: () => void;
}

const worn = (entry: BoardEntry): BoardWorn => ({ ...entry.w, ...(entry.w?.fr || !entry.fr ? {} : { fr: entry.fr }) });

/** The look a board entry stands for (its class and what it wore), the frame of the old per-field entries included. */
export const lookOf = (entry: BoardEntry, tier?: string): ReturnType<typeof lookOfEntry> => {
  const w = worn(entry);
  const look = lookOfEntry({ heroClass: entry.heroClass, w });
  return { ...look, ...(tier || w.lg ? { lg: tier ?? w.lg } : {}) };
};

const bare = (entry: BoardEntry): boolean => !entry.w || Object.keys(entry.w).length === 0;

/**
 * One row of a board: the place, the hero card, the name in its colour (a patron's mark by it), the score, and under the name the league's
 * mark, the title's plate (or the class) and the unit. The top three and the player's own row are lit by their medal or their gold.
 */
export function rowOf(data: RowData): VirtualRow {
  const { entry, place } = data;
  const w = worn(entry);
  const { node: box, card } = stage(lookOf(entry, data.tier), 'row', data.moving === true);
  const sub = el('span', { className: 'fl-row-sub' });
  if (data.friend && !data.compact && wide()) sub.append(el('span', { className: 'fl-chip-friend', textContent: tx('friend') }));
  sub.append(tierMini(data.tier ?? w.lg));
  const plate = !data.compact ? titleBadge(w.tt ?? entry.tt) : null;
  sub.append(plate ?? el('span', { textContent: tx(`classes.${entry.heroClass}`) }));
  sub.append(el('small', { className: 'fl-row-unit', textContent: data.unit }));
  const name = nameNode(entry.name, w.nc ?? entry.nc);
  if (entry.patron) name.prepend(el('i', { className: 'pd-patron-mark' }));
  const node = el(
    'div',
    {
      className: `fl-row${place === null ? ' no-n' : ''}${data.me ? ' me' : ''}${data.friend ? ' friend' : ''}${place !== null && place <= 3 ? ` m${place}` : ''}${bare(entry) ? ' bare' : ''}${data.zone ? ` ${data.zone}` : ''}`,
    },
    ...(place === null ? [] : [el('span', { className: 'fl-row-n', textContent: String(place) })]),
    box,
    name,
    el('b', { className: 'fl-row-score', textContent: data.value }),
    sub,
  );
  if (data.onClick) {
    node.classList.add('click');
    node.onclick = data.onClick;
  }
  return { node, dispose: () => card.dispose() };
}

/** One of the top three, as a big card: the place, the hero, the name, the title, the score. */
export function podiumPlace(data: RowData & { cup?: string }): VirtualRow {
  const { entry } = data;
  const w = worn(entry);
  const { node: box, card } = stage(lookOf(entry, data.tier), 'podium', true);
  const node = el('div', { className: `fl-pod m${data.place}${data.me ? ' me' : ''}` });
  node.append(el('span', { className: 'fl-pod-n', textContent: `#${data.place}` }), box, nameNode(entry.name, w.nc ?? entry.nc));
  const plate = titleBadge(w.tt ?? entry.tt);
  if (plate) node.append(plate);
  if (data.cup) node.append(art(data.cup, wide() ? 3 : 2, 'cup'));
  node.append(el('span', { className: 'fl-pod-score', textContent: data.value }));
  return { node, dispose: () => card.dispose() };
}

/** The top three as a podium, 2 · 1 · 3 (the places are put in order by the CSS); the cards it made are given back to let go. */
export function podium(places: readonly RowData[]): { node: HTMLElement; dispose: () => void } {
  const made = places.slice(0, 3).map((data) => podiumPlace(data));
  return { node: el('div', { className: 'fl-podium' }, ...made.map((row) => row.node)), dispose: () => made.forEach((row) => row.dispose?.()) };
}

/** Whether the competitions' data has come (a window waits for it before it is drawn). */
export const ready = (): boolean => compete() !== null;

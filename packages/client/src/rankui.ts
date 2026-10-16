import { audio } from './audio';
import type { BoardEntry, BoardKind, BoardView, BoardWorn, Profile, RunApi, SyncAnswer } from './checked';
import { heroCard, lookOfEntry, myLook } from './herocard';
import { type VirtualList, type VirtualRow, virtualList } from './vlist';
import { locale, t } from './i18n';
import type { RunRecord } from './rankings';
import { button, el, info, show, sprites, windowOf } from './screens';
import { itemById } from './catalog';
import { cosmetics } from './cosmetics';
import { L } from './i18n-shop';
import { flCatalog, onFlChange } from './flart';
import { paintName } from './shopart';
import { type RankIcon, rankIcon, trophyKind } from './trophyicons';

/*
 * The boards of checked runs (the server's player.ts): the day's daily dungeon, the week's
 * best, the arena's week, the best ever, and the player's own runs and trophies; the player's
 * card on the title (the streak, the best, the trophies); and the end of a run's places as
 * the server scored it. Markup after the design system's Ranked cards (v16, migration.md).
 */

type Tab = 'daily' | 'week' | 'arena' | 'all' | 'device';
/** The arena of waves is no longer offered: its boards are not shown. */
const TABS: readonly Tab[] = ['daily', 'week', 'all', 'device'];
/** The icon of each board's note and of its places 1–3. */
const BOARD_ICON: Partial<Record<string, RankIcon>> = { daily: 'gold', week: 'week', arena: 'arena' };

const number = (n: number): string => n.toLocaleString(locale);

/** A name in the colour of its item. The designer's colours come with their catalogue (flart.ts): a name made before it has arrived is painted when it does. */
function paintNameLive(node: HTMLElement, item: Parameters<typeof paintName>[1]): void {
  paintName(node, item);
  if (!item || flCatalog()) return;
  const stop = onFlChange(() => {
    if (!flCatalog()) return;
    stop();
    paintName(node, item);
  });
}

interface RowEntry {
  heroClass: BoardEntry['heroClass'];
  name: string;
  score: number;
  patron?: boolean;
  /** Name colour, title and portrait frame worn (Pixel-Mart's catalogue, item ids): the old per-field values of an entry. */
  nc?: string;
  tt?: string;
  fr?: string;
  /** How the hero looked: the server's snapshot (look, hat, pet, fire, frame, title, name colour). */
  w?: BoardWorn;
}

/** A row of a board is this tall, on a phone and everywhere (the list is virtual: it counts in rows of one height). */
const ROW_H = 56;

/** A row with what must be done when it leaves the page (its hero card stops moving). */
type RowNode = VirtualRow;

/**
 * One row of a board: place (none on the player's own list), the hero card (the hero in the look, hat, pet and camp fire the player
 * wore, in their frame), name in its colour with a patron's mark and the title, score, and what the run came to.
 * `moving`: the top three, the player's own row: their card's fire and pet move; every other row is a still frame.
 */
function row(place: number | null, entry: RowEntry, detail: Array<string | Node>, me: boolean, moving = false): RowNode {
  const medal = place !== null && place <= 3 ? ` pd-medal-${place}` : '';
  // What the player wears for the boards (looks only): `w`, or the old per-field values of an entry from before it.
  const worn = (id: string | undefined, category: string) => {
    const found = id ? itemById(id) : undefined;
    return found?.category === category ? found : undefined;
  };
  const look = lookOfEntry({ heroClass: entry.heroClass, w: { ...entry.w, ...(entry.w?.fr || !entry.fr ? {} : { fr: entry.fr }) } });
  const card = heroCard(look, { animate: moving || me, scale: 2, className: 'pd-rank-art' });
  const label = el('span', { textContent: entry.name });
  paintNameLive(label, worn(entry.w?.nc ?? entry.nc, 'namecolor'));
  const title = worn(entry.w?.tt ?? entry.tt, 'title');
  const node = el(
    'div',
    { className: `pd-rank${me ? ' me' : ''}${medal}${title ? '' : ' no-title'}` },
    place !== null ? el('span', { className: 'pd-rank-n', textContent: String(place) }) : null,
    el('span', { className: 'pd-rank-card' }, card.canvas),
    el('span', { className: 'pd-rank-name' }, entry.patron ? el('i', { className: 'pd-patron-mark' }) : null, label),
    title ? el('small', { className: `pd-rank-title ${title.rarity}`, textContent: title.name[L] }) : null,
    el('span', { className: 'pd-rank-score', textContent: number(entry.score) }),
    el('small', { className: 'pd-rank-detail' }, ...detail),
  );
  return { node, dispose: () => card.dispose() };
}

/** «Warrior · lv.22 · ⛶24», the depth as its icon; in the arena «Warrior · wave 23». */
function detail(heroClass: BoardEntry['heroClass'], level: number, depth: number, arena: boolean, won = false): Array<string | Node> {
  if (arena) return [`${t.classes[heroClass]} · ${t.arena.waveWord(depth)}`];
  return [`${t.classes[heroClass]} · ${t.ranked.lv}${level} · `, el('i', { className: 'pd-rank-depth' }), `${depth}${won ? ' · ★' : ''}`];
}

/** Boards longer than this are listed virtually (only the rows on screen are mounted). */
const EAGER_ROWS = 12;

/**
 * A board as rows, then (stuck to the bottom) my row if it is further down, and my place. Given the element that scrolls it, a long
 * board mounts only the rows on screen; `onList` gets the list, so that it can be stopped when the board is left.
 */
export function boardRows(board: BoardView | null, arena: boolean, scroller?: HTMLElement, onList?: (list: VirtualList) => void): HTMLElement[] {
  if (!board) return [info(t.boardOffline, 'pd-note center')];
  const make = (i: number): RowNode => {
    const entry = board.top[i]!;
    return row(i + 1, entry, detail(entry.heroClass, entry.level, entry.depth, arena, entry.won), i + 1 === board.rank, i < 3);
  };
  let list: HTMLElement;
  if (scroller && board.top.length > EAGER_ROWS) {
    const virtual = virtualList(scroller, board.top.length, ROW_H, make, 'pd-ranks virtual');
    onList?.(virtual);
    list = virtual.node;
  } else {
    list = el('div', { className: 'pd-ranks' }, ...board.top.map((_, i) => make(i).node));
  }
  const nodes: HTMLElement[] = [board.top.length === 0 ? info(t.noResults, 'pd-note center') : list];
  if (board.rank !== null) {
    const below = board.rank > board.top.length && board.you;
    nodes.push(
      el(
        'div',
        { className: 'pd-ranks-me' },
        below ? el('div', { className: 'pd-ranks-gap', textContent: '· · ·' }) : null,
        below ? row(board.rank, board.you!, detail(board.you!.heroClass, board.you!.level, board.you!.depth, arena, board.you!.won), true).node : null,
        el('div', { className: 'pd-board-place', textContent: t.ranked.placeOf(board.rank, board.total ?? board.rank) }),
      ),
    );
  } else {
    nodes.push(info(t.ranked.notYet, 'pd-note center'));
  }
  return nodes;
}

const shortDate = (time: number): string => new Date(time).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });

/** «Mine»: the shelf of trophies won, then the device's best runs, each with its date. */
function mineRows(records: readonly RunRecord[], trophies: Profile['trophies']): HTMLElement[] {
  const nodes: HTMLElement[] = [];
  if (trophies.length > 0) {
    nodes.push(
      el(
        'div',
        { className: 'pd-trophy-shelf' },
        ...trophies.slice(0, 12).map((trophy) => {
          const kind = trophy.board.split(':')[0] ?? '';
          return el('span', { title: trophyText(trophy) }, rankIcon(trophyKind(trophy.board, trophy.place), { big: true }), el('b', { textContent: `#${trophy.place}` }), t.ranked.trophyBoard[kind] ?? kind);
        }),
      ),
    );
  }
  if (records.length === 0) {
    nodes.push(info(t.noRankings, 'pd-note center'));
    return nodes;
  }
  const list = el('div', { className: 'pd-ranks mine' });
  for (const record of records) {
    const arena = record.mode === 'arena';
    const what = record.won ? '' : record.cause ? ` · ${record.cause}` : '';
    // A run the server did not check (played before checked runs, or without the server) is on no board: it says so.
    const unranked = record.checked ? '' : ` · ${t.ranked.offBoard}`;
    // The device's own runs are this player's: their hero as they wear it now.
    const mine = myLook(record.heroClass);
    const w: BoardWorn = { ...(mine.l ? { l: mine.l } : {}), ...(mine.h ? { h: mine.h } : {}), ...(mine.p ? { p: mine.p } : {}), ...(mine.f ? { f: mine.f } : {}), ...(mine.fr ? { fr: mine.fr } : {}) };
    const mineRow = row(null, { ...record, w: { ...w, ...(cosmetics.nameColor ? { nc: cosmetics.nameColor.id } : {}), ...(cosmetics.title ? { tt: cosmetics.title.id } : {}) } }, [`${shortDate(record.date)} · `, ...detail(record.heroClass, record.lvl, record.depth, arena, record.won), unranked, what], false);
    list.append(mineRow.node);
  }
  nodes.push(list);
  return nodes;
}

export interface BoardsOptions {
  api: RunApi | null;
  /** The device's own table (rankings.ts). */
  device: readonly RunRecord[];
  /** Trophies won, for «Mine» (the server's profile). */
  trophies?: Profile['trophies'];
  tab?: Tab;
  onClose(): void;
}

/** The rankings window: a tab a board, each loaded when first shown. */
export function showBoards(options: BoardsOptions): void {
  const body = el('div', { className: 'pd-scroll pd-boards' });
  const note = el('p', { className: 'pd-board-note' });
  const tabs = el('div', { className: 'pd-tabs compact' });
  tabs.setAttribute('role', 'tablist');
  const cache = new Map<Tab, Promise<BoardView | null>>();
  let current: Tab = options.api ? (options.tab ?? 'daily') : 'device';
  let listing: VirtualList | null = null;
  const select = (tab: Tab): void => {
    current = tab;
    // The board left behind lets its rows (and their hero cards) go.
    listing?.dispose();
    listing = null;
    for (const node of tabs.children) node.setAttribute('aria-selected', String((node as HTMLElement).dataset.tab === tab));
    const icon = BOARD_ICON[tab];
    note.replaceChildren(...(icon ? [rankIcon(icon)] : []), options.api ? t.ranked.tabInfo[tab] ?? '' : t.ranked.telegramOnly);
    if (tab === 'device' || !options.api) {
      body.replaceChildren(...mineRows(options.device.filter((record) => record.mode !== 'arena'), (options.trophies ?? []).filter((trophy) => !trophy.board.startsWith('arena:'))));
      sprites(body);
      return;
    }
    body.replaceChildren(info(t.loading, 'pd-note center'));
    if (!cache.has(tab)) cache.set(tab, options.api.board(tab as BoardKind));
    void cache.get(tab)!.then((board) => {
      if (current !== tab) return;
      body.replaceChildren(...boardRows(board, tab === 'arena', body, (list) => { listing = list; }));
      sprites(body);
    });
  };
  for (const tab of options.api ? TABS : (['device'] as const)) {
    const node = el('button', {
      className: 'pd-tab',
      textContent: t.ranked.tabs[tab] ?? tab,
      onclick: () => {
        audio.play('click');
        select(tab);
      },
    });
    node.dataset.tab = tab;
    node.setAttribute('role', 'tab');
    tabs.append(node);
  }
  show(windowOf({ title: t.ranked.title, onClose: options.onClose, className: 'pd-boards-window' }, tabs, note, body), options.onClose);
  select(current);
}

/** When the day's board closes (ms): the end of the UTC day. */
export function boardCloses(now: number): number {
  return Math.floor(now / 86_400_000 + 1) * 86_400_000;
}

/** «2 дн 7 ч», «5 ч 12 мин», «9 мин»; the last minute is «a moment». */
export function countdown(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  const u = t.camp.units;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (minutes < 1) return u.soon;
  return days > 0 ? `${days} ${u.d} ${hours} ${u.h}` : hours > 0 ? `${hours} ${u.h} ${minutes % 60} ${u.m}` : `${minutes} ${u.m}`;
}

/** What the camp's card says of a player the server does not know (outside Telegram): the device's own table. */
export interface CardFallback {
  best: number;
  games: number;
}

export interface CardOptions {
  /** The name shown. */
  name: string;
  /** The hero on the scene, in avatars.png (the order of the camp's classes). */
  avatar: number;
  /** The hero's class on the scene: his card shows him as this player wears him. */
  heroClass?: string;
  /** The portrait frame worn (Pixel-Mart): the card draws the frame itself now. */
  frame?: string;
  profile: Profile | null;
  fallback?: CardFallback;
  onOpen(): void;
}

/**
 * The player's card at the top of the camp: the portrait in the frame worn, the name, the streak's flame and days, the best and
 * the runs (today's place once played), frosts and trophies. Without the server's word it keeps to the name and the device's table.
 */
export function profileCard(options: CardOptions): HTMLElement {
  const { profile } = options;
  const streak = profile?.streak.count ?? 0;
  // The portrait is the hero card: this player's hero in the look, hat, pet and camp fire worn now, in the profile frame, moving.
  const heroClass = options.heroClass ?? (['warrior', 'mage', 'rogue', 'huntress'][options.avatar] ?? 'warrior');
  const card = heroCard(() => myLook(heroClass), { animate: true, scale: 2, className: 'pd-profile-art' });
  const portrait = el('span', { className: 'pd-profile-face card' }, card.canvas);
  // The name colour and title worn (Pixel-Mart's catalogue).
  const worn = { color: cosmetics.nameColor, title: cosmetics.title };
  const nameNode = el('span', { className: 'pd-profile-name', textContent: options.name });
  paintNameLive(nameNode, worn.color);
  const facts: Node[] = [];
  const fact = (label: string, value: string, className = ''): void => {
    if (facts.length > 0) facts.push(document.createTextNode(' · '));
    // Each fact keeps to one line; the line breaks between them.
    facts.push(el('span', { className: 'pd-fact' }, `${label} `, el('b', { className, textContent: value })));
  };
  const best = profile?.best ?? options.fallback?.best ?? 0;
  const games = profile?.games ?? options.fallback?.games ?? 0;
  if (best > 0) fact(t.ranked.best, number(best));
  fact(t.ranked.games, String(games));
  if (profile?.dailyDone && profile.places.daily) fact(t.ranked.today, `#${profile.places.daily}`, 'place');
  const side = el('span', { className: 'pd-profile-side' });
  if (profile && profile.streak.freezes > 0) {
    side.append(el('span', { className: 'pd-counter frost', title: t.ranked.freezeInfo }, rankIcon('frost'), String(profile.streak.freezes)));
  }
  if (profile && profile.trophies.length > 0) side.append(el('span', { className: 'pd-counter trophies' }, rankIcon('gold'), String(profile.trophies.length)));
  return el(
    'button',
    {
      className: 'pd-profile framed',
      ariaLabel: t.camp.profileHint,
      onclick: () => {
        audio.play('click');
        options.onOpen();
      },
    },
    portrait,
    el(
      'span',
      { className: 'pd-profile-text' },
      nameNode,
      worn.title ? el('span', { className: 'pd-profile-title', textContent: worn.title.name[L] }) : null,
      profile ? el('span', { className: `pd-profile-streak${streak > 0 ? '' : ' off'}` }, rankIcon(streak > 0 ? 'flame' : 'flame-off', { x1: true }), streak > 0 ? t.ranked.streak(streak) : t.ranked.streakNone) : null,
      el('span', { className: 'pd-profile-facts' }, ...facts),
    ),
    side.childElementCount > 0 ? side : null,
  );
}

/** A trophy's words: which board, which place, and when. */
export function trophyText(trophy: { board: string; place: number }): string {
  const [kind = '', when = ''] = trophy.board.split(':');
  return `${t.ranked.trophy(t.ranked.trophyBoard[kind] ?? kind, trophy.place)} (${when})`;
}

/** The end of a run as the server scored it: checked, a record, its places best first; or why it does not count. */
export function rankingBlock(answer: Promise<SyncAnswer | null> | null): HTMLElement {
  const block = el('div', { className: 'pd-ranking' });
  if (!answer) {
    block.append(el('p', { className: 'pd-checked off', textContent: t.ranked.unchecked }));
    return block;
  }
  block.append(el('p', { className: 'pd-checked pending', textContent: t.ranked.checking }));
  void answer.then((reply) => {
    if (!reply?.finished) {
      block.replaceChildren(el('p', { className: 'pd-checked off', textContent: t.ranked.offline }));
      return;
    }
    const places = (Object.entries(reply.places ?? {}).filter(([, place]) => typeof place === 'number') as Array<[string, number]>)
      .sort((a, b) => a[1] - b[1]);
    block.replaceChildren(
      el('p', { className: 'pd-checked', textContent: t.ranked.checked }),
      reply.record ? el('p', { className: 'pd-new-record', textContent: t.ranked.record }) : '',
      places.length > 0
        ? el(
          'div',
          { className: 'pd-places' },
          ...places.map(([kind, place]) => {
            const top = place <= 3;
            const icon = top && BOARD_ICON[kind] ? rankIcon(kind === 'daily' ? trophyKind('daily', place) : BOARD_ICON[kind]!) : null;
            return el('span', { className: `pd-place${top ? ' top' : ''}` }, icon, el('b', { textContent: `#${place}` }), t.ranked.placeShort[kind] ?? kind);
          }),
        )
        : !reply.finished.ranked ? info(t.ranked.practice, 'pd-note center') : '',
    );
  });
  return block;
}

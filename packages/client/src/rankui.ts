import { audio } from './audio';
import type { BoardEntry, BoardKind, BoardView, Profile, RunApi, SyncAnswer } from './checked';
import { locale, t } from './i18n';
import type { RunRecord } from './rankings';
import { AVATAR, button, el, info, show, sprites, windowOf } from './screens';
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

interface RowEntry {
  heroClass: BoardEntry['heroClass'];
  name: string;
  score: number;
  patron?: boolean;
}

/** One row of a board: place (none on the player's own list), face, name with a patron's mark, score, and what the run came to. */
function row(place: number | null, entry: RowEntry, detail: Array<string | Node>, me: boolean): HTMLElement {
  const face = el('i', { className: 'pd-rank-face' });
  face.style.setProperty('--av', String(AVATAR[entry.heroClass]));
  const medal = place !== null && place <= 3 ? ` pd-medal-${place}` : '';
  return el(
    'div',
    { className: `pd-rank${me ? ' me' : ''}${medal}` },
    place !== null ? el('span', { className: 'pd-rank-n', textContent: String(place) }) : null,
    face,
    el('span', { className: 'pd-rank-name' }, entry.patron ? el('i', { className: 'pd-patron-mark' }) : null, entry.name),
    el('span', { className: 'pd-rank-score', textContent: number(entry.score) }),
    el('small', { className: 'pd-rank-detail' }, ...detail),
  );
}

/** «Warrior · lv.22 · ⛶24», the depth as its icon; in the arena «Warrior · wave 23». */
function detail(heroClass: BoardEntry['heroClass'], level: number, depth: number, arena: boolean, won = false): Array<string | Node> {
  if (arena) return [`${t.classes[heroClass]} · ${t.arena.waveWord(depth)}`];
  return [`${t.classes[heroClass]} · ${t.ranked.lv}${level} · `, el('i', { className: 'pd-rank-depth' }), `${depth}${won ? ' · ★' : ''}`];
}

/** A board as rows, then (stuck to the bottom) my row if it is further down, and my place. */
export function boardRows(board: BoardView | null, arena: boolean, count = 50): HTMLElement[] {
  if (!board) return [info(t.boardOffline, 'pd-note center')];
  const list = el('div', { className: 'pd-ranks' });
  board.top.slice(0, count).forEach((entry, i) => list.append(row(i + 1, entry, detail(entry.heroClass, entry.level, entry.depth, arena, entry.won), i + 1 === board.rank)));
  const nodes: HTMLElement[] = [board.top.length === 0 ? info(t.noResults, 'pd-note center') : list];
  if (board.rank !== null) {
    const below = board.rank > count && board.you;
    nodes.push(
      el(
        'div',
        { className: 'pd-ranks-me' },
        below ? el('div', { className: 'pd-ranks-gap', textContent: '· · ·' }) : null,
        below ? row(board.rank, board.you!, detail(board.you!.heroClass, board.you!.level, board.you!.depth, arena, board.you!.won), true) : null,
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
    list.append(row(null, record, [`${shortDate(record.date)} · `, ...detail(record.heroClass, record.lvl, record.depth, arena, record.won), unranked, what], false));
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
  const select = (tab: Tab): void => {
    current = tab;
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
      body.replaceChildren(...boardRows(board, tab === 'arena'));
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

/** The player's card on the title: the streak's flame and days, the best and the runs (today's place once played), frosts and trophies. */
export function profileCard(profile: Profile, onOpen: () => void): HTMLElement {
  const streak = profile.streak.count;
  const flame = el('span', { className: `pd-streak ${streak > 0 ? 'on' : 'off'}` }, rankIcon(streak > 0 ? 'flame' : 'flame-off'), streak > 0 ? el('b', { textContent: String(streak) }) : null);
  const facts: Node[] = [];
  const fact = (label: string, value: string, className = ''): void => {
    if (facts.length > 0) facts.push(document.createTextNode(' · '));
    // Each fact keeps to one line; the line breaks between them.
    facts.push(el('span', { className: 'pd-fact' }, `${label} `, el('b', { className, textContent: value })));
  };
  if (profile.best > 0) fact(t.ranked.best, number(profile.best));
  fact(t.ranked.games, String(profile.games));
  if (profile.dailyDone && profile.places.daily) fact(t.ranked.today, `#${profile.places.daily}`, 'place');
  const side = el('span', { className: 'pd-profile-side' });
  if (profile.streak.freezes > 0) {
    side.append(el('span', { className: 'pd-counter frost', title: t.ranked.freezeInfo }, rankIcon('frost'), String(profile.streak.freezes)));
  }
  if (profile.trophies.length > 0) side.append(el('span', { className: 'pd-counter trophies' }, rankIcon('gold'), String(profile.trophies.length)));
  return el(
    'button',
    {
      className: 'pd-profile',
      ariaLabel: t.ranked.title,
      onclick: () => {
        audio.play('click');
        onOpen();
      },
    },
    flame,
    el(
      'span',
      { className: 'pd-profile-text' },
      el('span', { className: 'pd-profile-streak', textContent: streak > 0 ? t.ranked.streak(streak) : t.ranked.streakNone }),
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

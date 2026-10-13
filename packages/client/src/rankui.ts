import { audio } from './audio';
import type { BoardEntry, BoardKind, BoardView, Profile, RunApi, SyncAnswer } from './checked';
import { locale, t } from './i18n';
import type { RunRecord } from './rankings';
import { AVATAR, button, el, info, show, sprites, windowOf } from './screens';

/*
 * The boards of checked runs (the server's player.ts): the day's daily dungeon, the week's
 * best, the arena's week, the best ever, and the device's own table; a player's card on the
 * title (the streak, the best, the trophies); and the end of a run's places as the server
 * scored it.
 */

type Tab = 'daily' | 'week' | 'arena' | 'all' | 'device';
const TABS: readonly Tab[] = ['daily', 'week', 'arena', 'all', 'device'];

/** One row of a board: place, face, name (with a patron's star), what the run came to, its score. */
function row(place: number, entry: Pick<BoardEntry, 'heroClass' | 'name' | 'score' | 'patron'>, detail: string, me: boolean): HTMLElement {
  const face = el('i', { className: 'pd-rank-face' });
  face.style.setProperty('--av', String(AVATAR[entry.heroClass]));
  const medal = place <= 3 ? ` pd-medal-${place}` : '';
  return el(
    'div',
    { className: `pd-rank${me ? ' me' : ''}${medal}` },
    el('span', { className: 'pd-rank-n', textContent: String(place) }),
    face,
    el('span', { className: 'pd-rank-name', textContent: `${entry.patron ? '★ ' : ''}${entry.name}` }, el('small', { textContent: detail })),
    el('span', { className: 'pd-rank-score', textContent: entry.score.toLocaleString(locale) }),
  );
}

const entryDetail = (entry: BoardEntry, arena: boolean): string =>
  arena
    ? `${t.classes[entry.heroClass]} · ${t.arena.waveWord(entry.depth)}`
    : `${t.classes[entry.heroClass]} · ${t.levelShort} ${entry.level} · ${t.depthShort(entry.depth)}${entry.won ? ' · ★' : ''}`;

/** A board as rows; mine highlighted, and my place under the list when it is further down. */
export function boardRows(board: BoardView | null, arena: boolean, count = 50): HTMLElement {
  if (!board) return info(t.boardOffline, 'pd-note center');
  const list = el('div', { className: 'pd-ranks' });
  board.top.slice(0, count).forEach((entry, i) => list.append(row(i + 1, entry, entryDetail(entry, arena), i + 1 === board.rank)));
  const mine = board.rank !== null && board.rank > count && board.you
    ? el('div', { className: 'pd-ranks pd-ranks-me' }, row(board.rank, board.you, entryDetail(board.you, arena), true))
    : null;
  return el(
    'div',
    {},
    board.top.length === 0 ? info(t.noResults, 'pd-note center') : list,
    mine,
    board.rank !== null && board.total ? info(t.ranked.placeOf(board.rank, board.total), 'pd-info center') : info(t.ranked.notYet, 'pd-note center'),
  );
}

function deviceRows(records: readonly RunRecord[]): HTMLElement {
  if (records.length === 0) return info(t.noRankings, 'pd-note center');
  const list = el('div', { className: 'pd-ranks' });
  records.forEach((record, i) => {
    const what = record.won ? `★ ${t.won}` : record.cause;
    const detail = record.mode === 'arena'
      ? `${t.arena.title} · ${t.arena.waveWord(record.depth)}${what ? ` · ${what}` : ''}`
      : `${t.levelShort} ${record.lvl} · ${t.depthShort(record.depth)}${what ? ` · ${what}` : ''}`;
    list.append(row(i + 1, { heroClass: record.heroClass, name: record.name, score: record.score }, detail, false));
  });
  return list;
}

export interface BoardsOptions {
  api: RunApi | null;
  /** The device's own table (rankings.ts). */
  device: readonly RunRecord[];
  tab?: Tab;
  onClose(): void;
}

/** The rankings window: a tab a board, loaded when first shown. */
export function showBoards(options: BoardsOptions): void {
  const body = el('div', { className: 'pd-scroll pd-boards' });
  const note = info('', 'pd-note center');
  const tabs = el('div', { className: 'pd-tabs compact' });
  const cache = new Map<Tab, Promise<BoardView | null>>();
  let current: Tab = options.api ? (options.tab ?? 'daily') : 'device';
  const select = (tab: Tab): void => {
    current = tab;
    for (const node of tabs.children) node.setAttribute('aria-selected', String((node as HTMLElement).dataset.tab === tab));
    note.textContent = t.ranked.tabInfo[tab] ?? '';
    if (tab === 'device' || !options.api) {
      body.replaceChildren(deviceRows(options.device), options.api ? '' : info(t.ranked.telegramOnly, 'pd-note center'));
      sprites(body);
      return;
    }
    body.replaceChildren(info(t.loading, 'pd-note center'));
    if (!cache.has(tab)) cache.set(tab, options.api.board(tab as BoardKind));
    void cache.get(tab)!.then((board) => {
      if (current !== tab) return;
      body.replaceChildren(boardRows(board, tab === 'arena'));
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

/** The player's card on the title: the streak (and its frosts), the best, runs and wins, trophies, today's place. */
export function profileCard(profile: Profile, onOpen: () => void): HTMLElement {
  const streak = profile.streak.count;
  const flame = el('span', { className: `pd-streak${streak > 0 ? ' on' : ''}`, textContent: `🔥 ${streak}` });
  const lines: HTMLElement[] = [
    el('span', { className: 'pd-profile-streak', textContent: streak > 0 ? t.ranked.streak(streak) : t.ranked.streakNone }),
  ];
  const facts = [
    profile.best > 0 ? `${t.ranked.best}: ${profile.best.toLocaleString(locale)}` : '',
    `${t.ranked.games}: ${profile.games}`,
    profile.wins > 0 ? `${t.ranked.wins}: ${profile.wins}` : '',
    profile.places.daily ? t.ranked.dailyPlace(profile.places.daily) : '',
  ].filter(Boolean);
  lines.push(el('small', { textContent: facts.join(' · ') }));
  const card = el(
    'button',
    {
      className: 'pd-profile',
      onclick: () => {
        audio.play('click');
        onOpen();
      },
    },
    flame,
    el('span', { className: 'pd-profile-text' }, ...lines),
    profile.streak.freezes > 0 ? el('span', { className: 'pd-freeze', title: t.ranked.freezeInfo, textContent: t.ranked.freezes(profile.streak.freezes) }) : null,
    profile.trophies.length > 0 ? el('span', { className: 'pd-trophies', textContent: `🏆 ${profile.trophies.length}` }) : null,
  );
  return card;
}

/** A trophy's words: which board, which place. */
export function trophyText(trophy: { board: string; place: number }): string {
  const kind = trophy.board.split(':')[0] ?? '';
  const when = trophy.board.split(':')[1] ?? '';
  return `${t.ranked.trophy(t.ranked.trophyBoard[kind] ?? kind, trophy.place)} (${when})`;
}

/** The end of a run as the server scored it: checked, its places, a record; or why it does not count. */
export function rankingBlock(answer: Promise<SyncAnswer | null> | null, onBoards: (() => void) | null): HTMLElement {
  const block = el('div', { className: 'pd-ranking' });
  if (!answer) {
    block.append(info(t.ranked.unchecked, 'pd-note center'));
    return block;
  }
  block.append(info(t.ranked.checking, 'pd-note center'));
  void answer.then((reply) => {
    if (!reply?.finished) {
      block.replaceChildren(info(t.ranked.offline, 'pd-note center'));
      return;
    }
    const places = Object.entries(reply.places ?? {}).filter(([, place]) => typeof place === 'number') as Array<[string, number]>;
    block.replaceChildren(
      el('p', { className: 'pd-checked', textContent: `✓ ${t.ranked.checked}` }),
      reply.record ? el('p', { className: 'pd-info center pd-gold', textContent: t.ranked.record }) : '',
      places.length > 0
        ? el('div', { className: 'pd-places' }, ...places.map(([kind, place]) => el('span', { className: `pd-place${place <= 3 ? ' top' : ''}` }, el('b', { textContent: `#${place}` }), ` ${t.ranked.placeShort[kind] ?? kind}`)))
        : !reply.finished.ranked ? info(t.ranked.practice, 'pd-note center') : '',
      onBoards ? button(t.ranked.title, onBoards, 'quiet') : '',
    );
  });
  return block;
}

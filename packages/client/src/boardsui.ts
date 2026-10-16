import { weekEnd } from '@pd/core';
import { audio } from './audio';
import type { BoardEntry, BoardKind, BoardSlice, BoardView, Profile, RunApi } from './checked';
import { compete, loadCompete } from './compete';
import { chooseTab, classIcon, competeShell, nameNode, number, podium, rowOf, ROW_GAP, ROW_H, type RowData, stage, tabsBar, tx, txn, wide } from './compete-ui';
import { myLook } from './herocard';
import { lang, t } from './i18n';
import type { RunRecord } from './rankings';
import { boardCloses, countdown } from './rankui';
import { el, info, show, sprites } from './screens';
import { type VirtualList, type VirtualRow, virtualList } from './vlist';

/*
 * The boards (design part 7, fl-compete.css): tabs Day · Week · All time, a slice of each by what is ranked (score, speed, depth) and by
 * hero; the top three as a podium; the rows from the fourth, each a hero card as the player dressed him; the player's own row pinned to
 * the bottom with «Your place: N of M»; how many played, and when the board closes. On a monitor the player's own card stands at the side.
 * The rows come from the server (checked runs only); a board that cannot be had says so.
 */

type Tab = 'day' | 'week' | 'all' | 'device';
type BoardTab = Exclude<Tab, 'device'>;
const TABS: readonly BoardTab[] = ['day', 'week', 'all'];
const KIND: Record<BoardTab, BoardKind> = { day: 'daily', week: 'week', all: 'all' };
const METRICS = ['score', 'speed', 'depth'] as const;
const CLASSES = ['all', 'warrior', 'mage', 'rogue', 'huntress'] as const;

/** The board names the rest of the game uses (the camp's, the results', the mail's) for the tabs. */
const TAB_OF: Record<string, Tab> = { daily: 'day', week: 'week', all: 'all', device: 'device', arena: 'day', day: 'day' };

/** Boards longer than this are listed virtually (only the rows on screen are mounted). */
const EAGER_ROWS = 12;

/** What the board shows big, and small beside the line under the name, for a run on a list ranked by `metric`. */
export function valueOf(entry: BoardEntry, metric: BoardSlice['metric']): { value: string; unit: string } {
  if (metric === 'speed') {
    if (entry.turns === undefined || entry.depth < (compete()?.boards.speed.minDepth ?? 5)) return { value: '—', unit: '' };
    return { value: number(Math.round(entry.turns / entry.depth)), unit: tx('perTurn') };
  }
  if (metric === 'depth') return { value: number(entry.depth), unit: entry.turns === undefined ? '' : txn('turns', entry.turns) };
  return { value: number(entry.score), unit: tx('depthShort', { n: entry.depth }) };
}

export interface BoardsOptions {
  api: RunApi | null;
  /** The device's own table (rankings.ts). */
  device: readonly RunRecord[];
  /** Trophies won, for «My runs» (the server's profile). */
  trophies?: Profile['trophies'];
  profile?: Profile | null;
  /** The player's own hero class (the card at the side wears his look). */
  heroClass?: string;
  tab?: string;
  /** The slice the window opens on (default: the score, all heroes). */
  slice?: BoardSlice;
  /** Today's rules of the daily dungeon, in words (labelled «Day rules» on the day's board). */
  rules?: { hardship: string; boon: string; info: string };
  onClose(): void;
  /** The profile window (its button is in the head's line). */
  onProfile?(): void;
}

/** The boards window: a tab a board, each loaded when first shown. */
export function showBoards(options: BoardsOptions): void {
  const shell = competeShell(options.onClose);
  show(shell.win, options.onClose);
  shell.set(el('p', { className: 'pd-note center', textContent: tx('loading') }));
  void loadCompete().then(() => build(options, shell));
}

function build(options: BoardsOptions, shell: ReturnType<typeof competeShell>): void {
  const { win } = shell;
  let tab: Tab = options.api ? (TAB_OF[options.tab ?? 'day'] ?? 'day') : 'device';
  let metric: BoardSlice['metric'] = options.slice?.metric ?? 'score';
  let cls: BoardSlice['cls'] = options.slice?.cls ?? null;
  let listing: VirtualList | null = null;
  let held: Array<() => void> = [];
  const cache = new Map<string, Promise<BoardView | null>>();

  const letGo = (): void => {
    listing?.dispose();
    listing = null;
    for (const stop of held) stop();
    held = [];
  };

  const fetchBoard = (): Promise<BoardView | null> => {
    const key = `${tab}|${metric}|${cls ?? ''}`;
    if (!cache.has(key)) cache.set(key, options.api!.board(KIND[tab as BoardTab], { metric, cls }));
    return cache.get(key)!;
  };

  const select = (next: Tab): void => {
    tab = next;
    render();
  };

  const render = (): void => {
    letGo();
    if (tab === 'device') {
      shell.head(tx('myRuns'), null, options.api ? () => select('day') : null);
      const rows = mineRows(options.device, options.trophies ?? [], (node) => held.push(() => node.dispose?.()));
      shell.set(el('div', { className: 'fl-mart-main fl-boards' }, ...rows));
      sprites(win);
      return;
    }
    shell.head(tx('boards'), tx(`tabInfo.${tab}`));
    const bar = tabsBar(TABS, tab, { day: tx('tabs.day'), week: tx('tabs.week'), all: tx('tabs.all') } as Record<BoardTab, string>, (key) => {
      if (key !== tab) select(key);
    });
    chooseTab(bar, tab);
    const main = el('div', { className: 'fl-mart-main fl-boards' }, ...topParts());
    const stamp = `${tab}|${metric}|${cls ?? ''}`;
    const slot = el('div', { className: 'fl-list' }, info(tx('loading'), 'pd-note center'));
    main.append(slot);
    const mine = el('aside', { className: 'fl-side' }, ...sideParts());
    shell.set(bar, wide() ? el('div', { className: 'fl-cols' }, main, mine) : main);
    void fetchBoard().then((view) => {
      if (`${tab}|${metric}|${cls ?? ''}` !== stamp) return;
      const parts = boardParts(view, main);
      slot.replaceChildren(...parts);
      sprites(win);
    });
  };

  /** The note under the tabs (how many played, when it closes), the day's rules, and the slices. */
  const topParts = (): HTMLElement[] => {
    const parts: HTMLElement[] = [];
    const note = el('p', { className: 'fl-board-note' });
    const counter = compete()?.boards.counter[tab];
    const now = Date.now();
    parts.push(note);
    if (tab === 'day' && options.rules) {
      parts.push(
        el(
          'p',
          { className: 'fl-rules-line' },
          el('b', { textContent: `${tx('dayRules')}: ` }),
          `${options.rules.hardship} · ${options.rules.boon} (${options.rules.info})`,
        ),
      );
    }
    void fetchBoard().then((view) => {
      if (!view) return;
      const played = view.played ?? view.total ?? view.top.length;
      if (counter && played > 0) note.append(el('span', { className: 'count', textContent: txn(counter, played) }));
      const end = tab === 'day' ? boardCloses(now) : tab === 'week' ? weekEnd(now) : null;
      if (end !== null) note.append(el('span', { className: 'closes', textContent: tx('closes', { t: countdown(end - now) }) }));
    });
    parts.push(slices());
    // The way to the player's own profile and to his runs (on a monitor the profile is at the side as well).
    const links = el('div', { className: 'fl-board-links' });
    if (options.onProfile && !wide()) links.append(linkButton(tx('profileButton'), options.onProfile));
    links.append(linkButton(tx('myRuns'), () => select('device')));
    parts.push(links);
    return parts;
  };

  const linkButton = (label: string, run: () => void): HTMLElement => {
    const b = el('button', { className: 'pd-button quiet small', textContent: label });
    b.onclick = () => {
      audio.play('click');
      run();
    };
    return b;
  };

  /** The metric buttons and the hero filter; what the metric ranks, in words. */
  const slices = (): HTMLElement => {
    const box = el('div', { className: 'fl-slices' });
    const seg = el('div', { className: 'fl-seg' });
    for (const m of METRICS) {
      const b = el('button', { textContent: tx(`metric.${m}`) });
      b.setAttribute('aria-pressed', String(m === metric));
      b.onclick = () => {
        audio.play('click');
        if (m !== metric) {
          metric = m;
          render();
        }
      };
      seg.append(b);
    }
    const classes = el('div', { className: 'fl-classes' });
    for (const c of CLASSES) {
      const b = el('button', { className: c === 'all' ? 'all' : '' });
      if (c !== 'all') b.append(classIcon(c, 2));
      b.append(c === 'all' ? tx('classAll') : tx(`classes.${c}`));
      b.setAttribute('aria-pressed', String((c === 'all' ? null : c) === cls));
      b.onclick = () => {
        audio.play('click');
        const next = c === 'all' ? null : (c as BoardSlice['cls']);
        if (next !== cls) {
          cls = next;
          render();
        }
      };
      classes.append(b);
    }
    box.append(seg, classes, el('p', { className: 'fl-metric-info', textContent: tx(`metricInfo.${metric}`) }));
    return box;
  };

  /** The player's own card, at the side on a monitor (the league and the circle join it with their own parts). */
  const sideParts = (): HTMLElement[] => {
    if (!wide()) return [];
    const parts: HTMLElement[] = [];
    const heroClass = options.heroClass ?? 'warrior';
    const { node, card } = stage(() => myLook(heroClass), 'podium', true);
    held.push(() => card.dispose());
    const profile = options.profile;
    const facts = el('div', { className: 'fl-facts' });
    if (profile?.best) facts.append(el('span', {}, `${tx('best')} `, el('b', { textContent: number(profile.best) })));
    if (profile) facts.append(el('span', {}, `${tx('played')} `, el('b', { textContent: String(profile.games) })));
    if (profile && profile.streak.count > 0) facts.append(el('span', { textContent: txn('streak', profile.streak.count) }));
    const mineCard = el('div', { className: 'fl-hero-card' }, node, el('div', { className: 'who' }, nameNode(options.profile?.name ?? '', undefined), facts));
    parts.push(mineCard);
    if (options.onProfile) {
      const open = el('button', { className: 'pd-button small', textContent: tx('profileButton') });
      open.onclick = () => {
        audio.play('click');
        options.onProfile!();
      };
      parts.push(open);
    }
    parts.push(el('div', { className: 'fl-honour-note', textContent: tx('honourOnly') }));
    return parts;
  };

  /** The board itself: the podium, the rows, the player's pinned row. */
  const boardParts = (view: BoardView | null, scroller: HTMLElement): HTMLElement[] => {
    if (!view) return [info(tx('offline'), 'pd-note center')];
    const rows = compete()?.boards.rows ?? 50;
    const entries = view.top.slice(0, rows);
    const sliced = metric !== 'score' || cls !== null;
    const rank = view.rank;
    const data = (entry: BoardEntry, place: number): RowData => {
      const shown = valueOf(entry, metric);
      return { entry, place, value: shown.value, unit: shown.unit, me: place === rank, moving: place <= 3 || place === rank };
    };
    const parts: HTMLElement[] = [];
    if (entries.length === 0) {
      parts.push(info(tx(sliced ? 'noSlice' : 'noResults'), 'pd-note center'));
    } else {
      const top = podium(entries.slice(0, 3).map((entry, i) => data(entry, i + 1)));
      held.push(top.dispose);
      parts.push(top.node);
      const rest = entries.slice(3);
      if (rest.length > 0) {
        const make = (i: number): VirtualRow => rowOf(data(rest[i]!, i + 4));
        if (rest.length > EAGER_ROWS) {
          const list = virtualList(scroller, rest.length, ROW_H + ROW_GAP, make, 'fl-rows virtual');
          listing = list;
          parts.push(list.node);
        } else {
          const made = rest.map((_, i) => make(i));
          held.push(() => made.forEach((row) => row.dispose?.()));
          parts.push(el('div', { className: 'fl-rows' }, ...made.map((row) => row.node)));
        }
      }
    }
    parts.push(pin(view, data));
    return parts;
  };

  /** My row, stuck to the bottom, and where I stand. */
  const pin = (view: BoardView, data: (entry: BoardEntry, place: number) => RowData): HTMLElement => {
    const box = el('div', { className: 'fl-pin' });
    const you = view.you;
    const played = view.played ?? view.total ?? view.top.length;
    if (view.rank !== null && you) {
      if (view.rank > 3) {
        if (view.rank > Math.min(view.top.length, compete()?.boards.rows ?? 50) + 0) box.append(el('div', { className: 'fl-pin-gap', textContent: '· · ·' }));
        const mine = rowOf({ ...data(you, view.rank), me: true, moving: true });
        held.push(() => mine.dispose?.());
        box.append(mine.node);
      }
      box.append(el('div', { className: 'fl-pin-place', textContent: tx('placeOf', { n: number(view.rank), m: number(Math.max(played, view.rank)) }) }));
    } else if (you) {
      // On the board but not on this list: the row still shows, and says why it has no place.
      const mine = rowOf({ ...data(you, 0), place: null, me: true, moving: true });
      held.push(() => mine.dispose?.());
      box.append(mine.node, el('div', { className: 'fl-pin-place', textContent: metric === 'score' && cls === null ? tx('notYet') : tx(valueOf(you, metric).value === '—' ? 'notEligible' : 'slicePlace', { n: compete()?.boards.rows ?? 50 }) }));
    } else {
      box.append(el('div', { className: 'fl-pin-place', textContent: tx('notYet') }));
    }
    return box;
  };

  render();
}

const shortDate = (time: number): string => new Date(time).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { day: '2-digit', month: '2-digit' });

/** «My runs»: the shelf of trophies won, then the device's best runs, each with its date and its hero as he is dressed now. */
function mineRows(records: readonly RunRecord[], trophies: Profile['trophies'], track: (row: VirtualRow) => void): HTMLElement[] {
  const nodes: HTMLElement[] = [];
  const dungeon = records.filter((record) => record.mode !== 'arena');
  const shelf = trophies.filter((trophy) => !trophy.board.startsWith('arena:'));
  if (shelf.length > 0) {
    nodes.push(
      el(
        'div',
        { className: 'fl-shelf' },
        ...shelf.slice(0, 12).map((trophy) => {
          const [kind = '', when = ''] = trophy.board.split(':');
          return el('span', { title: `${kind} ${when}` }, el('b', { textContent: `#${trophy.place}` }), t.ranked.trophyBoard[kind] ?? kind);
        }),
      ),
    );
  }
  if (dungeon.length === 0) {
    nodes.push(info(tx('noRuns'), 'pd-note center'));
    return nodes;
  }
  const list = el('div', { className: 'fl-rows' });
  for (const record of dungeon) {
    const look = myLook(record.heroClass);
    const entry: BoardEntry = {
      id: record.key, name: record.name, heroClass: record.heroClass, score: record.score, depth: record.depth, level: record.lvl, gold: record.gold, won: record.won, at: record.date,
      w: { ...(look.l ? { l: look.l } : {}), ...(look.h ? { h: look.h } : {}), ...(look.p ? { p: look.p } : {}), ...(look.f ? { f: look.f } : {}), ...(look.fr ? { fr: look.fr } : {}) },
    };
    // A run the server did not check (played before checked runs, or without the server) is on no board: it says so.
    const unit = `${shortDate(record.date)}${record.checked ? '' : ` · ${tx('offBoard')}`}`;
    const row = rowOf({ entry, place: null, value: number(record.score), unit: `${unit} · ${tx('depthShort', { n: record.depth })}` });
    track(row);
    list.append(row.node);
  }
  nodes.push(list);
  return nodes;
}

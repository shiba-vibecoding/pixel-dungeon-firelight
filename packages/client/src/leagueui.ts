import { audio } from './audio';
import type { BoardEntry, LeagueResult, LeagueView, Profile, RunApi } from './checked';
import { compete, loadCompete, tierOf } from './compete';
import { art, competeShell, lastArmor, lastWeapon, number, rowOf, type RowData, tx, txn } from './compete-ui';
import { heroCard, myLook } from './herocard';
import { lang } from './i18n';
import { countdown } from './rankui';
import { button, el, info, type ShareChoice, show, sprites } from './screens';

/*
 * The weekly leagues (design part 7): five steps from the Spark to the Beacon, a room of 30 for the week ranked by each player's best
 * run, the first 5 going up and the last 5 down; the screen of the room with its zones and the time left, the window that shows how a
 * week ended (once), and the ladder of the steps (also on the profile). The leagues open when 60 players have played the week: until
 * then the screen says so and shows how far the week is from it. Nothing here is bought or sold.
 */

/** The ladder of the five steps: the one the player is in lit, the ones reached before shown, the rest dim. */
export function ladder(current: string | undefined, best: number, scale = 2): HTMLElement {
  const box = el('div', { className: 'fl-ladder' });
  for (const tier of compete()?.leagues.tiers ?? []) {
    const state = tier.key === current ? 'on' : tier.tier <= best ? 'done' : 'off';
    const step = el('div', { className: state }, art(tier.badge, scale), el('span', { textContent: tier.name[lang] }));
    step.style.setProperty('--tier', tier.color);
    box.append(step);
  }
  return box;
}

const weekNumber = (week: string): number => Number(week.split('-W')[1] ?? 0);

export interface LeagueOptions {
  api: RunApi | null;
  profile: Profile | null;
  onBack(): void;
  onClose(): void;
}

export function showLeague(options: LeagueOptions): void {
  const shell = competeShell(options.onClose);
  show(shell.win, options.onClose);
  shell.set(info(tx('loading'), 'pd-note center'));
  void loadCompete().then(async () => {
    const view = options.api ? await options.api.league() : null;
    build(options, shell, view);
  });
}

function build(options: LeagueOptions, shell: ReturnType<typeof competeShell>, view: LeagueView | null): void {
  if (!view) {
    shell.head(tx('league'), null, options.onBack);
    shell.set(info(tx('offline'), 'pd-note center'));
    return;
  }
  const tier = tierOf(view.tier)!;
  shell.win.style.setProperty('--tier', tier.color);
  shell.head(tx('leagueOf', { t: tier.name[lang] }), tx('week', { n: weekNumber(view.week) }), options.onBack);
  const main = el('div', { className: 'fl-mart-main' }, ladder(view.tier, view.best, wideScale()));

  // The step and the time left in the week.
  const timer = el('div', { className: 'fl-timer' }, el('span', { textContent: tx('endsInWeek') }), el('b', { textContent: countdown(view.endsAt - Date.now()) }));
  main.append(el('div', { className: 'fl-league-head' }, art(tier.badge, 3), el('div', { className: 't' }, el('b', { textContent: tier.name[lang] }), el('span', { textContent: tx('room', { n: 30 }) })), timer));

  if (!view.open) {
    // Closed: not enough players have played the week yet.
    main.append(
      info(tx('leaguesClosed'), 'pd-note center'),
      el('p', { className: 'fl-metric-info', textContent: tx('leaguesClosedNote') }),
      el('p', { className: 'fl-metric-info', textContent: tx('leaguePlayed', { n: number(view.played), m: view.need }) }),
    );
    shell.set(main);
    sprites(shell.win);
    return;
  }
  const room = view.room;
  if (!room) {
    main.append(info(tx('leagueNoRoom'), 'pd-note center'));
    shell.set(main);
    sprites(shell.win);
    return;
  }

  // The room: the promotion zone, the middle, the demotion zone; every row a hero card.
  const rows = el('div', { className: 'fl-rows' });
  const top = view.tier === compete()?.leagues.tiers.at(-1)?.key;
  const bottom = view.tier === compete()?.leagues.tiers[0]?.key;
  const next = compete()?.leagues.tiers.find((entry) => entry.tier === tier.tier + 1);
  const prev = compete()?.leagues.tiers.find((entry) => entry.tier === tier.tier - 1);
  const up = top ? 0 : room.up;
  const down = bottom ? 0 : room.down;
  const zone = (kind: 'up' | 'down' | 'safe', text: string): HTMLElement => el('div', { className: `fl-zone ${kind === 'safe' ? '' : kind}`, textContent: text });
  if (up > 0 && next) rows.append(zone('up', `${tx('promote')} · ${tx('promoteTo', { n: up, t: next.name[lang] })}`));
  else if (top) rows.append(zone('safe', tx('topTier')));
  room.top.forEach((entry: BoardEntry, i: number) => {
    const place = i + 1;
    if (up > 0 && place === up + 1) rows.append(zone('safe', tx('safe')));
    if (down > 0 && place === room.size - down + 1 && prev) rows.append(zone('down', `${tx('demote')} · ${tx('demoteTo', { n: down, t: prev.name[lang] })}`));
    const data: RowData = {
      entry, place, value: number(entry.score), unit: tx('depthShort', { n: entry.depth }), me: place === room.rank, moving: place <= 3 || place === room.rank,
      tier: room.tier, ...(place <= up ? { zone: 'up' as const } : place > room.size - down && down > 0 ? { zone: 'down' as const } : {}),
    };
    rows.append(rowOf(data).node);
  });
  if (bottom && room.size > 0) rows.append(zone('safe', tx('bottomTier')));
  main.append(rows);

  // Where the player stands, and how far the promotion zone is.
  if (room.rank !== null) {
    const place = tx('zonePlace', { n: room.rank, m: room.size });
    const inUp = up > 0 && room.rank <= up;
    const inDown = down > 0 && room.rank > room.size - down;
    // «Place 7 of 30 · 2 places to the promotion zone»; inside a zone it says so instead.
    const where = inUp ? tx('inUpZone') : inDown ? tx('inDownZone') : up > 0 ? txn('toZone', room.rank - up) : '';
    main.append(el('div', { className: 'fl-pin' }, el('div', { className: 'fl-pin-place', textContent: [place, where].filter(Boolean).join(' · ') })));
  }
  shell.set(main);
  sprites(shell.win);
}

const wideScale = (): number => (typeof matchMedia === 'function' && matchMedia('(min-width: 900px)').matches ? 3 : 2);

export interface WeekOptions {
  result: LeagueResult;
  profile: Profile | null;
  heroClass: string;
  /** The ways to send the card (a story, a chat ...), built by the game; none: no share button. */
  share?: readonly ShareChoice[];
  /** Said when the player closes the window: the week's result has been seen. */
  onSeen(): void;
}

/** The window of a week's end: up, stay or down, with the old and the new step, the place, the hero in the new frame and a word that does not shame. */
export function showWeek(options: WeekOptions): void {
  void loadCompete().then(() => {
    const { result } = options;
    const from = tierOf(result.tier)!;
    const to = tierOf(result.to)!;
    const zoneSize = Math.min(5, Math.floor(result.size / 3));
    const kind = result.result;
    const head = el('div', { className: 'fl-week-badges' }, art(from.badge, kind === 'up' ? 3 : 4));
    if (kind !== 'stay') head.append(el('span', { className: 'arrow', textContent: '→' }), art(to.badge, kind === 'up' ? 5 : 3));
    const title = kind === 'up' ? tx('up', { t: to.name[lang] }) : kind === 'down' ? tx('down', { t: to.name[lang] }) : tx('stay', { t: from.name[lang] });
    const text = kind === 'up' ? tx('upText', { n: zoneSize }) : kind === 'down' ? tx('downText', { n: zoneSize, t: from.name[lang] }) : tx('stayText', { n: zoneSize });
    const card = heroCard(() => ({ ...myLook(options.heroClass, lastArmor(options.profile, options.heroClass), lastWeapon(options.profile, options.heroClass)), lg: result.to }), { kind: 'big', animate: true, scale: 2, className: 'pd-card-row' });
    const buttons = el('div', { className: 'fl-week-buttons' });
    const done = (): void => {
      options.onSeen();
    };
    buttons.append(button(tx('resultsSeen'), done, 'primary'));
    if (options.share && options.share.length > 0) {
      const first = options.share[0]!;
      buttons.append(button(tx('leagueShare'), () => first.run()));
    }
    const body = el(
      'div',
      { className: `fl-week ${kind}` },
      el('div', { className: 'place', textContent: tx('resultsTitle') }),
      head,
      el('h2', { textContent: title }),
      el('div', { className: 'place', textContent: tx('place', { n: result.place, m: result.size }) }),
      el('span', { className: 'fl-stage big' }, card.canvas),
      el('p', { textContent: text }),
      buttons,
    );
    const win = el('section', { className: 'pd-window fl-mart fl-compete narrow' }, body);
    win.setAttribute('role', 'dialog');
    win.style.setProperty('--tier', to.color);
    show(win, done);
    audio.play(kind === 'up' ? 'levelup' : 'click');
    sprites(win);
  });
}

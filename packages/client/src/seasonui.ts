import type { BoardView, Profile, RunApi } from './checked';
import { artSeason, compete, loadCompete } from './compete';
import { competeShell, number, stage, titleBadge, tx, txn } from './compete-ui';
import { copyOf, cupNode, dressed, paletteOf } from './season-art';
import { lang } from './i18n';
import { el, info, show, sprites } from './screens';

/*
 * The season (design part 7): its name and days left, the player's Heat and place, how Heat is earned, and what the season gives the
 * best of it (the cup, the frame, the Beacon fire, the title): all only won. The cup and the frame wear the season's palette, made from
 * the template (season-art.ts). Below, the seasons the player has closed.
 */

export interface SeasonOptions {
  api: RunApi | null;
  profile: Profile | null;
  onBack(): void;
  onClose(): void;
  onHall(): void;
}

export function showSeason(options: SeasonOptions): void {
  const shell = competeShell(options.onClose);
  show(shell.win, options.onClose);
  shell.set(info(tx('loading'), 'pd-note center'));
  void loadCompete().then(async () => {
    const view = options.api ? await options.api.board('season') : null;
    build(options, shell, view);
  });
}

/** The name of a season (the designer's, by the palette it wears). */
export const seasonName = (n: number): string => compete()?.season.seasons.find((season) => season.id === artSeason(n))?.name[lang] ?? '';

const dayText = (time: number): string => new Date(time).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'long' });

function section(title: string, ...kids: Node[]): HTMLElement {
  return el('section', { className: 'fl-sec' }, el('div', { className: 'fl-sec-head' }, el('h3', { textContent: title })), ...kids);
}

function build(options: SeasonOptions, shell: ReturnType<typeof competeShell>, view: BoardView | null): void {
  const { profile } = options;
  const season = profile?.season ?? view?.season;
  const n = season?.number ?? 1;
  const palette = paletteOf(n);
  shell.win.style.setProperty('--season', palette[1] ?? '#ff9a3a');
  shell.win.style.setProperty('--season-hi', palette[0] ?? '#ffeba4');
  shell.head(tx('seasonOf', { n, t: seasonName(n) }), null, options.onBack);
  const won = new Set(profile?.honour ?? []);

  // The top: the cup, the season, the player's Heat and place.
  const played = view?.played ?? view?.total ?? 0;
  const line = [
    tx('seasonN', { n }),
    season?.started === false ? tx('seasonStarts', { d: dayText(season.start) }) : tx('daysLeft', { n: season?.daysLeft ?? 0 }),
    played > 0 ? txn('playersSeason', played) : '',
  ].filter(Boolean).join(' · ');
  const place = view?.rank ? `#${number(view.rank)}` : '';
  const top = el(
    'div',
    { className: 'fl-season-top' },
    cupNode(n, 4),
    el(
      'div',
      {},
      el('b', { textContent: seasonName(n) }),
      el('span', { textContent: line }),
      el('div', { className: 'fl-heat' }, el('b', { textContent: number(profile?.heat ?? 0) }), el('span', { textContent: [tx('heatRating'), place].filter(Boolean).join(' · ') })),
    ),
  );

  // How Heat is earned.
  const rules = el('ul', { className: 'fl-rules' });
  for (const rule of (compete()?.strings[lang].heatRules as readonly string[] | undefined) ?? []) rules.append(el('li', { textContent: rule }));
  const how = section(tx('heatHow'), rules, el('p', { className: 'fl-metric-info', textContent: tx('heatNote') }));

  // What the season gives, and what the player has won of it.
  const honours = el('div', { className: 'fl-honours' });
  const honour = (picture: Node, title: string, text: string, key: string): void => {
    const got = won.has(key);
    honours.append(
      el('div', { className: `fl-honour${got ? ' won' : ''}` }, el('div', { className: 'art' }, picture), el('b', { textContent: title }), el('span', { textContent: text }), got ? el('small', { className: 'fl-won', textContent: tx('awardsWon') }) : null),
    );
  };
  const frameBox = el('span', { className: 'fl-frame-art' });
  const template = compete()?.season.template.frame.sprite;
  if (template) {
    void dressed(template, n).then((canvas) => {
      if (canvas) frameBox.append(copyOf(canvas, 4));
    });
  }
  const { node: fire } = stage({ heroClass: 'warrior', f: 'fire.beacon', fr: 'league.beacon' }, 'podium', true);
  const beacon = compete()?.titles.find((title) => title.sku === 'title.season_beacon');
  honour(cupNode(n, 3), tx('cup'), tx('cupFor'), `cup.s${n}`);
  honour(frameBox, tx('seasonFrame'), tx('seasonFrameFor'), `frame.season.s${n}`);
  honour(fire, tx('beaconFire'), tx('beaconFireFor'), 'fire.beacon');
  honour(titleBadge('title.season_beacon', false) ?? el('span'), beacon?.name[lang] ?? '', tx('honourHow.season_beacon'), 'season_beacon');
  const prizes = section(tx('honours'), honours, el('div', { className: 'fl-honour-note', textContent: tx('honourOnly') }));

  const main = el('div', { className: 'fl-mart-main' }, top, how, prizes);

  // The seasons the player has closed.
  const past = profile?.seasons ?? [];
  if (past.length > 0) {
    const list = el('div', { className: 'fl-shelf' });
    for (const result of past) {
      const k = Number(result.id.slice(1));
      list.append(el('span', {}, cupNode(k, 1), `${seasonName(k)} · ${tx('pastResult', { h: number(result.heat), n: result.rank || '—', m: number(result.played) })}`));
    }
    main.append(section(tx('pastSeasons'), list));
  }
  const hall = el('button', { className: 'pd-button', textContent: tx('hallButton') });
  hall.onclick = options.onHall;
  main.append(hall);
  shell.set(main);
  sprites(shell.win);
}

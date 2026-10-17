import type { Profile } from './checked';
import { compete, loadCompete, tierOf } from './compete';
import { art, competeShell, lastArmor, lastWeapon, nameNode, number, stage, titleBadge, tx, txn, wide } from './compete-ui';
import { lang } from './i18n';
import { ladder } from './leagueui';
import { cosmetics } from './cosmetics';
import { myLook } from './herocard';
import { t } from './i18n';
import { button, el, type ShareChoice, show, sprites } from './screens';
import { rankIcon, trophyKind } from './trophyicons';

/*
 * The profile (design part 7): the player's own hero card, big, in the frame he wears; his name in its colour and his title; what he
 * has done (the best run, the games, the streak); the trophies on his shelf; and how to send the card: a story, a picture for a chat,
 * or the picture kept. On a monitor the chat picture is shown beside it before it is sent. Honours and the league's ladder come into
 * this window with the seasons and the leagues.
 */

export interface ProfileOptions {
  profile: Profile | null;
  name: string;
  heroClass: string;
  /** The ways to send the card (main.ts shareChoices): a story, a chat, the picture kept, a link. */
  share: readonly ShareChoice[];
  /** A picture of the card for a chat, for the preview on a monitor (null: none shown). */
  preview?: () => Promise<Blob | null>;
  onBack(): void;
  onClose(): void;
}

export function showProfile(options: ProfileOptions): void {
  const shell = competeShell(options.onClose);
  show(shell.win, options.onClose);
  shell.set(el('p', { className: 'pd-note center', textContent: tx('loading') }));
  void loadCompete().then(() => build(options, shell));
}

function build(options: ProfileOptions, shell: ReturnType<typeof competeShell>): void {
  const { profile } = options;
  shell.head(tx('profile'), null, options.onBack);

  // The card: the hero as he is dressed now, big, and who he is.
  const { node: box } = stage(() => myLook(options.heroClass, lastArmor(options.profile, options.heroClass), lastWeapon(options.profile, options.heroClass)), 'big', true);
  const who = el('div', { className: 'who' }, nameNode(options.name, cosmetics.nameColor?.id));
  const title = titleBadge(cosmetics.title?.id, false);
  if (title) who.append(title);
  // The league he plays in, under the title.
  const league = profile?.league;
  const tier = league ? tierOf(league.tier) : undefined;
  if (tier) {
    const mark = el('span', { className: 'fl-tier' }, art(tier.badge, 2), tier.name[lang]);
    mark.style.setProperty('--tier', tier.color);
    who.append(mark);
  }
  const facts = el('div', { className: 'fl-facts' });
  if (profile?.best) facts.append(el('span', {}, `${tx('best')} `, el('b', { textContent: number(profile.best) })));
  if (profile?.heat) facts.append(el('span', {}, `${tx('heatNow')} `, el('b', { textContent: number(profile.heat) })));
  if (profile) facts.append(el('span', {}, `${tx('played')} `, el('b', { textContent: number(profile.games) })));
  if (profile && profile.wins > 0) facts.append(el('span', {}, `${tx('wins')} `, el('b', { textContent: number(profile.wins) })));
  if (profile && profile.deepest > 0) facts.append(el('span', {}, `${tx('deepest')} `, el('b', { textContent: String(profile.deepest) })));
  facts.append(el('span', { textContent: profile && profile.streak.count > 0 ? txn('streak', profile.streak.count) : tx('streakNone') }));
  who.append(facts);
  const hero = el('div', { className: 'fl-hero-card stack' }, box, who);

  const main = el('div', { className: 'fl-mart-main' }, hero);

  // The ladder of the five steps.
  if (league && tier) main.append(section(tx('league'), tx('leagueOf', { t: tier.name[lang] }), ladder(league.tier, league.best)));
  // The honour titles: the ones won are lit, the others are shown dark with how they are won (never sold).
  const won = new Set(profile?.honour ?? []);
  const titles = el('div', { className: 'fl-titles' });
  for (const title of compete()?.titles ?? []) {
    const plate = titleBadge(title.sku, false, !won.has(title.title));
    if (!plate) continue;
    plate.title = tx(`honourHow.${title.title}`);
    titles.append(plate);
  }
  if (titles.childElementCount > 0) main.append(section(tx('titlesHonour'), tx('duelSoon'), titles));
  // The seasons closed: the cup of each, and the place.
  if ((profile?.seasons ?? []).length > 0) {
    const closed = el('div', { className: 'fl-shelf' });
    for (const result of profile!.seasons!) closed.append(el('span', { textContent: `${tx('seasonN', { n: result.id.slice(1) })} · ${tx('heatPlace', { n: result.rank || '—', m: number(result.played) })}` }));
    main.append(section(tx('pastSeasons'), null, closed));
  }
  // The shelf: the places won on finished boards.
  const shelf = (profile?.trophies ?? []).filter((trophy) => !trophy.board.startsWith('arena:'));
  if (shelf.length > 0) {
    const row = el('div', { className: 'fl-shelf' });
    for (const trophy of shelf.slice(0, 12)) {
      const [kind = '', when = ''] = trophy.board.split(':');
      row.append(el('span', { title: `${kind} ${when}` }, rankIcon(trophyKind(trophy.board, trophy.place), { big: true }), `${t.ranked.trophyBoard[kind] ?? kind} #${trophy.place}`));
    }
    main.append(section(tx('trophies'), null, row));
  }
  main.append(el('div', { className: 'fl-honour-note', textContent: tx('honourOnly') }));

  // Sending the card: one button per way.
  const buttons = el('div', { className: 'fl-week-buttons' });
  options.share.forEach((choice, i) => {
    const b = button(choice.label, () => choice.run(), i === 0 ? 'primary' : '');
    buttons.append(b);
  });
  const sharing = el('div', { className: 'fl-card2' }, el('h3', { textContent: tx('shareTitle') }), buttons);
  if (wide() && options.preview) {
    const slot = el('div', { className: 'fl-share-preview' });
    sharing.insertBefore(slot, buttons);
    void options.preview().then((blob) => {
      if (!blob || !slot.isConnected) return;
      const url = URL.createObjectURL(blob);
      const img = el('img', { src: url, alt: '' });
      img.onload = () => URL.revokeObjectURL(url);
      slot.append(img);
    });
    shell.set(el('div', { className: 'fl-cols' }, main, el('aside', { className: 'fl-side' }, sharing)));
  } else {
    main.append(sharing);
    shell.set(main);
  }
  sprites(shell.win);
}

function section(title: string, more: string | null, ...kids: Node[]): HTMLElement {
  const head = el('div', { className: 'fl-sec-head' }, el('h3', { textContent: title }));
  if (more) head.append(el('span', { className: 'fl-more', textContent: more }));
  return el('section', { className: 'fl-sec' }, head, ...kids);
}

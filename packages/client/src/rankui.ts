import { audio } from './audio';
import type { Profile, SyncAnswer } from './checked';
import { heroCard, myLook } from './herocard';
import { locale, t } from './i18n';
import { el, info } from './screens';
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

/** The icon of the places 1-3 of each board. */
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
  // He wears the armour of his last run (of this class, else of the last run at all): the tier he died or finished in.
  const last = profile?.history.find((run) => run.heroClass === heroClass && run.armor !== undefined) ?? profile?.history.find((run) => run.armor !== undefined);
  const card = heroCard(() => myLook(heroClass, last?.armor), { animate: true, className: 'pd-profile-art' });
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

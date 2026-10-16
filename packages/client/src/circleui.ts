import { audio } from './audio';
import type { BoardEntry, CircleBoardView, CircleRef, RunApi } from './checked';
import { loadCompete } from './compete';
import { art, competeShell, number, rowOf, titleBadge, tx, wide } from './compete-ui';
import { appLink } from './telegram';
import { button, el, info, type ShareChoice, show, sprites } from './screens';

/*
 * Circles (design part 7): friends (up to 50) or a Telegram group (up to 200) with a board for the week, a champion when the week is over,
 * an invite link (`?startapp=c_<code>`) and a card of the week for the chat. The screen picks one of the player's circles (at most two),
 * shows its board with every other member as a friend, and makes a new one. Only members see a circle's board. Nothing is bought.
 */

export interface CirclesOptions {
  api: RunApi | null;
  /** The circle to open first (a code just joined). */
  code?: string;
  onBack(): void;
  onClose(): void;
  /** The ways to send a circle's card of the week (main.ts builds them from the picture): story, chat, link. */
  cardShare(circle: CircleBoardView): ShareChoice[];
  toast(text: string): void;
  /** Sends the invite link where the player picks, or copies it. */
  invite(code: string, name: string): void;
}

const week = (value: string): number => Number(value.split('-W')[1] ?? 0);

export function showCircles(options: CirclesOptions): void {
  const shell = competeShell(options.onClose);
  show(shell.win, options.onClose);
  shell.set(info(tx('loading'), 'pd-note center'));
  void loadCompete().then(async () => {
    const list = options.api ? await options.api.circles() : null;
    render(options, shell, list?.circles ?? [], options.code ?? list?.circles[0]?.code ?? null, list?.max ?? 2);
  });
}

function render(options: CirclesOptions, shell: ReturnType<typeof competeShell>, circles: CircleRef[], selected: string | null, max: number): void {
  const api = options.api!;
  const again = (code: string | null, next: CircleRef[] = circles): void => render(options, shell, next, code, max);
  shell.head(tx('circles'), null, options.onBack);

  const picker = el('div', { className: 'fl-circle-pick' });
  for (const circle of circles) {
    const b = el('button', { textContent: circle.name });
    b.setAttribute('aria-pressed', String(circle.code === selected));
    b.onclick = () => {
      audio.play('click');
      if (circle.code !== selected) again(circle.code);
    };
    picker.append(b);
  }
  if (circles.length < max) {
    const add = el('button', { className: 'add', textContent: `+ ${tx('addCircle')}` });
    add.onclick = () => {
      audio.play('click');
      shell.set(picker, creation(options, shell, max));
    };
    picker.append(add);
  }
  const current = circles.find((circle) => circle.code === selected);
  if (!current) {
    shell.set(picker, el('div', { className: 'fl-mart-main' }, info(tx('circleNone'), 'pd-note center'), creation(options, shell, max)));
    return;
  }
  shell.set(picker, info(tx('loading'), 'pd-note center'));
  void api.circleBoard(current.code).then((view) => {
    if ('error' in view) {
      // A circle that is gone (or that the player is no longer in) is forgotten.
      options.toast(tx(`circleErrors.${view.error}`));
      void api.circles().then((fresh) => again(fresh?.circles[0]?.code ?? null, fresh?.circles ?? []));
      return;
    }
    body(options, shell, picker, view, again);
  });
}

/** The form that makes a circle: a name and a kind. */
function creation(options: CirclesOptions, shell: ReturnType<typeof competeShell>, max: number): HTMLElement {
  let kind: 'friends' | 'group' = 'friends';
  const field = el('input', { className: 'fl-field', placeholder: tx('circleNameHint'), maxLength: 24 });
  field.setAttribute('aria-label', tx('circleName'));
  const kinds = el('div', { className: 'fl-seg two' });
  const kindLabels: Array<['friends' | 'group', string]> = [['friends', tx('circleKindFriends')], ['group', tx('circleKindGroup')]];
  for (const [value, label] of kindLabels) {
    const b = el('button', { textContent: label });
    b.setAttribute('aria-pressed', String(value === kind));
    b.onclick = () => {
      kind = value;
      for (const node of kinds.children) node.setAttribute('aria-pressed', String(node === b));
    };
    kinds.append(b);
  }
  const make = button(tx('circleCreate'), () => {
    void options.api!.circleOp('create', { name: field.value, kind }).then((answer) => {
      if ('error' in answer) {
        options.toast(tx(`circleErrors.${answer.error}`));
        return;
      }
      options.toast(tx('circleMade'));
      render(options, shell, answer.circles, answer.code ?? answer.circles[0]?.code ?? null, max);
    });
  }, 'primary');
  return el('div', { className: 'fl-invite' }, el('p', { className: 'fl-hint', textContent: tx('circleName') }), field, kinds, make, el('p', { className: 'fl-metric-info', textContent: tx('circleHint') }));
}

/** A circle: its head with the invite, last week's champion, the week's board, the card for a chat, leaving. */
function body(
  options: CirclesOptions, shell: ReturnType<typeof competeShell>, picker: HTMLElement, view: CircleBoardView, again: (code: string | null, next?: CircleRef[]) => void,
): void {
  const api = options.api!;
  const { circle } = view;
  shell.head(tx('circles'), `${tx('circleWeek')} · ${tx('week', { n: week(view.week) })}`, options.onBack);
  const main = el('div', { className: 'fl-mart-main' });

  const icon = el('div', { className: 'fl-circle-icon' }, art(circle.kind === 'group' ? 'compete/titles/title-circle_champion.png' : 'mart/fl/profile/title-keeper.png', 3));
  const invite = button(tx('invite'), () => options.invite(view.code, circle.name), 'small primary');
  main.append(el('div', { className: 'fl-circle-head' }, icon, el('div', { className: 't' }, el('b', { textContent: circle.name }), el('span', { textContent: `${circle.kind === 'group' ? tx('group') : tx('friends')} · ${tx('members', { n: circle.size })}` })), invite));

  if (circle.champion) {
    const plate = titleBadge('title.circle_champion', true);
    main.append(el('div', { className: 'fl-champ' }, plate ?? el('span'), el('span', { textContent: `${tx('lastChampion')} ` }), el('b', { textContent: circle.champion.you ? tx('you') : circle.champion.name })));
  }

  const board = view.board;
  const entries: BoardEntry[] = board.top;
  const rows = el('div', { className: 'fl-rows' });
  entries.forEach((entry, i) => {
    const place = i + 1;
    const me = place === board.rank;
    rows.append(rowOf({ entry, place, value: number(entry.score), unit: tx('depthShort', { n: entry.depth }), me, friend: !me, moving: place <= 3 || me }).node);
  });
  main.append(entries.length > 0 ? rows : info(tx('noResults'), 'pd-note center'));
  if (board.rank === null) main.append(info(tx('notYet'), 'pd-note center'));
  else main.append(el('div', { className: 'fl-pin' }, el('div', { className: 'fl-pin-place', textContent: tx('placeOf', { n: board.rank, m: Math.max(board.played ?? entries.length, board.rank) }) })));

  // The card of the week, for the chat; inviting; leaving.
  const buttons = el('div', { className: 'fl-week-buttons' });
  main.append(el('div', { className: 'fl-sec-head' }, el('h3', { textContent: tx('weekCard') })));
  for (const choice of options.cardShare(view)) buttons.append(button(choice.label, () => choice.run()));
  buttons.append(button(tx('invite'), () => options.invite(view.code, circle.name), 'primary'));
  main.append(buttons);
  const leave = el('button', { className: 'pd-button quiet small', textContent: tx('circleLeave') });
  leave.onclick = () => {
    audio.play('click');
    void api.circleOp('leave', { code: view.code }).then((answer) => {
      if ('error' in answer) {
        options.toast(tx(`circleErrors.${answer.error}`));
        return;
      }
      options.toast(tx('circleLeft'));
      again(answer.circles[0]?.code ?? null, answer.circles);
    });
  };
  main.append(leave, el('p', { className: 'fl-metric-info', textContent: tx('circleHint') }));
  const side = wide() ? el('aside', { className: 'fl-side' }, el('div', { className: 'fl-honour-note', textContent: tx('honourOnly') })) : null;
  shell.set(picker, side ? el('div', { className: 'fl-cols' }, main, side) : main);
  sprites(shell.win);
}

export interface InviteOptions {
  code: string;
  name: string;
  onBack(): void;
  onClose(): void;
  /** Copies the link; Telegram's share sheet for it. */
  copy(link: string): void;
  send(): void;
}

/** The invitation: the link that opens the game and adds the player to this circle, to copy or to send to a chat. */
export function showInvite(options: InviteOptions): void {
  const shell = competeShell(options.onClose);
  show(shell.win, options.onClose);
  void loadCompete().then(() => {
    shell.head(tx('inviteTitle'), options.name, options.onBack);
    const link = inviteLink(options.code);
    const box = el(
      'div',
      { className: 'fl-mart-main fl-invite' },
      el('p', { className: 'fl-hint', textContent: tx('inviteText') }),
      el('div', { className: 'fl-link' }, art('compete/titles/title-circle_champion.png', 2), el('span', { textContent: link.replace(/^https?:\/\//, '') })),
      el('div', { className: 'fl-invite-buttons' }, button(tx('copy'), () => options.copy(link)), button(tx('sendChat'), () => options.send(), 'primary')),
    );
    shell.set(box);
    sprites(shell.win);
  });
}

/** The link that opens the game in a circle (a Telegram direct link, or the page's own address elsewhere). */
export const inviteLink = (code: string): string => appLink(`c_${code}`);

import type { Hero, World } from '@pd/core';
import { capitalize, t } from './i18n';
import { chipCard, type QuestCard, questCards } from './questcard';
import { BADGE_ICON, GOAL_ICON, PICKAXE_ICON, stepsOf } from './questart';
import { chipLine, goalLine, rewardLine, stageLine } from './questcardtext';
import { Q } from './quest-text';
import { el } from './screens';

/*
 * The quest card's pictures: the card in the journal's «Notes» tab, and the little chip that sits on the HUD while an errand
 * stands (a tap opens the journal). What they say is questcardtext.ts's; what they know is questcard.ts's, which counts only from
 * the world and the pack, so no card gives away what the dungeon keeps hidden.
 */

/** One of the designer's icons (icons.png): `row` 0 the goals, 1 the givers' faces; `scale` is the size in tiles of 16 px. */
export function qicon(index: number, row: number, scale = 2, extra = ''): HTMLElement {
  const node = el('i', { className: `fl-qicon${extra ? ` ${extra}` : ''}` });
  node.style.setProperty('--qi', String(index));
  node.style.setProperty('--qr', String(row));
  node.style.setProperty('--qs', String(scale));
  return node;
}

/** The bar of a card: a step a unit (ore 15, tokens 8 or 6), one step for a single thing; green when the goal is met (progress.png). */
export function stepsNode(card: QuestCard): HTMLElement {
  const { of, done, green } = stepsOf(card);
  const bar = el('div', { className: `fl-qsteps${green ? ' done' : ''}` });
  bar.style.setProperty('--of', String(of));
  for (let i = 0; i < of; i++) bar.append(el('i', { className: i < done ? (i === done - 1 && done < of ? 'on last' : 'on') : '' }));
  return bar;
}

/** One quest's card: the giver's face, where, the goal and its count, the bar of steps, the reward on offer. */
export function questCardNode(card: QuestCard, className = ''): HTMLElement {
  const stage = stageLine(card, Q);
  const count = card.count
    ? `${card.count.have} / ${card.count.need}`
    : (Q.card.state[card.goal]?.[card.found ? 1 : 0] ?? '');
  const node = el(
    'article',
    { className: `fl-quest ${card.id} ${card.stage}${className ? ` ${className}` : ''}` },
    qicon(BADGE_ICON[card.id], 1, 3, 'badge'),
    el(
      'div',
      { className: 'fl-quest-title' },
      el('span', { textContent: capitalize(t.mobs[card.giver]) }),
      el('small', { className: 'pd-note', textContent: Q.card.depth(card.depth) }),
      card.stage === 'done' ? el('span', { className: 'fl-qtag done', textContent: Q.card.done }) : card.stage === 'ready' ? el('span', { className: 'fl-qtag ready', textContent: '!' }) : null,
    ),
    el(
      'div',
      { className: 'fl-quest-goal' },
      qicon(GOAL_ICON[card.goal], 0, 1.5),
      el('span', { textContent: goalLine(card, Q) }),
      card.stage === 'done' ? el('b', { textContent: '✓' }) : el('b', { textContent: count }),
    ),
    stepsNode(card),
    card.noPickaxe ? el('p', { className: 'fl-qwarn' }, qicon(PICKAXE_ICON, 0, 1, 'inline'), el('span', { textContent: Q.card.noPickaxe })) : null,
    stage && card.stage === 'ready' ? el('p', { className: 'fl-qback', textContent: stage }) : null,
    el('p', { className: 'fl-qreward' }, el('b', { textContent: `${Q.card.rewardTitle}: ` }), rewardLine(card, Q)),
  );
  node.dataset.stage = card.stage;
  return node;
}

/** The cards of the journal's notes: those under way first, then the finished ones. Null when no giver has asked for anything yet. */
export function questSection(world: World, hero: Hero): HTMLElement | null {
  const cards = questCards(world, hero);
  if (cards.length === 0) return null;
  const order = [...cards.filter((c) => c.stage !== 'done'), ...cards.filter((c) => c.stage === 'done')];
  return el('section', { className: 'fl-quests' }, el('h3', { className: 'fl-quests-title', textContent: Q.card.title }), ...order.map((card) => questCardNode(card)));
}

/**
 * The HUD chip: a pill with the giver's face and the progress, in the corner under the status band. It is made once and brought up to
 * date with `update` on the HUD's own beat; a tap opens the journal. Hidden when no errand stands.
 */
export class QuestChip {
  readonly node: HTMLElement;
  private readonly face: HTMLElement;
  private readonly text: HTMLElement;
  private readonly more: HTMLElement;
  private shown = '';

  constructor(root: HTMLElement, private readonly open: () => void) {
    this.face = el('span', { className: 'fl-qchip-face' });
    this.text = el('span', { className: 'fl-qchip-text' });
    this.more = el('span', { className: 'fl-qchip-more' });
    this.node = el('button', { className: 'fl-qchip', type: 'button', hidden: true }, this.face, this.text, this.more);
    this.node.ariaLabel = Q.card.title;
    this.node.onclick = () => this.open();
    root.append(this.node);
  }

  /** What the chip says for this world and hero, and whether it is shown. */
  update(world: World | null, hero: Hero | null, depth: number, hidden = false): void {
    const cards = world && hero ? questCards(world, hero) : [];
    const card = hidden ? null : chipCard(cards, depth);
    if (!card) {
      if (!this.node.hidden) this.node.hidden = true;
      this.shown = '';
      return;
    }
    const others = cards.filter((c) => c.stage !== 'done').length - 1;
    const key = `${card.id}|${chipLine(card, Q)}|${card.stage}|${others}`;
    if (key === this.shown) return;
    this.shown = key;
    this.node.hidden = false;
    this.node.dataset.who = card.id;
    this.node.dataset.stage = card.stage;
    this.text.textContent = chipLine(card, Q);
    this.more.textContent = others > 0 ? `+${others}` : '';
    this.face.replaceChildren(qicon(BADGE_ICON[card.id], 1, 1.5));
    // A little pop whenever what the chip says changes.
    this.node.classList.remove('pop');
    void this.node.offsetWidth;
    this.node.classList.add('pop');
  }
}

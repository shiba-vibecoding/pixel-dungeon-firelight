import type { Hero, World } from '@pd/core';
import { capitalize, t } from './i18n';
import { chipCard, type QuestCard, questCards, share } from './questcard';
import { chipLine, goalLine, progressLine, rewardLine, stageLine } from './questcardtext';
import { Q } from './quest-text';
import { el, portrait } from './screens';

/*
 * The quest card's pictures: the card in the journal's «Notes» tab, and the little chip that sits on the HUD while an errand
 * stands (a tap opens the journal). What they say is questcardtext.ts's; what they know is questcard.ts's, which counts only from
 * the world and the pack, so no card gives away what the dungeon keeps hidden.
 */

/** One quest's card: the giver, where, the goal, the progress bar and its words, the reward on offer. */
export function questCardNode(card: QuestCard, className = ''): HTMLElement {
  const bar = el('div', { className: 'fl-qbar' }, el('i'));
  const fill = bar.firstElementChild as HTMLElement;
  fill.style.width = `${Math.round(share(card) * 100)}%`;
  if (card.count) bar.style.setProperty('--need', String(card.count.need));
  bar.classList.toggle('single', !card.count);
  const stage = stageLine(card, Q);
  const node = el(
    'article',
    { className: `fl-qcard ${card.id} ${card.stage}${className ? ` ${className}` : ''}` },
    el(
      'header',
      { className: 'fl-qcard-head' },
      portrait(card.giver),
      el(
        'div',
        { className: 'fl-qcard-who' },
        el('h3', { className: 'fl-qcard-name', textContent: capitalize(t.mobs[card.giver]) }),
        el('span', { className: 'pd-note', textContent: Q.card.depth(card.depth) }),
      ),
      card.stage === 'done' ? el('span', { className: 'fl-qtag done', textContent: Q.card.done }) : card.stage === 'ready' ? el('span', { className: 'fl-qtag ready', textContent: '!' }) : null,
    ),
    el('p', { className: 'fl-qgoal', textContent: goalLine(card, Q) }),
    card.stage === 'done' && !card.count ? null : bar,
    card.stage === 'done' ? null : el('p', { className: 'fl-qprogress', textContent: progressLine(card, Q) }),
    card.noPickaxe ? el('p', { className: 'fl-qwarn', textContent: Q.card.noPickaxe }) : null,
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
    this.face.replaceChildren(portrait(card.giver));
    // A little pop whenever what the chip says changes.
    this.node.classList.remove('pop');
    void this.node.offsetWidth;
    this.node.classList.add('pop');
  }
}

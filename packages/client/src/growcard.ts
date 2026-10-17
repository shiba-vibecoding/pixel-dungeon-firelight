import { type Hero, type Item, itemDef, type World } from '@pd/core';
import { type Compare, compare, segments } from './growth';
import { h, hb, vars } from './growdom';
import { gi } from './growicons';
import { grow, itemKey } from './growmem';
import { locale } from './i18n';
import { G } from './i18n-grow';

/*
 * The item card of part 11 (variant A, «was / will be»): a thing from the pack set beside what is worn, the progress toward knowing it
 * in segments, and the player's own note. Every figure is the game's own (growth.ts) and only what the player may know: while an
 * item's level is hidden, its bar is dashed and marked «?» and the figures are those of a plain one (the same the card's first line
 * gives), never the real ones.
 */

const num = (x: number): string => String(x);

/** «2–9» for a weapon, «6» for armour; with a «?» while the level is hidden. */
function figure(c: Compare, side: Compare['this']): string {
  const text = c.kind === 'weapon' ? `${side.lo}–${side.hi}` : num(side.hi);
  return side.known ? text : `${text}?`;
}

const ACC = (heavier: number): string => (1 / 1.5 ** heavier).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The worn thing and this one on the same scale; null when there is nothing to set it against (it is the worn one, or not gear). */
export function compareBlock(hero: Hero, item: Item, label: { worn: string; ours: string } = { worn: G.card.inHand, ours: G.card.thisOne }): HTMLElement | null {
  const c = compare(hero, item);
  if (!c) return null;
  const top = Math.max(c.this.hi, c.worn?.hi ?? 0, 1) * 1.15;
  const row = (who: string, side: Compare['this'], ours: boolean): HTMLElement => {
    const lo = c.kind === 'weapon' ? side.lo : 0;
    const range = h('span', 'fl-range', h('i'));
    vars(range, { '--lo': (lo / top).toFixed(3), '--hi': (side.hi / top).toFixed(3) });
    return h('div', `fl-cmp-row${ours ? ' this' : ''}${side.known ? '' : ' unknown'}`, h('span', 'who', who), range, h('span', 'num', figure(c, side)));
  };
  const box = h('div', 'fl-cmp');
  if (c.worn) box.append(row(c.kind === 'armor' ? G.card.onYou : label.worn, c.worn, false));
  box.append(row(label.ours, c.this, true));
  // Only a comparison of known things says which is better; a hidden level says only that the figures are of a plain one.
  if (c.worn && c.this.known && c.worn.known) {
    const d = c.this.hi - c.worn.hi;
    box.append(h('span', `pd-note fl-cmp-verdict ${d > 0 ? 'up' : d < 0 ? 'down' : 'same'}`, gi(d > 0 ? 'up' : d < 0 ? 'down' : 'fits', 8, 2), d > 0 ? G.card.higher(d) : d < 0 ? G.card.lower(-d) : G.card.same));
  }
  if (!c.this.known) box.append(h('span', 'pd-note fl-tip', gi('unknown', 8, 2), G.card.typical));
  if (c.heavier > 0) box.append(h('span', 'pd-note fl-cmp-heavy', gi('heavy', 8, 2), c.kind === 'weapon' ? G.card.heavier(c.heavier, ACC(c.heavier)) : G.card.heavierArmor(c.heavier)));
  return box;
}

/** The progress toward knowing as segments (growth.ts segments: ten at most, each a whole number of steps). */
export function segsBar(done: number, of: number): HTMLElement {
  const s = segments(done, of);
  const bar = h('div', 'fl-segs');
  vars(bar, { '--n': s.n });
  const filled = Math.floor(done / s.per);
  for (let i = 0; i < s.n; i++) bar.append(h('i', i < filled ? 'full' : i === filled && done % s.per > 0 ? 'next' : ''));
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(of));
  bar.setAttribute('aria-valuenow', String(done));
  return bar;
}

/** The player's note on an item (or on its kind or look, kept as growmem.ts does): a line that opens into an editor on a tap. */
export function noteBlock(world: World, item: Item): HTMLElement {
  const key = itemKey(world, item);
  const text = (): string | undefined => grow.data.notes[key];
  const box = h('div', 'fl-note-box');
  const kindWide = ['potion', 'scroll', 'ring', 'wand'].includes(itemDef(item.kind).category);
  const draw = (): void => {
    const note = text();
    const line = hb(`fl-note${note ? '' : ' empty'}`, G.card.noteTitle, edit, gi('note', 8, 2), h('span', '', note ?? G.card.noteEmpty));
    box.replaceChildren(line);
  };
  function edit(): void {
    const input = h('input', 'fl-note-input');
    input.type = 'text';
    input.maxLength = 80;
    input.value = text() ?? '';
    input.placeholder = G.card.notePlaceholder;
    input.enterKeyHint = 'done';
    const save = (): void => {
      grow.setNote(key, input.value);
      draw();
    };
    input.onkeydown = (event) => {
      if (event.key === 'Enter') save();
      if (event.key === 'Escape') draw();
    };
    box.replaceChildren(
      h('div', 'fl-note editing', gi('note', 8, 2), input),
      h('div', 'fl-note-actions', hb('pd-button small', G.card.noteSave, save, G.card.noteSave), text() ? hb('pd-button small quiet', G.card.noteClear, () => { input.value = ''; save(); }, G.card.noteClear) : null),
      ...(kindWide ? [h('p', 'pd-note', G.card.noteKindHint)] : []),
    );
    input.focus();
  }
  draw();
  return box;
}

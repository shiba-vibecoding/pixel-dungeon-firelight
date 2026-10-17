import type { Hero, Item, World } from '@pd/core';
import { familiarity } from './familiar';
import { mealBonus, wasteIfEaten } from './hungerinfo';
import { I } from './i18n-info';
import './info.css';

/*
 * The small pieces the item window gets: how far a thing is from being known, and what a meal eaten now would waste.
 * Built apart from screens.ts so that file need not know their numbers (familiar.ts, hungerinfo.ts).
 */

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** «Identifying: 13 of 20 hits» with a small bar; null for what is known, or not the hero's. */
export function knowLine(world: World, hero: Hero, item: Item): HTMLElement | null {
  const f = familiarity(world, hero, item);
  if (!f) return null;
  const bar = node('div', 'pd-bar thin xp pd-know-bar');
  bar.style.setProperty('--v', String(f.of > 0 ? f.done / f.of : 0));
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(f.of));
  bar.setAttribute('aria-valuenow', String(f.done));
  const line = node('div', 'pd-know', undefined);
  line.append(node('p', 'pd-info pd-know-text', `${I.know.label}: ${I.know[f.unit === 'zaps' ? 'zaps' : f.unit](f.done, f.of)}`), bar);
  if (!f.inUse && f.unit !== 'zaps') line.append(node('p', 'pd-note pd-know-idle', I.know.idle[f.unit]));
  return line;
}

/** «Eat now and 40 of its satiety is wasted», gently, on a food's card; null if nothing would be. */
export function wasteLine(hero: Hero, item: Item): HTMLElement | null {
  const waste = wasteIfEaten(hero, item);
  if (waste <= 0) return null;
  const bonus = mealBonus(hero, item);
  const text = I.hunger.waste(waste) + (bonus ? `. ${bonus === 'heal' ? I.hunger.wasteHeals : I.hunger.wasteCharges}` : '');
  return node('p', 'pd-callout warn pd-waste', text);
}

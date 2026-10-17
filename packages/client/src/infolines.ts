import type { Hero, Item } from '@pd/core';
import { mealBonus, wasteIfEaten } from './hungerinfo';
import { I } from './i18n-info';
import './info.css';

/*
 * The small pieces the item window gets: what a meal eaten now would waste.
 * Built apart from screens.ts so that file need not know its numbers (hungerinfo.ts).
 */

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** «Eat now and 40 of its satiety is wasted», gently, on a food's card; null if nothing would be. */
export function wasteLine(hero: Hero, item: Item): HTMLElement | null {
  const waste = wasteIfEaten(hero, item);
  if (waste <= 0) return null;
  const bonus = mealBonus(hero, item);
  const text = I.hunger.waste(waste) + (bonus ? `. ${bonus === 'heal' ? I.hunger.wasteHeals : I.hunger.wasteCharges}` : '');
  return node('p', 'pd-callout warn pd-waste', text);
}

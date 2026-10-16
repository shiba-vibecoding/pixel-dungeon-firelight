/*
 * The boss's title card as a page element (fl-fx.css, design part 6): a dark band across the screen with the boss's portrait, the depth
 * and region, its name and its epithet, taken from the game's own texts (so they are in the player's language). It comes when a boss
 * notices the party, stays through the data's timeline and goes. It replaces the canvas card (cards.ts → bossCard), which stays for a
 * view with no page to put it in.
 */
import type { MobKind } from '@pd/core';
import { t } from './i18n';
import { fxState } from './fxsheet';

declare const __BUILD__: { commit: string; date: string } | undefined;
const VERSION = typeof __BUILD__ !== 'undefined' ? __BUILD__.commit : 'dev';

/** How long the card lasts (fx.json → bossCards.timeline.dur). */
export const BOSS_CARD_MS = 2600;

let shown: { el: HTMLElement; out: number; gone: number } | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Shows the card of a boss that has noticed the party; false if there is nothing to show it with (the canvas card is drawn instead). */
export function showBossCard(kind: MobKind, depth: number, region: number, base: string): boolean {
  const loaded = fxState();
  const boss = loaded?.lib.bossCards.bosses[kind];
  const host = typeof document === 'undefined' ? null : document.getElementById('ui');
  if (!loaded || !boss || !host) return false;
  hideBossCard();
  const timeline = loaded.lib.bossCards.timeline;

  const face = el('img', 'fl-boss-face');
  face.alt = '';
  face.src = `${base}${boss.portrait}?v=${VERSION}`;
  const where = el('span', 'fl-boss-depth', t.depthTitle(depth));
  const place = t.regionNames[region];
  if (place) where.append(el('span', 'fl-boss-region', ` · ${place}`));
  const text = el('div', 'fl-boss-text');
  text.append(where, el('span', 'fl-boss-name', t.mobs[kind] ?? kind), el('span', 'fl-boss-sub', t.bossEpithets[kind] ?? ''));
  const plate = el('div', 'fl-boss-plate');
  plate.append(face, text);
  const card = el('div', 'fl-boss-card');
  card.setAttribute('aria-hidden', 'true');
  card.append(plate);
  host.append(card);

  const out = window.setTimeout(() => card.classList.add('out'), timeline.out[0]);
  const gone = window.setTimeout(() => {
    card.remove();
    if (shown?.el === card) shown = null;
  }, timeline.dur);
  shown = { el: card, out, gone };
  return true;
}

/** Takes the card away at once (a new floor, a new run). */
export function hideBossCard(): void {
  if (!shown) return;
  window.clearTimeout(shown.out);
  window.clearTimeout(shown.gone);
  shown.el.remove();
  shown = null;
}

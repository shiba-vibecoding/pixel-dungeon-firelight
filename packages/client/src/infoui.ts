import { type Hero, HUNGRY, STARVING, type World } from '@pd/core';
import { hungerReport } from './hungerinfo';
import { I } from './i18n-info';
import { hungerLines } from './infotext';
import { button, el, info, show, windowOf } from './screens';
import './info.css';

/*
 * The information windows: what the hunger icon opens (turns left, the pack's food counted in turns, the hunger's rate). It only
 * tells; nothing is sent to the dungeon from here. The numbers come from hungerinfo.ts.
 */

/* Hunger */

const SHARE_HUNGRY = 1 - HUNGRY / STARVING;

/** The hunger bar of the card: filled with what is left of satiety, as the HUD's is, with the two thresholds marked. */
function meter(hunger: number, state: string): HTMLElement {
  const bar = el('div', { className: `pd-meter ${state}` }, el('i', { className: 'pd-meter-fill' }), el('i', { className: 'pd-meter-tick hungry' }), el('i', { className: 'pd-meter-tick starving' }));
  bar.style.setProperty('--v', String(Math.max(0, 1 - hunger / STARVING)));
  bar.style.setProperty('--at', String(SHARE_HUNGRY));
  const scale = el(
    'div',
    { className: 'pd-meter-scale' },
    el('span', { className: 'pd-meter-label hungry', textContent: String(HUNGRY) }),
    el('span', { className: 'pd-meter-label starving', textContent: String(STARVING) }),
  );
  scale.style.setProperty('--at', String(SHARE_HUNGRY));
  return el('div', { className: 'pd-meter-box' }, bar, scale);
}

/** What the hunger icon opens: how many turns before hungry and before starving, the pack's food in turns, the rate of hunger. */
export function showHunger(world: World, hero: Hero, onClose: () => void): void {
  const report = hungerReport(world, hero);
  const lines = hungerLines(world, hero);
  const F = I.hunger;
  const icon = el('i', { className: 'pd-icon pd-hunger-icon' });
  icon.style.backgroundImage = 'var(--spr-food)';
  const box = windowOf(
    { title: F.title, sub: F.level(report.hunger, STARVING), icon, onClose, narrow: true, className: 'pd-info-window' },
    el('div', { className: `pd-hunger-state ${report.state}`, textContent: lines.status }),
    meter(report.hunger, report.state),
    el('p', { className: 'pd-note pd-meter-note', textContent: F.thresholds(HUNGRY, STARVING) }),
    el('p', { className: 'pd-info pd-hunger-turns', textContent: lines.turns }),
    info(lines.meaning),
    el(
      'section',
      { className: 'pd-info-block' },
      el('p', { className: 'pd-info pd-hunger-food', textContent: lines.food }),
      ...lines.items.map((text) => el('p', { className: 'pd-note', textContent: text })),
    ),
    el('section', { className: 'pd-info-block' }, el('h3', { className: 'pd-info-head', textContent: F.rates }), ...lines.rates.map((text) => el('p', { className: 'pd-note', textContent: text }))),
    button(F.close, onClose, 'quiet'),
  );
  show(box, onClose);
}

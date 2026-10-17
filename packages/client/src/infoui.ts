import { createItem, type Hero, HUNGRY, type Item, type ItemKind, levelAt, STARVING, T, type World } from '@pd/core';
import { audio } from './audio';
import { brewOdds, SEEDS_TO_BREW, type SeedCount, seedsIn, seedsInPot } from './brewodds';
import { hungerReport } from './hungerinfo';
import { I } from './i18n-info';
import { hungerLines, percent, potLines, seedList, seedName } from './infotext';
import { button, el, info, show, slot, windowOf } from './screens';
import './info.css';

/*
 * The information windows: what the hunger icon opens (turns left, the pack's food counted in turns, the hunger's rate) and the
 * alchemy pot's calculator (what the seeds chosen will brew, by the core's own formula). Both only tell; nothing is sent to
 * the dungeon from here. The numbers come from hungerinfo.ts and brewodds.ts.
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

/* The alchemy pot */

export interface PotOptions {
  world: World;
  hero: Hero;
  /** The pot's cell, if the hero is at it or looking at it: the seeds lying in it count. */
  cell?: number;
  /** Seeds to begin with. */
  start?: ItemKind;
  onClose(): void;
}

/** The alchemy pot's calculator: seeds picked from the pack with + and −, and at once what the pot would brew of them. */
export function showPot(options: PotOptions): void {
  const { world, hero, onClose } = options;
  const pack = seedsIn(hero);
  // Seeds lying in the pot count; at any other cell nothing does.
  const atPot = options.cell !== undefined && levelAt(world, hero.depth).map[options.cell] === T.ALCHEMY;
  const inside = atPot ? seedsInPot(world, hero, options.cell!) : { seeds: [], spoiled: false };
  const picked = new Map<ItemKind, number>();
  if (options.start && pack.some((s) => s.kind === options.start)) picked.set(options.start, 1);
  const result = el('section', { className: 'pd-pot-result', ariaLive: 'polite' });
  const counters = new Map<ItemKind, { value: HTMLElement; minus: HTMLButtonElement; plus: HTMLButtonElement }>();

  const render = (): void => {
    const chosen: SeedCount[] = pack.map((s) => ({ kind: s.kind, qty: picked.get(s.kind) ?? 0 })).filter((s) => s.qty > 0);
    const all = [...inside.seeds, ...chosen];
    const odds = brewOdds(all);
    for (const s of pack) {
      const c = counters.get(s.kind)!;
      const n = picked.get(s.kind) ?? 0;
      c.value.textContent = String(n);
      c.minus.disabled = n <= 0;
      c.plus.disabled = n >= s.qty;
    }
    result.replaceChildren();
    if (inside.spoiled) {
      result.append(el('p', { className: 'pd-callout warn', textContent: I.pot.spoiled }));
      return;
    }
    if (odds.count === 0) {
      result.append(el('p', { className: 'pd-note', textContent: I.pot.none }));
      return;
    }
    result.append(el('p', { className: 'pd-info pd-pot-mix', textContent: seedList(all.reduce<SeedCount[]>((merged, s) => {
      const same = merged.find((m) => m.kind === s.kind);
      if (same) same.qty += s.qty;
      else merged.push({ ...s });
      return merged;
    }, [])) }));
    if (!odds.enough) {
      result.append(el('p', { className: 'pd-note', textContent: I.pot.need(SEEDS_TO_BREW - odds.count) }));
      return;
    }
    result.append(el('h3', { className: 'pd-info-head', textContent: I.pot.odds }));
    for (const line of potLines(world, odds)) {
      const bar = el('div', { className: 'pd-bar thin xp pd-pot-bar' });
      bar.style.setProperty('--v', String(line.chance));
      result.append(el('div', { className: 'pd-pot-line' }, el('span', { className: 'pd-pot-name', textContent: line.label }), el('span', { className: 'pd-pot-pct', textContent: percent(line.chance) }), bar));
    }
  };

  const row = (seed: SeedCount): HTMLElement => {
    const sample: Item = createItem(seed.kind, seed.qty);
    const value = el('span', { className: 'pd-pot-count', textContent: '0' });
    const step = (by: number): void => {
      audio.play('click');
      picked.set(seed.kind, Math.max(0, Math.min(seed.qty, (picked.get(seed.kind) ?? 0) + by)));
      render();
    };
    const minus = el('button', { className: 'pd-button pd-pot-step', textContent: '−', ariaLabel: I.pot.minus, onclick: () => step(-1) });
    const plus = el('button', { className: 'pd-button pd-pot-step', textContent: '+', ariaLabel: I.pot.plus, onclick: () => step(1) });
    counters.set(seed.kind, { value, minus, plus });
    return el(
      'div',
      { className: 'pd-pot-row' },
      slot(world, sample, { hero }),
      el('span', { className: 'pd-pot-seed', textContent: seedName(seed.kind) }),
      el('div', { className: 'pd-pot-stepper' }, minus, value, plus),
    );
  };

  const box = windowOf(
    { title: I.pot.title, sub: I.pot.sub, onClose, narrow: true, className: 'pd-info-window pd-pot' },
    el(
      'div',
      { className: 'pd-scroll pd-stack' },
      inside.seeds.length > 0 && el('p', { className: 'pd-note', textContent: `${I.pot.inPot}: ${seedList(inside.seeds)}` }),
      el('h3', { className: 'pd-info-head', textContent: I.pot.pack }),
      pack.length === 0 ? el('p', { className: 'pd-note', textContent: I.pot.noSeeds }) : el('p', { className: 'pd-note', textContent: I.pot.pick }),
      ...pack.map(row),
      result,
      el('p', { className: 'pd-note', textContent: I.pot.note }),
      el('p', { className: 'pd-note', textContent: I.pot.stack }),
    ),
    button(I.pot.close, onClose, 'quiet'),
  );
  show(box, onClose);
  render();
}

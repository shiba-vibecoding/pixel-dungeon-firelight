import { createItem, type Hero, isAlive, type World } from '@pd/core';
import { causeName, causeNote } from './deathcopy';
import type { HurtEntry } from './hurtlog';
import type { Source } from './hurtsrc';
import { capitalize, t } from './i18n';
import { itemName } from './itemtext';
import { el, info, show, windowOf } from './screens';
import { iconFor, sourceIconEl } from './srcicon';
import type { Assets } from './sprites';

/*
 * «What was» (fl-input.css): the hero's last wounds, the newest first: what dealt each, how much, on which turn. Opened from the
 * HP bar, from the hero's window and from the death window. When the hero has fallen, the cause of death stands on top.
 */

/** What a source is called: a monster, a class, a trap's own name, a wand or missile by the name the hero knows it by, or the cause. */
export function sourceName(world: World, source: Source): string {
  if ('mob' in source) return capitalize(t.mobs[source.mob]);
  if ('hero' in source) return capitalize(t.classes[source.hero]);
  if (source.cause === 'trap' && source.trap) return t.safe.trap[source.trap][0];
  if ((source.cause === 'wand' || source.cause === 'missile') && source.item) return capitalize(itemName(world, createItem(source.item)));
  return t.input.feed.causes[source.cause] ?? t.input.feed.causes.unknown!;
}

export interface FeedOptions {
  world: World;
  hero: Hero;
  assets: Assets;
  entries: readonly HurtEntry[];
  onClose(): void;
}

/** One wound: its picture, what dealt it and when, and how much. */
function row(world: World, assets: Assets, entry: HurtEntry): HTMLElement {
  const labels = world.run.labels;
  return el(
    'li',
    { className: 'fl-feed-row' },
    sourceIconEl(iconFor(entry.source, labels), assets, entry.depth, 28),
    el(
      'span',
      { className: 'fl-feed-what' },
      el('span', { className: 'fl-feed-name', textContent: sourceName(world, entry.source) }),
      el('small', { className: 'fl-feed-when', textContent: `${t.input.feed.turn(entry.turn)} · ${t.depthShort(entry.depth)}` }),
    ),
    el('span', { className: 'fl-feed-hp', textContent: `−${entry.amount}` }),
  );
}

export function showFeed(options: FeedOptions): void {
  const { world, hero, assets, entries } = options;
  const dead = !isAlive(hero);
  const cause = dead ? causeName(hero.killedBy) : '';
  const note = dead ? causeNote(hero.killedBy) : '';
  show(
    windowOf(
      { title: t.input.feed.title, onClose: options.onClose, className: 'fl-feed' },
      cause && el('div', { className: 'fl-feed-death' }, el('b', { textContent: t.input.feed.died }), el('span', { textContent: capitalize(t.killedBy(cause)) }), note && el('small', { textContent: note })),
      entries.length > 0
        ? el('div', { className: 'pd-scroll' }, el('ol', { className: 'fl-feed-list' }, ...entries.map((entry) => row(world, assets, entry))))
        : info(t.input.feed.empty, 'pd-note center'),
      entries.length > 0 && info(t.input.feed.hint, 'pd-note center'),
    ),
    options.onClose,
  );
}

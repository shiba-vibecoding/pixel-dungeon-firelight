import { audio } from './audio';
import type { BoardEntry, HallView, RunApi } from './checked';
import { loadCompete } from './compete';
import { competeShell, number, podium, rowOf, type RowData, tx } from './compete-ui';
import { cupNode, paletteOf } from './season-art';
import { seasonName } from './seasonui';
import { el, info, show, sprites } from './screens';

/*
 * The hall of fame (design part 7): the top ten of every season by Heat, written once when the season is over and kept for ever, a page
 * a season: the first three on a podium with the season's cups, then places 4 to 10. The heroes stand as they were dressed when the page
 * was written. A season is picked from the row above.
 */

export interface HallOptions {
  api: RunApi | null;
  onBack(): void;
  onClose(): void;
}

export function showHall(options: HallOptions): void {
  const shell = competeShell(options.onClose);
  show(shell.win, options.onClose);
  shell.set(info(tx('loading'), 'pd-note center'));
  void loadCompete().then(async () => {
    shell.head(tx('hall'), null, options.onBack);
    const page = options.api ? await options.api.hall() : null;
    render(options, shell, page);
  });
}

function render(options: HallOptions, shell: ReturnType<typeof competeShell>, page: HallView | null): void {
  if (!page) {
    shell.set(info(tx('offline'), 'pd-note center'));
    return;
  }
  if (!page.season) {
    shell.set(el('div', { className: 'fl-mart-main' }, info(tx('hallNone'), 'pd-note center'), el('div', { className: 'fl-honour-note', textContent: tx('hallWaiting') })));
    return;
  }
  const n = Number(page.season.slice(1));
  const palette = paletteOf(n);
  shell.win.style.setProperty('--season-hi', palette[0] ?? '#ffeba4');
  const main = el('div', { className: 'fl-mart-main fl-hall' });

  // The seasons that have a page.
  if (page.available.length > 1) {
    const picker = el('div', { className: 'fl-hall-seasons' });
    for (const id of page.available) {
      const k = Number(id.slice(1));
      const b = el('button', {}, cupNode(k, 1), `${tx('seasonN', { n: k })} · ${seasonName(k)}`);
      b.setAttribute('aria-pressed', String(id === page.season));
      b.onclick = () => {
        audio.play('click');
        shell.set(info(tx('loading'), 'pd-note center'));
        void options.api!.hall(id).then((next) => render(options, shell, next));
      };
      picker.append(b);
    }
    main.append(picker);
  }
  main.append(el('div', { className: 'fl-hall-banner' }, el('b', { textContent: tx('hallOf', { n }) }), el('span', { textContent: page.frozen ? tx('hallBanner') : tx('hallWaiting') })));

  const heat = (entry: BoardEntry, place: number): RowData => ({ entry, place, value: number(entry.score), unit: tx('heatRating').toLowerCase(), moving: place <= 3 });
  const held: Array<() => void> = [];
  if (page.top.length > 0) {
    const top = podium(page.top.slice(0, 3).map((entry, i) => ({ ...heat(entry, i + 1), cup: () => cupNode(n, 2) })));
    held.push(top.dispose);
    main.append(top.node);
    const rows = el('div', { className: 'fl-rows' });
    page.top.slice(3, 10).forEach((entry, i) => {
      const row = rowOf(heat(entry, i + 4));
      held.push(() => row.dispose?.());
      rows.append(row.node);
    });
    if (rows.childElementCount > 0) main.append(rows);
  } else {
    main.append(info(tx('noResults'), 'pd-note center'));
  }
  main.append(el('div', { className: 'fl-honour-note', textContent: tx('honourOnly') }));
  shell.set(main);
  sprites(shell.win);
}

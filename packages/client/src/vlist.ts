/*
 * A list of rows of one fixed height that mounts only the rows on screen (and a few more each way): a board of a hundred rows holds
 * a dozen at a time, each with its own hero card (herocard.ts). The rest is empty space of the right height, so the scrollbar and the
 * scroll position are those of the whole list. `scroller` is the element that scrolls it (the window's body).
 */

export interface VirtualRow {
  node: HTMLElement;
  /** Called when the row is taken off the page (a hero card stops there). */
  dispose?(): void;
}

export interface VirtualList {
  node: HTMLElement;
  /** Mounts what is in view now (called on scroll and resize by itself; for a layout change). */
  update(): void;
  dispose(): void;
}

export function virtualList(scroller: HTMLElement, count: number, rowHeight: number, make: (index: number) => VirtualRow, className: string, buffer = 3): VirtualList {
  const node = document.createElement('div');
  node.className = className;
  const mounted = new Map<number, VirtualRow>();
  let from = -1;
  let to = -1;
  let frame = 0;
  let stopped = false;
  let seen = false;

  const update = (): void => {
    if (stopped) return;
    // A list taken off the page (its tab was left) stops at once, and lets its rows go.
    if (node.isConnected) seen = true;
    else if (seen) {
      stop();
      return;
    }
    const view = scroller.clientHeight || 640;
    const listTop = node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    const first = Math.max(0, Math.floor((scroller.scrollTop - listTop) / rowHeight) - buffer);
    const last = Math.min(count, Math.ceil((scroller.scrollTop - listTop + view) / rowHeight) + buffer);
    const [a, b] = last <= first ? [Math.min(first, count), Math.min(first, count)] : [first, last];
    if (a === from && b === to) return;
    from = a;
    to = b;
    for (const [index, row] of mounted) {
      if (index < a || index >= b) {
        row.dispose?.();
        row.node.remove();
        mounted.delete(index);
      }
    }
    const ordered: HTMLElement[] = [];
    for (let index = a; index < b; index++) {
      let row = mounted.get(index);
      if (!row) {
        row = make(index);
        mounted.set(index, row);
      }
      ordered.push(row.node);
    }
    node.replaceChildren(...ordered);
    node.style.paddingTop = `${a * rowHeight}px`;
    node.style.paddingBottom = `${(count - b) * rowHeight}px`;
  };

  const onScroll = (): void => {
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      update();
    });
  };
  scroller.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
  // Laid out by the time of the next frame (the list may not be on the page yet): look again.
  requestAnimationFrame(() => {
    from = -1;
    update();
  });

  function stop(): void {
    stopped = true;
    scroller.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    if (frame !== 0) cancelAnimationFrame(frame);
    for (const row of mounted.values()) row.dispose?.();
    mounted.clear();
  }

  return { node, update, dispose: stop };
}

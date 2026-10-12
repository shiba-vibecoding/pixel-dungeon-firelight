/*
 * Hover tooltips for a mouse (design system v12, .pd-tooltip): over a cell of
 * the map, what is there and what the buttons do; over a button, its name and
 * key. They live in the interface layer, which may be scaled by a whole
 * number (--ui), so positions are given in screen pixels and divided by it.
 * Touch screens never see them.
 */

export interface TipContent {
  name: string;
  /** Colours the name: a monster, an item, a companion. */
  kind?: 'foe' | 'item' | 'ally';
  /** A key after the name, as buttons show it. */
  key?: string;
  /** Health, 0 to 1, as a bar under the name. */
  health?: number;
  text?: string;
  /** What the mouse buttons do: [button, what]. */
  keys?: ReadonlyArray<readonly [string, string]>;
}

const MAX_WIDTH = 300;

export class Tooltip {
  private readonly node: HTMLElement;

  constructor(private readonly root: HTMLElement, private readonly scale: () => number) {
    this.node = document.createElement('div');
    this.node.className = 'pd-tooltip';
    this.node.style.display = 'none';
    this.node.setAttribute('role', 'tooltip');
    root.append(this.node);
  }

  /** Shows a tooltip by the pointer (screen pixels): below and to its right, or to its left past the middle. */
  show(content: TipContent, x: number, y: number, small = false): void {
    const node = this.node;
    node.className = `pd-tooltip${small ? ' small' : ''}`;
    node.replaceChildren();
    const name = document.createElement('span');
    name.className = `pd-tooltip-name${content.kind ? ` ${content.kind}` : ''}`;
    name.textContent = content.name;
    if (content.key) {
      const key = document.createElement('b');
      key.textContent = content.key;
      name.append(key);
    }
    node.append(name);
    if (content.health !== undefined) {
      const bar = document.createElement('div');
      bar.className = 'pd-bar';
      bar.style.setProperty('--v', String(Math.max(0, Math.min(1, content.health))));
      node.append(bar);
    }
    if (content.text) {
      const text = document.createElement('span');
      text.className = 'pd-tooltip-text';
      text.textContent = content.text;
      node.append(text);
    }
    if (content.keys?.length) {
      const keys = document.createElement('div');
      keys.className = 'pd-tooltip-keys';
      for (const [button, what] of content.keys) {
        const line = document.createElement('span');
        const b = document.createElement('b');
        b.textContent = button;
        line.append(b, ` ${what}`);
        keys.append(line);
      }
      node.append(keys);
    }
    node.style.display = '';
    node.style.maxWidth = `${MAX_WIDTH}px`;
    // In the layer's own pixels; kept on the screen, and on the other side of the pointer near an edge.
    const scale = this.scale();
    const px = x / scale;
    const py = y / scale;
    const width = this.root.clientWidth;
    const height = this.root.clientHeight;
    const box = node.getBoundingClientRect();
    const w = box.width / scale;
    const h = box.height / scale;
    let left = px > width / 2 ? px - w - 12 : px + 16;
    let top = py + 18;
    if (top + h > height - 8) top = py - h - 12;
    left = Math.max(8, Math.min(width - w - 8, left));
    top = Math.max(8, top);
    node.style.left = `${Math.round(left)}px`;
    node.style.top = `${Math.round(top)}px`;
  }

  hide(): void {
    this.node.style.display = 'none';
  }

  get shown(): boolean {
    return this.node.style.display !== 'none';
  }
}

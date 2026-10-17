/*
 * A tiny element builder for the pieces of part 11 that need no window of their own (cards, rows, chips). It lives apart from
 * screens.ts so that the screens can use these pieces without a cycle; a window is still made with screens.ts's windowOf.
 */

export type GChild = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', ...children: GChild[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children) if (child !== null && child !== undefined && child !== false) node.append(typeof child === 'object' ? child : String(child));
  return node;
}

/** CSS custom properties on a node. */
export function vars<T extends HTMLElement>(node: T, values: Readonly<Record<string, string | number>>): T {
  for (const [key, value] of Object.entries(values)) node.style.setProperty(key, String(value));
  return node;
}

/** A button with an accessible name. */
export function hb(className: string, label: string, onClick: () => void, ...children: GChild[]): HTMLButtonElement {
  const node = h('button', className, ...children);
  node.type = 'button';
  node.ariaLabel = label;
  node.onclick = onClick;
  return node;
}

/** An items.png sprite (`.pd-item` with its place set, no hydrating pass needed). */
export function spriteNode(index: number): HTMLElement {
  const node = document.createElement('i');
  node.className = 'pd-item';
  node.dataset.i = String(index);
  node.style.setProperty('--ix', String(index % 8));
  node.style.setProperty('--iy', String(Math.floor(index / 8)));
  return node;
}

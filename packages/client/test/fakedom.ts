import { vi } from 'vitest';

/*
 * A minimal document for the tests of what the screens SAY: elements that keep their class, text, attributes and children, and print
 * themselves as one string (`say`). Enough for the builders of part 11 (growcard, growhero, growknow) and the slot of screens.ts;
 * no layout, no events. Two worlds that differ only in what is hidden must `say` the same.
 */

class Style {
  readonly props = new Map<string, string>();
  setProperty(key: string, value: string): void {
    this.props.set(key, value);
  }
  getPropertyValue(key: string): string {
    return this.props.get(key) ?? '';
  }
  removeProperty(key: string): void {
    this.props.delete(key);
  }
  set cssText(value: string) {
    this.props.set('cssText', value);
  }
  [key: string]: unknown;
}

export class FakeEl {
  className = '';
  readonly children: Array<FakeEl | string> = [];
  readonly style = new Style() as unknown as CSSStyleDeclaration;
  readonly dataset: Record<string, string> = {};
  readonly attrs = new Map<string, string>();
  readonly classList = {
    add: (...c: string[]) => { for (const x of c) if (!this.className.split(' ').includes(x)) this.className = `${this.className} ${x}`.trim(); },
    remove: (...c: string[]) => { this.className = this.className.split(' ').filter((x) => !c.includes(x)).join(' '); },
    contains: (c: string) => this.className.split(' ').includes(c),
    toggle: (c: string, on?: boolean) => { const has = this.classList.contains(c); if (on ?? !has) this.classList.add(c); else this.classList.remove(c); return !has; },
  };
  hidden = false;
  tabIndex = 0;
  type = '';
  value = '';
  maxLength = 0;
  placeholder = '';
  ariaLabel = '';
  ariaLive = '';
  role = '';
  onclick: (() => void) | null = null;
  onkeydown: ((e: unknown) => void) | null = null;
  parentElement: FakeEl | null = null;
  constructor(readonly tag: string) {}
  append(...nodes: Array<FakeEl | string>): void {
    for (const n of nodes) {
      if (n instanceof FakeEl) n.parentElement = this;
      this.children.push(n);
    }
  }
  replaceChildren(...nodes: Array<FakeEl | string>): void {
    this.children.length = 0;
    this.append(...nodes);
  }
  remove(): void {}
  setAttribute(key: string, value: string): void {
    this.attrs.set(key, value);
  }
  getAttribute(key: string): string | null {
    return this.attrs.get(key) ?? null;
  }
  addEventListener(): void {}
  querySelector(): FakeEl | null {
    return null;
  }
  querySelectorAll(): FakeEl[] {
    return [];
  }
  getBoundingClientRect(): { width: number; height: number; bottom: number } {
    return { width: 0, height: 0, bottom: 0 };
  }
  focus(): void {}
  set textContent(value: string) {
    this.children.length = 0;
    this.children.push(value);
  }
  get textContent(): string {
    return this.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join('');
  }
}

/** Stubs the globals the client's modules reach for; the language is the one asked for. Call before importing them. */
export function stubBrowser(lang: 'ru' | 'en' = 'en'): void {
  vi.stubGlobal('location', { search: `?lang=${lang}`, href: 'http://x/' });
  vi.stubGlobal('navigator', { language: lang, languages: [lang], userAgent: 'x' });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, length: 0, key: () => null });
  vi.stubGlobal('document', {
    createElement: (tag: string) => new FakeEl(tag),
    createTextNode: (text: string) => text,
    getElementById: () => new FakeEl('div'),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => undefined,
    documentElement: new FakeEl('html'),
    body: new FakeEl('body'),
    baseURI: 'http://x/',
    visibilityState: 'visible',
  });
  vi.stubGlobal('window', { setTimeout, clearTimeout, addEventListener: () => undefined, matchMedia: () => ({ matches: false, addEventListener: () => undefined }) });
  vi.stubGlobal('addEventListener', () => undefined);
  vi.stubGlobal('removeEventListener', () => undefined);
  vi.stubGlobal('innerWidth', 375);
  vi.stubGlobal('innerHeight', 812);
  vi.stubGlobal('devicePixelRatio', 2);
  vi.stubGlobal('Node', FakeEl);
  vi.stubGlobal('HTMLElement', FakeEl);
}

/** Everything a node shows, as text: tag, class, the inline numbers, the attributes the player can read, then the children. */
export function say(node: FakeEl | string): string {
  if (typeof node === 'string') return node;
  if (!(node instanceof FakeEl)) return JSON.stringify(node);
  const style = [...(node.style as unknown as Style).props].map(([k, v]) => `${k}:${v}`).join(';');
  const attrs = [...node.attrs].map(([k, v]) => `${k}=${v}`).join(',');
  const label = node.ariaLabel ? ` aria=${node.ariaLabel}` : '';
  const data = Object.entries(node.dataset).map(([k, v]) => `${k}=${v}`).join(',');
  return `<${node.tag} class="${node.className}" style="${style}" ${attrs}${label} ${data}>${node.children.map(say).join('')}</${node.tag}>`;
}

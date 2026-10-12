import { audio } from './audio';
import { t } from './i18n';

/*
 * The map's own controls and the finds (design system: .pd-mapctl, .pd-finds).
 * A column of buttons over the log on the right: zoom in, zoom out, the whole
 * level, and — only while the view has been dragged away — back to the hero.
 * Under the HUD on the right, what was just picked up stacks for a moment;
 * the same thing again counts up «×N» rather than repeating.
 */

export interface MapActions {
  zoomIn(): void;
  zoomOut(): void;
  whole(): void;
  home(): void;
}

export class MapControls {
  private readonly box: HTMLElement;
  private readonly hero: HTMLButtonElement;
  private readonly zoomIn: HTMLButtonElement;
  private readonly zoomOut: HTMLButtonElement;
  private state = '';

  constructor(root: HTMLElement, actions: MapActions) {
    const button = (kind: string, label: string, act: () => void): HTMLButtonElement => {
      const node = document.createElement('button');
      node.className = `pd-mapbtn ${kind}`;
      node.setAttribute('aria-label', label);
      node.onclick = () => {
        audio.play('click');
        act();
      };
      return node;
    };
    this.hero = button('hero', t.mapHero, actions.home);
    this.zoomIn = button('in', t.mapIn, actions.zoomIn);
    this.zoomOut = button('out', t.mapOut, actions.zoomOut);
    this.box = document.createElement('div');
    this.box.className = 'pd-mapctl';
    this.box.append(this.hero, this.zoomIn, this.zoomOut, button('all', t.mapAll, actions.whole));
    root.append(this.box);
  }

  /** The buttons as things stand: at a limit of the zoom one is spent; «to the hero» only when dragged away. */
  update(canIn: boolean, canOut: boolean, away: boolean, logHeight: number): void {
    const state = `${canIn}|${canOut}|${away}|${Math.round(logHeight)}`;
    if (state === this.state) return;
    this.state = state;
    this.zoomIn.disabled = !canIn;
    this.zoomOut.disabled = !canOut;
    this.hero.hidden = !away;
    this.box.style.setProperty('--log-h', `${Math.round(logHeight)}px`);
  }
}

/** The finds' stack: PD.find of the design system. */
export class Finds {
  private readonly box: HTMLElement;

  constructor(root: HTMLElement) {
    this.box = document.createElement('div');
    this.box.className = 'pd-finds';
    this.box.setAttribute('aria-live', 'polite');
    root.append(this.box);
  }

  /** Something found: `key` joins repeats of the same thing; `sprite` is its icon in items.png. */
  show(key: string, sprite: number, name: string, good = false, ttl = 2400, max = 3): void {
    const same = [...this.box.querySelectorAll<HTMLElement>('.pd-find:not(.gone)')].find((node) => node.dataset.key === key);
    if (same) {
      const n = Number(same.dataset.n || 1) + 1;
      same.dataset.n = String(n);
      let count = same.querySelector('b');
      if (!count) {
        count = document.createElement('b');
        same.append(count);
      }
      count.textContent = ` ×${n}`;
      window.clearTimeout(Number(same.dataset.timer));
      same.dataset.timer = String(window.setTimeout(() => this.gone(same), ttl));
      this.box.prepend(same);
      this.age();
      return;
    }
    const node = document.createElement('div');
    node.className = `pd-find${good ? ' good' : ''}`;
    node.dataset.key = key;
    const icon = document.createElement('i');
    icon.className = 'pd-item';
    icon.style.setProperty('--ix', String(sprite % 8));
    icon.style.setProperty('--iy', String(Math.floor(sprite / 8)));
    const label = document.createElement('span');
    label.textContent = name;
    node.append(icon, label);
    this.box.prepend(node);
    const all = [...this.box.querySelectorAll<HTMLElement>('.pd-find:not(.gone)')];
    for (const extra of all.slice(max)) this.gone(extra);
    node.dataset.timer = String(window.setTimeout(() => this.gone(node), ttl));
    this.age();
  }

  private gone(node: HTMLElement): void {
    node.classList.add('gone');
    window.setTimeout(() => {
      node.remove();
      this.age();
    }, 260);
  }

  private age(): void {
    this.box.querySelectorAll<HTMLElement>('.pd-find:not(.gone)').forEach((node, i) => {
      node.dataset.age = String(Math.min(2, i));
    });
  }
}

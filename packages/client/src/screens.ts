import {
  BACKPACK_SIZE, type Hero, type HeroClass, type InventoryAction, type Item, itemDef, type World,
} from '@pd/core';
import { audio } from './audio';
import { capitalize, t } from './i18n';
import { isKnown, itemInfo, itemName, spriteOffset } from './itemtext';

/*
 * DOM windows over the game: title screen, menu, help, death. They use the
 * original window and button frames through CSS border-image (see index.html).
 */

const root = document.getElementById('overlay')!;
const HERO_CLASSES: readonly HeroClass[] = ['warrior', 'mage', 'rogue', 'huntress'];

type Child = Node | string | null | undefined | false;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {}, ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = Object.assign(document.createElement(tag), props);
  for (const child of children) {
    if (child) element.append(child);
  }
  return element;
}

function button(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const click = (): void => {
    audio.play('click');
    onClick();
  };
  return el('button', { className: `pd-button ${className}`.trim(), textContent: label, onclick: click });
}

function show(content: HTMLElement, dim = true): void {
  root.replaceChildren(content);
  root.classList.toggle('dim', dim);
  root.hidden = false;
}

export function hideOverlay(): void {
  root.hidden = true;
  root.replaceChildren();
}

export function overlayOpen(): boolean {
  return !root.hidden;
}

export interface TitleOptions {
  heroClass: HeroClass;
  invitedRoom: string | null;
  hasSave: boolean;
  coopAvailable: boolean;
  /** Shown outside Telegram, where the name is not known. */
  askName: string | null;
  onClass(heroClass: HeroClass): void;
  onName(name: string): void;
  onContinue(): void;
  onSolo(): void;
  onCoop(): void;
  onJoin(): void;
  onDaily(): void;
}

export function showTitle(options: TitleOptions): void {
  let selected = options.heroClass;
  const info = el('p', { className: 'pd-info', textContent: t.classInfo[selected] });
  const classes = el('div', { className: 'pd-classes' });
  const renderClasses = (): void => {
    classes.replaceChildren(
      ...HERO_CLASSES.map((heroClass) =>
        el(
          'button',
          {
            className: `pd-class${heroClass === selected ? ' selected' : ''}`,
            onclick: () => {
              selected = heroClass;
              info.textContent = t.classInfo[heroClass];
              options.onClass(heroClass);
              renderClasses();
            },
          },
          el('span', { className: `pd-class-icon icon-${heroClass}` }),
          el('span', { textContent: t.classes[heroClass] }),
        ),
      ),
    );
  };
  renderClasses();

  const name =
    options.askName !== null &&
    el('input', {
      className: 'pd-input',
      value: options.askName,
      maxLength: 20,
      placeholder: t.yourName,
      oninput: (event: Event) => options.onName((event.target as HTMLInputElement).value),
    });

  show(
    el(
      'div',
      { className: 'pd-title' },
      el('div', { className: 'pd-banner' }),
      el('p', { className: 'pd-subtitle', textContent: t.subtitle }),
      el(
        'div',
        { className: 'pd-window' },
        classes,
        info,
        name,
        options.invitedRoom && button(t.join(options.invitedRoom), options.onJoin, 'primary'),
        options.hasSave && button(t.continueRun, options.onContinue, options.invitedRoom ? '' : 'primary'),
        button(options.hasSave ? t.newRun : t.solo, options.onSolo),
        options.coopAvailable
          ? button(t.coop, options.onCoop)
          : el('p', { className: 'pd-note', textContent: t.coopUnavailable }),
        button(t.daily, options.onDaily),
        el('p', { className: 'pd-note', textContent: t.dailyInfo }),
      ),
    ),
    false,
  );
}

export interface MenuOptions {
  room: string | null;
  onResume(): void;
  onInvite(): void;
  onHelp(): void;
  onExit(): void;
}

export function showMenu(options: MenuOptions): void {
  const sound = button(audio.enabled ? t.soundOn : t.soundOff, () => {
    audio.setEnabled(!audio.enabled);
    sound.textContent = audio.enabled ? t.soundOn : t.soundOff;
  });
  show(
    el(
      'div',
      { className: 'pd-window' },
      options.room && el('p', { className: 'pd-heading', textContent: t.room(options.room) }),
      button(t.resume, options.onResume, 'primary'),
      options.room && button(t.invite, options.onInvite),
      button(t.help, options.onHelp),
      sound,
      button(t.toMenu, options.onExit),
    ),
  );
}

export function showHelp(onClose: () => void): void {
  show(
    el(
      'div',
      { className: 'pd-window' },
      el('p', { className: 'pd-heading', textContent: t.help }),
      el('ul', { className: 'pd-help' }, ...t.helpText.map((line) => el('li', { textContent: line }))),
      button('OK', onClose, 'primary'),
    ),
  );
}

export interface EndOptions {
  victory: boolean;
  title: string;
  text: string;
  onRestart: () => void;
  restartLabel: string;
  onExit: () => void;
}

/** The end of a run: the whole party fell, or it won. */
export function showRunEnd(options: EndOptions): void {
  show(
    el(
      'div',
      { className: 'pd-window' },
      el('div', { className: options.victory ? 'pd-victory' : 'pd-gameover' }),
      el('p', { className: 'pd-heading', textContent: options.title }),
      el('p', { className: 'pd-info', textContent: options.text }),
      button(options.restartLabel, options.onRestart, 'primary'),
      button(t.toMenu, options.onExit),
    ),
  );
}

/* Backpack */

function itemIcon(world: World, item: Item): HTMLElement {
  const [x, y] = spriteOffset(world, item);
  const icon = el('span', { className: 'pd-item' });
  icon.style.backgroundPosition = `calc(${-x}px * var(--s)) calc(${-y}px * var(--s))`;
  return icon;
}

function slot(world: World, item: Item | undefined, onClick?: () => void, label?: string): HTMLElement {
  const node = el('button', { className: `pd-slot${item ? '' : ' empty'}`, disabled: !item });
  if (item) {
    node.append(itemIcon(world, item));
    if (item.qty > 1) node.append(el('span', { className: 'pd-qty', textContent: String(item.qty) }));
    if (item.level !== 0 && isKnown(world, item)) {
      node.append(
        el('span', { className: `pd-lvl ${item.level > 0 ? 'up' : 'down'}`, textContent: `${item.level > 0 ? '+' : ''}${item.level}` }),
      );
    }
    if (label) node.append(el('span', { className: 'pd-tag', textContent: label }));
    node.onclick = () => {
      audio.play('click');
      onClick?.();
    };
  }
  return node;
}

export interface BackpackOptions {
  world: World;
  hero: Hero;
  onAction(action: InventoryAction): void;
  onClose(): void;
}

export function showBackpack(options: BackpackOptions): void {
  const { world, hero } = options;
  const open = (item: Item, index: number | null): void => showItem({ ...options, item, index });
  const grid = el('div', { className: 'pd-grid' });
  for (let i = 0; i < BACKPACK_SIZE; i++) {
    const item = hero.items[i];
    grid.append(slot(world, item, item && (() => open(item, i))));
  }
  show(
    el(
      'div',
      { className: 'pd-window' },
      el(
        'div',
        { className: 'pd-row' },
        el('p', { className: 'pd-heading', textContent: t.backpack }),
        el('span', { className: 'pd-gold' }, itemIcon(world, { kind: 'gold', qty: 1, level: 0 }), String(hero.gold)),
      ),
      el(
        'div',
        { className: 'pd-row equipped' },
        slot(world, hero.weapon, () => open(hero.weapon, null), t.equippedLabel),
        slot(world, hero.armor, () => open(hero.armor, null), t.equippedLabel),
        el('span', { className: 'pd-stats', textContent: `${t.strShort} ${hero.str}` }),
      ),
      grid,
      button(t.close, options.onClose),
    ),
  );
}

interface ItemOptions extends BackpackOptions {
  item: Item;
  /** Backpack slot, or null for equipped items. */
  index: number | null;
}

function showItem(options: ItemOptions): void {
  const { world, hero, item, index } = options;
  const category = itemDef(item.kind).category;
  const act = (action: InventoryAction): void => {
    options.onAction(action);
    options.onClose();
  };
  const actions: HTMLElement[] = [];
  if (index !== null) {
    if (category === 'potion') actions.push(button(t.drink, () => act({ type: 'use', item: index }), 'primary'));
    if (category === 'scroll') {
      if (item.kind === 'scroll.upgrade' && isKnown(world, item)) {
        actions.push(button(t.upgradeWeapon, () => act({ type: 'use', item: index, target: 'weapon' }), 'primary'));
        actions.push(button(t.upgradeArmor, () => act({ type: 'use', item: index, target: 'armor' }), 'primary'));
      } else {
        actions.push(button(t.read, () => act({ type: 'use', item: index }), 'primary'));
      }
    }
    if (category === 'weapon' || category === 'armor') {
      actions.push(button(t.equip, () => act({ type: 'equip', item: index }), 'primary'));
    }
    actions.push(button(t.dropItem, () => act({ type: 'drop', item: index })));
  }
  show(
    el(
      'div',
      { className: 'pd-window' },
      el('div', { className: 'pd-row' }, slot(world, item), el('p', { className: 'pd-heading', textContent: capitalize(itemName(world, item)) })),
      ...itemInfo(world, hero, item).map((line) => el('p', { className: 'pd-info', textContent: line })),
      ...actions,
      button(t.back, () => showBackpack(options)),
    ),
  );
}

let toastTimer = 0;

export function toast(text: string): void {
  const node = document.getElementById('toast')!;
  node.textContent = text;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    node.hidden = true;
  }, 2500);
}

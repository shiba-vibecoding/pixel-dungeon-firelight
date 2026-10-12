import {
  type Action, armorStats, BACKPACK_SIZE, isBroken, type Hero, inBag, type HeroClass, type Item, itemDef, itemPrice, type ItemRef,
  itemSprite, maxExp, type MobKind, SUBCLASSES, wandMaxCharges, weaponStats, type World, CLASS_ARMOR_OF,
} from '@pd/core';
import { audio } from './audio';
import { chooseQuickslot, quickIndex, quickUse } from './quickslot';
import { BADGES, type BadgeId, badgeText, earnedBadges, markBadgesSeen, unseenBadges } from './badges';
import { BUFF_ICONS, type BuffName } from './hud';
import { capitalize, t } from './i18n';
import { isKnown, itemInfo, itemName, plainName, wearOf } from './itemtext';
import type { DailyBoard } from './leaderboard';
import { mart } from './mart';
import { quality } from './quality';
import type { RunRecord } from './rankings';
import { type Assets, heroSprite } from './sprites';
import type { LogLine } from './view';

/*
 * DOM windows over the game, in the design system's markup (docs/design/system):
 * a window has a head with a title and a cross, then text, then its actions,
 * the main one red and first, the dangerous ones last behind a line.
 */

const root = document.getElementById('overlay')!;
const HERO_CLASSES: readonly HeroClass[] = ['warrior', 'mage', 'rogue', 'huntress'];
/** Heroes in avatars.png and in the heroes strip, in this order. */
export const AVATAR: Readonly<Record<HeroClass, number>> = { warrior: 0, mage: 1, rogue: 2, huntress: 3 };

let assets: Assets | null = null;

/** The sprite sheets portraits are cut from. */
export function setAssets(loaded: Assets): void {
  assets = loaded;
}

export type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {}, ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = Object.assign(document.createElement(tag), props);
  for (const child of children) {
    if (child) element.append(child);
  }
  return element;
}

/** A button of the design system: '' secondary, 'primary' (one per window), 'danger', 'quiet', 'ally'. */
export function button(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const click = (): void => {
    audio.play('click');
    onClick();
  };
  return el('button', { className: `pd-button ${className}`.trim(), textContent: label, onclick: click });
}

/**
 * Lays out a window's actions as the design asks: the main one first, the
 * others two to a row, the dangerous ones last behind a line.
 */
function actions(primary: readonly HTMLElement[], secondary: readonly HTMLElement[], danger: readonly HTMLElement[] = []): HTMLElement {
  const box = el('div', { className: 'pd-actions' }, ...primary);
  // A label too long for half a row (Russian ones often are) takes a whole row.
  const short = (node: HTMLElement): boolean => (node.textContent ?? '').length <= 11;
  for (let i = 0; i < secondary.length; i++) {
    const node = secondary[i]!;
    const next = secondary[i + 1];
    if (next && short(node) && short(next)) {
      box.append(el('div', { className: 'pd-row' }, node, next));
      i++;
    } else {
      box.append(node);
    }
  }
  if (danger.length > 0) box.append(el('div', { className: 'pd-danger-zone' }, ...danger));
  return box;
}

/** What closes the window open now, by its cross, a tap beside it or Telegram's back button. */
let closer: (() => void) | null = null;

root.addEventListener('pointerdown', (event) => {
  if (event.target === root && closer) {
    audio.play('click');
    closer();
  }
});

export function show(content: HTMLElement, onClose: (() => void) | null, bare = false): void {
  closer = onClose;
  root.replaceChildren(content);
  root.classList.add('open');
  root.classList.toggle('bare', bare);
  sprites(content);
}

export function hideOverlay(): void {
  closer = null;
  root.classList.remove('open', 'bare');
  root.replaceChildren();
}

export function overlayOpen(): boolean {
  return root.classList.contains('open');
}

/** Closes the open window the way its cross would; false if it has none. */
export function closeOverlay(): boolean {
  if (!overlayOpen()) return false;
  if (closer) closer();
  else return false;
  return true;
}

/** Sets --ix/--iy (items.png, badges.png: 8 a row) and --bx/--by (buffs.png: 18 a row) from data-i and data-b. */
export function sprites(scope: ParentNode): void {
  scope.querySelectorAll<HTMLElement>('[data-i]').forEach((node) => {
    const i = Number(node.dataset.i);
    node.style.setProperty('--ix', String(i % 8));
    node.style.setProperty('--iy', String(Math.floor(i / 8)));
  });
  scope.querySelectorAll<HTMLElement>('[data-b]').forEach((node) => {
    const b = Number(node.dataset.b);
    node.style.setProperty('--bx', String(b % 18));
    node.style.setProperty('--by', String(Math.floor(b / 18)));
  });
}

function closeButton(onClose: () => void): HTMLButtonElement {
  return el('button', {
    className: 'pd-close',
    ariaLabel: t.close,
    onclick: () => {
      audio.play('click');
      onClose();
    },
  });
}

interface WindowOptions {
  title?: string;
  /** A line under the title. */
  sub?: string;
  /** An item slot or a portrait before the title. */
  icon?: HTMLElement | null;
  /** The cross; a window without one wants an answer. */
  onClose?: () => void;
  narrow?: boolean;
  className?: string;
}

/** A window: the head (icon, title, cross), then the body. */
export function windowOf(options: WindowOptions, ...body: Child[]): HTMLElement {
  const head =
    (options.title || options.icon || options.onClose) &&
    el(
      'header',
      { className: 'pd-window-head' },
      options.icon,
      el(
        'div',
        { className: 'pd-titles' },
        options.title && el('h2', { className: 'pd-heading', textContent: options.title }),
        options.sub && el('span', { className: 'pd-note', textContent: options.sub }),
      ),
    );
  const box = el(
    'section',
    { className: `pd-window${options.narrow ? ' narrow' : ''}${options.className ? ` ${options.className}` : ''}` },
    head,
    ...body,
  );
  box.setAttribute('role', options.onClose ? 'dialog' : 'alertdialog');
  if (options.onClose) box.append(closeButton(options.onClose));
  return box;
}

export const info = (text: string, className = 'pd-info'): HTMLElement => el('p', { className, textContent: text });

/* Portraits */

/**
 * The first frame of a character's sprite, up to three times its size, on a
 * small canvas; for a hero, `row` is the armour's tier, as on the map.
 */
export function portrait(kind: MobKind | HeroClass, row = 0, skin?: string): HTMLElement {
  const box = el('div', { className: 'pd-portrait' });
  const sprite = assets && (kind in assets.heroes ? heroSprite(assets, kind as HeroClass, skin) : assets.mobs[kind as MobKind]);
  if (!sprite) return box;
  const { sheet } = sprite;
  const frame = sprite.anims.idle.frames[0] ?? 0;
  const canvas = el('canvas', { width: sheet.w, height: sheet.h });
  const scale = Math.max(1, Math.min(3, Math.floor(52 / Math.max(sheet.w, sheet.h))));
  canvas.style.width = `${sheet.w * scale}px`;
  canvas.style.height = `${sheet.h * scale}px`;
  const ctx = canvas.getContext('2d')!;
  const sy = (Math.floor(frame / sheet.cols) + row) * sheet.h;
  ctx.drawImage(sheet.image, (frame % sheet.cols) * sheet.w, sy, sheet.w, sheet.h, 0, 0, sheet.w, sheet.h);
  box.append(canvas);
  return box;
}

/** A health bar of the design system; `v` from 0 to 1. */
export function healthBar(hp: number, ht: number, text = true): HTMLElement {
  const bar = el('div', { className: `pd-bar${hp <= ht / 4 ? ' low' : ''}` }, text && el('span', { className: 'pd-bar-text', textContent: `${Math.max(0, hp)}/${ht}` }));
  bar.style.setProperty('--v', String(Math.max(0, Math.min(1, hp / ht))));
  return bar;
}

/* Item slots */

function itemIcon(world: World, item: Item): HTMLElement {
  const icon = el('i', { className: 'pd-item' });
  icon.dataset.i = String(itemSprite(item, world.run.labels));
  return icon;
}

/** A sprite of the design system's own (--spr-*), at a size in CSS pixels. */
function picture(sprite: string, width?: number, height?: number): HTMLElement {
  const node = el('i', { className: 'pd-icon' });
  node.style.backgroundImage = `var(--spr-${sprite})`;
  if (width) node.style.width = `${width}px`;
  if (height) node.style.height = `${height}px`;
  return node;
}

/** An item's description, its curse set apart as a warning. */
function described(lines: readonly string[]): HTMLElement[] {
  return lines.filter(Boolean).map((line) =>
    line === t.cursedInfo ? el('p', { className: 'pd-callout cursed', textContent: line })
    : line === t.tooHeavy ? el('p', { className: 'pd-callout bad', textContent: line })
    : info(line));
}

interface SlotOptions {
  onClick?: () => void;
  /** Worn: the equipment row. */
  equipped?: boolean;
  hero?: Hero;
  /** An empty equipment place: the silhouette of what goes there (items.png 5, 6, 7). */
  placeholder?: number;
}

/** A 52×52 slot: the sprite and up to three corner labels (level, strength, quantity). */
export function slot(world: World, item: Item | undefined, options: SlotOptions = {}): HTMLElement {
  if (!item) {
    if (options.placeholder !== undefined) {
      const icon = el('i', { className: 'pd-item' });
      icon.dataset.i = String(options.placeholder);
      return el('div', { className: 'pd-slot placeholder' }, icon);
    }
    return el('div', { className: 'pd-slot empty' });
  }
  const known = isKnown(world, item);
  const cursed = Boolean(item.cursed) && (known || options.equipped);
  const node = el('button', {
    className: `pd-slot${options.equipped ? ' equipped' : ''}${cursed ? ' cursed' : ''}`,
    ariaLabel: capitalize(itemName(world, item)),
  });
  node.append(itemIcon(world, item));
  if (item.charges !== undefined) {
    node.append(el('span', { className: 'pd-qty', textContent: `${item.charges}/${wandMaxCharges(item)}` }));
  } else if (item.qty > 1) {
    node.append(el('span', { className: 'pd-qty', textContent: String(item.qty) }));
  }
  if (item.level !== 0 && known) {
    node.append(el('span', { className: `pd-lvl ${item.level > 0 ? 'up' : 'down'}`, textContent: `${item.level > 0 ? '+' : '−'}${Math.abs(item.level)}` }));
  }
  // WndBag's durability bars: how worn an upgraded item is; a broken one's level is struck through (it works as +0).
  const wear = wearOf(world, item);
  if (wear) {
    node.append(durabilityBar(wear.left, wear.max));
    markWear(node);
  }
  // ItemSlot's top right: the strength it wants, with a «?» while its level is unknown.
  const category = itemDef(item.kind).category;
  const str = category === 'weapon' ? weaponStats(item).str : category === 'armor' ? armorStats(item).str : null;
  if (str !== null && !options.equipped) {
    node.append(el('span', { className: `pd-tag${options.hero && options.hero.str < str ? ' bad' : ''}`, textContent: known ? String(str) : `${str}?` }));
  }
  if (cursed) node.append(el('span', { className: 'pd-mark curse' }));
  if (options.hero && inQuickslot(options.hero, item)) node.append(el('span', { className: 'pd-mark quick' }));
  node.onclick = () => {
    audio.play('click');
    options.onClick?.();
  };
  return node;
}

/** The row of a hero's sprite sheet: the tier of the armour worn. */
export const armorTier = (hero: Hero): number => itemDef(hero.armor.kind).tier ?? 0;

/**
 * The design system's durability bar (PD.durability): filled in 2px steps, «low» at a quarter or less,
 * «broken» when worn out; its slot is marked so the corner digits rise above it.
 */
export function durabilityBar(left: number, max: number, big = false): HTMLElement {
  const bar = el('i', { className: `pd-dur${big ? ' big' : ''}` });
  const steps = big ? 40 : 21;
  const share = max > 0 ? Math.max(0, Math.min(1, left / max)) : 0;
  bar.style.setProperty('--v', String(left <= 0 ? 0 : Math.max(1 / steps, Math.round(share * steps) / steps)));
  bar.classList.toggle('low', left > 0 && share <= 0.25);
  bar.classList.toggle('broken', left <= 0);
  return bar;
}

/** A slot holding a durability bar lifts its corner digits; a broken one dims and strikes its level. */
export function markWear(node: HTMLElement): void {
  const bar = node.querySelector(':scope > .pd-dur');
  if (!bar) return;
  node.classList.add('has-dur');
  node.classList.toggle('broken', bar.classList.contains('broken'));
}

/** An item's description, its curse and weight set apart as warnings, and how worn it is under its numbers. */
function describedItem(world: World, hero: Hero, item: Item): HTMLElement[] {
  const nodes = described(itemInfo(world, hero, item));
  const wear = wearOf(world, item);
  if (!wear) return nodes;
  const line = el('div', { className: `pd-durability${wear.left > 0 && wear.left / wear.max <= 0.25 ? ' low' : ''}` },
    info(t.durability(wear.left, wear.max)), durabilityBar(wear.left, wear.max, true));
  const after = [line, ...(wear.left <= 0 ? [el('p', { className: 'pd-callout broken', textContent: t.brokenInfo })] : [])];
  return [nodes[0]!, ...after, ...nodes.slice(1)].filter(Boolean);
}

/** A window title for an item: a broken item's level struck through rather than its name saying «broken». */
function titleFor(world: World, item: Item, box: HTMLElement): void {
  if (!isBroken(item) || item.level <= 0 || !isKnown(world, item)) return;
  const heading = box.querySelector('.pd-heading');
  if (!heading) return;
  heading.textContent = `${capitalize(plainName(world, item))} `;
  heading.append(el('span', { className: 'pd-lvl-broken', textContent: `+${item.level}` }));
}

/** The item is the one the quickslot shows. */
const inQuickslot = (hero: Hero, item: Item): boolean => hero.items[quickIndex(hero)] === item;

/* Title */

export interface TitleOptions {
  heroClass: HeroClass;
  invitedRoom: string | null;
  /** The solo run that can be continued, if any. */
  save: { heroClass: HeroClass; lvl: number; depth: number } | null;
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
  /** Shows today's leaderboard; absent without a server. */
  onDailyBoard?: () => void;
  onRankings(): void;
  onMart(): void;
}

export function showTitle(options: TitleOptions): void {
  let selected = options.heroClass;
  const name = el('span', { className: 'pd-class-name', textContent: t.classes[selected] });
  const about = info(t.classInfo[selected], 'pd-note');
  const classes = el('div', { className: 'pd-classes' });
  classes.setAttribute('role', 'radiogroup');
  const renderClasses = (): void => {
    classes.replaceChildren(
      ...HERO_CLASSES.map((heroClass) => {
        const face = el('i', { className: 'pd-class-face' });
        face.style.setProperty('--av', String(AVATAR[heroClass]));
        const node = el(
          'button',
          {
            className: `pd-class${heroClass === selected ? ' selected' : ''}`,
            ariaLabel: t.classes[heroClass],
            onclick: () => {
              audio.play('click');
              selected = heroClass;
              name.textContent = t.classes[heroClass];
              about.textContent = t.classInfo[heroClass];
              options.onClass(heroClass);
              renderClasses();
            },
          },
          face,
        );
        node.setAttribute('role', 'radio');
        node.setAttribute('aria-checked', String(heroClass === selected));
        return node;
      }),
    );
  };
  renderClasses();

  const field =
    options.askName !== null &&
    el(
      'div',
      { className: 'pd-field' },
      el('label', { htmlFor: 'pd-name', textContent: t.heroName }),
      el('input', {
        id: 'pd-name',
        className: 'pd-input',
        value: options.askName,
        maxLength: 20,
        placeholder: t.yourName,
        oninput: (event: Event) => options.onName((event.target as HTMLInputElement).value),
      }),
    );

  const { save } = options;
  const main: HTMLElement[] = [];
  const rest: HTMLElement[] = [];
  if (options.invitedRoom) main.push(button(t.join(options.invitedRoom), options.onJoin, 'primary big'));
  if (save) {
    const resume = button(t.continueRun, options.onContinue, `${main.length ? '' : 'primary big '}stacked`);
    resume.append(el('span', { className: 'pd-btn-sub', textContent: t.continueMeta(t.classes[save.heroClass], save.lvl, save.depth) }));
    (main.length ? rest : main).push(resume);
  }
  const fresh = button(save ? t.newRun : t.solo, options.onSolo, main.length ? '' : 'primary big');
  (main.length ? rest : main).push(fresh);

  const daily = el(
    'div',
    { className: 'pd-daily' },
    el('div', { className: 'pd-daily-head' }, picture('stairs'), el('h3', { textContent: t.daily })),
    info(t.dailyInfo, 'pd-note'),
    el('div', { className: 'pd-row' }, button(t.descendDaily, options.onDaily), options.onDailyBoard && button(t.dailyBoard, options.onDailyBoard)),
  );

  const logo = el(
    'div',
    { className: 'pd-logo' },
    el('img', { src: 'assets/banner-title.png', alt: 'Pixel Dungeon' }),
    el('span', { className: 'pd-logo-sub', textContent: t.subtitle }),
  );

  show(
    el(
      'main',
      { className: 'pd-title-screen' },
      logo,
      el(
        'section',
        { className: 'pd-window' },
        classes,
        el('div', { className: 'pd-class-info' }, name, about),
        field,
        el(
          'div',
          { className: 'pd-actions' },
          ...main,
          ...rest,
          options.coopAvailable ? button(t.coop, options.onCoop, 'ally') : info(t.coopUnavailable, 'pd-note center'),
          el('div', { className: 'pd-row' }, button(t.rankings, options.onRankings, 'quiet'), button(t.mart, options.onMart, 'quiet')),
        ),
        daily,
      ),
    ),
    null,
    true,
  );
}

/* Menu */

export interface MenuOptions {
  room: string | null;
  onResume(): void;
  onInvite(): void;
  onHelp(): void;
  onBadges(): void;
  onMart(): void;
  onTreat(): void;
  /** Full effects or light ones (quality.ts). */
  onEffects(full: boolean): void;
  onExit(): void;
}

export function showMenu(options: MenuOptions): void {
  const sound = el(
    'button',
    {
      className: 'pd-switch',
      onclick: () => {
        audio.setEnabled(!audio.enabled);
        audio.play('click');
        sound.setAttribute('aria-checked', String(audio.enabled));
      },
    },
    el('span', { className: 'pd-info', textContent: t.sound }),
    el('span', { className: 'pd-switch-box' }),
  );
  sound.setAttribute('role', 'switch');
  sound.setAttribute('aria-checked', String(audio.enabled));
  const effects = el(
    'button',
    {
      className: 'pd-switch',
      onclick: () => {
        const full = effects.getAttribute('aria-checked') !== 'true';
        audio.play('click');
        effects.setAttribute('aria-checked', String(full));
        options.onEffects(full);
      },
    },
    el('span', { className: 'pd-info', textContent: t.effects }),
    el('span', { className: 'pd-switch-box' }),
  );
  effects.setAttribute('role', 'switch');
  effects.setAttribute('aria-checked', String(!quality.light));
  show(
    windowOf(
      { title: t.menu, sub: options.room ? t.room(options.room) : undefined, onClose: options.onResume, narrow: true },
      el(
        'div',
        { className: 'pd-menu-list' },
        button(t.resume, options.onResume, 'primary'),
        options.room && button(t.invite, options.onInvite, 'ally'),
        button(t.help, options.onHelp),
        button(t.badges, options.onBadges),
        button(t.mart, options.onMart),
        sound,
        effects,
        button(t.treat, options.onTreat, 'quiet'),
        button(t.toMenu, options.onExit, 'quiet'),
      ),
    ),
    options.onResume,
  );
}

/* Badges */

/** WndBadges: every badge, the ones earned bright, new ones with a golden dot; a tap tells what each is for. */
export function showBadges(onClose: () => void): void {
  const earned = earnedBadges();
  const fresh = unseenBadges();
  markBadgesSeen();
  const big = el('i', { className: 'pd-badge big' });
  const name = el('span', { className: 'pd-badge-name' });
  const detail = el('div', { className: 'pd-badge-detail' }, big, name);
  const select = (id: BadgeId, image: number, node: HTMLElement | null): void => {
    big.className = 'pd-badge big';
    big.dataset.i = String(image);
    big.classList.toggle('dim', !earned.has(id));
    name.textContent = badgeText(id);
    detail.classList.toggle('locked', !earned.has(id));
    grid.querySelectorAll('.selected').forEach((n) => n.classList.remove('selected'));
    node?.classList.add('selected');
    sprites(detail);
  };
  const grid = el('div', { className: 'pd-grid c6' });
  for (const badge of BADGES) {
    const icon = el('i', { className: `pd-badge${earned.has(badge.id) ? '' : ' dim'}` });
    icon.dataset.i = String(badge.image);
    const node = el('button', { className: `pd-slot${fresh.has(badge.id) ? ' new' : ''}`, ariaLabel: badgeText(badge.id) }, icon);
    node.onclick = () => {
      audio.play('click');
      select(badge.id, badge.image, node);
    };
    grid.append(node);
  }
  // «Patron of the arts», outside the original's badges: for a tip or the patronage.
  if (mart.maecenas) {
    const node = el('button', { className: 'pd-slot', ariaLabel: t.maecenas }, el('i', { className: 'pd-offer-badge patron' }));
    node.onclick = () => {
      audio.play('click');
      grid.querySelectorAll('.selected').forEach((n) => n.classList.remove('selected'));
      node.classList.add('selected');
      big.className = 'pd-offer-badge patron';
      name.textContent = t.maecenas;
      detail.classList.remove('locked');
    };
    grid.append(node);
  }
  const first = BADGES.find((b) => fresh.has(b.id)) ?? BADGES.find((b) => earned.has(b.id)) ?? BADGES[0]!;
  show(
    windowOf(
      { title: t.badges, sub: t.badgesCount(earned.size, BADGES.length), onClose },
      el('div', { className: 'pd-scroll' }, grid),
      detail,
    ),
    onClose,
  );
  select(first.id, first.image, grid.children[BADGES.indexOf(first)] as HTMLElement);
}

/* Hero */

export interface HeroOptions {
  hero: Hero;
  /** Pixel-Mart's «Look» rows, if the shop is there. */
  looks?: HTMLElement;
  /** The look the hero wears, for their portrait. */
  skin?: string;
  buffs: ReadonlyArray<{ name: BuffName; turns?: number }>;
  onClose(): void;
}

function stats(rows: ReadonlyArray<readonly [string, string, string?]>): HTMLElement {
  return el(
    'dl',
    { className: 'pd-stats' },
    ...rows.map(([label, value, tone]) => el('div', {}, el('dt', { textContent: label }), el('dd', { className: tone ?? '', textContent: value }))),
  );
}

/** WndHero: the hero's numbers and what currently ails or helps them. */
export function showHero(options: HeroOptions): void {
  const { hero } = options;
  const buffs = options.buffs.map((buff) => {
    const icon = el('i');
    icon.dataset.b = String(BUFF_ICONS[buff.name]);
    const text = buff.turns ? `${t.buffs[buff.name]} (${t.turnsLeft(buff.turns)})` : t.buffs[buff.name];
    return el('div', { className: 'pd-row' }, el('span', { className: 'pd-buff' }, icon), info(text));
  });
  show(
    windowOf(
      {
        title: t.heroTitle(hero.subclass ? capitalize(t.subclasses[hero.subclass]) : t.classes[hero.heroClass], hero.lvl),
        icon: portrait(hero.heroClass, armorTier(hero), options.skin),
        onClose: options.onClose,
      },
      stats([
        [t.strength, String(hero.str)],
        [t.health, `${Math.max(0, hero.hp)}/${hero.ht}`],
        [t.experience, `${hero.exp}/${maxExp(hero)}`],
        [t.goldLabel, String(hero.gold), 'gold'],
        [t.slain, String(hero.kills)],
      ]),
      el('h3', { className: 'pd-heading', textContent: t.conditions }),
      ...(buffs.length > 0 ? buffs : [info(t.noConditions, 'pd-note')]),
      options.looks && el('h3', { className: 'pd-subhead', textContent: t.looksTitle }),
      options.looks,
    ),
    options.onClose,
  );
}

/* Shops */

export interface TradeOptions {
  world: World;
  hero: Hero;
  item: Item;
  price: number;
  onBuy(): void;
  onClose(): void;
}

/** WndTradeItem for a shop's ware: what it is, and what it costs. */
export function showTrade(options: TradeOptions): void {
  const { world, hero, item, price } = options;
  const short = hero.gold < price;
  const buy = button(t.buyFor(price), () => {
    options.onBuy();
    options.onClose();
  }, 'primary');
  buy.disabled = short;
  const head = windowOf(
    { title: capitalize(itemName(world, item)), icon: slot(world, item, { hero }), onClose: options.onClose },
    ...describedItem(world, hero, item),
    actions([buy], []),
    info(t.yourGold(hero.gold), 'pd-note center'),
  );
  titleFor(world, item, head);
  head.querySelector('.pd-titles')!.append(el('span', { className: `pd-price${short ? ' short' : ''}`, textContent: String(price) }));
  show(head, options.onClose);
}

export interface SellOptions {
  world: World;
  hero: Hero;
  onSell(index: number): void;
  onClose(): void;
}

/** Shopkeeper.sell: what the pack is worth to him, item by item. */
export function showSell(options: SellOptions): void {
  const { world, hero } = options;
  const cards = hero.items.flatMap((item, index) => {
    const price = itemPrice(item, world.known.includes(item.kind));
    if (price <= 0) return [];
    return [
      el(
        'div',
        { className: 'pd-reward' },
        slot(world, item, { hero }),
        el('div', { className: 'pd-reward-name', textContent: capitalize(itemName(world, item)) }),
        el('div', { className: 'pd-reward-desc' }),
        button(t.sellFor(price), () => options.onSell(index), 'danger small'),
      ),
    ];
  });
  show(
    windowOf(
      { title: capitalize(t.mobs.shopkeeper), icon: portrait('shopkeeper'), onClose: options.onClose },
      info(cards.length > 0 ? t.sellInfo : t.nothingToSell, 'pd-speech'),
      cards.length > 0 && el('div', { className: 'pd-scroll' }, el('div', { className: 'pd-rewards' }, ...cards)),
      info(t.yourGold(hero.gold), 'pd-note center'),
    ),
    options.onClose,
  );
}

/* Quests */

export interface QuestOptions {
  world: World;
  hero: Hero;
  /** Who is speaking: the sad ghost or the old wandmaker. */
  who: MobKind;
  text: string;
  /** Rewards on offer, one of which the hero may take. */
  offers?: readonly Item[];
  onChoose?(index: number): void;
  /** Answers to give instead of just closing (WndQuest's buttons), each closing the window. */
  answers?: ReadonlyArray<{ label: string; onAnswer(): void }>;
  onClose(): void;
}

/** A word with a quest giver (WndQuest, WndSadGhost, WndWandmaker): portrait, name, speech, rewards or answers. */
export function showQuest(options: QuestOptions): void {
  const { hero, offers = [] } = options;
  // The rewards are shown for what they are.
  const world = { ...options.world, known: [...options.world.known, ...offers.map((item) => item.kind)] };
  const card = (item: Item, index: number): HTMLElement =>
    el(
      'div',
      { className: 'pd-reward' },
      slot(world, item, { hero }),
      el('div', { className: 'pd-reward-name', textContent: capitalize(itemName(world, item)) }),
      el('div', { className: 'pd-reward-desc', textContent: itemInfo(world, hero, item).join(' ') }),
      button(t.take, () => {
        options.onChoose?.(index);
        options.onClose();
      }, offers.length === 1 ? 'primary small' : 'small'),
    );
  const answers = options.answers ?? [];
  // A question wants an answer: no cross. The first answer is the yes.
  const answerRow =
    answers.length > 0 &&
    el(
      'div',
      { className: 'pd-row' },
      ...[...answers].reverse().map((answer, i) =>
        button(answer.label, () => {
          answer.onAnswer();
          options.onClose();
        }, i === answers.length - 1 ? 'primary' : 'quiet')),
    );
  const box = windowOf(
    { title: capitalize(t.mobs[options.who]), icon: portrait(options.who), onClose: answers.length > 0 ? undefined : options.onClose },
    info(options.text, 'pd-speech'),
    offers.length > 0 && el('div', { className: 'pd-rewards' }, ...offers.map(card)),
    answerRow,
  );
  show(box, answers.length > 0 ? null : options.onClose);
}

/* Examine */

export interface InfoExtras {
  /** A portrait or an item slot beside the title. */
  icon?: HTMLElement;
  /** A creature's health, as a bar under its name. */
  health?: readonly [number, number];
}

/** A few lines about something looked at (the examine tool's windows). */
export function showInfo(title: string, lines: readonly string[], onClose: () => void, extras: InfoExtras = {}): void {
  const box = windowOf(
    { title: capitalize(title), icon: extras.icon, onClose },
    ...described(lines),
  );
  if (extras.health) box.querySelector('.pd-titles')!.append(healthBar(extras.health[0], extras.health[1]));
  show(box, onClose);
}

/* The blacksmith */

export interface ReforgeOptions {
  world: World;
  hero: Hero;
  text: string;
  onReforge(first: ItemRef, second: ItemRef): void;
  onClose(): void;
}

/**
 * WndBlacksmith: two items of one kind become one, a level better. Rather
 * than picking two items one after the other, each possible pair is offered
 * at once: the better item, and what would be melted down with it.
 */
export function showReforge(options: ReforgeOptions): void {
  const { world, hero } = options;
  const owned: Array<{ ref: ItemRef; item: Item }> = [
    ...(hero.weapon ? [{ ref: 'weapon' as ItemRef, item: hero.weapon }] : []),
    { ref: 'armor' as ItemRef, item: hero.armor },
    ...hero.items.map((item, index) => ({ ref: index as ItemRef, item })),
  ].filter(({ item }) => {
    const category = itemDef(item.kind).category;
    return (category === 'weapon' || category === 'armor' || category === 'wand' || category === 'ring') &&
      item.level >= 0 && item.kind !== 'weapon.pickaxe';
  });
  const pairs: Array<{ first: ItemRef; second: ItemRef; better: Item; worse: Item }> = [];
  owned.forEach((a, i) => {
    for (const b of owned.slice(i + 1)) {
      if (a.item.kind !== b.item.kind) continue;
      // What is melted down comes from the pack.
      const [keep, melt] = typeof b.ref !== 'number' || (typeof a.ref === 'number' && a.item.level < b.item.level) ? [b, a] : [a, b];
      if (typeof melt.ref !== 'number') continue;
      const better = keep.item.level >= melt.item.level ? keep.item : melt.item;
      pairs.push({ first: keep.ref, second: melt.ref, better, worse: better === keep.item ? melt.item : keep.item });
    }
  });
  const card = (pair: (typeof pairs)[number]): HTMLElement =>
    el(
      'div',
      { className: 'pd-reward' },
      el('div', { className: 'pd-reforge' }, slot(world, pair.better, { hero }), el('span', { className: 'pd-reforge-arrow' }), slot(world, pair.worse, { hero })),
      el('div', { className: 'pd-reward-name', textContent: capitalize(itemName(world, pair.better)) }),
      el('div', { className: 'pd-reward-desc', textContent: t.reforgePair(itemName(world, pair.better), itemName(world, pair.worse)) }),
      button(t.reforge, () => {
        options.onReforge(pair.first, pair.second);
        options.onClose();
      }, pairs.length === 1 ? 'primary small' : 'small'),
    );
  show(
    windowOf(
      { title: capitalize(t.mobs.blacksmith), icon: portrait('blacksmith'), onClose: options.onClose },
      info(options.text, 'pd-speech'),
      pairs.length === 0
        ? info(t.nothingToReforge, 'pd-note')
        : el('div', { className: 'pd-scroll' }, el('div', { className: 'pd-rewards pd-reforges' }, ...pairs.map(card))),
    ),
    options.onClose,
  );
}

/* Small windows */

/** The tip on a level's sign (Sign.read): no cross, a tap anywhere closes it. */
export function showSign(text: string, onClose: () => void): void {
  const sign = el('div', { className: 'pd-sign' }, info(t.signTitle, 'pd-note'), info(text));
  show(sign, onClose);
  sign.onclick = () => {
    audio.play('click');
    onClose();
  };
}

/** Chasm.heroJump's WndOptions: a question with a yes and a no; the yes is dangerous here. */
export function showConfirm(title: string, text: string, yes: string, no: string, onYes: () => void, onClose: () => void): void {
  show(
    windowOf(
      { narrow: true },
      el('h2', { className: 'pd-heading center', textContent: title }),
      info(text, 'pd-info center'),
      el(
        'div',
        { className: 'pd-row' },
        button(no, onClose, 'quiet'),
        button(yes, () => {
          onClose();
          onYes();
        }, 'danger'),
      ),
    ),
    onClose,
  );
}

/** The help's controls: the button each line is about, and which line of the help text it is. */
const CONTROLS: ReadonlyArray<{ sprite?: string; item?: number; w: number; h: number; line?: number }> = [
  { sprite: 'target', w: 16, h: 16, line: 0 },
  { sprite: 'tool-backpack', w: 14, h: 15, line: 1 },
  { item: 31, w: 16, h: 16, line: 3 },
  { sprite: 'tool-search', w: 12, h: 12, line: 4 },
  { sprite: 'tool-wait', w: 12, h: 12, line: 5 },
  { sprite: 'tool-info', w: 8, h: 12, line: 6 },
  { sprite: 'menu', w: 6, h: 5 },
];
/** The rest of the help text: tips rather than controls. */
const TIPS = [2, 7, 8, 9, 10];

/** The help: «Controls», each line beside the button it is about, and «Tips»; only the list scrolls. */
export function showHelp(onClose: () => void): void {
  const controls = el(
    'ul',
    { className: 'pd-tips' },
    ...CONTROLS.map((control) => {
      let glyph: HTMLElement;
      if (control.item !== undefined) {
        glyph = el('i', { className: 'pd-item' });
        glyph.dataset.i = String(control.item);
      } else {
        glyph = picture(control.sprite!);
        glyph.style.setProperty('--w', String(control.w));
        glyph.style.setProperty('--h', String(control.h));
      }
      const text = control.line === undefined ? t.helpHud : t.helpText[control.line] ?? '';
      return el('li', { className: 'pd-tip' }, el('span', { className: 'pd-tip-ico' }, glyph), info(text));
    }),
  );
  const tips = el('ul', { className: 'pd-tips plain' }, ...TIPS.map((i) => el('li', { className: 'pd-tip' }, info(t.helpText[i] ?? ''))));
  const scroll = el('div', { className: 'pd-scroll' }, controls);
  const tabs = el('div', { className: 'pd-tabs' });
  tabs.setAttribute('role', 'tablist');
  const tab = (label: string, list: HTMLElement): HTMLButtonElement => {
    const node = el('button', { className: 'pd-tab', textContent: label });
    node.setAttribute('role', 'tab');
    node.onclick = () => {
      audio.play('click');
      for (const other of tabs.children) other.setAttribute('aria-selected', String(other === node));
      scroll.replaceChildren(list);
      scroll.scrollTop = 0;
      sprites(scroll);
    };
    return node;
  };
  const first = tab(t.helpControls, controls);
  first.setAttribute('aria-selected', 'true');
  const second = tab(t.helpTips, tips);
  second.setAttribute('aria-selected', 'false');
  tabs.append(first, second);
  show(windowOf({ title: t.help, onClose }, tabs, scroll), onClose);
}

/** The log's history: every message kept, newest last, depths marked. */
export function showHistory(lines: readonly LogLine[], onClose: () => void): void {
  const list = el('div', { className: 'pd-history' });
  let depth = -1;
  for (const line of lines) {
    if (line.depth !== undefined && line.depth !== depth) {
      depth = line.depth;
      list.append(el('div', { className: 'pd-depth-mark', textContent: t.newDepth(depth) }));
    }
    const row = el('div', { className: `pd-log-line ${line.tone ?? ''}`.trim(), textContent: line.text });
    if ((line.count ?? 1) > 1) row.append(el('span', { className: 'pd-n', textContent: `×${line.count}` }));
    list.append(row);
  }
  const scroll = el('div', { className: 'pd-scroll' }, list);
  show(windowOf({ title: t.history, onClose }, scroll), onClose);
  scroll.scrollTop = scroll.scrollHeight;
}

/* The end of a run */

export interface EndOptions {
  victory: boolean;
  title: string;
  /** What befell the hero: where and by what. */
  cause: string;
  hero: { name: string; heroClass: HeroClass; lvl: number; depth: number; gold: number; kills: number };
  onRestart: () => void;
  restartLabel: string;
  onExit: () => void;
  /** The run's place among this device's best, if it made the table. */
  place?: number | null;
  /** For the daily dungeon: today's leaderboard (loading) and a way to share. */
  daily?: { score: number; board: Promise<DailyBoard | null>; onShare: () => void };
}

/** Today's best runs, as rows; mine is highlighted. */
function boardView(board: DailyBoard | null): HTMLElement {
  if (!board) return info(t.boardOffline, 'pd-note');
  if (board.top.length === 0) return info(t.noResults, 'pd-note');
  const ranks = el('div', { className: 'pd-ranks' });
  board.top.slice(0, 10).forEach((entry, i) => {
    const face = el('i', { className: 'pd-rank-face' });
    face.style.setProperty('--av', String(AVATAR[entry.heroClass]));
    ranks.append(
      el(
        'div',
        { className: `pd-rank${entry.id === board.you ? ' me' : ''}` },
        el('span', { className: 'pd-rank-n', textContent: String(i + 1) }),
        face,
        el('span', { className: 'pd-rank-name', textContent: entry.name }, el('small', { textContent: `${t.classes[entry.heroClass]} · ${t.depthShort(entry.depth)}${entry.won ? ' · ★' : ''}` })),
        el('span', { className: 'pd-rank-score', textContent: entry.score.toLocaleString('ru-RU') }),
      ),
    );
  });
  return el('div', {}, ranks, board.rank && board.rank > 10 ? info(t.yourPlace(board.rank), 'pd-note center') : null);
}

/** The end of a run: the whole party fell, or it won. */
export function showRunEnd(options: EndOptions): void {
  const { hero } = options;
  const avatar = el('i');
  avatar.style.setProperty('--av', String(AVATAR[hero.heroClass]));
  const board = el('div', { className: 'pd-scroll' }, options.daily && info(t.loading, 'pd-note center'));
  const rows: Array<readonly [string, string, string?]> = [
    [t.statDepth, String(hero.depth)],
    [t.statLevel, String(hero.lvl)],
    [t.goldLabel, String(hero.gold), 'gold'],
    [t.slain, String(hero.kills)],
  ];
  if (options.daily) rows.push([t.daily, String(options.daily.score), 'ally']);
  show(
    el(
      'section',
      { className: `pd-window pd-runend${options.victory ? ' win' : ''}` },
      el('h2', { className: 'pd-display', textContent: options.title }),
      options.cause && el('p', { className: 'pd-cause', textContent: options.cause }),
      options.place ? el('p', { className: 'pd-info center pd-gold', textContent: options.place === 1 ? t.newRecord : t.rankPlace(options.place) }) : null,
      el(
        'div',
        { className: 'pd-runend-hero' },
        el('div', { className: 'pd-avatar' }, avatar),
        el('div', { className: 'pd-info', textContent: `${hero.name} · ${t.classes[hero.heroClass]}` }),
      ),
      stats(rows),
      options.daily && board,
      actions(
        options.daily ? [button(t.shareResult, options.daily.onShare, 'primary')] : [button(options.restartLabel, options.onRestart, 'primary')],
        options.daily ? [button(options.restartLabel, options.onRestart)] : [],
      ),
      button(t.toMenu, options.onExit, 'quiet'),
    ),
    null,
  );
  void options.daily?.board.then((loaded) => {
    board.replaceChildren(...(loaded?.rank ? [info(t.yourPlace(loaded.rank), 'pd-info center')] : []), boardView(loaded));
    sprites(board);
  });
}

/** Rankings: the best runs on this device; `latest` is highlighted. */
export function showRankings(records: readonly RunRecord[], onClose: () => void, latest?: string): void {
  const ranks = el('div', { className: 'pd-ranks' });
  records.forEach((record, i) => {
    const face = el('i', { className: 'pd-rank-face' });
    face.style.setProperty('--av', String(AVATAR[record.heroClass]));
    const what = record.won ? `★ ${t.won}` : record.cause;
    ranks.append(
      el(
        'div',
        { className: `pd-rank${record.key === latest ? ' me' : ''}` },
        el('span', { className: 'pd-rank-n', textContent: String(i + 1) }),
        face,
        el(
          'span',
          { className: 'pd-rank-name', textContent: `${record.name} · ${t.classes[record.heroClass]}` },
          el('small', { textContent: `${t.levelShort} ${record.lvl} · ${t.depthShort(record.depth)}${what ? ` · ${what}` : ''}` }),
        ),
        el('span', { className: 'pd-rank-score', textContent: record.score.toLocaleString('ru-RU') }),
      ),
    );
  });
  show(
    windowOf(
      { title: t.rankings, onClose },
      records.length === 0 ? info(t.noRankings, 'pd-note') : el('div', { className: 'pd-scroll' }, ranks),
    ),
    onClose,
  );
}

/** Today's leaderboard from the title screen. */
export function showDailyBoard(loading: Promise<DailyBoard | null>, onClose: () => void): void {
  const body = el('div', { className: 'pd-scroll' }, info(t.loading, 'pd-note'));
  show(windowOf({ title: t.dailyBoard, sub: t.dailyInfo, onClose }, body), onClose);
  void loading.then((board) => body.replaceChildren(boardView(board)));
}

/* Backpack */

export interface BackpackOptions {
  world: World;
  hero: Hero;
  onAction(action: Action): void;
  /** Throw or zap the item at a cell the player picks next. */
  onAim(index: number, kind: 'throw' | 'zap' | 'special'): void;
  onClose(): void;
}

export function showBackpack(options: BackpackOptions): void {
  const { world, hero } = options;
  const open = (item: Item, index: number | null, ring?: number): void => showItem({ ...options, item, index, ring });
  // The backpack's own slots, then whatever lies in bags or on the key ring.
  const entries = hero.items.map((item, index) => ({ item, index, bagged: inBag(hero, item) }));
  const loose = entries.filter((entry) => !entry.bagged);
  const bagged = entries.filter((entry) => entry.bagged);
  const grid = el('div', { className: 'pd-grid' });
  for (let i = 0; i < Math.max(BACKPACK_SIZE, loose.length); i++) {
    const entry = loose[i];
    grid.append(slot(world, entry?.item, entry ? { hero, onClick: () => open(entry.item, entry.index) } : {}));
  }
  const coin = picture('coin', 16, 14);
  const head = el(
    'header',
    { className: 'pd-bag-head' },
    el('h2', { className: 'pd-heading', textContent: t.backpack }),
    el('span', { className: 'pd-stat gold' }, coin, String(hero.gold)),
    el('span', { className: 'pd-stat' }, el('span', { className: 'pd-stat-label', textContent: t.strength }), String(hero.str)),
  );
  const equip = el(
    'div',
    { className: 'pd-equip' },
    // Bare-handed after a monk's blow: the weapon's silhouette.
    slot(world, hero.weapon ?? undefined, { hero, equipped: true, placeholder: 5, onClick: () => hero.weapon && open(hero.weapon, null) }),
    slot(world, hero.armor, { hero, equipped: true, placeholder: 6, onClick: () => open(hero.armor, null) }),
    ...[0, 1].map((i) => {
      const ring = hero.rings[i];
      return slot(world, ring, { hero, equipped: true, placeholder: 7, onClick: () => ring && open(ring, null, i) });
    }),
  );
  const box = el(
    'section',
    { className: 'pd-window' },
    head,
    equip,
    grid,
    ...(bagged.length > 0
      ? [
          el('div', { className: 'pd-bagrow-title' }, info(t.inBags, 'pd-note')),
          el('div', { className: 'pd-bagrow' }, ...bagged.map(({ item, index }) => slot(world, item, { hero, onClick: () => open(item, index) }))),
        ]
      : []),
    closeButton(options.onClose),
  );
  box.setAttribute('role', 'dialog');
  show(box, options.onClose);
}

interface ItemOptions extends BackpackOptions {
  item: Item;
  /** Backpack slot, or null for equipped items. */
  index: number | null;
  /** For a worn ring: which of the two it is. */
  ring?: number;
}

function showItem(options: ItemOptions): void {
  const { world, hero, item, index } = options;
  const category = itemDef(item.kind).category;
  const back = (): void => showBackpack(options);
  const act = (action: Action): void => {
    options.onAction(action);
    options.onClose();
  };
  const aimWith = (kind: 'throw' | 'zap' | 'special', at: number): void => {
    options.onClose();
    options.onAim(at, kind);
  };
  // What the item is for comes first and red; the rest are stone; dropping it goes last.
  const main: HTMLElement[] = [];
  const more: HTMLElement[] = [];
  const danger: HTMLElement[] = [];
  const use = (label: string, onClick: () => void): void => {
    (main.length === 0 ? main : more).push(button(label, onClick, main.length === 0 ? 'primary' : ''));
  };
  if (index !== null) {
    if (category === 'potion') use(t.drink, () => act({ type: 'use', item: index }));
    if (category === 'food' || item.kind === 'quest.fish') use(t.eat, () => act({ type: 'use', item: index }));
    if (category === 'torch') use(t.light, () => act({ type: 'use', item: index }));
    if (category === 'tome') use(t.readTome, () => showWays(options, index, act));
    if (item.kind === 'weapon.pickaxe') use(t.mine, () => act({ type: 'mine' }));
    if (category === 'kit') use(t.applyKit, () => act({ type: 'use', item: index, target: 'armor' }));
    if (category === 'seed') use(t.plantSeed, () => aimWith('throw', index));
    if (category === 'scroll') {
      if (item.kind === 'scroll.upgrade' && isKnown(world, item)) {
        use(t.upgradeWeapon, () => act({ type: 'use', item: index, target: 'weapon' }));
        use(t.upgradeArmor, () => act({ type: 'use', item: index, target: 'armor' }));
      } else if (item.kind === 'scroll.enchantment' && isKnown(world, item)) {
        use(t.enchantWeapon, () => act({ type: 'use', item: index, target: 'weapon' }));
        use(t.enchantArmor, () => act({ type: 'use', item: index, target: 'armor' }));
      } else {
        use(t.read, () => act({ type: 'use', item: index }));
      }
    }
    if (category === 'weapon' || category === 'armor' || category === 'ring') {
      use(category === 'ring' ? t.putOn : t.equip, () => act({ type: 'equip', item: index }));
    }
    if (category === 'beacon') {
      // LloydsBeacon: set it here, or go back to where it was set.
      if (item.returnTo) use(t.beaconReturn, () => act({ type: 'beacon', item: index, mode: 'return' }));
      use(t.beaconSet, () => act({ type: 'beacon', item: index, mode: 'set' }));
    }
    if (category === 'weightstone' && hero.weapon) {
      // Weightstone.WndBalance: the weapon in hand, balanced the way it is not yet.
      for (const imbue of ['speed', 'accuracy'] as const) {
        if (hero.weapon.imbue !== imbue) use(t.balanceFor[imbue], () => act({ type: 'balance', item: index, imbue }));
      }
    }
    if (category === 'wipeout') use(t.read, () => act({ type: 'use', item: index }));
    if (category === 'vial' && item.volume) use(t.drink, () => act({ type: 'use', item: index }));
    if (category === 'missile' || category === 'wand' || category === 'bomb' || category === 'honeypot') {
      const kind = category === 'wand' ? 'zap' : 'throw';
      use(kind === 'throw' ? t.throwItem : t.zap, () => aimWith(kind, index));
    }
    if (category === 'potion') use(t.throwItem, () => aimWith('throw', index));
    if (category === 'honeypot') use(t.shatterPot, () => act({ type: 'use', item: index }));
    // QuickSlot: any item with a use can be kept one tap away.
    if (quickUse(item.kind) && !inQuickslot(hero, item)) {
      more.push(button(t.toQuickslot, () => {
        chooseQuickslot(item.kind);
        back();
      }));
    }
    danger.push(button(t.dropItem, () => act({ type: 'drop', item: index }), 'danger'));
  } else if (options.ring !== undefined) {
    const ring = options.ring;
    use(t.takeOff, () => act({ type: 'remove', ring }));
  } else if (item === hero.armor && item.kind === CLASS_ARMOR_OF[hero.heroClass]) {
    // ClassArmor.doSpecial: the leap and the smoke bomb want a cell; the others act at once.
    const aimed = hero.heroClass === 'warrior' || hero.heroClass === 'rogue';
    use(t.specials[hero.heroClass], () => (aimed ? aimWith('special', -1) : act({ type: 'special' })));
  }
  const box = windowOf(
    { title: capitalize(itemName(world, item)), icon: slot(world, item, { hero, equipped: index === null }), onClose: back },
    ...describedItem(world, hero, item),
    (main.length > 0 || more.length > 0 || danger.length > 0) && actions(main, more, danger),
  );
  titleFor(world, item, box);
  show(box, back);
}

/** TomeOfMastery: the two ways of the hero's class, as equal cards; the choice can wait. */
function showWays(options: ItemOptions, index: number, act: (action: Action) => void): void {
  const { hero } = options;
  const back = (): void => showBackpack(options);
  const book = el('div', { className: 'pd-slot' }, itemIcon(options.world, hero.items[index]!));
  show(
    windowOf(
      { title: t.chooseWay, icon: book },
      el(
        'div',
        { className: 'pd-choices' },
        ...SUBCLASSES[hero.heroClass].map((way) =>
          el(
            'div',
            { className: 'pd-choice' },
            el('span', { className: 'pd-choice-name', textContent: capitalize(t.subclasses[way]) }),
            el('p', { className: 'pd-choice-desc', textContent: t.subclassInfo[way] }),
            button(t.choose, () => act({ type: 'master', item: index, subclass: way }), 'small'),
          )),
      ),
      button(t.later, back, 'quiet'),
    ),
    back,
  );
}

/* Toast */

let toastTimer = 0;

export interface ToastOptions {
  tone?: 'good' | 'warn' | 'ally' | 'badge';
  /** An item sprite or a badge image beside the text. */
  item?: number;
  badge?: number;
}

/** One message at a time under the HUD; it fades out by itself. */
export function toast(text: string, options: ToastOptions = {}): void {
  const node = document.getElementById('toast')!;
  const icon = options.badge !== undefined ? el('i', { className: 'pd-badge' }) : options.item !== undefined ? el('i', { className: 'pd-item' }) : null;
  if (icon) icon.dataset.i = String(options.badge ?? options.item);
  node.className = `pd-toast${options.tone ? ` ${options.tone}` : ''}`;
  node.replaceChildren(...[icon, el('span', { textContent: text })].filter((n): n is HTMLElement => n !== null));
  sprites(node);
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    node.classList.add('hide');
    toastTimer = window.setTimeout(() => {
      node.hidden = true;
    }, 260);
  }, 2400);
}

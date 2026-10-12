import {
  BACKPACK_SIZE, type Hero, type HeroClass, type InventoryAction, type Item, itemDef, itemPrice, type ItemRef, maxExp, type MobKind,
  SUBCLASSES, wandMaxCharges, type World, CLASS_ARMOR_OF,
} from '@pd/core';
import { audio } from './audio';
import { BUFF_ICONS, type BuffName } from './hud';
import { capitalize, t } from './i18n';
import { isKnown, itemInfo, itemName, spriteOffset } from './itemtext';
import type { DailyBoard } from './leaderboard';

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
  /** Shows today's leaderboard; absent without a server. */
  onDailyBoard?: () => void;
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
        options.onDailyBoard && button(t.dailyBoard, options.onDailyBoard),
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

export interface HeroOptions {
  hero: Hero;
  buffs: ReadonlyArray<{ name: BuffName; turns?: number }>;
  onClose(): void;
}

/** WndHero: the hero's numbers and what currently ails or helps them. */
export function showHero(options: HeroOptions): void {
  const { hero } = options;
  const row = (label: string, value: string): HTMLElement =>
    el('div', { className: 'pd-row pd-stat' }, el('span', { textContent: label }), el('span', { textContent: value }));
  const buffs = options.buffs.map((buff) => {
    const icon = el('span', { className: 'pd-buff' });
    icon.style.backgroundPosition = `calc(${-(BUFF_ICONS[buff.name] % 18) * 7}px * var(--s)) calc(${-Math.floor(BUFF_ICONS[buff.name] / 18) * 7}px * var(--s))`;
    const text = buff.turns ? `${t.buffs[buff.name]} (${t.turnsLeft(buff.turns)})` : t.buffs[buff.name];
    return el('div', { className: 'pd-row' }, icon, el('span', { textContent: text }));
  });
  show(
    el(
      'div',
      { className: 'pd-window' },
      el('p', {
        className: 'pd-heading',
        textContent: t.heroTitle(hero.subclass ? capitalize(t.subclasses[hero.subclass]) : t.classes[hero.heroClass], hero.lvl),
      }),
      row(t.strength, String(hero.str)),
      row(t.health, `${Math.max(0, hero.hp)}/${hero.ht}`),
      row(t.experience, `${hero.exp}/${maxExp(hero)}`),
      row(t.goldLabel, String(hero.gold)),
      row(t.slain, String(hero.kills)),
      el('p', { className: 'pd-heading', textContent: t.conditions }),
      ...(buffs.length > 0 ? buffs : [el('p', { className: 'pd-info', textContent: t.noConditions })]),
      button(t.close, options.onClose),
    ),
  );
}

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
  const buy = button(t.buyFor(price), () => {
    options.onBuy();
    options.onClose();
  }, 'primary');
  buy.disabled = hero.gold < price;
  show(
    el(
      'div',
      { className: 'pd-window' },
      el('div', { className: 'pd-row' }, slot(world, item), el('p', { className: 'pd-heading', textContent: capitalize(itemName(world, item)) })),
      ...itemInfo(world, hero, item).map((line) => el('p', { className: 'pd-info', textContent: line })),
      buy,
      el('p', { className: 'pd-note', textContent: t.yourGold(hero.gold) }),
      button(t.close, options.onClose),
    ),
  );
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
  const rows = hero.items.flatMap((item, index) => {
    const price = itemPrice(item, world.known.includes(item.kind));
    if (price <= 0) return [];
    return [
      el(
        'div',
        { className: 'pd-row' },
        slot(world, item),
        el(
          'div',
          { className: 'pd-offer' },
          el('p', { className: 'pd-note', textContent: capitalize(itemName(world, item)) }),
          button(t.sellFor(price), () => options.onSell(index)),
        ),
      ),
    ];
  });
  show(
    el(
      'div',
      { className: 'pd-window' },
      el('p', { className: 'pd-heading', textContent: capitalize(t.mobs.shopkeeper) }),
      el('p', { className: 'pd-info', textContent: rows.length > 0 ? t.sellInfo : t.nothingToSell }),
      ...rows,
      el('p', { className: 'pd-note', textContent: t.yourGold(hero.gold) }),
      button(t.close, options.onClose),
    ),
  );
}

export interface QuestOptions {
  world: World;
  hero: Hero;
  /** Who is speaking: the sad ghost or the old wandmaker. */
  who: MobKind;
  text: string;
  /** Rewards on offer, one of which the hero may take. */
  offers?: readonly Item[];
  onChoose?(index: number): void;
  onClose(): void;
}

/** A word with a quest giver (WndQuest, WndSadGhost, WndWandmaker). */
export function showQuest(options: QuestOptions): void {
  const { hero, offers = [] } = options;
  // The rewards are shown for what they are.
  const world = { ...options.world, known: [...options.world.known, ...offers.map((item) => item.kind)] };
  const offer = (item: Item, index: number): HTMLElement =>
    el(
      'div',
      { className: 'pd-row' },
      slot(world, item),
      el(
        'div',
        { className: 'pd-offer' },
        ...itemInfo(world, hero, item).map((line) => el('p', { className: 'pd-note', textContent: line })),
        button(t.takeReward(itemName(world, item)), () => {
          options.onChoose?.(index);
          options.onClose();
        }, 'primary'),
      ),
    );
  show(
    el(
      'div',
      { className: 'pd-window' },
      el('p', { className: 'pd-heading', textContent: capitalize(t.mobs[options.who]) }),
      el('p', { className: 'pd-info', textContent: options.text }),
      ...offers.map(offer),
      button(t.close, options.onClose),
    ),
  );
}

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
  show(
    el(
      'div',
      { className: 'pd-window' },
      el('p', { className: 'pd-heading', textContent: capitalize(t.mobs.blacksmith) }),
      el('p', { className: 'pd-info', textContent: options.text }),
      ...(pairs.length === 0
        ? [el('p', { className: 'pd-note', textContent: t.nothingToReforge })]
        : pairs.map((pair) =>
          button(t.reforgePair(itemName(world, pair.better), itemName(world, pair.worse)), () => {
            options.onReforge(pair.first, pair.second);
            options.onClose();
          }, 'primary'))),
      button(t.close, options.onClose),
    ),
  );
}

/** The tip on a level's sign (Sign.read). */
export function showSign(text: string, onClose: () => void): void {
  show(
    el(
      'div',
      { className: 'pd-window' },
      el('p', { className: 'pd-note', textContent: t.signTitle }),
      el('p', { className: 'pd-info', textContent: text }),
      button('OK', onClose, 'primary'),
    ),
  );
}

/** Chasm.heroJump's WndOptions: a question with a yes and a no. */
export function showConfirm(title: string, text: string, yes: string, no: string, onYes: () => void, onClose: () => void): void {
  show(
    el(
      'div',
      { className: 'pd-window' },
      el('p', { className: 'pd-heading', textContent: title }),
      el('p', { className: 'pd-info', textContent: text }),
      button(yes, () => {
        onClose();
        onYes();
      }),
      button(no, onClose, 'primary'),
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
  /** Extra lines: what killed the hero, the run's numbers. */
  details: string[];
  onRestart: () => void;
  restartLabel: string;
  onExit: () => void;
  /** For the daily dungeon: today's leaderboard (loading) and a way to share. */
  daily?: { score: number; board: Promise<DailyBoard | null>; onShare: () => void };
}

/** Today's best runs, as a list; `you` is highlighted. */
function boardView(board: DailyBoard | null): HTMLElement {
  if (!board) return el('p', { className: 'pd-note', textContent: t.boardOffline });
  if (board.top.length === 0) return el('p', { className: 'pd-note', textContent: t.noResults });
  const list = el('ol', { className: 'pd-board' });
  for (const entry of board.top.slice(0, 10)) {
    list.append(
      el(
        'li',
        { className: entry.id === board.you ? 'me' : '' },
        el('span', { className: 'who', textContent: `${entry.name} · ${t.classes[entry.heroClass]}` }),
        el('span', { className: 'what', textContent: `${entry.won ? '★ ' : ''}${t.depthShort(entry.depth)} · ${entry.score}` }),
      ),
    );
  }
  return el('div', {}, list, board.rank && board.rank > 10 ? el('p', { className: 'pd-note', textContent: t.yourPlace(board.rank) }) : null);
}

/** The end of a run: the whole party fell, or it won. */
export function showRunEnd(options: EndOptions): void {
  const board = el('div', {}, options.daily && el('p', { className: 'pd-note', textContent: t.loading }));
  show(
    el(
      'div',
      { className: 'pd-window' },
      el('div', { className: options.victory ? 'pd-victory' : 'pd-gameover' }),
      el('p', { className: 'pd-heading', textContent: options.title }),
      el('p', { className: 'pd-info', textContent: options.text }),
      ...options.details.map((line) => el('p', { className: 'pd-note', textContent: line })),
      options.daily && el('p', { className: 'pd-heading', textContent: t.dailyEnd(options.daily.score) }),
      options.daily && board,
      options.daily && button(t.shareResult, options.daily.onShare),
      button(options.restartLabel, options.onRestart, 'primary'),
      button(t.toMenu, options.onExit),
    ),
  );
  void options.daily?.board.then((loaded) => {
    const rank = loaded?.rank;
    board.replaceChildren(
      ...(rank ? [el('p', { className: 'pd-info', textContent: t.yourPlace(rank) })] : []),
      boardView(loaded),
    );
  });
}

/** Today's leaderboard from the title screen. */
export function showDailyBoard(loading: Promise<DailyBoard | null>, onClose: () => void): void {
  const body = el('div', {}, el('p', { className: 'pd-note', textContent: t.loading }));
  show(
    el(
      'div',
      { className: 'pd-window' },
      el('p', { className: 'pd-heading', textContent: t.dailyBoard }),
      body,
      button(t.close, onClose),
    ),
  );
  void loading.then((board) => body.replaceChildren(boardView(board)));
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
    if (item.charges !== undefined) {
      node.append(el('span', { className: 'pd-qty', textContent: `${item.charges}/${wandMaxCharges(item)}` }));
    }
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
  /** Throw or zap the item at a cell the player picks next. */
  onAim(index: number, kind: 'throw' | 'zap' | 'special'): void;
  onClose(): void;
}

export function showBackpack(options: BackpackOptions): void {
  const { world, hero } = options;
  const open = (item: Item, index: number | null, ring?: number): void => showItem({ ...options, item, index, ring });
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
        // Bare-handed after a monk's blow: an empty slot.
        slot(world, hero.weapon ?? undefined, hero.weapon ? () => open(hero.weapon!, null) : undefined, hero.weapon ? t.equippedLabel : t.bareHanded),
        slot(world, hero.armor, () => open(hero.armor, null), t.equippedLabel),
        ...[0, 1].map((i) => {
          const ring = hero.rings[i];
          return slot(world, ring, ring && (() => open(ring, null, i)), ring && t.equippedLabel);
        }),
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
  /** For a worn ring: which of the two it is. */
  ring?: number;
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
    if (category === 'potion') {
      actions.push(button(t.drink, () => act({ type: 'use', item: index }), 'primary'));
      actions.push(
        button(t.throwItem, () => {
          options.onClose();
          options.onAim(index, 'throw');
        }),
      );
    }
    if (category === 'food') actions.push(button(t.eat, () => act({ type: 'use', item: index }), 'primary'));
    if (category === 'torch') actions.push(button(t.light, () => act({ type: 'use', item: index }), 'primary'));
    if (category === 'tome') {
      actions.push(
        button(t.readTome, () => {
          // TomeOfMastery: the two ways of the hero's class, to choose from.
          show(
            el(
              'div',
              { className: 'pd-window' },
              el('p', { className: 'pd-heading', textContent: t.chooseWay }),
              ...SUBCLASSES[hero.heroClass].flatMap((way) => [
                el('p', { className: 'pd-info', textContent: t.subclassInfo[way] }),
                button(capitalize(t.subclasses[way]), () => act({ type: 'master', item: index, subclass: way }), 'primary'),
              ]),
              button(t.back, () => showBackpack(options)),
            ),
          );
        }, 'primary'),
      );
    }
    if (item.kind === 'weapon.pickaxe') {
      actions.push(button(t.mine, () => act({ type: 'mine' }), 'primary'));
    }
    if (category === 'kit') {
      actions.push(button(t.applyKit, () => act({ type: 'use', item: index, target: 'armor' }), 'primary'));
    }
    if (category === 'seed') {
      actions.push(
        button(t.plantSeed, () => {
          options.onClose();
          options.onAim(index, 'throw');
        }, 'primary'),
      );
    }
    if (category === 'scroll') {
      if (item.kind === 'scroll.upgrade' && isKnown(world, item)) {
        actions.push(button(t.upgradeWeapon, () => act({ type: 'use', item: index, target: 'weapon' }), 'primary'));
        actions.push(button(t.upgradeArmor, () => act({ type: 'use', item: index, target: 'armor' }), 'primary'));
      } else if (item.kind === 'scroll.enchantment' && isKnown(world, item)) {
        actions.push(button(t.enchantWeapon, () => act({ type: 'use', item: index, target: 'weapon' }), 'primary'));
        actions.push(button(t.enchantArmor, () => act({ type: 'use', item: index, target: 'armor' }), 'primary'));
      } else {
        actions.push(button(t.read, () => act({ type: 'use', item: index }), 'primary'));
      }
    }
    if (category === 'weapon' || category === 'armor' || category === 'ring') {
      actions.push(button(category === 'ring' ? t.putOn : t.equip, () => act({ type: 'equip', item: index }), 'primary'));
    }
    if (category === 'missile' || category === 'wand') {
      const kind = category === 'missile' ? 'throw' : 'zap';
      actions.push(
        button(kind === 'throw' ? t.throwItem : t.zap, () => {
          options.onClose();
          options.onAim(index, kind);
        }, 'primary'),
      );
    }
    actions.push(button(t.dropItem, () => act({ type: 'drop', item: index })));
  } else if (options.ring !== undefined) {
    const ring = options.ring;
    actions.push(button(t.takeOff, () => act({ type: 'remove', ring }), 'primary'));
  } else if (item === hero.armor && item.kind === CLASS_ARMOR_OF[hero.heroClass]) {
    // ClassArmor.doSpecial: the leap and the smoke bomb want a cell; the others act at once.
    const aimed = hero.heroClass === 'warrior' || hero.heroClass === 'rogue';
    actions.push(
      button(t.specials[hero.heroClass], () => {
        if (!aimed) return act({ type: 'special' });
        options.onClose();
        options.onAim(-1, 'special');
      }, 'primary'),
    );
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

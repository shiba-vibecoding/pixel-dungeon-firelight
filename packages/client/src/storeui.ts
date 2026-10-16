import type { HeroClass } from '@pd/core';
import { audio } from './audio';
import { Camp, type CampDress, CAMP_ORDER, seasonOf } from './camp';
import {
  bundleValue, CATALOG, DECOR_MAX, earnOnly, forSale, HEROES, type Item, itemById, PASS_PRICE, RARITY_RANK, type Slot, slotOf, type Category, passSku,
} from './catalog';
import { cosmetics } from './cosmetics';
import {
  fireArt, flCatalog, flItem, flStr, flUrl, fxArt, digitsArt, loadFl, onFlChange, type FlCategory,
} from './flart';
import { lang } from './i18n';
import { L, S } from './i18n-shop';
import { P } from './i18n-photo';
import { flash, sceneShot, showPhoto } from './photoui';
import { levelCost, PASS_LEVELS, REWARDS, type Track } from './pass';
import { packLines } from './quip-packs';
import { SEASON } from './season';
import { AVATAR, button, el, hideOverlay, info, show, sprites, toast } from './screens';
import { framedFace, itemArt, paintName, pixelImage, titlePlate } from './shopart';
import { wornOf } from './wear';

/*
 * Pixel-Mart's storefront (design part 5, docs/design/system/firelight-mart.md and the mock tools/art/firelight/p5/mock): one window of
 * the fl-mart.css classes over the game's own (.pd-window, .pd-button, .pd-chip). A head (the shop's name, a way back and out), the
 * categories (a row of chips on a phone, a list at the left on a monitor), the shelves, and the try-on: on a monitor always at the
 * right, on a phone its own screen. Screens: home (the season, the bundle of the week, the starter kit, what is new), a category,
 * the try-on, a bundle, a gift, the season pass, the profile, the photo.
 *
 * The try-on is the camp itself (camp.ts): the hero by the fire in what he would wear, the fire, the decorations, the pet, the trail.
 * Cosmetics are looks only: nothing here touches the rules or the scoring.
 */

export interface StoreOptions {
  heroClass: HeroClass;
  /** Opens on this screen's category (a designer's category id: looks, fires, ...), or the pass. */
  tab?: string;
  /** Opens on the photo screen (coming back from the photo mode). */
  screen?: 'photo';
  onClose(): void;
  /** The first shop (martui.ts): recolours, effects, the patronage. */
  classic?: () => void;
}

/** The designer's categories and which catalogue categories each holds. */
const SHELVES: Readonly<Record<string, readonly Category[]>> = {
  looks: ['look'], fires: ['campfire'], hats: ['hat'], pets: ['pet'], effects: ['trail', 'killfx', 'deathfx', 'numbers'], quips: ['quips'],
  camp: ['decor'], profile: ['frame', 'title', 'namecolor'], photo: ['photoframe', 'sticker'],
};
const EFFECT_ORDER: ReadonlyArray<readonly [Category, string]> = [['trail', 'trails'], ['killfx', 'kills'], ['deathfx', 'deaths'], ['numbers', 'digits']];

type Route =
  | { s: 'home' }
  | { s: 'cat'; cat: string }
  | { s: 'tryon'; id: string }
  | { s: 'bundle'; id: string }
  | { s: 'gift'; id: string }
  | { s: 'pass' }
  | { s: 'profile' }
  | { s: 'photo' };

const WIDE = (): boolean => typeof matchMedia === 'function' && matchMedia('(min-width: 900px)').matches;
const T = (key: string, n?: number | string): string => flStr(L, key, n);
const nameOf = (item: Item): string => item.name[L];

const starIcon = (): HTMLElement => el('i', { className: 'fl-star' });

/** A price: a star and the number; a coal tag (`legend`) for a legendary thing's. */
function priceTag(stars: number, className = ''): HTMLElement {
  return el('span', { className: `fl-price ${className}`.trim() }, starIcon(), String(stars));
}

/** Buys and says how it went. */
async function purchase(item: Item, then: () => void): Promise<void> {
  const status = await cosmetics.buy(item);
  if (status === 'paid') {
    audio.play('badge');
    toast(S.thanks, { tone: 'good' });
  } else if (status === 'owned') {
    toast(S.alreadyOwned, { tone: 'warn' });
  } else if (status === 'failed') {
    toast(S.failed, { tone: 'warn' });
  } else if (status === 'expired') {
    toast(S.expired, { tone: 'warn' });
  }
  then();
}

/** Whether an item can be bought now (for sale, in season, not owned, a once-only offer not yet taken). */
function buyable(item: Item): boolean {
  if (!forSale(item) || cosmetics.owns(item)) return false;
  return !(item.once && cosmetics.tookOffer(item.once));
}

const givable = (item: Item): boolean => forSale(item) && item.category !== 'pass' && !item.once;

/** The items of a shelf: those for sale first, then those that are earned; cheapest first. */
function shelf(categories: readonly Category[], heroClass: HeroClass): Item[] {
  return CATALOG.filter((item) => categories.includes(item.category) && (item.category !== 'look' || item.heroClass === heroClass))
    .sort((a, b) => Number(earnOnly(a)) - Number(earnOnly(b)) || a.stars - b.stars || RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity]);
}

/** The meta line of a card: the class or the season, then the price, the earn, or that it is yours. */
function cardMeta(item: Item): HTMLElement {
  const meta = el('div', { className: 'fl-card-meta' });
  if (item.category === 'look' && item.heroClass) meta.append(el('span', { textContent: S.classes[item.heroClass] }));
  else if (item.season && !cosmetics.owns(item)) meta.append(el('span', { textContent: L === 'ru' ? 'Зима' : 'Winter' }));
  if (cosmetics.owns(item) && item.category !== 'bundle') meta.append(el('span', { className: 'fl-own', textContent: cosmetics.isWorn(item) ? S.worn : S.owned }));
  else if (earnOnly(item)) meta.append(el('span', { textContent: S.earn(item.earn!) }));
  else if (item.stars > 0) meta.append(priceTag(item.stars, item.legendary ? 'legend' : ''));
  else if (item.category === 'sticker') meta.append(el('span', { textContent: itemById('stickers.pack1')?.name[L] ?? '' }));
  return meta;
}

function card(item: Item, selected: boolean, choose: (item: Item) => void, isNew = false): HTMLElement {
  const owned = cosmetics.owns(item);
  const node = el('div', { className: `fl-card${item.legendary ? ' legendary' : ''}${selected ? ' selected' : ''}${owned ? ' owned' : ''}` });
  node.tabIndex = 0;
  node.setAttribute('role', 'button');
  const art = el('div', { className: 'fl-card-art' }, itemArt(item, 4, 80));
  if (item.legendary) art.append(el('span', { className: 'pd-chip fl-legend-chip', textContent: T('legendary') }));
  else if (isNew) art.append(el('span', { className: 'pd-chip', textContent: T('new') }));
  node.append(art, el('div', { className: 'fl-card-name', textContent: nameOf(item) }), cardMeta(item));
  node.onclick = () => {
    audio.play('click');
    choose(item);
  };
  node.onkeydown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      node.click();
    }
  };
  return node;
}

function section(title: string, more: string | null, ...children: Array<Node | null>): HTMLElement {
  const head = el('div', { className: 'fl-sec-head' }, el('h3', { textContent: title }));
  if (more) head.append(el('span', { className: 'fl-more', textContent: more }));
  return el('section', { className: 'fl-sec' }, head, ...children.filter((c): c is Node => c !== null));
}

/* ---- What the try-on puts on the hero ---- */

interface Dressing {
  dress: CampDress;
  hero: HeroClass;
  slots: Map<Slot, Item>;
  /** The slots a candidate changed. */
  changed: Set<string>;
  plate: { color?: Item; title?: Item; frame?: Item };
  photoFrame?: Item;
  pack: string | null;
}

/** What the camp wears for a set of items tried on over what is worn already (a candidate takes its slot; a decoration joins the set). */
function dressingOf(candidates: readonly Item[], heroClass: HeroClass): Dressing {
  const slots = new Map<Slot, Item>();
  const decor: Item[] = [];
  for (const id of Object.values(cosmetics.equipped.slots)) {
    const item = id ? itemById(id) : undefined;
    const slot = item ? slotOf(item) : null;
    if (item && slot && cosmetics.ownsId(item.id)) slots.set(slot, item);
  }
  for (const item of cosmetics.decor) decor.push(item);
  let hero = heroClass;
  const changed = new Set<string>();
  const demo: NonNullable<CampDress['demo']> = {};
  for (const item of candidates) {
    if (item.category === 'decor') {
      if (!decor.some((d) => d.id === item.id)) decor.unshift(item);
      changed.add('decor');
    } else {
      const slot = slotOf(item);
      if (slot) {
        slots.set(slot, item);
        changed.add(slot.startsWith('look.') ? 'look' : slot);
      }
    }
    if (item.category === 'look' && item.heroClass) hero = item.heroClass;
    if (item.category === 'killfx') demo.kill = fxArt(item.id);
    if (item.category === 'deathfx') demo.death = fxArt(item.id);
    if (item.category === 'numbers') demo.digits = digitsArt(item.id);
  }
  const fireId = slots.get('campfire')?.id ?? 'fire.classic';
  return {
    dress: { fire: fireArt(fireId) ?? null, decor: decor.slice(0, DECOR_MAX).map((d) => d.id), wear: (cls) => wornOf(slots, cls as HeroClass), demo: demo.kill || demo.death || demo.digits ? demo : null },
    hero,
    slots,
    changed,
    plate: { color: slots.get('namecolor'), title: slots.get('title'), frame: slots.get('frame') },
    ...(slots.get('photoframe') ? { photoFrame: slots.get('photoframe')! } : {}),
    pack: slots.get('quips')?.id ?? null,
  };
}

/** The name plate: a portrait in its frame, the name in its colour, the title. */
function plateOf(heroClass: HeroClass, things: Dressing['plate']): HTMLElement {
  const portrait = framedFace(things.frame, AVATAR[heroClass], 3);
  if (!things.frame) portrait.style.border = '';
  const name = el('b', { className: 'fl-name', textContent: S.nameSample });
  paintName(name, things.color);
  return el('div', { className: 'fl-profile-card' }, portrait, el('div', { className: 'who' }, name, things.title ? titlePlate(things.title, nameOf(things.title)) : null));
}

/** A live stage: the camp by the fire with the hero in what he would wear; stopped when the screen goes. */
interface Stage {
  root: HTMLElement;
  /** The scene's own canvas, for a snapshot. */
  canvas: HTMLCanvasElement;
  apply(candidates: readonly Item[]): Dressing;
  stop(): void;
}

function makeStage(heroClass: HeroClass, phone: boolean): Stage {
  const root = el('div', { className: 'fl-tryon-stage' });
  const holder = el('div', { className: 'fl-tryon-camp' });
  root.append(holder);
  const crop: [number, number, number, number] = phone ? [4, 90, 86, 70] : [8, 94, 84, 64];
  const scale = phone ? Math.max(2, Math.min(4, Math.floor(Math.min(innerWidth - 56, 380) / crop[2]))) : 3;
  // The camp's canvas is laid out by its host (position: absolute): the host has the size of the scene.
  holder.style.width = `${crop[2] * scale}px`;
  holder.style.height = `${crop[3] * scale}px`;
  const camp = new Camp(holder, {
    scene: 'outdoor', season: seasonOf(new Date()), hero: Math.max(0, CAMP_ORDER.indexOf(heroClass)), crop, scale, interactive: false, label: false, own: true,
  });
  let said = '';
  let last: Item[] = [];
  let current: Dressing = dressingOf([], heroClass);
  const stop = onFlChange(() => {
    // The art arrives as it is asked for: dress again with what has come.
    current = dressingOf(last, heroClass);
    camp.setHero(current.hero);
    camp.dress(current.dress);
  });
  return {
    root,
    canvas: camp.canvas,
    apply(candidates) {
      last = [...candidates];
      current = dressingOf(candidates, heroClass);
      camp.setHero(current.hero);
      camp.dress(current.dress);
      const line = packLines(current.pack, lang, 'kill', current.hero)?.[0] ?? '';
      if (line && line !== said) camp.speak(line, 60_000);
      else if (!line && said) camp.speak('', 1);
      said = line;
      root.classList.toggle('photo', Boolean(current.photoFrame));
      return current;
    },
    stop() {
      stop();
      camp.stop();
    },
  };
}

/** The five slots under the stage: what is on the hero, the one the item changes lit. */
function slotsRow(d: Dressing): HTMLElement {
  const order: Array<[string, Slot]> = [['look', `look.${d.hero}`], ['hat', 'hat'], ['pet', 'pet'], ['fire', 'campfire'], ['trail', 'trail']];
  const row = el('div', { className: 'fl-slots' });
  for (const [key, slot] of order) {
    const item = d.slots.get(slot);
    const art = el('div', { className: 'fl-slot-art' });
    if (item) art.append(itemArt(item, 3, 36));
    row.append(el('div', { className: `fl-slot${d.changed.has(key) ? ' changed' : ''}` }, art, el('span', { textContent: S.slotNames[key as keyof typeof S.slotNames] })));
  }
  return row;
}

/* ---- The storefront ---- */

/** Opens the storefront (once the designer's catalogue has come: a moment on a cold start). */
export function showStore(options: StoreOptions): void {
  const wait = el('section', { className: 'pd-window fl-mart' }, el('p', { className: 'pd-note center', textContent: S.loading }));
  show(wait, options.onClose);
  void loadFl().then(() => build(options));
}

function build(options: StoreOptions): void {
  const data = flCatalog();
  let heroClass = options.heroClass;
  let route: Route = options.screen === 'photo' ? { s: 'photo' } : options.tab === 'pass' ? { s: 'pass' } : options.tab && SHELVES[options.tab] ? { s: 'cat', cat: options.tab } : { s: 'home' };
  const trail: Route[] = [];
  let selected: Item | null = null;
  let stage: Stage | null = null;
  const win = el('section', { className: 'pd-window fl-mart' });
  win.setAttribute('role', 'dialog');
  const cats = data?.categories ?? [];

  const close = (): void => {
    stage?.stop();
    options.onClose();
  };
  const go = (next: Route, push = true): void => {
    if (push) trail.push(route);
    route = next;
    selected = null;
    render();
  };
  const back = (): void => {
    const previous = trail.pop();
    if (previous) {
      route = previous;
      selected = null;
      render();
    } else close();
  };
  const choose = (item: Item): void => {
    if (item.category === 'bundle' && !item.pack) go({ s: 'bundle', id: item.id });
    else if (item.category === 'sticker') go({ s: 'bundle', id: 'stickers.pack1' });
    else if (WIDE() && (route.s === 'home' || route.s === 'cat' || route.s === 'gift')) {
      selected = item;
      render();
    } else go({ s: 'tryon', id: item.id });
  };

  /* -- pieces -- */

  const head = (title: string, sub: string | null, withBack: boolean): HTMLElement => {
    const row = el('div', { className: 'fl-mart-head' });
    if (withBack) {
      const backButton = el('button', { className: 'pd-button quiet small fl-back', ariaLabel: S.back }, '<', el('span', { className: 'lbl', textContent: ` ${S.back}` }));
      backButton.onclick = () => {
        audio.play('click');
        back();
      };
      row.append(backButton);
    }
    row.append(el('div', { className: 'pd-titles' }, el('h2', { className: 'pd-heading', textContent: title }), sub ? el('div', { className: 'fl-motto', textContent: sub }) : null));
    const x = el('button', { className: 'fl-close', ariaLabel: S.close, textContent: '×' });
    x.onclick = () => {
      audio.play('click');
      close();
    };
    row.append(x);
    return row;
  };

  const navigation = (current: string): HTMLElement => {
    const nav = el('nav', { className: 'fl-cats' });
    const entry = (id: string, label: string, icon: string | null, signature: boolean, target: Route): void => {
      const b = el('button', { className: `fl-cat${signature ? ' signature' : ''}` });
      if (id === current) b.setAttribute('aria-current', 'true');
      if (icon) b.append(pixelImage(icon, 32, 2));
      b.append(label);
      b.onclick = () => {
        audio.play('click');
        if (id !== current) go(target, false);
      };
      nav.append(b);
    };
    entry('home', S.home, null, false, { s: 'home' });
    for (const c of cats as FlCategory[]) entry(c.id, c[L], c.icon, c.signature === true, { s: 'cat', cat: c.id });
    entry('pass', S.seasonShelf, null, false, { s: 'pass' });
    return nav;
  };

  const classChips = (): HTMLElement => {
    const row = el('div', { className: 'fl-filters' });
    for (const name of HEROES) {
      const chip = el('button', { className: 'fl-filter', textContent: S.classes[name] });
      chip.setAttribute('aria-pressed', String(name === heroClass));
      chip.onclick = () => {
        audio.play('click');
        heroClass = name;
        render();
      };
      row.append(chip);
    }
    return row;
  };

  const grid = (items: readonly Item[], isNew: readonly string[] = []): HTMLElement =>
    el('div', { className: 'fl-grid' }, ...items.map((item) => card(item, selected?.id === item.id, choose, isNew.includes(item.id))));

  const cosmeticNote = (): HTMLElement => el('div', { className: 'fl-cosmetic', textContent: T('cosmetic') });

  /* -- the try-on: buy, gift, wear -- */

  const actionsOf = (item: Item, reopen: () => void): HTMLElement => {
    const owned = cosmetics.owns(item);
    const worn = owned && item.category !== 'bundle' && cosmetics.isWorn(item);
    const row = el('div', { className: 'fl-tryon-buy' });
    if (owned && item.category !== 'bundle' && (slotOf(item) !== null || item.category === 'decor')) {
      row.append(button(worn ? S.takeOff : S.wear, () => void cosmetics.wear(item, !worn).then(reopen), 'primary'));
    } else if (buyable(item)) {
      const buy = el('button', { className: 'pd-button primary' }, `${S.buy} `, priceTag(item.stars));
      buy.onclick = () => {
        audio.play('click');
        void purchase(item, reopen);
      };
      buy.disabled = !cosmetics.open;
      row.append(buy);
      if (givable(item)) {
        const give = button(S.gift, () => go({ s: 'gift', id: item.id }), '');
        give.disabled = !cosmetics.open;
        row.append(give);
      }
    }
    return row;
  };

  /** The try-on of one thing (or a bundle, all its parts together): the stage, the slots, the buttons. */
  const tryon = (item: Item | null, phone: boolean): HTMLElement => {
    stage?.stop();
    const parts = item ? (item.items ? item.items.map((id) => itemById(id)).filter((p): p is Item => p !== undefined && p.category !== 'sticker') : [item]) : [];
    const startClass = (item?.heroClass ?? heroClass) as HeroClass;
    const live = makeStage(startClass, phone);
    stage = live;
    const d = live.apply(parts.filter((part) => part.category !== 'sticker'));
    const panel = el('div', { className: 'fl-tryon' });
    const stageBox = el('div', { className: 'fl-tryon-stage-box' }, live.root);
    if (d.photoFrame) {
      const raw = flItem(d.photoFrame.id);
      if (raw?.sprite) live.root.style.cssText = `border:24px solid transparent;border-image:url("${flUrl(raw.sprite)}") 8 fill / 24px stretch;image-rendering:pixelated;`;
    }
    live.root.append(el('div', { className: 'fl-tryon-name', textContent: item ? nameOf(item) : S.classes[startClass] }));
    panel.append(stageBox);
    const profile = item && ['frame', 'title', 'namecolor'].includes(item.category);
    if (profile) panel.append(plateOf(startClass, d.plate));
    panel.append(el('div', { className: 'fl-sec-head' }, el('h3', { textContent: T('slots') })), slotsRow(d));
    if (item) {
      const reopen = (): void => render();
      if (item.earn) panel.append(info(`${S.earnOnly}: ${S.earn(item.earn)}`, 'fl-hint'));
      panel.append(actionsOf(item, reopen));
      if (item.once) panel.append(info(S.starterNote, 'fl-hint'));
      if (item.category === 'quips') panel.append(info(T('quipHint'), 'fl-hint'));
      if (item.category === 'decor') panel.append(info(S.decorSet(cosmetics.equipped.decor.length, DECOR_MAX), 'fl-hint'));
    }
    panel.append(info(item ? (cosmetics.open ? S.starsNote : S.closedNote) : T('tryHint'), 'fl-hint'));
    return panel;
  };

  /* -- screens -- */

  const seasonCard = (compact: boolean): HTMLElement => {
    const season = data?.season;
    const pass = cosmetics.pass;
    const box = el('div', { className: `fl-banner${compact ? ' compact' : ''}` });
    if (season) {
      const banner = el('img', { alt: '' });
      banner.src = flUrl(season.banner);
      box.append(banner);
    }
    const bar = el('div', { className: 'fl-xp' }, el('i'));
    (bar.firstChild as HTMLElement).style.width = pass.need > 0 ? `${Math.round((pass.into / pass.need) * 100)}%` : '100%';
    const text = el(
      'div', { className: 'grow' },
      el('span', { textContent: `${T('season')} ${SEASON}` }),
      el('b', { textContent: season?.name[L] ?? S.passTitle }),
      bar,
      el('span', { textContent: `${S.passLevel(pass.level)} · ${pass.level >= PASS_LEVELS ? S.passMax : S.passXp(pass.into, pass.need || levelCost(pass.level + 1))}` }),
    );
    const row = el('div', { className: 'fl-banner-text' }, text);
    if (!compact) row.append(button(T('pass'), () => go({ s: 'pass' }), 'primary small'));
    box.append(row);
    return box;
  };

  const bundleCard = (item: Item, title: string | null = null): HTMLElement => {
    const value = bundleValue(item);
    const art = el('div', { className: 'fl-bundle-art' }, itemArt(item, 3, 120));
    const items = el('div', { className: 'fl-bundle-items' });
    for (const id of item.items ?? []) {
      const part = itemById(id);
      if (part && part.category !== 'sticker') items.append(el('div', { className: 'fl-mini', title: nameOf(part) }, itemArt(part, 2, 34)));
    }
    const buyRow = el('div', { className: 'fl-bundle-buy' });
    if (value > item.stars) buyRow.append(el('span', { className: 'fl-price old', textContent: String(value) }));
    buyRow.append(priceTag(item.stars, 'big'));
    if (value > item.stars) buyRow.append(el('span', { className: 'fl-save', textContent: T('save', Math.round((1 - item.stars / value) * 100)) }));
    const open = button(cosmetics.owns(item) ? S.owned : S.tryOn, () => go({ s: 'bundle', id: item.id }), 'primary small');
    buyRow.append(open);
    return el('div', { className: 'fl-bundle' }, art, el('div', { className: 'fl-bundle-info' }, title ? el('span', { className: 'fl-motto', textContent: title }) : null, el('b', { textContent: nameOf(item) }), items, buyRow));
  };

  const homeScreen = (): HTMLElement[] => {
    const out: HTMLElement[] = [seasonCard(false)];
    const starter = itemById(`bundle.starter.${heroClass}`);
    if (starter && buyable(starter)) {
      const card2 = bundleCard(starter, S.starterTitle);
      card2.classList.add('starter');
      out.push(card2);
    }
    const week = data?.bundles[0] ? itemById(data.bundles[0].sku) : undefined;
    if (week) out.push(bundleCard(week, T('featured')));
    const fresh = ['skin.mage.starflame', 'fire.rainbow', 'pet.skull', 'hat.horns', 'kill.pillar', 'decor.musicbox', 'quips.robot', 'title.keeper']
      .map((id) => itemById(id)).filter((i): i is Item => i !== undefined);
    out.push(section(T('new'), null, grid(fresh.slice(0, WIDE() ? 8 : 6), fresh.map((i) => i.id))));
    const others = CATALOG.filter((i) => i.category === 'bundle' && !i.once && !i.pack && i.id !== week?.id);
    if (others.length > 0) out.push(section(T('bundles'), null, grid(others)));
    out.push(cosmeticNote());
    if (options.classic) out.push(button(S.classic, options.classic, 'small quiet'));
    return out;
  };

  const catScreen = (id: string): HTMLElement[] => {
    const category = (cats as FlCategory[]).find((c) => c.id === id);
    const kinds = SHELVES[id] ?? [];
    const out: HTMLElement[] = [];
    const items = shelf(kinds, heroClass);
    const hint = { fires: 'fireHint', camp: 'decorHint', quips: 'quipHint' }[id];
    if (hint) out.push(el('p', { className: 'fl-hint', textContent: T(hint) }));
    if (id === 'looks') {
      out.push(classChips());
      out.push(section(T('legendary'), T('animated'), grid(items.filter((i) => i.legendary))));
      out.push(section(category?.[L] ?? '', T('lookTiers'), grid(items.filter((i) => !i.legendary))));
    } else if (id === 'effects') {
      for (const [kind, key] of EFFECT_ORDER) out.push(section(T(key), null, grid(items.filter((i) => i.category === kind))));
    } else if (id === 'profile') {
      out.push(button(T('profileTitle'), () => go({ s: 'profile' }), 'small'));
      for (const [kind, key] of [['frame', 'frame'], ['title', 'titleL'], ['namecolor', 'nameColour']] as const) out.push(section(T(key), null, grid(items.filter((i) => i.category === kind))));
    } else if (id === 'photo') {
      out.push(button(T('photoTitle'), () => go({ s: 'photo' }), 'small'));
      const pack = itemById('stickers.pack1');
      out.push(section(T('photoFrames'), null, grid(items.filter((i) => i.category === 'photoframe'))));
      out.push(section(T('stickers'), null, pack ? grid([pack]) : null));
    } else {
      out.push(grid(items));
    }
    out.push(cosmeticNote());
    return out;
  };

  const tryonScreen = (id: string): HTMLElement[] => {
    const item = itemById(id);
    if (!item) return [];
    const out: HTMLElement[] = [tryon(item, true)];
    // Under the stage, more of the same kind to try (the looks of the class, the rest of the shelf).
    const kinds: Category[] = item.category === 'look' ? ['look'] : [item.category];
    const more = shelf(kinds, (item.heroClass ?? heroClass) as HeroClass).filter((i) => i.id !== item.id).slice(0, 6);
    if (more.length > 0) out.push(section(S.category[item.category], item.heroClass ? S.classes[item.heroClass] : null, grid(more)));
    return out;
  };

  const bundleScreen = (id: string): HTMLElement[] => {
    const item = itemById(id);
    if (!item) return [];
    const parts = (item.items ?? []).map((p) => itemById(p)).filter((p): p is Item => p !== undefined);
    const out: HTMLElement[] = [];
    if (item.pack) {
      const wall = el('div', { className: 'fl-sticker-wall' });
      for (const part of parts) wall.append(itemArt(part, 3, 48));
      out.push(el('div', { className: 'fl-tryon-stage' }, wall));
    } else {
      out.push(tryon(item, true));
    }
    out.push(section(T('inBundle'), null, grid(parts)));
    const value = bundleValue(item);
    const buyRow = el('div', { className: 'fl-bundle-buy' }, el('span', { className: 'fl-motto', textContent: T('total') }));
    if (value > item.stars) buyRow.append(el('span', { className: 'fl-price old', textContent: String(value) }));
    buyRow.append(priceTag(item.stars, 'big'));
    if (value > item.stars) buyRow.append(el('span', { className: 'fl-save', textContent: T('save', Math.round((1 - item.stars / value) * 100)) }));
    out.push(buyRow);
    if (item.pack) out.push(actionsOf(item, () => render()));
    return out;
  };

  const giftScreen = (id: string): HTMLElement[] => {
    const item = itemById(id);
    if (!item) return [];
    const art = el('div', { className: 'fl-card-art' }, itemArt(item, 4, 100));
    art.style.width = '120px';
    const top = el('div', { className: 'fl-bundle fl-gift-top' }, art, el('div', { className: 'fl-bundle-info' }, el('b', { textContent: nameOf(item) }), el('span', { className: 'fl-motto', textContent: S.category[item.category] }), priceTag(item.stars, 'big')));
    const input = el('input', { className: 'pd-input', type: 'text', inputMode: 'numeric', placeholder: S.giftIdHint, maxLength: 15 });
    input.setAttribute('aria-label', S.giftId);
    const status = el('p', { className: 'fl-hint', textContent: '' });
    const say = (text: string, tone: 'good' | 'warn' = 'warn'): void => {
      status.textContent = text;
      status.dataset.tone = tone;
    };
    const finish = async (run: Promise<Awaited<ReturnType<typeof cosmetics.give>>>, link: boolean): Promise<void> => {
      const result = await run;
      if (result === 'paid') {
        audio.play('badge');
        say(link ? S.giftLinkNote : S.giftSent, 'good');
      } else if (result === 'owned-by-friend') say(S.giftHas);
      else if (result === 'bad-friend') say(S.giftBadId);
      else if (result === 'expired') say(S.expired);
      else if (result === 'failed') say(S.failed);
    };
    const byId = el('button', { className: 'pd-button primary' }, `${S.giftById} `, priceTag(item.stars));
    byId.onclick = () => {
      const friend = input.value.trim();
      if (!/^\d{4,15}$/.test(friend)) return say(S.giftBadId);
      void finish(cosmetics.give(item, { friend: Number(friend) }), false);
    };
    const byLink = button(S.giftByLink, () => void finish(cosmetics.give(item, { link: true }), true), '');
    byId.disabled = byLink.disabled = !cosmetics.open;
    return [
      top,
      info(S.giftText, 'fl-hint'),
      section(T('giftTo'), null, el('label', { className: 'fl-search' }, input)),
      el('div', { className: 'fl-tryon-buy' }, byId, byLink),
      status,
      info(cosmetics.open ? S.starsNote : S.closedNote, 'fl-hint'),
    ];
  };

  const rewardCell = (level: number, track: Track, reached: number, claimed: readonly number[], paid: boolean): HTMLElement => {
    const id = REWARDS[level - 1]?.[track];
    const item = id ? itemById(id) : undefined;
    if (!item) return el('div', { className: `fl-reward ${track} empty` });
    const done = claimed.includes(level);
    const ready = !done && level <= reached && (track === 'free' || paid);
    const state = done ? ' claimed' : ready ? ' ready' : track === 'paid' && !paid ? ' locked' : level > reached ? ' locked' : '';
    const status = done ? S.passClaimed : ready ? S.passClaim : null;
    const cell = el(
      'div', { className: `fl-reward ${track}${state}` },
      itemArt(item, 2, 40),
      el('span', { className: 'fl-rw' }, el('small', { textContent: nameOf(item) }), status ? el('small', { className: 'st', textContent: status }) : null),
    );
    cell.onclick = () => {
      audio.play('click');
      go({ s: 'tryon', id: item.id });
    };
    return cell;
  };

  const passScreen = (): HTMLElement[] => {
    const pass = cosmetics.pass;
    const reached = pass.level;
    const claimable = (track: Track): number => REWARDS.filter((r) => r[track] && r.level <= reached && !pass.claimed[track].includes(r.level) && (track === 'free' || pass.paid)).length;
    const claim = (track: Track): HTMLElement => {
      const n = claimable(track);
      const node = button(`${S.passClaim} ${track === 'free' ? S.passFree : S.passPaid}${n > 0 ? ` (${n})` : ''}`, () => {
        void cosmetics.claim(track).then((levels) => {
          if (levels.length > 0) {
            audio.play('badge');
            toast(S.passGot(levels.length), { tone: 'good' });
          } else toast(S.passNothing);
          render();
        });
      }, n > 0 ? 'primary small' : 'small');
      node.disabled = n === 0;
      return node;
    };
    const paidItem = itemById(passSku(SEASON))!;
    const buyRow = el('div', { className: 'fl-bundle-buy' });
    if (pass.paid) buyRow.append(el('span', { className: 'pd-chip active', textContent: S.passBought }));
    else {
      const buy = el('button', { className: 'pd-button primary' }, `${S.passBuy} `, priceTag(PASS_PRICE));
      buy.onclick = () => {
        audio.play('click');
        void purchase(paidItem, () => render());
      };
      buy.disabled = !cosmetics.open;
      buyRow.append(buy);
    }
    buyRow.append(claim('free'), claim('paid'));
    if (import.meta.env.DEV && cosmetics.open) buyRow.append(button(S.passDevXp, () => { cosmetics.devAddXp(500); render(); }, 'small quiet'));
    const track = el('div', { className: 'fl-track' }, el('div', { className: 'fl-track-label', textContent: T('level') }), el('div', { className: 'fl-track-label', textContent: S.passFree }), el('div', { className: 'fl-track-label paid', textContent: S.passPaid }));
    for (let level = 1; level <= PASS_LEVELS; level++) {
      track.append(
        el('div', { className: `fl-lvl${level <= reached ? ' done' : level === reached + 1 ? ' now' : ''}`, textContent: String(level) }),
        rewardCell(level, 'free', reached, pass.claimed.free, true),
        rewardCell(level, 'paid', reached, pass.claimed.paid, pass.paid),
      );
    }
    return [seasonCard(true), buyRow, section(`${S.passFree} · ${S.passPaid}`, null, track), info(data?.season.how[L] ?? S.passHow, 'fl-hint'), info(S.passHow, 'fl-hint'), ...(cosmetics.open ? [] : [info(S.closedNote, 'fl-hint')])];
  };

  const profileScreen = (): HTMLElement[] => {
    const d = dressingOf([], heroClass);
    const frames = shelf(['frame'], heroClass);
    const titles = shelf(['title'], heroClass);
    const names = shelf(['namecolor'], heroClass);
    const swatch = (item: Item, content: Node): HTMLElement => {
      const owned = cosmetics.owns(item);
      const b = el('button', { className: 'fl-swatch' }, content);
      b.setAttribute('aria-pressed', String(owned && cosmetics.isWorn(item)));
      b.style.opacity = owned ? '1' : '.55';
      b.onclick = () => {
        audio.play('click');
        if (owned) void cosmetics.wear(item, !cosmetics.isWorn(item)).then(() => render());
        else go({ s: 'tryon', id: item.id });
      };
      return b;
    };
    const row = (items: Item[], make: (item: Item) => Node): HTMLElement => el('div', { className: 'fl-swatches' }, ...items.map((item) => swatch(item, make(item))));
    return [
      plateOf(heroClass, d.plate),
      info(S.profileNote, 'fl-hint'),
      section(T('frame'), null, row(frames, (item) => framedFace(item, AVATAR[heroClass], 2))),
      section(T('titleL'), null, row(titles, (item) => titlePlate(item, nameOf(item)))),
      section(T('nameColour'), null, row(names, (item) => {
        const s = el('span', { textContent: nameOf(item) });
        paintName(s, item);
        return s;
      })),
    ];
  };

  const photoScreen = (): HTMLElement[] => {
    const live = (() => { stage?.stop(); const s = makeStage(heroClass, !WIDE()); stage = s; s.apply([]); return s; })();
    const frame = cosmetics.photoFrame;
    const raw = frame ? flItem(frame.id) : undefined;
    if (raw?.sprite) live.root.style.cssText = `border:24px solid transparent;border-image:url("${flUrl(raw.sprite)}") 8 fill / 24px stretch;image-rendering:pixelated;`;
    const placed: HTMLElement[] = [];
    const stickers = shelf(['sticker'], heroClass);
    const swatchRow = (items: Item[], onTap: (item: Item) => void, pressed: (item: Item) => boolean): HTMLElement =>
      el('div', { className: 'fl-swatches' }, ...items.map((item) => {
        const b = el('button', { className: 'fl-swatch' }, itemArt(item, 2, 40));
        b.setAttribute('aria-pressed', String(pressed(item)));
        b.style.opacity = cosmetics.owns(item) ? '1' : '.55';
        b.onclick = () => {
          audio.play('click');
          onTap(item);
        };
        return b;
      }));
    const frames = shelf(['photoframe'], heroClass);
    // The real photo mode, over the shop: a snapshot of this stage (the hero by the fire in what is worn), the worn frame ready on it.
    const openPhotoMode = (): void => {
      const shot = sceneShot(live.canvas, null, P.campCaption);
      if (!shot) {
        toast(P.shotFailed, { tone: 'warn' });
        return;
      }
      const back = (): void => showStore({ ...options, screen: 'photo', tab: 'photo' });
      stage?.stop();
      stage = null;
      flash();
      showPhoto({ shot, onClose: back, onShop: () => showStore({ ...options, tab: 'photo' }) });
    };
    const spots: ReadonlyArray<readonly [number, number]> = [[8, 6], [62, 8], [70, 52], [10, 54]];
    const stickerRow = swatchRow(stickers, (item) => {
      if (!cosmetics.owns(item)) return go({ s: 'bundle', id: 'stickers.pack1' });
      const raw2 = flItem(item.id);
      if (!raw2?.sprite) return;
      const spot = spots[placed.length % spots.length]!;
      const img = pixelImage(raw2.sprite, 40, 3, 'fl-sticker');
      img.style.left = `${spot[0] * 3}px`;
      img.style.top = `${spot[1] * 3}px`;
      live.root.append(img);
      placed.push(img);
      if (placed.length > 6) placed.shift()?.remove();
    }, () => false);
    return [
      el('div', { className: 'fl-photo-edit' }, live.root),
      info(P.shopOpenHint, 'fl-hint'),
      button(P.shopOpen, openPhotoMode, 'primary'),
      section(T('photoFrames'), null, swatchRow(frames, (item) => {
        if (cosmetics.owns(item)) void cosmetics.wear(item, !cosmetics.isWorn(item)).then(() => render());
        else go({ s: 'tryon', id: item.id });
      }, (item) => cosmetics.owns(item) && cosmetics.isWorn(item))),
      section(T('stickers'), S.stickerTap, stickerRow),
      info(S.photoNote, 'fl-hint'),
    ];
  };

  /* -- the window -- */

  function render(): void {
    // Whatever stage there was is stopped: a screen makes its own.
    stage?.stop();
    stage = null;
    const wide = WIDE();
    const main = el('div', { className: 'fl-mart-main' });
    const body = el('div', { className: 'fl-mart-body' });
    let title = S.title;
    let sub: string | null = T('motto');
    let current = 'home';
    let withBack = true;
    let aside = false;
    switch (route.s) {
      case 'home':
        main.append(...homeScreen());
        withBack = false;
        aside = true;
        break;
      case 'cat': {
        const category = (cats as FlCategory[]).find((c) => c.id === (route as { cat: string }).cat);
        current = route.cat;
        title = S.title;
        sub = category?.[L] ?? null;
        main.append(...catScreen(route.cat));
        withBack = false;
        aside = true;
        break;
      }
      case 'tryon': {
        const item = itemById(route.id);
        title = T('byFire');
        sub = item ? nameOf(item) : T('tryOn');
        current = 'looks';
        main.append(...tryonScreen(route.id));
        break;
      }
      case 'bundle': {
        const item = itemById(route.id);
        title = item ? nameOf(item) : T('bundles');
        sub = T('bundles');
        current = 'home';
        main.append(...bundleScreen(route.id));
        break;
      }
      case 'gift': {
        const item = itemById(route.id);
        title = T('giftTitle');
        sub = item ? nameOf(item) : null;
        current = 'home';
        main.append(...giftScreen(route.id));
        aside = true;
        break;
      }
      case 'pass':
        title = `${T('pass')} · ${data?.season.name[L] ?? ''}`;
        sub = `${T('season')} ${SEASON}`;
        current = 'pass';
        main.append(...passScreen());
        break;
      case 'profile':
        title = T('profileTitle');
        sub = T('preview');
        current = 'profile';
        main.append(...profileScreen());
        break;
      case 'photo':
        title = T('photoTitle');
        sub = `${T('photoFrames')} · ${T('stickers')}`;
        current = 'photo';
        main.append(...photoScreen());
        break;
    }
    // The categories: a row of chips on a phone's shelves, a list on a monitor; the inner screens of a phone have none.
    if (wide || route.s === 'home' || route.s === 'cat') body.append(navigation(current));
    body.append(main);
    if (wide && aside) {
      const side = el('aside', { className: 'fl-aside' });
      side.append(tryon(selected, false));
      body.append(side);
    }
    win.replaceChildren(head(title, sub, withBack), body);
    sprites(win);
    // The current category's chip is in view on a phone.
    for (const nav of win.querySelectorAll<HTMLElement>('.fl-cats')) {
      const here = nav.querySelector<HTMLElement>('[aria-current]');
      if (here && !wide) nav.scrollLeft = here.offsetLeft - 24;
    }
  }

  // The dressing changes as the art comes in; the owned and worn as the server answers.
  const unsubscribe = cosmetics.onChange(() => {
    if (win.isConnected) render();
    else unsubscribe();
  });
  show(win, close);
  render();
}

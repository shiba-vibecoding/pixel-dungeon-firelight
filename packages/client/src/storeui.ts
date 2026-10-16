import type { HeroClass } from '@pd/core';
import { audio } from './audio';
import { Camp, type CampDress, type CampExtra, CAMP_ORDER, seasonOf } from './camp';
import {
  bundleValue, CATALOG, DECOR_MAX, earnOnly, forSale, HEROES, type Item, itemById, RARITY_RANK, slotOf, type Category,
} from './catalog';
import { cosmetics } from './cosmetics';
import { lang } from './i18n';
import { L, S, type Tab } from './i18n-shop';
import { levelCost, PASS_LEVELS, REWARDS, type Track } from './pass';
import { packLines } from './quip-packs';
import { SEASON } from './season';
import { AVATAR, button, el, hideOverlay, info, show, sprites, toast, windowOf } from './screens';
import { frameStyle, glyph, itemArt, lookTint, paintName, rarityClass } from './shopart';

/*
 * Pixel-Mart's storefront (the expanded shop): the catalogue's categories as tabs, item cards with rarity frames, a try-on that shows
 * the item on the hero by the camp fire (camp.ts), «Мои вещи» to wear what is owned, the season pass's track, bundles, and gifts. The
 * design system's shop markup is reused (docs/design/system «Pixel-Mart»); what is new is in game.css (.pd-store-*). Art is a
 * placeholder, drawn by shopart.ts, until the sheets arrive.
 *
 * Cosmetics are looks only: nothing here touches the rules or the scoring.
 */

const BASE = `${import.meta.env.BASE_URL}assets/`;

export interface StoreOptions {
  heroClass: HeroClass;
  tab?: Tab;
  onClose(): void;
  /** The first shop (martui.ts): recolours, effects, the patronage. */
  classic?: () => void;
}

/** The tabs, in order; photo frames and stickers share one. */
const TABS: readonly Tab[] = ['look', 'campfire', 'hat', 'pet', 'trail', 'killfx', 'deathfx', 'numbers', 'quips', 'decor', 'frame', 'title', 'namecolor', 'photo', 'bundle'];

const inTab = (tab: Tab): Category[] => (tab === 'photo' ? ['photoframe', 'sticker'] : tab === 'pass' ? [] : [tab]);

/** What a shelf shows: the catalogue's items of the tab, those for sale first, then those that are earned; cheapest first. */
function shelf(tab: Tab, heroClass: HeroClass): Item[] {
  const categories = inTab(tab);
  return CATALOG.filter((item) => categories.includes(item.category) && (tab !== 'look' || item.heroClass === heroClass))
    .sort((a, b) => Number(earnOnly(a)) - Number(earnOnly(b)) || a.stars - b.stars || RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity]);
}

const stars = (amount: number, small = false): HTMLElement => el('span', { className: `pd-stars${small ? ' small' : ''}`, textContent: String(amount) });
const nameOf = (item: Item): string => item.name[L];
const keeperIcon = (): HTMLElement => {
  const keeper = el('i', { className: 'keeper' });
  keeper.style.setProperty('--keeper', `url(${BASE}shopkeeper.png)`);
  return el('div', { className: 'pd-portrait' }, keeper);
};

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

/** The price line of a card: stars, what it takes to earn it, or that it is yours. */
function metaOf(item: Item): Array<Node | string> {
  if (cosmetics.owns(item)) return [cosmetics.isWorn(item) ? S.worn : S.owned];
  if (item.earn) return [S.earn(item.earn)];
  const nodes: Array<Node | string> = [stars(item.stars, true)];
  if (item.items) nodes.push(el('span', { className: 'pd-store-save', textContent: S.bundleSave(Math.round((1 - item.stars / bundleValue(item)) * 100)) }));
  return nodes;
}

function card(item: Item, refresh: () => void, openTry: (item: Item) => void): HTMLElement {
  const owned = cosmetics.owns(item);
  const worn = owned && cosmetics.isWorn(item);
  const art = el('div', { className: 'pd-offer-art' }, itemArt(item, item.category === 'look' ? 5 : 6));
  if (item.legendary) art.append(el('span', { className: 'pd-chip legend', textContent: S.rarity.legendary }));
  else if (item.rarity !== 'common') art.append(el('span', { className: `pd-chip rar-chip ${rarityClass(item.rarity)}`, textContent: S.rarity[item.rarity] }));
  art.onclick = () => openTry(item);
  const action = owned && item.category !== 'bundle'
    ? button(worn ? S.takeOff : S.wear, () => void cosmetics.wear(item, !worn).then(refresh), worn ? 'small quiet' : 'small')
    : button(S.tryOn, () => openTry(item), 'small');
  return el(
    'article',
    { className: `pd-offer pd-store-card ${rarityClass(item.rarity)}${item.legendary ? ' legend' : ''}${worn ? ' worn' : owned ? ' owned' : item.earn ? ' badge' : ''}` },
    art,
    el('h3', { className: 'pd-offer-name', textContent: nameOf(item) }),
    el('p', { className: 'pd-offer-meta' }, ...metaOf(item)),
    action,
  );
}

/** The storefront: a head with the pass and «Мои вещи», the tabs, the shelf. */
export function showStore(options: StoreOptions): void {
  let tab: Tab = options.tab ?? 'look';
  let heroClass = options.heroClass;
  const body = el('div', { className: 'pd-scroll pd-store-body' });
  const tabs = el('div', { className: 'pd-tabs compact pd-store-tabs' });
  tabs.setAttribute('role', 'tablist');
  const reopen = (): void => showStore({ ...options, tab, heroClass });
  const tryOn = (item: Item): void => showTryOn(item, heroClass, reopen);

  const render = (): void => {
    for (const node of tabs.children) node.setAttribute('aria-selected', String((node as HTMLElement).dataset.tab === tab));
    if (tab === 'pass') {
      body.replaceChildren(passBody(render));
    } else {
      const items = shelf(tab, heroClass);
      const children: Node[] = [];
      if (tab === 'look') {
        children.push(el('div', { className: 'pd-store-classes' }, ...HEROES.map((name) => {
          const pill = el('button', { className: 'pd-store-class', textContent: S.classes[name] });
          pill.setAttribute('aria-pressed', String(name === heroClass));
          pill.onclick = () => {
            audio.play('click');
            heroClass = name;
            render();
          };
          return pill;
        })));
      }
      children.push(items.length > 0 ? el('div', { className: 'pd-shop-grid' }, ...items.map((item) => card(item, render, tryOn))) : info(S.nothing, 'pd-note center'));
      if (!cosmetics.open) children.push(info(S.closedNote, 'pd-note center'));
      body.replaceChildren(...children);
    }
    sprites(body);
  };
  for (const id of TABS) {
    const node = el('button', { className: 'pd-tab', textContent: S.tabs[id] });
    node.dataset.tab = id;
    node.setAttribute('role', 'tab');
    node.onclick = () => {
      audio.play('click');
      tab = id;
      render();
      node.scrollIntoView?.({ inline: 'center', block: 'nearest' });
    };
    tabs.append(node);
  }
  const top = el(
    'div',
    { className: 'pd-store-top' },
    button(S.passButton, () => {
      tab = 'pass';
      render();
    }, 'small'),
    button(S.wardrobe, () => showWardrobe(heroClass, reopen), 'small'),
    ...(options.classic ? [button(S.classic, options.classic, 'small quiet')] : []),
  );
  const box = windowOf({ title: S.title, sub: S.sub, icon: keeperIcon(), onClose: options.onClose, className: 'pd-store' }, top, tabs, body);
  show(box, options.onClose);
  render();
}

/* ---- The try-on ---- */

/** Where placeholder icons stand on the camp scene (scene pixels; the hero's feet are at 50, 119, the fire at 24, 118). */
const SPOT = {
  hat: [46, 98], pet: [58, 111], numbers: [57, 92], killfx: [36, 106], deathfx: [62, 99], sticker: [3, 90],
} as const;
const DECOR_SPOTS: ReadonlyArray<readonly [number, number]> = [[6, 108], [12, 98], [36, 112], [2, 99]];

/** What the camp wears for a set of items tried on over what is worn; also the name plate's things and a pack's line. */
interface Dressing {
  dress: CampDress;
  hero: HeroClass | null;
  plate: { color?: Item; title?: Item; frame?: Item };
  photoFrame?: Item;
  pack: string | null;
}

function dressing(candidates: readonly Item[], heroClass: HeroClass): Dressing {
  // What is worn already, then the candidates over it (a candidate takes its slot).
  const slots = new Map<string, Item>();
  const decor: Item[] = [];
  for (const item of Object.values(cosmetics.equipped.slots)) {
    const found = item ? itemById(item) : undefined;
    if (found && cosmetics.ownsId(found.id)) slots.set(slotOf(found)!, found);
  }
  for (const id of cosmetics.equipped.decor) {
    const found = itemById(id);
    if (found && cosmetics.ownsId(id)) decor.push(found);
  }
  let hero: HeroClass | null = null;
  let sticker: Item | undefined;
  let photoFrame: Item | undefined;
  for (const item of candidates) {
    if (item.category === 'decor') decor.unshift(item);
    else if (item.category === 'sticker') sticker = item;
    else if (item.category === 'photoframe') photoFrame = item;
    else {
      const slot = slotOf(item);
      if (slot) slots.set(slot, item);
    }
    if (item.category === 'look' && item.heroClass) hero = item.heroClass;
  }
  const look = slots.get(`look.${hero ?? heroClass}`);
  const tint = look ? lookTint(look) : undefined;
  const flame = slots.get('campfire')?.tones;
  const extras: CampExtra[] = [];
  const place = (item: Item | undefined, x: number, y: number, bob = false, alpha = 1): void => {
    if (item) extras.push({ img: glyph(item), x, y, bob, alpha });
  };
  place(slots.get('hat'), ...SPOT.hat);
  place(slots.get('pet'), ...SPOT.pet, true);
  place(slots.get('numbers'), ...SPOT.numbers, true);
  place(slots.get('killfx'), ...SPOT.killfx, true);
  place(slots.get('deathfx'), ...SPOT.deathfx, true);
  place(sticker, ...SPOT.sticker);
  const trail = slots.get('trail');
  [62, 70, 78].forEach((x, i) => place(trail, x, 114, false, 0.85 - i * 0.3));
  decor.slice(0, DECOR_MAX).forEach((item, i) => place(item, ...DECOR_SPOTS[i]!));
  return {
    dress: {
      fire: flame && flame.length >= 4 ? [flame[0]!, flame[1]!, flame[2]!, flame[3]!] : null,
      tint: tint && (hero ?? heroClass) ? { [hero ?? heroClass]: tint } : {},
      extras,
    },
    hero,
    plate: { color: slots.get('namecolor'), title: slots.get('title'), frame: slots.get('frame') },
    ...(photoFrame ? { photoFrame } : {}),
    pack: slots.get('quips')?.id ?? null,
  };
}

/** The name plate: a portrait in its frame, the name in its colour, the title. */
function plate(heroClass: HeroClass, things: Dressing['plate']): HTMLElement {
  const face = el('i');
  face.style.setProperty('--av', String(AVATAR[heroClass]));
  const portrait = el('span', { className: `pd-profile-face${things.frame ? ' frame-p' : ''}` }, face);
  portrait.style.cssText = frameStyle(things.frame);
  const name = el('b', { className: 'pd-store-name', textContent: S.nameSample });
  paintName(name, things.color);
  return el('div', { className: 'pd-store-plate' }, portrait, el('span', { className: 'pd-store-who' }, name, things.title ? el('small', { textContent: nameOf(things.title) }) : null));
}

/**
 * An item up close, live: the hero by the camp fire with it on («Примерить» puts it on and takes it off), and «Купить» / «Подарить»
 * (or «Надеть» when it is owned). A bundle tries all its parts at once.
 */
export function showTryOn(item: Item, heroClass: HeroClass, back: () => void): void {
  const parts = item.items ? item.items.map((id) => itemById(id)).filter((part): part is Item => part !== undefined) : [item];
  let on = true;
  const stage = el('div', { className: 'pd-store-stage' });
  const holder = el('div', { className: 'pd-store-camp' });
  const plateBox = el('div', { className: 'pd-store-platebox' });
  stage.append(holder);
  const startClass = item.heroClass ?? heroClass;
  const camp = new Camp(holder, {
    scene: 'outdoor', season: seasonOf(new Date()), hero: Math.max(0, CAMP_ORDER.indexOf(startClass)), crop: [6, 86, 66, 46], scale: 4,
    interactive: false, label: false, own: true,
  });
  let said = '';
  const apply = (): void => {
    const d = dressing(on ? parts : [], startClass);
    camp.setHero(startClass);
    camp.dress(d.dress);
    plateBox.replaceChildren(plate(startClass, d.plate));
    stage.style.setProperty('--photo', d.photoFrame?.tones?.[0] ?? 'transparent');
    stage.classList.toggle('photo', Boolean(d.photoFrame));
    const line = on ? packLines(d.pack, lang, 'kill', startClass)?.[0] ?? '' : '';
    if (line && line !== said) camp.speak(line, 60_000);
    else if (!line && said) camp.speak('', 1);
    said = line;
  };
  const tryButton = button(S.tryOff, () => {
    on = !on;
    tryButton.textContent = on ? S.tryOff : S.tryOn;
    apply();
  }, 'small');
  const owned = cosmetics.owns(item);
  const rows: Child[] = [];
  const buy = !owned && forSale(item) ? button('', () => void purchase(item, () => { camp.stop(); back(); }), 'primary') : null;
  if (buy) {
    buy.append(S.buy, ' ', stars(item.stars));
    buy.disabled = !cosmetics.open;
  }
  const givable = forSale(item) && item.category !== 'pass';
  const give = givable ? button(S.gift, () => { camp.stop(); showGift(item, () => showTryOn(item, heroClass, back)); }, '') : null;
  if (give) give.disabled = !cosmetics.open;
  const wear = owned && item.category !== 'bundle'
    ? button(cosmetics.isWorn(item) ? S.takeOff : S.wear, () => void cosmetics.wear(item, !cosmetics.isWorn(item)).then(() => { camp.stop(); back(); }), 'primary')
    : null;
  rows.push(el('div', { className: 'pd-actions' }, ...(buy ? [buy] : wear ? [wear] : []), el('div', { className: 'pd-row' }, tryButton, ...(give ? [give] : []))));
  const partList = item.items
    ? el('ul', { className: 'pd-store-parts' }, ...parts.map((part) => el('li', { className: `${rarityClass(part.rarity)}${cosmetics.ownsId(part.id) ? ' have' : ''}` }, itemArt(part, 3), el('span', { textContent: nameOf(part) }), cosmetics.ownsId(part.id) ? el('i', { className: 'pd-store-tick', textContent: '✓' }) : stars(part.stars, true))))
    : null;
  const close = (): void => {
    camp.stop();
    back();
  };
  const sub = `${S.category[item.category]} · ${S.rarity[item.rarity]}`;
  const box = windowOf(
    { title: nameOf(item), sub, onClose: close, className: 'pd-store-try' },
    stage,
    plateBox,
    partList,
    item.earn ? info(`${S.earnOnly}: ${S.earn(item.earn)}`, 'pd-note center') : item.items ? info(`${S.bundleHas(parts.length, bundleValue(item))} · ${S.bundleSave(Math.round((1 - item.stars / bundleValue(item)) * 100))}`, 'pd-note center') : null,
    ...rows,
    info(`${cosmetics.open ? S.starsNote : S.closedNote} ${S.placeholderNote}`, 'pd-note center'),
  );
  show(box, close);
  apply();
}

type Child = Node | string | null | undefined | false;

/* ---- Gifts ---- */

/** «Подарить»: a friend by Telegram ID, or a link to send on. */
function showGift(item: Item, back: () => void): void {
  const input = el('input', { className: 'pd-input', type: 'text', inputMode: 'numeric', placeholder: S.giftIdHint, maxLength: 15 });
  input.setAttribute('aria-label', S.giftId);
  const status = el('p', { className: 'pd-note center', textContent: '' });
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
  const byId = button(S.giftById, () => {
    const id = input.value.trim();
    if (!/^\d{4,15}$/.test(id)) return say(S.giftBadId);
    void finish(cosmetics.give(item, { friend: Number(id) }), false);
  }, 'primary');
  const byLink = button(S.giftByLink, () => void finish(cosmetics.give(item, { link: true }), true), '');
  byId.disabled = byLink.disabled = !cosmetics.open;
  show(
    windowOf(
      { title: S.giftTitle, sub: nameOf(item), onClose: back, narrow: true },
      el('div', { className: 'pd-store-giftart' }, itemArt(item, 6)),
      info(S.giftText),
      el('label', { className: 'pd-store-field' }, el('span', { textContent: S.giftId }), input),
      el('div', { className: 'pd-actions' }, byId, byLink),
      status,
      stars(item.stars),
      info(cosmetics.open ? S.starsNote : S.closedNote, 'pd-note center'),
    ),
    back,
  );
}

/* ---- «Мои вещи» ---- */

/** What is owned, by tab, to wear and take off. */
function showWardrobe(heroClass: HeroClass, back: () => void): void {
  const wardTabs = TABS.filter((id) => id !== 'bundle');
  let tab: Tab = 'look';
  let cls = heroClass;
  const body = el('div', { className: 'pd-scroll pd-store-body' });
  const tabs = el('div', { className: 'pd-tabs compact pd-store-tabs' });
  const render = (): void => {
    for (const node of tabs.children) node.setAttribute('aria-selected', String((node as HTMLElement).dataset.tab === tab));
    const categories = inTab(tab);
    const items = CATALOG.filter((item) => categories.includes(item.category) && cosmetics.ownsId(item.id) && (tab !== 'look' || item.heroClass === cls))
      .sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || a.id.localeCompare(b.id));
    const children: Node[] = [];
    if (tab === 'look') {
      children.push(el('div', { className: 'pd-store-classes' }, ...HEROES.map((name) => {
        const pill = el('button', { className: 'pd-store-class', textContent: S.classes[name] });
        pill.setAttribute('aria-pressed', String(name === cls));
        pill.onclick = () => {
          audio.play('click');
          cls = name;
          render();
        };
        return pill;
      })));
    }
    if (tab === 'decor') children.push(info(S.decorSet(cosmetics.equipped.decor.length, DECOR_MAX), 'pd-note center'));
    children.push(items.length > 0 ? el('div', { className: 'pd-shop-grid' }, ...items.map((item) => card(item, render, (it) => showTryOn(it, cls, () => showWardrobe(cls, back))))) : info(S.nothingOwned, 'pd-note center'));
    body.replaceChildren(...children);
    sprites(body);
  };
  for (const id of wardTabs) {
    const node = el('button', { className: 'pd-tab', textContent: S.tabs[id] });
    node.dataset.tab = id;
    node.setAttribute('role', 'tab');
    node.onclick = () => {
      audio.play('click');
      tab = id;
      render();
    };
    tabs.append(node);
  }
  show(windowOf({ title: S.wardrobe, sub: S.wardrobeSub, icon: keeperIcon(), onClose: back, className: 'pd-store' }, tabs, body), back);
  render();
}

/* ---- The season pass ---- */

function rewardCell(level: number, track: Track, reached: number, claimed: readonly number[], paid: boolean): HTMLElement {
  const id = REWARDS[level - 1]?.[track];
  const item = id ? itemById(id) : undefined;
  if (!item) return el('div', { className: 'pd-pass-cell empty' });
  const done = claimed.includes(level);
  const open = level <= reached && (track === 'free' || paid);
  const cell = el(
    'div',
    { className: `pd-pass-cell ${rarityClass(item.rarity)}${done ? ' done' : open ? ' open' : ' locked'}`, title: nameOf(item) },
    itemArt(item, 3),
    el('span', { className: 'pd-pass-name', textContent: nameOf(item) }),
    done ? el('i', { className: 'pd-store-tick', textContent: '✓' }) : null,
  );
  cell.onclick = () => showTryOn(item, 'warrior', () => showStore({ heroClass: 'warrior', tab: 'pass', onClose: hideOverlay }));
  return cell;
}

/** The pass: where the player stands, the paid track's purchase, and the 30 levels with a reward on each track. */
function passBody(refresh: () => void): HTMLElement {
  const pass = cosmetics.pass;
  const reached = pass.level;
  const bar = el('div', { className: 'pd-pass-bar' }, el('i'));
  bar.style.setProperty('--fill', pass.need > 0 ? `${Math.round((pass.into / pass.need) * 100)}%` : '100%');
  const claimable = (track: Track): number => REWARDS.filter((r) => r[track] && r.level <= reached && !pass.claimed[track].includes(r.level) && (track === 'free' || pass.paid)).length;
  const claim = (track: Track): HTMLElement => {
    const n = claimable(track);
    const node = button(`${S.passClaim}${n > 0 ? ` (${n})` : ''}`, () => {
      void cosmetics.claim(track).then((levels) => {
        if (levels.length > 0) {
          audio.play('badge');
          toast(S.passGot(levels.length), { tone: 'good' });
        } else {
          toast(S.passNothing);
        }
        refresh();
      });
    }, n > 0 ? 'primary small' : 'small');
    node.disabled = n === 0;
    return node;
  };
  const paidItem = itemById(`pass.s${SEASON}`)!;
  const buyPaid = pass.paid
    ? el('span', { className: 'pd-chip active', textContent: S.passBought })
    : (() => {
        const node = button('', () => void purchase(paidItem, refresh), 'small');
        node.append(S.passBuy, ' ', stars(paidItem.stars));
        node.disabled = !cosmetics.open;
        return node;
      })();
  const rows = REWARDS.map((reward) =>
    el(
      'div',
      { className: `pd-pass-row${reward.level <= reached ? ' reached' : ''}` },
      el('b', { className: 'pd-pass-level', textContent: String(reward.level) }),
      rewardCell(reward.level, 'free', reached, pass.claimed.free, true),
      rewardCell(reward.level, 'paid', reached, pass.claimed.paid, pass.paid),
    ),
  );
  const dev = import.meta.env.DEV && !cosmetics.open ? null : import.meta.env.DEV ? button(S.passDevXp, () => { cosmetics.devAddXp(500); refresh(); }, 'small quiet') : null;
  return el(
    'div',
    { className: 'pd-pass' },
    el('h3', { className: 'pd-heading', textContent: S.passTitle }),
    info(S.passSub(pass.season), 'pd-note'),
    el('div', { className: 'pd-pass-head' }, el('b', { textContent: S.passLevel(reached) }), el('span', { textContent: reached >= PASS_LEVELS ? S.passMax : S.passXp(pass.into, pass.need || levelCost(reached + 1)) })),
    bar,
    el('div', { className: 'pd-pass-tools' }, buyPaid, ...(dev ? [dev] : [])),
    el('div', { className: 'pd-pass-cols' }, el('span'), el('b', { textContent: S.passFree }), el('b', { textContent: S.passPaid })),
    el('div', { className: 'pd-pass-claims' }, el('span'), claim('free'), claim('paid')),
    el('div', { className: 'pd-pass-track' }, ...rows),
    info(S.passHow, 'pd-note center'),
    ...(cosmetics.open ? [] : [info(S.closedNote, 'pd-note center')]),
  );
}

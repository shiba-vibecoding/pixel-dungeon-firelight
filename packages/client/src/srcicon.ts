import { createItem, type HeroClass, type ItemKind, itemSprite, type Labels, type MobKind, T, type TrapKind } from '@pd/core';
import type { Cause, Source } from './hurtsrc';
import { ICONS, type Assets, levelRegion } from './sprites';

/*
 * The tiny picture that says what dealt a damage: a monster's portrait, a buff's icon for fire, poison, bleeding and the other slow
 * ones, a trap's tile, the item of a wand or a missile. Everything is a picture the game already has (the mob sheets, buffs.png,
 * items.png, the tileset, icons.png); the one made here is a puff for a cloud of gas. An `Icon` is made once when a damage number is
 * born, so drawing it each frame allocates nothing.
 */

export type Icon =
  | { readonly kind: 'buff'; readonly index: number }
  | { readonly kind: 'item'; readonly index: number }
  | { readonly kind: 'icons'; readonly rect: readonly [number, number, number, number] }
  | { readonly kind: 'mob'; readonly mob: MobKind }
  | { readonly kind: 'hero'; readonly heroClass: HeroClass }
  | { readonly kind: 'tile'; readonly terrain: number }
  | { readonly kind: 'gas' };

/** buffs.png, 7 x 7, 18 a row (hud.ts BUFF_ICONS). */
const BUFF = { burning: 2, poison: 3, hunger: 6, ooze: 8, bleeding: 26, deferred: 28 } as const;

const TRAP_TERRAIN: Readonly<Record<TrapKind, number>> = {
  toxic: T.TOXIC_TRAP, fire: T.FIRE_TRAP, paralytic: T.PARALYTIC_TRAP, poison: T.POISON_TRAP, alarm: T.ALARM_TRAP,
  lightning: T.LIGHTNING_TRAP, gripping: T.GRIPPING_TRAP, summoning: T.SUMMONING_TRAP,
};

const SKULL: Icon = { kind: 'icons', rect: ICONS.skull };

const itemIcon = (kind: ItemKind, labels: Labels): Icon => ({ kind: 'item', index: itemSprite(createItem(kind), labels) });

/** The picture for a source. `labels` are the run's (a wand's look depends on them: the hero's own wand is drawn as they know it). */
export function iconFor(source: Source, labels: Labels): Icon {
  if ('mob' in source) return { kind: 'mob', mob: source.mob };
  if ('hero' in source) return { kind: 'hero', heroClass: source.hero };
  const cause: Cause = source.cause;
  switch (cause) {
    case 'burning': return { kind: 'buff', index: BUFF.burning };
    case 'poison': return { kind: 'buff', index: BUFF.poison };
    case 'bleeding': return { kind: 'buff', index: BUFF.bleeding };
    case 'hunger': return { kind: 'buff', index: BUFF.hunger };
    case 'ooze': return { kind: 'buff', index: BUFF.ooze };
    case 'deferred': return { kind: 'buff', index: BUFF.deferred };
    case 'gas': return { kind: 'gas' };
    case 'trap': return source.trap ? { kind: 'tile', terrain: TRAP_TERRAIN[source.trap] } : SKULL;
    // Lightning of a trap or a glyph: the lightning trap's own tile (a wand's look would give away which wand it is).
    case 'lightning': return { kind: 'tile', terrain: T.LIGHTNING_TRAP };
    case 'fall': return { kind: 'icons', rect: ICONS.depth };
    case 'bones': return { kind: 'mob', mob: 'skeleton' };
    case 'bomb': return itemIcon('bomb', labels);
    case 'multiplicity': return itemIcon('armor.cloth', labels);
    case 'wand': return itemIcon(source.item ?? 'wand.magicMissile', labels);
    case 'missile': return itemIcon(source.item ?? 'missile.dart', labels);
    default: return SKULL;
  }
}

let buffs: HTMLImageElement | null = null;
let buffsAsked = false;

/** buffs.png as an image the canvas can draw (the page's CSS atlas is not one); null until it has come. */
function buffsImage(): HTMLImageElement | null {
  if (!buffsAsked && typeof Image !== 'undefined') {
    buffsAsked = true;
    const image = new Image();
    image.onload = () => {
      buffs = image;
    };
    image.src = `${import.meta.env.BASE_URL}assets/buffs.png`;
  }
  return buffs;
}

/**
 * Draws an icon in the square of `size` pixels whose top-left corner is (x, y): sprites fitted and centred, whole-number scales
 * where the art is smaller than the box. `depth` picks the tileset a trap's tile is from.
 */
export function drawSourceIcon(ctx: CanvasRenderingContext2D, assets: Assets, icon: Icon, x: number, y: number, size: number, depth: number): void {
  const save = ctx.imageSmoothingEnabled;
  switch (icon.kind) {
    case 'mob':
    case 'hero': {
      const sprite = icon.kind === 'mob' ? assets.mobs[icon.mob] : assets.heroes[icon.heroClass];
      const { image, w, h, cols } = sprite.sheet;
      const frame = sprite.anims.idle.frames[0] ?? 0;
      const fit = Math.min(size / w, size / h);
      // Downscaled art is smoothed (nearest-neighbour at half size loses the face); upscaled stays crisp.
      ctx.imageSmoothingEnabled = fit < 1;
      const dw = Math.max(1, Math.round(w * fit));
      const dh = Math.max(1, Math.round(h * fit));
      ctx.drawImage(image, (frame % cols) * w, Math.floor(frame / cols) * h, w, h, Math.round(x + (size - dw) / 2), Math.round(y + (size - dh) / 2), dw, dh);
      break;
    }
    case 'item': {
      ctx.imageSmoothingEnabled = size < 16;
      ctx.drawImage(assets.items, (icon.index % 8) * 16, Math.floor(icon.index / 8) * 16, 16, 16, Math.round(x), Math.round(y), size, size);
      break;
    }
    case 'buff': {
      const image = buffsImage();
      if (!image) break;
      ctx.imageSmoothingEnabled = false;
      const s = Math.max(1, Math.floor(size / 7)) * 7;
      ctx.drawImage(image, (icon.index % 18) * 7, Math.floor(icon.index / 18) * 7, 7, 7, Math.round(x + (size - s) / 2), Math.round(y + (size - s) / 2), s, s);
      break;
    }
    case 'icons': {
      const [sx, sy, w, h] = icon.rect;
      ctx.imageSmoothingEnabled = false;
      const s = Math.max(1, Math.floor(size / Math.max(w, h)));
      ctx.drawImage(assets.icons, sx, sy, w, h, Math.round(x + (size - w * s) / 2), Math.round(y + (size - h * s) / 2), w * s, h * s);
      break;
    }
    case 'tile': {
      const tiles = assets.tiles[levelRegion({ depth })];
      if (!tiles) break;
      const columns = tiles.width / 16;
      ctx.imageSmoothingEnabled = size < 16;
      ctx.drawImage(tiles, (icon.terrain % columns) * 16, Math.floor(icon.terrain / columns) * 16, 16, 16, Math.round(x), Math.round(y), size, size);
      break;
    }
    case 'gas': {
      // A puff of green: three overlapping squares of a cloud, with a darker rim.
      const u = Math.max(1, Math.round(size / 8));
      const px = Math.round(x);
      const py = Math.round(y);
      ctx.fillStyle = '#2f5f2a';
      for (const [cx, cy, cs] of [[1, 3, 4], [3, 1, 4], [4, 3, 3], [2, 4, 4]] as const) ctx.fillRect(px + (cx - 0.5) * u, py + (cy - 0.5) * u, (cs + 1) * u, (cs + 1) * u);
      ctx.fillStyle = '#8fdc6a';
      for (const [cx, cy, cs] of [[1, 3, 4], [3, 1, 4], [4, 3, 3], [2, 4, 4]] as const) ctx.fillRect(px + cx * u, py + cy * u, cs * u, cs * u);
      break;
    }
  }
  ctx.imageSmoothingEnabled = save;
}

/** The icon on a small canvas of its own, for a window (the feed); `px` is the number of device pixels to a CSS pixel for it. */
export function sourceIconEl(icon: Icon, assets: Assets, depth: number, css = 24): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const scale = Math.max(1, Math.round(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
  canvas.width = css * scale;
  canvas.height = css * scale;
  canvas.className = 'fl-src-icon';
  canvas.style.width = `${css}px`;
  canvas.style.height = `${css}px`;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    drawSourceIcon(ctx, assets, icon, 0, 0, css * scale, depth);
    // buffs.png may still be on its way: once it is here, the icon is drawn again.
    if (icon.kind === 'buff' && !buffs) {
      const image = buffsImage();
      image?.addEventListener('load', () => drawSourceIcon(ctx, assets, icon, 0, 0, css * scale, depth), { once: true });
    }
  }
  return canvas;
}

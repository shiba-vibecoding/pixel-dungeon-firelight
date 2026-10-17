import { GLYPH_RGB, GROWTH_ICONS, type IconSize, MASKED, ENCHANT_RGB } from './growdata';

/*
 * The little pictures of part 11 (assets/ui/growth/growth-icons.png): 8 px marks of a slot, 12 px figures of the hero, 16 px
 * headings. An icon is an <i class="fl-gi"> whose background position is the sheet's place (growth.json); the white masks
 * (enchantment, glyph) are painted in the colour of the thing they mark. No dependency on the screens, so that any module can
 * draw one.
 */

export type IconName8 = keyof (typeof GROWTH_ICONS)[8];
export type IconName12 = keyof (typeof GROWTH_ICONS)[12];
export type IconName16 = keyof (typeof GROWTH_ICONS)[16];
export type IconName = IconName8 | IconName12 | IconName16;

/** Where an icon is on the sheet; throws for a name the sheet does not have (a typo is a bug, not a missing picture). */
export function iconBox(name: string, size: IconSize): readonly [number, number, number, number] {
  const box = (GROWTH_ICONS[size] as Readonly<Record<string, readonly [number, number, number, number]>>)[name];
  if (!box) throw new Error(`no icon ${size}/${name}`);
  return box;
}

/** `<i class="fl-gi">` of the sheet's icon `name` at `size` px, each pixel `scale` CSS px wide (default the design's 2). `tint`: an rgb triplet for a mask. */
export function gi(name: string, size: IconSize = 8, scale = 2, tint?: string): HTMLElement {
  const [x, y] = iconBox(name, size);
  const node = document.createElement('i');
  node.className = `fl-gi${MASKED.includes(name) ? ' mask' : ''}`;
  node.style.setProperty('--gx', String(x));
  node.style.setProperty('--gy', String(y));
  node.style.setProperty('--s', String(size));
  node.style.setProperty('--gs', `${scale}px`);
  if (tint) node.style.setProperty('--tint', tint);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

/** The colour of an enchantment's rune, or of a glyph's (an rgb triplet, as ItemSprite.Glowing gives it). */
export const enchantRgb = (enchant: string): string | undefined => ENCHANT_RGB[enchant];
export const glyphRgb = (): string => GLYPH_RGB;

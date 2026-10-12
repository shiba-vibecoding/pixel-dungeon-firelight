import type { HeroClass, MobKind } from '@pd/core';

/* Sprite sheets and animations of the original (HeroSprite, RatSprite, …). */

export interface Sheet {
  image: HTMLImageElement;
  w: number;
  h: number;
  cols: number;
}

export interface Animation {
  fps: number;
  frames: readonly number[];
  loop: boolean;
}

export type AnimName = 'idle' | 'run' | 'attack' | 'die' | 'operate' | 'pump';

export interface CharSprite {
  sheet: Sheet;
  anims: Readonly<Record<AnimName, Animation>>;
}

export interface Assets {
  tiles: HTMLImageElement;
  water: HTMLImageElement;
  heroes: Record<HeroClass, CharSprite>;
  mobs: Record<MobKind, CharSprite>;
  icons: HTMLImageElement;
  bossBanner: HTMLImageElement;
  status: HTMLImageElement;
  toolbar: HTMLImageElement;
  hpBar: HTMLImageElement;
  expBar: HTMLImageElement;
}

const anim = (fps: number, frames: number[], loop = false): Animation => ({ fps, frames, loop });

/** Animations of a character that has no special ones for operating or pumping up. */
function basic(idle: Animation, run: Animation, attack: Animation, die: Animation): Record<AnimName, Animation> {
  return { idle, run, attack, die, operate: idle, pump: idle };
}

const HERO_ANIMS: Record<AnimName, Animation> = {
  ...basic(
    anim(1, [0, 0, 0, 1, 0, 0, 1, 1], true),
    anim(20, [2, 3, 4, 5, 6, 7], true),
    anim(15, [13, 14, 15, 0]),
    anim(20, [8, 9, 10, 11, 12, 11]),
  ),
  operate: anim(8, [16, 17, 16, 17]),
};

const MOB_SPRITES: Record<MobKind, { w: number; h: number; anims: Record<AnimName, Animation> }> = {
  rat: {
    w: 16,
    h: 15,
    anims: basic(anim(2, [0, 0, 0, 1], true), anim(10, [6, 7, 8, 9, 10], true), anim(15, [2, 3, 4, 5, 0]), anim(10, [11, 12, 13, 14])),
  },
  gnoll: {
    w: 12,
    h: 15,
    anims: basic(anim(2, [0, 0, 0, 1, 0, 0, 1, 1], true), anim(12, [4, 5, 6, 7], true), anim(12, [2, 3, 0]), anim(12, [8, 9, 10])),
  },
  crab: {
    w: 16,
    h: 16,
    anims: basic(anim(5, [0, 1, 0, 2], true), anim(15, [3, 4, 5, 6], true), anim(12, [7, 8, 9]), anim(12, [10, 11, 12, 13])),
  },
  goo: {
    w: 20,
    h: 14,
    anims: {
      ...basic(anim(10, [0, 1], true), anim(10, [0, 1], true), anim(10, [5, 0, 6]), anim(10, [2, 3, 4])),
      pump: anim(20, [0, 1], true),
    },
  },
};

/** Frame of an animation `elapsed` ms after it started; non-looping ones hold the last frame. */
export function frameAt(animation: Animation, elapsed: number): number {
  const index = Math.floor((elapsed / 1000) * animation.fps);
  const frames = animation.frames;
  return animation.loop ? frames[index % frames.length]! : frames[Math.min(index, frames.length - 1)]!;
}

export function duration(animation: Animation): number {
  return (animation.frames.length / animation.fps) * 1000;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${url}`));
    image.src = url;
  });
}

const sheet = (image: HTMLImageElement, w: number, h: number): Sheet => ({ image, w, h, cols: Math.floor(image.width / w) });

export async function loadAssets(base: string): Promise<Assets> {
  const names = [
    'tiles0', 'water0', 'warrior', 'mage', 'rogue', 'ranger', 'rat', 'gnoll', 'crab', 'goo',
    'icons', 'status_pane', 'toolbar', 'hp_bar', 'exp_bar', 'banner-boss',
  ] as const;
  const images = Object.fromEntries(
    await Promise.all(names.map(async (name) => [name, await loadImage(`${base}${name}.png`)] as const)),
  ) as Record<(typeof names)[number], HTMLImageElement>;

  const hero = (image: HTMLImageElement): CharSprite => ({ sheet: sheet(image, 12, 15), anims: HERO_ANIMS });
  const mob = (kind: MobKind): CharSprite => {
    const spec = MOB_SPRITES[kind];
    return { sheet: sheet(images[kind], spec.w, spec.h), anims: spec.anims };
  };
  return {
    tiles: images.tiles0,
    water: images.water0,
    heroes: {
      warrior: hero(images.warrior),
      mage: hero(images.mage),
      rogue: hero(images.rogue),
      huntress: hero(images.ranger),
    },
    mobs: { rat: mob('rat'), gnoll: mob('gnoll'), crab: mob('crab'), goo: mob('goo') },
    icons: images.icons,
    bossBanner: images['banner-boss'],
    status: images.status_pane,
    toolbar: images.toolbar,
    hpBar: images.hp_bar,
    expBar: images.exp_bar,
  };
}

/** Rectangles in icons.png, from Icons.java. */
export const ICONS = {
  skull: [0, 0, 8, 8],
  busy: [8, 0, 8, 8],
  sleep: [13, 45, 9, 8],
  alert: [22, 45, 8, 8],
  depth: [45, 12, 9, 8],
  warrior: [0, 29, 16, 16],
  mage: [16, 29, 16, 16],
  rogue: [32, 29, 16, 16],
  huntress: [48, 29, 16, 16],
} as const satisfies Record<string, readonly [number, number, number, number]>;

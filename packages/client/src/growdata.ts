// Generated from public/assets/ui/growth/growth.json (growth.test.ts holds the two together): the places of the icons on growth-icons.png,
// the colours of the enchantments, and the motion of the moments. Nothing else of the designer's json is needed by the client.
export type IconSize = 8 | 12 | 16;
export type IconBox = readonly [x: number, y: number, w: number, h: number];

export const GROWTH_ICONS = {
  8: {
    cursed: [32, 0, 8, 8],
    down: [72, 0, 8, 8],
    enchant: [40, 0, 8, 8],
    fire: [80, 0, 8, 8],
    fits: [16, 0, 8, 8],
    glyph: [48, 0, 8, 8],
    heavy: [8, 0, 8, 8],
    new: [0, 0, 8, 8],
    note: [56, 0, 8, 8],
    seen: [88, 0, 8, 8],
    unknown: [24, 0, 8, 8],
    up: [64, 0, 8, 8]
  },
  12: {
    acc: [24, 16, 12, 12],
    aware: [96, 16, 12, 12],
    depth: [144, 16, 12, 12],
    dmg: [60, 16, 12, 12],
    dr: [48, 16, 12, 12],
    eva: [36, 16, 12, 12],
    gold: [132, 16, 12, 12],
    hp: [0, 16, 12, 12],
    ident: [180, 16, 12, 12],
    kills: [168, 16, 12, 12],
    lvl: [72, 16, 12, 12],
    ring: [108, 16, 12, 12],
    speed: [192, 16, 12, 12],
    str: [12, 16, 12, 12],
    turns: [156, 16, 12, 12],
    wand: [120, 16, 12, 12],
    xp: [84, 16, 12, 12]
  },
  16: {
    bestiary: [160, 32, 16, 16],
    boss: [208, 32, 16, 16],
    catalog: [144, 32, 16, 16],
    chronicle: [176, 32, 16, 16],
    filter: [240, 32, 16, 16],
    hunger: [0, 32, 16, 16],
    key: [112, 32, 16, 16],
    passport: [192, 32, 16, 16],
    pot: [64, 32, 16, 16],
    rest: [16, 32, 16, 16],
    search: [32, 32, 16, 16],
    shop: [96, 32, 16, 16],
    sigil: [224, 32, 16, 16],
    sort: [256, 32, 16, 16],
    strength: [128, 32, 16, 16],
    traps: [48, 32, 16, 16],
    well: [80, 32, 16, 16]
  }
} as const;

/** Enchantment colours (ItemSprite.Glowing) as an rgb triplet, and the glyph's. */
export const ENCHANT_RGB: Readonly<Record<string, string>> = {
  death: "40, 40, 40",
  fire: "255, 68, 0",
  horror: "90, 90, 90",
  instability: "255, 255, 255",
  leech: "170, 0, 40",
  luck: "0, 255, 0",
  paralysis: "255, 255, 68",
  poison: "68, 0, 170",
  shock: "255, 255, 255",
  slow: "0, 68, 255",
  tempering: "204, 136, 136"
};
export const GLYPH_RGB = "94, 200, 192";
/** Icons painted white and tinted in the game. */
export const MASKED: readonly string[] = ["enchant","glyph"];

/** Milliseconds of each moment (≤ 400), and the stagger of the strength flip. */
export const MOMENTS = {
  classArmor: 400,
  enchant: 360,
  expTick: 160,
  identify: 320,
  levelUp: 360,
  mastery: 400,
  newItem: 240,
  strength: 400,
  uncurse: 360,
  upgrade: 320
} as const;
export const MOTION = {max:400,hold:1200,stagger:40,pop:160,reveal:320} as const;

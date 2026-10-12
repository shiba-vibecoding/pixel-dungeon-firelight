import {
  adjacent, cellX, cellY, type Effect, type Enchantment, heroById, isAlive, itemDef, type ItemKind, itemSprite, LENGTH, type MobKind,
  WIDTH, type World,
  type Look,
} from '@pd/core';
import { audio } from './audio';
import { capitalize, t } from './i18n';
import { itemName } from './itemtext';
import { type AnimName, type Assets, type CharSprite, duration, heroSprite } from './sprites';
import { haptic } from './telegram';

/*
 * What the player sees, as opposed to what the world is: characters slide
 * between cells, play attack and death animations, flash when hit; numbers
 * float up; the message log fills. Everything here is cosmetic and local.
 */

export const STEP_MS = 110;
/**
 * How long after a step ends a walker still counts as walking: the next step
 * of a walk starts within a frame or two, and the legs should not stop for it.
 */
const WALK_GRACE_MS = 70;

/** Potions whose shattering does something; the rest splash harmlessly. */
const HARMFUL: ReadonlySet<ItemKind> = new Set([
  'potion.toxicGas', 'potion.paralyticGas', 'potion.liquidFlame', 'potion.frost', 'potion.purity',
]);

/** Colours of magic bolts in flight. */
const BOLT_COLORS: Record<string, string> = {
  magic: '120, 180, 255', lightning: '255, 255, 200', fire: '255, 130, 40', poison: '120, 220, 60', slow: '230, 220, 120',
  teleport: '170, 230, 255', blink: '255, 255, 255', beam: '200, 90, 255', rocks: '170, 160, 140', shadow: '90, 40, 120',
  amok: '255, 60, 150', reach: '230, 230, 230', flock: '255, 255, 255', regrowth: '120, 255, 120',
};

/** Tints of the clouds: green poison, yellow paralysis, orange flames. */
const BURST_COLORS = {
  toxic: '90, 200, 60', paralytic: '230, 220, 70', fire: '255, 120, 30', frost: '170, 220, 255', purity: '240, 250, 255',
} as const;

/** ItemSprite.Glowing: the colour each enchantment shines with. */
const ENCHANT_COLORS: Record<Enchantment, string> = {
  fire: '255, 68, 0', poison: '68, 0, 170', death: '40, 40, 40', paralysis: '255, 255, 68', leech: '170, 0, 40', slow: '0, 68, 255',
  shock: '255, 255, 255', instability: '255, 255, 255', horror: '90, 90, 90', luck: '0, 255, 0', tempering: '204, 136, 136',
};
export const TILE = 16;

/** The middle of a cell, world pixels. */
const cellMiddle = (cell: number): { x: number; y: number } => ({ x: cellX(cell) * TILE + TILE / 2, y: cellY(cell) * TILE + TILE / 2 });

export interface Puppet {
  id: string;
  /** Where the current step started, in world pixels: wherever the walker was, not the middle of a cell. */
  fromX?: number;
  fromY?: number;
  /** A hero's Pixel-Mart look (effect, the patron's star); undefined for monsters. */
  look?: Look;
  /** Hero class or monster kind. */
  kind: string;
  sprite: CharSprite;
  isHero: boolean;
  from: number;
  to: number;
  moveStart: number;
  flip: boolean;
  anim: AnimName;
  animStart: number;
  alive: boolean;
  /** Dying monsters linger until their death animation has played. */
  removeAt: number;
  flashUntil: number;
  alertUntil: number;
  sleeping: boolean;
  /** Goo, pumped up for a big hit. */
  pumped: boolean;
  /** A hero under a potion of invisibility. */
  invisible: boolean;
  /** Row of the sprite sheet: heroes are drawn in their armour's tier. */
  row: number;
  /** Shown above companions in a party. */
  label: string;
  hp: number;
  ht: number;
  /** A melee lunge: when it began, and how far towards the target (world pixels). */
  lungeStart?: number;
  lungeX?: number;
  lungeY?: number;
  /** Burning or poisoned: embers or bubbles rise off it. */
  burning?: boolean;
  poisoned?: boolean;
}

export interface Floater {
  text: string;
  color: string;
  /** World pixels. */
  x: number;
  y: number;
  start: number;
  /** Bigger for a heavy blow. */
  scale?: number;
  /** Drawn in its own colour even if it looks like a number (gold found). */
  word?: boolean;
}

export interface LogLine {
  text: string;
  color: string;
  time: number;
  /** The design system's tone for the colour: good, bad, warn, hl (highlight) or muted. */
  tone?: string;
  /** The depth it was said on, for the history's markers. */
  depth?: number;
  /** The same message in a row, shown as «×N». */
  count?: number;
}

/** Log colours of the original (GLog), as the design system's line tones. */
const TONES: Record<string, string> = {
  '#44ff44': 'good', '#ff4444': 'bad', '#ff8800': 'warn', '#ffff44': 'hl', '#cccccc': 'muted',
};

/** How many messages the history keeps. */
const HISTORY = 200;

export const COLORS = {
  default: '#ffffff',
  positive: '#44ff44',
  negative: '#ff4444',
  warning: '#ff8800',
  highlight: '#ffff44',
  neutral: '#cccccc',
};

export class View {
  readonly puppets = new Map<string, Puppet>();
  floaters: Floater[] = [];
  /** Cells lit up for a moment: discoveries and traps, or tinted clouds of gas and flame. */
  flashes: Array<{ cell: number; start: number; color?: string; duration?: number }> = [];
  log: LogLine[] = [];
  /** What each player wears (Pixel-Mart), by hero id: their look, effect and frame, and the patron's star. */
  looks: Record<string, Look> = {};
  depth = 0;
  /** When the "boss slain" banner appeared, or 0. */
  bannerStart = 0;
  /** A boss's title card: who, and when it appeared. */
  bossIntro: { kind: MobKind; start: number } | null = null;
  /** My level-up card: the new level, and when it appeared. */
  levelCard: { lvl: number; start: number } | null = null;
  /** A new region's card on the way down: the depth, and when it appeared. */
  depthCard: { depth: number; start: number } | null = null;
  /** Thrown items and magic bolts in flight; `sprite` null for a bolt. */
  projectiles: Array<{ from: number; to: number; start: number; duration: number; sprite: number | null; color?: string }> = [];

  constructor(private readonly assets: Assets) {}

  /** Starts over, e.g. after changing depth or receiving a new world. */
  reset(depth: number): void {
    this.depth = depth;
    this.puppets.clear();
    this.floaters = [];
    this.flashes = [];
    this.bannerStart = 0;
    this.bossIntro = null;
    this.levelCard = null;
    this.projectiles = [];
  }

  /** Coming into a region (or setting out): its card, over the band in the middle. */
  enterRegion(depth: number, now: number): void {
    this.depthCard = { depth, start: now };
  }

  /**
   * Adds a message to the log. Messages are stamped with real time whatever
   * `_now` says: the log fades by the wall clock, which hit-stop never slows.
   */
  say(text: string, color = COLORS.default, _now?: number): void {
    const now = performance.now();
    const last = this.log[this.log.length - 1];
    if (last && last.text === text && now - last.time < 8000) {
      last.count = (last.count ?? 1) + 1;
      last.time = now;
      return;
    }
    this.log.push({ text, color, time: now, tone: TONES[color.toLowerCase()], depth: this.depth || undefined });
    if (this.log.length > HISTORY) this.log.shift();
  }

  /**
   * Brings puppets in line with the world for the depth being shown. Call
   * after apply(), so monsters killed in this update can still play dead.
   */
  sync(world: World, now: number, myId = ''): void {
    const seen = new Set<string>();
    const place = (
      id: string, kind: string, sprite: CharSprite, isHero: boolean, pos: number, hp: number, ht: number, sleeping: boolean,
      pumped = false,
      invisible = false,
    ): void => {
      seen.add(id);
      let puppet = this.puppets.get(id);
      if (!puppet) {
        puppet = {
          id, kind, sprite, isHero, from: pos, to: pos, moveStart: 0, flip: false, anim: 'idle', animStart: now,
          alive: hp > 0, removeAt: Infinity, flashUntil: 0, alertUntil: 0, sleeping, pumped, invisible, row: 0, label: '',
          hp, ht,
        };
        if (!puppet.alive) {
          puppet.anim = 'die';
          puppet.animStart = -1e9;
        }
        this.puppets.set(id, puppet);
      } else if (puppet.to !== pos) {
        const at = this.cellOf(puppet, now);
        // The next step starts from where the walker is now, so a walk flows from cell to cell without a jolt.
        const here = this.position(puppet, now);
        if (cellX(pos) !== cellX(puppet.to)) puppet.flip = cellX(pos) < cellX(puppet.to);
        const walking = puppet.anim === 'run' && now - puppet.moveStart < STEP_MS + WALK_GRACE_MS;
        // The next step of a walk carries straight on from where the last one ended, as if it had
        // been sent that very moment: no standstill of a frame or two at every cell.
        const late = now - (puppet.moveStart + STEP_MS);
        const chained = walking && late >= 0 && late < STEP_MS / 2 && adjacent(pos, puppet.to);
        puppet.from = at;
        puppet.fromX = here.x;
        puppet.fromY = here.y;
        puppet.to = pos;
        puppet.moveStart = chained ? now - late : now;
        // Legs keep their stride along a walk; only a walk's first step starts the run anew.
        if (puppet.alive && puppet.anim !== 'attack' && !walking) {
          puppet.anim = 'run';
          puppet.animStart = now;
        }
      }
      puppet.hp = hp;
      puppet.ht = ht;
      puppet.sleeping = sleeping;
      puppet.pumped = pumped;
      puppet.invisible = invisible;
      if (hp > 0 && !puppet.alive) {
        // Revived.
        puppet.alive = true;
        puppet.anim = 'idle';
        puppet.animStart = now;
      }
    };

    for (const hero of world.heroes) {
      if (hero.depth === this.depth) {
        place(
          hero.id, hero.heroClass, this.assets.heroes[hero.heroClass], true, hero.pos, hero.hp, hero.ht, false, false,
          hero.invisible > 0,
        );
        const puppet = this.puppets.get(hero.id)!;
        // Pixel-Mart: the hero's look, once its sheet has loaded.
        puppet.sprite = heroSprite(this.assets, hero.heroClass, this.looks[hero.id]?.skin);
        puppet.look = this.looks[hero.id];
        puppet.burning = hero.burning > 0;
        puppet.poisoned = hero.poison > 0;
        puppet.row = itemDef(hero.armor.kind).tier ?? 0;
        puppet.label = hero.id === myId ? '' : hero.name;
      }
    }
    for (const mob of world.floors[this.depth]?.mobs ?? []) {
      // A mirror image looks like its hero, only fainter.
      const twin = mob.image && world.heroes.find((hero) => hero.id === mob.image!.owner);
      if (twin) {
        place(mob.id, 'mirror', this.assets.heroes[twin.heroClass], false, mob.pos, mob.hp, mob.ht, false, false, true);
        this.puppets.get(mob.id)!.sprite = heroSprite(this.assets, twin.heroClass, this.looks[twin.id]?.skin);
        this.puppets.get(mob.id)!.row = itemDef(twin.armor.kind).tier ?? 0;
        continue;
      }
      place(mob.id, mob.kind, this.assets.mobs[mob.kind], false, mob.pos, mob.hp, mob.ht,
        // A statue biding its time shows no sign of sleep.
        mob.state === 'sleeping' && mob.kind !== 'statue', mob.pumped);
      const puppet = this.puppets.get(mob.id)!;
      puppet.burning = (mob.burning ?? 0) > 0;
      puppet.poisoned = (mob.poison ?? 0) > 0;
    }
    for (const [id, puppet] of this.puppets) {
      if (!seen.has(id) && (puppet.alive || now >= puppet.removeAt)) this.puppets.delete(id);
    }

    // Finished one-off animations fall back to idle (or keep running while moving).
    for (const puppet of this.puppets.values()) {
      if (!puppet.alive) continue;
      const moving = now - puppet.moveStart < STEP_MS + WALK_GRACE_MS;
      if (puppet.anim === 'run' && !moving) {
        puppet.anim = 'idle';
        puppet.animStart = now;
      } else if (puppet.anim !== 'idle' && puppet.anim !== 'run' && now - puppet.animStart > duration(puppet.sprite.anims[puppet.anim])) {
        puppet.anim = moving ? 'run' : 'idle';
        puppet.animStart = now;
      }
    }
    this.floaters = this.floaters.filter((floater) => now - floater.start < 1200);
    this.flashes = this.flashes.filter((flash) => now - flash.start < (flash.duration ?? 600));
    this.projectiles = this.projectiles.filter((p) => now - p.start < p.duration);
  }

  private shoot(from: number, to: number, sprite: number | null, now: number, color?: string): void {
    const cells = Math.max(Math.abs(cellX(to) - cellX(from)), Math.abs(cellY(to) - cellY(from)));
    this.projectiles.push({ from, to, start: now, duration: Math.max(90, cells * 45), sprite, color });
  }

  /** Interpolated position in world pixels. */
  position(puppet: Puppet, now: number): { x: number; y: number } {
    const k = Math.min(1, Math.max(0, (now - puppet.moveStart) / STEP_MS));
    const fromX = puppet.fromX ?? cellX(puppet.from) * TILE;
    const fromY = puppet.fromY ?? cellY(puppet.from) * TILE;
    return {
      x: fromX + (cellX(puppet.to) * TILE - fromX) * k,
      y: fromY + (cellY(puppet.to) * TILE - fromY) * k,
    };
  }

  private cellOf(puppet: Puppet, now: number): number {
    return now - puppet.moveStart >= STEP_MS / 2 ? puppet.to : puppet.from;
  }

  /** A hero busy with their hands (drinking, reading, eating): the operate animation, as in the original. */
  private busy(id: string, now: number): void {
    const puppet = this.puppets.get(id);
    if (puppet?.alive && puppet.anim !== 'attack') {
      puppet.anim = 'operate';
      puppet.animStart = now;
    }
  }

  /** Where a character is, world pixels (its middle), for sounds that come from it. */
  private placeOf(id: string, now: number): { x: number; y: number } | undefined {
    const puppet = this.puppets.get(id);
    if (!puppet) return undefined;
    const { x, y } = this.position(puppet, now);
    return { x: x + TILE / 2, y: y + TILE / 2 };
  }

  private float(id: string, text: string, color: string, now: number, word = false): void {
    const puppet = this.puppets.get(id);
    if (!puppet) return;
    const { x, y } = this.position(puppet, now);
    // Stack texts that appear together over the same one so they stay readable (not over a neighbour).
    const stacked = this.floaters.filter((f) => now - f.start < 250 && Math.abs(f.x - x - TILE / 2) < 4 && y - f.y >= 0 && y - f.y < 15).length;
    this.floaters.push({ text, color, x: x + TILE / 2, y: y - stacked * 7, start: now, ...(word ? { word } : {}) });
  }

  private name(world: World, id: string): string {
    if (id.startsWith('#')) {
      const mob = world.floors[this.depth]?.mobs.find((m) => m.id === id);
      return mob ? t.mobs[mob.kind] : '';
    }
    return heroById(world, id)?.name ?? '';
  }

  apply(effects: readonly Effect[], world: World, myId: string, now: number): void {
    const searchedByMe = effects.some((e) => e.type === 'searched' && e.hero === myId);
    let discovered = false;
    // Traps announce their own gas and flames.
    let trapped = false;
    const mobKind = (depth: number, id: string, fallback: MobKind): MobKind =>
      world.floors[depth]?.mobs.find((mob) => mob.id === id)?.kind ?? fallback;
    for (const effect of effects) {
      switch (effect.type) {
        case 'attack': {
          if (effect.depth !== this.depth) break;
          const attacker = this.puppets.get(effect.attacker);
          const target = this.puppets.get(effect.target);
          if (attacker) {
            attacker.anim = 'attack';
            attacker.animStart = now;
            if (target && cellX(target.to) !== cellX(attacker.to)) attacker.flip = cellX(target.to) < cellX(attacker.to);
          }
          if (effect.hit) {
            if (target) target.flashUntil = now + 160;
            const toHero = !effect.target.startsWith('#');
            this.float(effect.target, String(effect.damage), toHero ? COLORS.negative : COLORS.warning, now);
            audio.play('hit', 0.8 + Math.random() * 0.45, 1, this.placeOf(effect.target, now));
            if (effect.target === myId) haptic('hurt');
            else if (effect.attacker === myId) haptic('hit');
          } else {
            this.float(effect.target, t.miss, COLORS.neutral, now);
            audio.play('miss', 1, 1, this.placeOf(effect.target, now));
          }
          break;
        }
        case 'died': {
          if (effect.depth === this.depth) {
            const puppet = this.puppets.get(effect.who);
            if (puppet) {
              puppet.alive = false;
              puppet.anim = 'die';
              puppet.animStart = now;
              puppet.removeAt = puppet.isHero ? Infinity : now + duration(puppet.sprite.anims.die) + 700;
            }
          }
          if (effect.who.startsWith('#')) {
            const kind = this.puppets.get(effect.who)?.kind as MobKind | undefined;
            if (kind && effect.depth === this.depth) this.say(t.killed(t.mobs[kind]), COLORS.neutral, now);
          } else {
            audio.play('death');
            if (effect.who !== myId) this.say(t.heroDied(this.name(world, effect.who)), COLORS.negative, now);
          }
          break;
        }
        case 'noticed': {
          if (effect.depth !== this.depth) break;
          const puppet = this.puppets.get(effect.mob);
          if (puppet) puppet.alertUntil = now + 1200;
          const mob = world.floors[this.depth]?.mobs.find((m) => m.id === effect.mob);
          if (mob?.enemy === myId) this.say(capitalize(t.noticed(t.mobs[mob.kind])), COLORS.warning, now);
          break;
        }
        case 'exp':
          this.float(effect.hero, `+${effect.amount} XP`, COLORS.positive, now);
          break;
        case 'levelUp':
          this.float(effect.hero, t.levelUpFloat, COLORS.highlight, now);
          if (effect.hero === myId) {
            this.say(t.myLevelUp(effect.lvl), COLORS.highlight, now);
            audio.play('levelup');
            audio.duck(0.3, 1600);
            haptic('success');
          } else {
            this.say(t.levelUp(this.name(world, effect.hero), effect.lvl), COLORS.highlight, now);
          }
          break;
        case 'discovered':
          if (effect.depth === this.depth) this.flashes.push({ cell: effect.cell, start: now });
          if (!discovered) {
            this.say(t.found, COLORS.highlight, now);
            audio.play('secret');
          }
          discovered = true;
          break;
        case 'searched': {
          const puppet = this.puppets.get(effect.hero);
          if (puppet?.alive) {
            puppet.anim = 'operate';
            puppet.animStart = now;
          }
          break;
        }
        case 'revived':
          this.say(t.revived(this.name(world, effect.hero)), COLORS.positive, now);
          break;
        case 'resurrected':
          // Up again at the stairs: no sliding across the map.
          this.puppets.delete(effect.hero);
          audio.play('levelup');
          this.say(effect.hero === myId ? t.resurrected : t.resurrectedCompanion(this.name(world, effect.hero)), COLORS.highlight, now);
          if (effect.hero === myId) haptic('success');
          break;
        case 'hurt':
          if (effect.depth === this.depth) this.float(effect.who, String(effect.damage), COLORS.negative, now);
          break;
        case 'oozed':
          if (effect.hero === myId) this.say(t.oozed, COLORS.negative, now);
          break;
        case 'pumped':
          if (effect.depth !== this.depth) break;
          this.float(effect.mob, '!!!', COLORS.negative, now);
          this.say(t.gooPumps, COLORS.negative, now);
          break;
        case 'yell': {
          if (effect.depth !== this.depth) break;
          const hero = heroById(world, effect.hero ?? myId);
          const notice = effect.line === 'notice';
          const line =
            effect.kind === 'goo' ? notice ? t.gooNotice : t.gooDeath
            : effect.kind === 'dm300' ? notice ? t.dm300Notice : t.dm300Death
            : effect.kind === 'yog' ? notice ? t.yogNotice : t.yogDeath
            : effect.kind === 'king'
              ? effect.line === 'summon' ? t.kingSummon : notice ? t.kingNotice : t.kingDeath(hero ? t.classes[hero.heroClass] : '')
            : notice ? t.tenguNotice(hero ? t.classes[hero.heroClass] : '') : t.tenguDeath;
          this.say(`${t.mobs[effect.kind]}: «${line}»`, COLORS.negative, now);
          break;
        }
        case 'bossSlain':
          this.bannerStart = now;
          this.say(t.bossSlain[effect.kind] ?? '', COLORS.highlight, now);
          audio.play('boss');
          audio.duck(0.25, 2500);
          haptic('success');
          break;
        case 'opened':
          audio.play('item', 0.8);
          break;
        case 'pickedUp': {
          // Whoever takes something stoops for it.
          const taker = this.puppets.get(effect.hero);
          if (taker?.alive && taker.anim !== 'attack') {
            taker.anim = 'operate';
            taker.animStart = now;
          }
          if (effect.item.kind === 'gold') this.float(effect.hero, `+${effect.item.qty}`, COLORS.highlight, now, true);
          if (effect.hero !== myId) break;
          if (effect.item.kind === 'gold') {
            this.say(t.youFoundGold(effect.item.qty), COLORS.highlight, now);
            audio.play('gold', 1, 0.8);
            audio.coins(effect.item.qty);
          } else {
            this.say(t.youPicked(itemName(world, effect.item)), COLORS.default, now);
            audio.play('item');
          }
          break;
        }
        case 'packFull':
          if (effect.hero === myId) this.say(t.packFull, COLORS.warning, now);
          break;
        case 'dropped':
          if (effect.hero === myId) audio.play('item', 0.7);
          break;
        case 'equipped':
          if (effect.hero === myId) this.say(t.equippedItem(itemName(world, effect.item)), COLORS.default, now);
          break;
        case 'used': {
          const potion = effect.kind.startsWith('potion.');
          audio.play(potion ? 'drink' : 'read', 1, 1, this.placeOf(effect.hero, now));
          this.busy(effect.hero, now);
          if (effect.identified) this.say(t.itWas(t.items[effect.kind]), COLORS.highlight, now);
          if (effect.hero === myId && effect.kind === 'potion.levitation') this.say(t.floating, COLORS.default, now);
          if (effect.hero === myId && effect.kind === 'potion.purity') this.say(t.noSmell, COLORS.default, now);
          break;
        }
        case 'identified':
          if (effect.hero === myId) this.say(t.identifiedAs(t.items[effect.kind]), COLORS.highlight, now);
          break;
        case 'healed':
          if (effect.amount > 0) this.float(effect.hero, `+${effect.amount}`, COLORS.positive, now);
          break;
        case 'strength':
          this.float(effect.hero, `+1 ${t.strShort}`, COLORS.positive, now);
          if (effect.hero === myId) this.say(t.stronger, COLORS.positive, now);
          break;
        case 'upgraded':
          if (effect.hero === myId) this.say(t.upgradedItem(itemName(world, effect.item)), COLORS.highlight, now);
          break;
        case 'worn':
          // Item.use: the bearer hears of it, if they know the item's level; breaking is loud.
          if (effect.hero !== myId) break;
          if (effect.state === 'warning') {
            this.say(t.goingToBreak(itemName(world, { ...effect.item, durability: undefined })), COLORS.warning, now);
          } else {
            this.say(t.hasBroken(itemName(world, { ...effect.item, durability: undefined })), COLORS.negative, now);
            audio.play('degrade');
            haptic('error');
          }
          break;
        case 'mended':
          if (effect.hero === myId) this.say(t.mended(itemName(world, effect.item)), COLORS.positive, now);
          break;
        case 'teleported':
          // Appear at once in the new place rather than sliding across the map.
          this.puppets.delete(effect.hero);
          audio.play('teleport');
          if (effect.hero === myId) this.say(t.teleported, COLORS.default, now);
          break;
        case 'mapped':
          if (effect.hero === myId) this.say(t.mapped, COLORS.highlight, now);
          break;
        case 'scroll':
          if (effect.kind === 'removeCurse') {
            if (effect.hero === myId) this.say(effect.count > 0 ? t.uncursed : t.nothingCursed, COLORS.default, now);
          } else if (effect.kind === 'recharging') {
            if (effect.hero === myId) this.say(effect.count > 0 ? t.recharged : t.nothingToRecharge, COLORS.default, now);
          } else if (effect.kind === 'psionic') {
            audio.play('blast');
            if (effect.hero === myId) this.say(t.psionic, COLORS.warning, now);
          } else {
            this.say(effect.kind === 'challenge' ? t.challenge : effect.kind === 'terror' ? t.terror : t.lullaby, COLORS.warning, now);
          }
          break;
        case 'enchanted':
          // The weapon's glow flares up on whoever it struck.
          if (effect.depth === this.depth) {
            this.flashes.push({ cell: effect.pos, start: now, color: ENCHANT_COLORS[effect.enchant], duration: 500 });
          }
          break;
        case 'glyph':
          if (effect.depth === this.depth) this.float(effect.hero, t.glyphShort[effect.glyph], COLORS.highlight, now);
          break;
        case 'pushed':
          break;
        case 'imbued':
          if (effect.hero === myId) this.say(t.imbued(itemName(world, effect.item)), COLORS.highlight, now);
          audio.play('evoke');
          break;
        case 'disenchanted':
          if (effect.hero === myId) this.say(t.disenchanted(itemName(world, effect.item)), COLORS.warning, now);
          break;
        case 'fell':
          if (effect.hero !== myId && effect.depth === this.depth) {
            this.puppets.delete(effect.hero);
            this.say(t.fellCompanion(this.name(world, effect.hero)), COLORS.warning, now);
          }
          break;
        case 'shattered':
          audio.play('shatter');
          if (effect.identified) this.say(t.itWas(t.items[effect.kind]), COLORS.highlight, now);
          else if (effect.hero === myId && !HARMFUL.has(effect.kind)) this.say(t.splashes, COLORS.default, now);
          break;
        case 'burst':
          if (effect.depth !== this.depth) break;
          for (let y = -effect.radius; y <= effect.radius; y++) {
            for (let x = -effect.radius; x <= effect.radius; x++) {
              const cell = effect.pos + x + y * WIDTH;
              if (cellX(effect.pos) + x >= 0 && cellX(effect.pos) + x < WIDTH && cell >= 0 && cell < LENGTH) {
                this.flashes.push({ cell, start: now, color: BURST_COLORS[effect.kind], duration: 1400 });
              }
            }
          }
          if (effect.kind === 'fire') audio.play('burning');
          if (!trapped && !effect.silent) this.say(t.bursts[effect.kind], COLORS.warning, now);
          break;
        case 'unlocked':
          audio.play('unlock');
          if (effect.hero === myId) this.say(t.unlocked, COLORS.default, now);
          break;
        case 'well':
          audio.play('drink');
          if (effect.hero === myId) {
            this.say(
            effect.water === 'health' ? t.wellHealth : effect.water === 'awareness' ? t.wellAwareness : t.wellTransmutation,
            COLORS.positive, now,
          );
            haptic('success');
          }
          break;
        case 'thrown':
          if (effect.depth === this.depth) {
            this.shoot(effect.from, effect.to, itemSprite({ kind: effect.item, qty: 1, level: 0 }, world.run.labels), now);
          }
          break;
        case 'zapped':
          if (effect.depth === this.depth) this.shoot(effect.from, effect.to, null, now, BOLT_COLORS[effect.bolt ?? 'magic']);
          audio.play(effect.bolt === 'lightning' ? 'lightning' : 'zap', 1, 1, effect.depth === this.depth ? cellMiddle(effect.from) : undefined);
          break;
        case 'avalanche':
          if (effect.depth !== this.depth) break;
          for (const cell of effect.cells) this.flashes.push({ cell, start: now, color: '150, 140, 120', duration: 900 });
          audio.play('rocks');
          break;
        case 'disarmed':
          if (effect.hero === myId) {
            this.say(t.disarmed(t.mobs[mobKind(effect.depth, effect.mob, 'monk')], itemName(world, effect.item)), COLORS.negative, now);
          }
          break;
        case 'transmuted':
          audio.play('evoke');
          if (effect.hero === myId) this.say(t.transmuted(itemName(world, effect.from), itemName(world, effect.to)), COLORS.highlight, now);
          break;
        case 'classArmor':
          audio.play('evoke');
          if (effect.hero === myId) this.say(t.classArmorMade(itemName(world, effect.item)), COLORS.highlight, now);
          break;
        case 'special':
          audio.play(effect.ability === 'smokeBomb' ? 'puff' : effect.ability === 'moltenEarth' ? 'burning' : effect.ability === 'leap' ? 'rocks' : 'miss');
          if (effect.ability === 'smokeBomb') {
            this.flashes.push({ cell: effect.from, start: now, color: '200, 200, 200', duration: 600 });
            this.puppets.delete(effect.hero);
          }
          if (effect.hero === myId) this.say(t.specialUsed[effect.ability]!, COLORS.highlight, now);
          break;
        case 'mined':
          if (effect.depth !== this.depth) break;
          this.flashes.push({ cell: effect.pos, start: now, color: '255, 210, 90', duration: 500 });
          audio.play('rocks', 1.3, 0.5, cellMiddle(effect.pos));
          break;
        case 'smith':
          break;
        case 'mirrored':
          if (effect.depth !== this.depth) break;
          for (const cell of effect.cells) this.flashes.push({ cell, start: now, color: '200, 220, 255', duration: 500 });
          audio.play('teleport', 1.2, 0.6);
          if (effect.hero === myId) this.say(t.mirrored(effect.cells.length), COLORS.default, now);
          break;
        case 'flock':
          if (effect.depth !== this.depth) break;
          for (const cell of effect.cells) this.flashes.push({ cell, start: now, color: '255, 255, 255', duration: 500 });
          audio.play('puff');
          break;
        case 'faded':
          if (effect.depth !== this.depth) break;
          this.puppets.delete(effect.mob);
          this.flashes.push({ cell: effect.pos, start: now, color: '255, 255, 255', duration: 500 });
          break;
        case 'baa':
          if (effect.depth === this.depth) this.float(effect.mob, t.baa[Math.floor(Math.random() * t.baa.length)]!, COLORS.default, now);
          break;
        case 'missile':
          if (effect.depth === this.depth) this.shoot(effect.from, effect.to, effect.sprite, now);
          audio.play('miss', 1.4, 0.6);
          break;
        case 'jumped':
          // Gone in a puff of smoke, and there at once in the new place.
          if (effect.depth !== this.depth) break;
          this.puppets.delete(effect.mob);
          this.flashes.push({ cell: effect.from, start: now, color: '220, 220, 220', duration: 500 });
          this.flashes.push({ cell: effect.to, start: now, color: '220, 220, 220', duration: 500 });
          audio.play('puff');
          break;
        case 'stole':
          if (effect.hero === myId) this.say(t.stole(t.mobs[mobKind(effect.depth, effect.mob, 'thief')], itemName(world, effect.item)), COLORS.warning, now);
          else if (effect.depth === this.depth) this.say(t.robbed(this.name(world, effect.hero)), COLORS.warning, now);
          break;
        case 'cornered':
          if (effect.depth === this.depth) this.say(t.cornered(t.mobs[effect.kind]), COLORS.warning, now);
          break;
        case 'enraged':
          if (effect.depth !== this.depth) break;
          this.float(effect.mob, '!!!', COLORS.negative, now);
          this.say(t.enraged(t.mobs[mobKind(effect.depth, effect.mob, 'brute')]), COLORS.warning, now);
          break;
        case 'bones':
          if (effect.depth !== this.depth) break;
          audio.play('bones', 1, 1, cellMiddle(effect.pos));
          this.flashes.push({ cell: effect.pos, start: now, color: '230, 225, 200', duration: 700 });
          break;
        case 'bought':
        case 'sold':
          if (effect.hero !== myId) break;
          audio.play('gold');
          this.say(
            (effect.type === 'bought' ? t.bought : t.sold)(itemName(world, effect.item), effect.price),
            COLORS.highlight, now,
          );
          break;
        case 'shopkeeperFled':
          if (effect.depth !== this.depth) break;
          this.puppets.delete(effect.mob);
          this.flashes.push({ cell: effect.pos, start: now, color: '220, 220, 220', duration: 600 });
          audio.play('puff');
          this.say(t.shopkeeperFled, COLORS.warning, now);
          break;
        case 'shop':
          break;
        case 'arena':
          if (effect.depth === this.depth && effect.sealed) {
            this.say(effect.depth === 15 ? t.lairSealed : t.arenaSealed, COLORS.warning, now);
            audio.play(effect.depth === 15 ? 'rocks' : 'door_open', 0.7);
          }
          break;
        case 'weakened':
          if (effect.hero === myId) this.say(t.weakened, COLORS.negative, now);
          break;
        case 'plantTriggered':
          if (effect.depth !== this.depth) break;
          this.flashes.push({ cell: effect.pos, start: now, color: '120, 220, 120', duration: 700 });
          if (effect.who === myId) this.say(t.plants[effect.kind], COLORS.warning, now);
          break;
        case 'planted':
          break;
        case 'combo':
          if (effect.hero === myId) this.float(effect.hero, t.combo(effect.count), COLORS.highlight, now);
          break;
        case 'mastered':
          if (effect.hero === myId) {
            this.say(t.mastered(t.subclasses[effect.subclass]), COLORS.highlight, now);
            audio.play('levelup');
          }
          break;
        case 'brewed':
          if (effect.depth !== this.depth) break;
          audio.play('puff');
          this.flashes.push({ cell: effect.pos, start: now, color: '255, 255, 255', duration: 700 });
          this.say(t.brewed, COLORS.highlight, now);
          break;
        case 'mimic':
          if (effect.depth !== this.depth) break;
          this.say(t.isMimic, COLORS.negative, now);
          audio.play('alert');
          if (effect.hero === myId) haptic('hurt');
          break;
        case 'charmed':
          if (effect.hero === myId) this.say(t.charmed, COLORS.negative, now);
          break;
        case 'crippled':
          if (effect.hero === myId) this.say(t.crippled, COLORS.negative, now);
          break;
        case 'lit':
          audio.play('burning', 1.4, 0.5);
          if (effect.hero === myId) this.say(t.lit, COLORS.default, now);
          break;
        case 'repaired':
          if (effect.depth !== this.depth) break;
          this.float(effect.mob, '+', COLORS.positive, now);
          this.say(t.repaired, COLORS.negative, now);
          break;
        case 'trap':
          trapped = true;
          if (effect.depth === this.depth) this.flashes.push({ cell: effect.pos, start: now });
          audio.play(effect.kind === 'lightning' ? 'lightning' : effect.kind === 'fire' ? 'burning' : 'trap');
          if (effect.hero === myId) {
            this.say(t.plateClicks, COLORS.warning, now);
            this.say(t.traps[effect.kind], COLORS.negative, now);
            haptic('hurt');
          } else if (effect.depth === this.depth) {
            this.say(t.companionTrap(this.name(world, effect.hero)), COLORS.warning, now);
          }
          break;
        case 'ate':
          audio.play('eat', 1, 1, this.placeOf(effect.hero, now));
          this.busy(effect.hero, now);
          if (effect.hero === myId) {
            this.say(effect.kind === 'food.meat' ? t.ateMeat : effect.kind === 'food.overpriced' ? t.ateOk : t.ateFood, COLORS.default, now);
            // Mystery meat's surprises are bad ones; frozen carpaccio's are good.
            if (effect.outcome) this.say(t.meat[effect.outcome], effect.kind === 'food.meat' ? COLORS.warning : COLORS.positive, now);
          }
          break;
        case 'hunger':
          if (effect.hero === myId) {
            this.say(effect.state === 'hungry' ? t.hungry : t.starving, effect.state === 'hungry' ? COLORS.warning : COLORS.negative, now);
            if (effect.state === 'starving') haptic('error');
          }
          break;
        case 'dew':
          audio.play('dewdrop');
          if (effect.amount > 0) this.float(effect.hero, `+${effect.amount}`, COLORS.positive, now);
          break;
        case 'burnt':
        case 'heapBurnt':
          if (effect.depth === this.depth) this.flashes.push({ cell: effect.pos, start: now });
          break;
        case 'burntUp':
          if (effect.hero === myId) this.say(t.burntUp(itemName(world, { kind: effect.kind, qty: 1, level: 0 })), COLORS.warning, now);
          break;
        case 'exploded':
          if (effect.depth === this.depth) {
            audio.play('blast', 1, 1, cellMiddle(effect.pos));
            this.flashes.push({ cell: effect.pos, start: now, duration: 400 });
          }
          break;
        case 'dewCollected':
          audio.play('dewdrop');
          if (effect.hero === myId) this.say(effect.full ? t.vialFull : t.dewCollected, effect.full ? COLORS.positive : COLORS.default, now);
          break;
        case 'vial':
          audio.play('drink');
          if (effect.amount > 0) this.float(effect.hero, `+${effect.amount}`, COLORS.positive, now);
          break;
        case 'vialSaved':
          if (effect.hero === myId) this.say(t.vialSaved, COLORS.warning, now);
          break;
        case 'greeting':
          if (effect.depth === this.depth) this.say(`${t.mobs.impShopkeeper}: «${t.impGreeting}»`, COLORS.default, now);
          break;
        case 'marked':
          if (effect.depth === this.depth) {
            audio.play('burning');
            this.float(effect.who, t.marked, COLORS.warning, now);
          }
          break;
        case 'sacrifice':
          if (effect.depth === this.depth) {
            this.say(t.sacrifice[effect.outcome], effect.outcome === 'reward' ? COLORS.highlight : COLORS.warning, now);
            this.flashes.push({ cell: effect.pos, start: now, color: '102, 255, 255', duration: 900 });
          }
          break;
        case 'wipedOut':
          if (effect.depth === this.depth) {
            audio.play('cursed');
            this.say(t.wipedOut, COLORS.negative, now);
          }
          break;
        case 'bee':
          if (effect.depth === this.depth) {
            audio.play('shatter');
            audio.play('bee');
          }
          break;
        case 'wraiths':
          audio.play('cursed');
          if (effect.depth === this.depth) {
            this.flashes.push({ cell: effect.pos, start: now, duration: 500 });
            this.say(t.wraiths, COLORS.negative, now);
          }
          break;
        case 'cursed':
          audio.play('ghost');
          if (effect.depth === this.depth) this.say(t.cursed, COLORS.negative, now);
          break;
        case 'beacon':
          audio.play(effect.mode === 'set' ? 'beacon' : 'teleport');
          if (effect.hero === myId && effect.mode === 'set') this.say(t.beaconDone, COLORS.default, now);
          break;
        case 'balanced':
          audio.play('miss');
          if (effect.hero === myId && effect.item.imbue) this.say(t.balanced[effect.item.imbue], COLORS.positive, now);
          break;
        case 'interrupted': {
          // Only the reasons worth telling: a refused move into a wall says nothing.
          const why = t.reasons[effect.reason];
          if (effect.hero === myId && why) this.say(why, COLORS.warning, now);
          break;
        }
        case 'cursedEquip':
          if (effect.hero === myId) this.say(t.cursedEquip(itemName(world, effect.item)), COLORS.negative, now);
          break;
        case 'victory':
          break;
      }
    }
    if (searchedByMe && !discovered) this.say(t.nothingFound, COLORS.neutral, now);
    const me = heroById(world, myId);
    if (me && !isAlive(me) && effects.some((e) => e.type === 'died' && e.who === myId)) haptic('error');
  }
}

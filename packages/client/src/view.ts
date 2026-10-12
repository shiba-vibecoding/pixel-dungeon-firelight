import { cellX, cellY, type Effect, heroById, isAlive, type MobKind, type World } from '@pd/core';
import { audio } from './audio';
import { capitalize, t } from './i18n';
import { itemName } from './itemtext';
import { type AnimName, type Assets, type CharSprite, duration } from './sprites';
import { haptic } from './telegram';

/*
 * What the player sees, as opposed to what the world is: characters slide
 * between cells, play attack and death animations, flash when hit; numbers
 * float up; the message log fills. Everything here is cosmetic and local.
 */

export const STEP_MS = 110;
export const TILE = 16;

export interface Puppet {
  id: string;
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
  hp: number;
  ht: number;
}

export interface Floater {
  text: string;
  color: string;
  /** World pixels. */
  x: number;
  y: number;
  start: number;
}

export interface LogLine {
  text: string;
  color: string;
  time: number;
}

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
  flashes: Array<{ cell: number; start: number }> = [];
  log: LogLine[] = [];
  depth = 0;
  /** When the "boss slain" banner appeared, or 0. */
  bannerStart = 0;

  constructor(private readonly assets: Assets) {}

  /** Starts over, e.g. after changing depth or receiving a new world. */
  reset(depth: number): void {
    this.depth = depth;
    this.puppets.clear();
    this.floaters = [];
    this.flashes = [];
    this.bannerStart = 0;
  }

  say(text: string, color = COLORS.default, now = performance.now()): void {
    this.log.push({ text, color, time: now });
    if (this.log.length > 8) this.log.shift();
  }

  /**
   * Brings puppets in line with the world for the depth being shown. Call
   * after apply(), so monsters killed in this update can still play dead.
   */
  sync(world: World, now: number): void {
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
          alive: hp > 0, removeAt: Infinity, flashUntil: 0, alertUntil: 0, sleeping, pumped, invisible, hp, ht,
        };
        if (!puppet.alive) {
          puppet.anim = 'die';
          puppet.animStart = -1e9;
        }
        this.puppets.set(id, puppet);
      } else if (puppet.to !== pos) {
        const at = this.cellOf(puppet, now);
        if (cellX(pos) !== cellX(puppet.to)) puppet.flip = cellX(pos) < cellX(puppet.to);
        puppet.from = at;
        puppet.to = pos;
        puppet.moveStart = now;
        if (puppet.alive && puppet.anim !== 'attack') {
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
      }
    }
    for (const mob of world.floors[this.depth]?.mobs ?? []) {
      place(mob.id, mob.kind, this.assets.mobs[mob.kind], false, mob.pos, mob.hp, mob.ht, mob.state === 'sleeping', mob.pumped);
    }
    for (const [id, puppet] of this.puppets) {
      if (!seen.has(id) && (puppet.alive || now >= puppet.removeAt)) this.puppets.delete(id);
    }

    // Finished one-off animations fall back to idle (or keep running while moving).
    for (const puppet of this.puppets.values()) {
      if (!puppet.alive) continue;
      const moving = now - puppet.moveStart < STEP_MS;
      if (puppet.anim === 'run' && !moving) {
        puppet.anim = 'idle';
        puppet.animStart = now;
      } else if (puppet.anim !== 'idle' && puppet.anim !== 'run' && now - puppet.animStart > duration(puppet.sprite.anims[puppet.anim])) {
        puppet.anim = moving ? 'run' : 'idle';
        puppet.animStart = now;
      }
    }
    this.floaters = this.floaters.filter((floater) => now - floater.start < 1200);
    this.flashes = this.flashes.filter((flash) => now - flash.start < 600);
  }

  /** Interpolated position in world pixels. */
  position(puppet: Puppet, now: number): { x: number; y: number } {
    const k = Math.min(1, Math.max(0, (now - puppet.moveStart) / STEP_MS));
    return {
      x: (cellX(puppet.from) + (cellX(puppet.to) - cellX(puppet.from)) * k) * TILE,
      y: (cellY(puppet.from) + (cellY(puppet.to) - cellY(puppet.from)) * k) * TILE,
    };
  }

  private cellOf(puppet: Puppet, now: number): number {
    return now - puppet.moveStart >= STEP_MS / 2 ? puppet.to : puppet.from;
  }

  private float(id: string, text: string, color: string, now: number): void {
    const puppet = this.puppets.get(id);
    if (!puppet) return;
    const { x, y } = this.position(puppet, now);
    // Stack texts that appear together so they stay readable.
    const stacked = this.floaters.filter((f) => now - f.start < 250 && Math.abs(f.x - x) < 4).length;
    this.floaters.push({ text, color, x: x + TILE / 2, y: y - stacked * 7, start: now });
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
            audio.play('hit', 0.8 + Math.random() * 0.45);
            if (effect.target === myId) haptic('hurt');
            else if (effect.attacker === myId) haptic('hit');
          } else {
            this.float(effect.target, t.miss, COLORS.neutral, now);
            audio.play('miss');
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
        case 'yell':
          if (effect.depth === this.depth) {
            this.say(`${t.mobs.goo}: «${effect.line === 'notice' ? t.gooNotice : t.gooDeath}»`, COLORS.negative, now);
          }
          break;
        case 'bossSlain':
          this.bannerStart = now;
          this.say(t.bossSlain, COLORS.highlight, now);
          audio.play('boss');
          haptic('success');
          break;
        case 'opened':
          audio.play('item', 0.8);
          break;
        case 'pickedUp':
          if (effect.hero !== myId) break;
          if (effect.item.kind === 'gold') {
            this.say(t.youFoundGold(effect.item.qty), COLORS.highlight, now);
            audio.play('gold', 0.9 + Math.random() * 0.2);
          } else {
            this.say(t.youPicked(itemName(world, effect.item)), COLORS.default, now);
            audio.play('item');
          }
          break;
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
          audio.play(potion ? 'drink' : 'read');
          if (effect.identified) this.say(t.itWas(t.items[effect.kind]), COLORS.highlight, now);
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
          this.say(effect.kind === 'challenge' ? t.challenge : t.lullaby, COLORS.warning, now);
          break;
        case 'interrupted':
        case 'victory':
          break;
      }
    }
    if (searchedByMe && !discovered) this.say(t.nothingFound, COLORS.neutral, now);
    const me = heroById(world, myId);
    if (me && !isAlive(me) && effects.some((e) => e.type === 'died' && e.who === myId)) haptic('error');
  }
}

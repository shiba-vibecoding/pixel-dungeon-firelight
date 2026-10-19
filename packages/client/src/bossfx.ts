import { type Effect, F, heroById, type Level, type Mob, T, terrainFlags, WIDTH, type World } from '@pd/core';
import { audio } from './audio';
import { type BarBoss, BossBar, HpGhost } from './bossbar';
import { REPAIR_MS } from './bosslook';
import { bossLine, BOSS_KINDS, type BossKind, type BossMoment } from './bosslines';
import {
  type BodyLook, type BodyState, bossIntensity, calmPush, damageStage, DM_BLAST_MS, GLARE_MS, lookOf, newLook, POP_MS, type Push, pushEnvelope,
} from './bosslook';
import * as emit from './bossemit';
import { fx } from './fx';
import { fxp, type PlayOpts } from './fxplayer';
import { fxState } from './fxsheet';
import { squashMs, stageAt, type Staging, stagingOf } from './bossdata';
import { gore, poolSplat } from './gore';
import { lang, t } from './i18n';
import { quality } from './quality';
import { quipMode } from './quips';
import { bossVfx } from './r3d/bossvfx3d';
import { FEET_PX } from './r3d/project';
import { seenCells } from './sight';
import { COLORS, type Puppet, TILE, type View } from './view';

/*
 * The five boss fights made to look like fights (the rules are the core's and are not touched; this reads what the core says happened and
 * what the boss's health is, and shows it): a bar at the top with the boss's name and a ghost of the health just lost; a line or two from
 * the boss at the start, at half health and at the end; the body's jiggle, tint and wounds (bosslook.ts, bossdmg.ts); smoke, sparks,
 * steam, dust, rings and streaks in the 3D scene (bossemit.ts, r3d/bossvfx3d.ts); a slow push of the camera and a red pulse for the
 * finale; the throne room's light; the white-out and the Amulet; the music's intensity. All of it is a picture drawn over the same
 * events, so it can never change a run, and the effects module's shake and the quality setting govern it (no shake and a short, small
 * zoom in reduced motion, a third of the particles on the light effects).
 *
 * How it is driven: `effect` is called for each effect the core sends (fx-events.ts); `frame` once a frame (main.ts) reads the bosses'
 * health from the world and does what is due; `camera` bends the view; `place` puts the boss's bubble where its head is. The world3d
 * scene asks `lookFor` how to draw a body and `accentFor` how to light the arena.
 */

const BOSS_SET: ReadonlySet<string> = new Set(BOSS_KINDS);
/** Bodies that come up out of the floor when they appear in a fight. */
const RISERS: ReadonlySet<string> = new Set(['undead', 'rottingFist', 'burningFist']);
/** ItemSpriteSheet.SHURIKEN (the core's missile of Tengu). */
const SHURIKEN = 15;

interface Fight {
  id: string;
  kind: BossKind;
  depth: number;
  hp: number;
  ht: number;
  ghost: HpGhost;
  /** The lines at half and at a quarter have been said. */
  half: boolean;
  quarter: boolean;
  /** The boss has fallen. */
  fell: boolean;
  /** The next ambient moments (sparks, smoke, dust, steam, glare), ms. */
  nextSpark: number;
  nextSmoke: number;
  nextDust: number;
  nextSteam: number;
  nextGlare: number;
  rageSeen: boolean;
  /** The machine's loop now (an index of the staging's stages, -1 for none) and how often the old god's eye has glinted. */
  loop: number;
  glints: number;
}

/** What is waiting to be said, and what is on screen. */
interface Line {
  kind: BossKind;
  id: string;
  text: string;
  at: number;
  last: boolean;
}

/** The hero's head on the interface layer, and the layer's size (both in its own units): where a bubble stands. */
export interface BubbleAnchor {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the director writes in the language of the page. */
const TEXT = {
  en: {
    mending: (n: number) => (n > 0 ? `REPAIR +${n}` : 'REPAIR'),
    enraged: 'ENRAGED',
    amulet: 'The Amulet of Yendor',
    amuletSub: 'It waits below, where the way is now open.',
  },
  ru: {
    mending: (n: number) => (n > 0 ? `РЕМОНТ +${n}` : 'РЕМОНТ'),
    enraged: 'В ЯРОСТИ',
    amulet: 'Амулет Йендора',
    amuletSub: 'Он ждёт внизу, куда путь теперь открыт.',
  },
}[lang === 'ru' ? 'ru' : 'en'];

/** How long a loop of the designer's art plays before it is put again, ms. */
const LOOP_MS = 1800;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

class BossFx {
  private view: View | null = null;
  private world: World | null = null;
  private depth = -1;
  private readonly fights = new Map<string, Fight>();
  private readonly states = new Map<string, BodyState>();
  private readonly look = newLook();
  private readonly timers: Array<{ at: number; run: () => void }> = [];
  private readonly pushes: Array<{ push: Push; id: string }> = [];
  private primary = '';
  private smoothed = 0;
  private bar: BossBar | null = null;
  private host: HTMLElement | null = null;
  /** The finale's effects on the page: the red pulse, the white veil, the Amulet. */
  private pulseEl: HTMLElement | null = null;
  private veilEl: HTMLElement | null = null;
  private amuletEl: HTMLElement | null = null;
  /** The boss's bubble and what waits to be said. */
  private bubble: HTMLElement | null = null;
  private bubbleBody: HTMLElement | null = null;
  private bubbleWho: HTMLElement | null = null;
  private queue: Line[] = [];
  private shown: { line: Line; at: number; hold: number } | null = null;
  private lastFrame = 0;
  private lastLines: string[] = [];
  /** A summoning, a fists' entrance, a blink: which new bodies belong to it. */
  private summonAt = -1e9;
  private fistsAt = -1e9;
  private fistsDone = 0;
  /** The throne room's light: when the king appeared and when he fell. */
  private throne = { start: -1e9, fall: -1e9, armed: false };
  /** Where the focused boss stands (world pixels, the centre of its cell), for the camera. */
  private focus = { x: 0, y: 0, ok: false };
  private lastRepairHp = new Map<string, number>();
  private pendingRepair = new Map<string, number>();
  /** What was said last, for the dev console and the tests of the page. */
  lastLine = '';

  // ---- the designer's art ---------------------------------------------------------------------------------------------------

  private stagingFor: unknown = undefined;
  private stagingNow: Staging = stagingOf(null);

  /** The staging of fx.json (bossdata.ts), with the file's own numbers once it has come. */
  private get staging(): Staging {
    const lib = fxState()?.lib ?? null;
    if (lib !== this.stagingFor) {
      this.stagingFor = lib;
      this.stagingNow = stagingOf(lib);
    }
    return this.stagingNow;
  }

  /**
   * Plays one of the designer's effects (part 13) at a place in cells; false if the data (or that sheet) is not there, and the caller
   * then makes the older look itself. So nothing is drawn twice: what the designer's art does, the particles leave out.
   */
  private art(id: string, x: number, z: number, now: number, o: PlayOpts = {}): boolean {
    return fxp.ready && fxp.has(id) && fxp.playAt(id, x, z, now, o);
  }

  // ---- the page -------------------------------------------------------------------------------------------------------------

  private ensureDom(): boolean {
    if (this.host) return true;
    const host = typeof document === 'undefined' ? null : document.getElementById('ui');
    if (!host) return false;
    this.host = host;
    this.bar = new BossBar(host);
    this.pulseEl = document.createElement('div');
    this.pulseEl.className = 'fl-boss-pulse';
    this.veilEl = document.createElement('div');
    this.veilEl.className = 'fl-boss-veil';
    this.veilEl.style.transition = 'none';
    host.append(this.pulseEl, this.veilEl);
    return true;
  }

  /** A red pulse over the edges of the screen, once; `soft` slower. Reduced motion has its own gentle one (the stylesheet). */
  private pulse(soft = false): void {
    const el = this.pulseEl;
    if (!el) return;
    el.classList.remove('beat', 'soft');
    void el.offsetWidth;
    el.classList.add('beat');
    if (soft) el.classList.add('soft');
  }

  // ---- what the core says ---------------------------------------------------------------------------------------------------

  /** An effect of the core, after the view has taken it in. */
  effect(e: Effect, view: View, world: World, myId: string, now: number): void {
    this.view = view;
    this.world = world;
    switch (e.type) {
      case 'yell': {
        if (e.depth !== view.depth || !BOSS_SET.has(e.kind)) return;
        const kind = e.kind as BossKind;
        const hero = heroById(world, e.hero ?? myId);
        const cls = hero ? t.classes[hero.heroClass] : '';
        if (e.line === 'notice') {
          this.begin(kind, e.mob, now, false);
          this.speak(kind, e.mob, 'notice', now, originalLine(kind, 'notice', cls));
        } else if (e.line === 'summon') {
          this.summonAt = now;
          this.enqueue({ kind, id: e.mob, text: t.kingSummon, at: now, last: false });
        } else {
          this.speak(kind, e.mob, 'death', now, originalLine(kind, 'death', cls), true);
        }
        return;
      }
      case 'attack': {
        if (e.depth !== view.depth) return;
        if (!e.hit) {
          this.missed(view, e.attacker, e.target, now);
          return;
        }
        const target = view.puppets.get(e.target);
        if (!target || !(BOSS_SET.has(target.kind) || RISERS.has(target.kind))) return;
        this.struck(target, e.damage, e.attacker, now);
        return;
      }
      case 'died': {
        if (e.depth !== view.depth) return;
        const puppet = view.puppets.get(e.who);
        const kind = puppet?.kind ?? e.kind;
        if (kind && BOSS_SET.has(kind)) this.died(kind as BossKind, e.who, puppet, e.pos, now);
        return;
      }
      case 'jumped': {
        if (e.depth !== view.depth) return;
        const from = cellOf(e.from);
        const to = cellOf(e.to);
        // The designer's smoke at both ends; the trail between them, and the sparks, are ours.
        const st = this.staging;
        const drawn = this.art(st.tenguJump, from.x, from.z, now) && this.art(st.tenguJump, to.x, to.z, now + 60);
        emit.blinkSmoke(from.x, from.z, to.x, to.z, !drawn);
        const state = this.stateOf(e.mob, 'tengu');
        state.riseAt = now;
        state.riseMs = 340;
        audio.play('puff', 0.8, 0.5);
        return;
      }
      case 'missile': {
        if (e.depth !== view.depth || e.sprite !== SHURIKEN) return;
        const from = cellOf(e.from);
        const to = cellOf(e.to);
        const cells = Math.max(Math.abs(e.from % WIDTH - (e.to % WIDTH)), Math.abs(Math.trunc(e.from / WIDTH) - Math.trunc(e.to / WIDTH)));
        const dur = Math.max(90, cells * 45);
        bossVfx.streak(from.x, from.z, to.x, to.z, 0.55, now, dur, '#dfe8ff', 2.2, 0.09);
        bossVfx.streak(from.x, from.z + 0.04, to.x, to.z + 0.04, 0.5, now + 12, dur, '#9fb4ff', 1.4, 0.05);
        // The blade's landing: a handful of sparks.
        this.later(now + dur, () => emit.sparks(to.x, 0.5, to.z, 6));
        return;
      }
      case 'repaired': {
        if (e.depth !== view.depth) return;
        this.repaired(e.mob, now);
        return;
      }
      case 'arena': {
        // The way back closing on DM-300's lair: the rock falls.
        if (e.depth === view.depth && e.sealed && e.depth === 15) {
          const me = heroById(world, myId);
          if (me) {
            const c = cellOf(me.pos);
            emit.fallingDust(c.x, c.z, 5, 22, 8);
          }
        }
        return;
      }
      case 'hurt': {
        // Hurt by no one's blow (fire, poison, the ooze): the slime splashes all the same (fx.json's moment `hurt.goo`).
        if (e.depth !== view.depth) return;
        const puppet = view.puppets.get(e.who);
        if (puppet?.kind !== 'goo') return;
        const center = this.cellCenter(puppet, now);
        if (center) this.art(this.staging.gooHit, center.x, center.z, now);
        this.stateOf(puppet.id, 'goo').hitAt = now;
        return;
      }
      case 'pumped':
        return;
      default:
    }
  }

  /** A boss takes the stage: the bar, the first line, what the arena does for it. */
  private begin(kind: BossKind, id: string, now: number, quiet: boolean): Fight {
    const known = this.fights.get(id);
    if (known) return known;
    const world = this.world!;
    const view = this.view!;
    const mob = mobOf(world, view.depth, id);
    const fight: Fight = {
      id, kind, depth: view.depth, hp: mob?.hp ?? 1, ht: mob?.ht ?? 1, ghost: new HpGhost(), half: (mob?.hp ?? 1) <= (mob?.ht ?? 1) / 2, quarter: false, fell: false,
      nextSpark: now + 800, nextSmoke: now + 600, nextDust: now + 1500, nextSteam: now + 2500, nextGlare: now + 3000, rageSeen: false, loop: -1, glints: 0,
    };
    fight.ghost.reset(fight.ht > 0 ? fight.hp / fight.ht : 1);
    this.fights.set(id, fight);
    this.stateOf(id, kind).frac = fight.ht > 0 ? fight.hp / fight.ht : 1;
    this.primary = id;
    if (this.ensureDom()) {
      const boss: BarBoss = { kind, name: t.mobs[kind] ?? kind, epithet: t.bossEpithets[kind] ?? '' };
      this.bar!.show(boss);
    }
    if (quiet) return fight;
    // (The throne room's light rises when the king is first seen: see `frame`.)
    if (kind === 'king') this.throne = { start: -1e9, fall: -1e9, armed: true };
    if (kind === 'yog') {
      this.fistsAt = now;
      this.fistsDone = 0;
      // The finale's camera: a slow push in on the old god while its card plays, held, then let go; and the first red pulse.
      this.pushFor(id, { at: now + 500, inMs: 2600, holdMs: 1300, outMs: 1800, amount: 0.2, slide: 0.55 });
      this.later(now + 650, () => this.pulse());
      this.later(now + 2100, () => this.pulse());
      audio.play('rumble', 0.7, 0.8);
    }
    if (kind === 'dm300') {
      // The lair's walls shake as the machine wakes.
      const where = this.puppetCell(id);
      if (where) this.later(now + 500, () => emit.fallingDust(where.x, where.z, 3.5, 20, 6));
      audio.play('rumble', 1, 0.5);
    }
    return fight;
  }

  /** The lines at a moment: the original's (already in the log) in the bubble, then one of ours (in the bubble and the log). */
  private speak(kind: BossKind, id: string, moment: BossMoment, now: number, original: string | null, last = false): void {
    const foul = quipMode.value === 'foul';
    const extra = bossLine(kind, moment, lang === 'ru' ? 'ru' : 'en', foul, Math.random(), this.lastLines);
    this.lastLines.push(extra);
    if (this.lastLines.length > 6) this.lastLines.shift();
    let at = now;
    if (original) {
      this.enqueue({ kind, id, text: original, at, last: false });
      at += 1900;
    }
    this.enqueue({ kind, id, text: extra, at, last });
    this.logLater(kind, extra, at);
  }

  private logLater(kind: BossKind, text: string, at: number): void {
    this.later(at, () => this.view?.say(`${t.mobs[kind]}: «${text}»`, COLORS.negative, at));
  }

  private enqueue(line: Line): void {
    this.queue.push(line);
    this.lastLine = line.text;
    if (this.queue.length > 6) this.queue.shift();
  }

  /** A blow that missed: Tengu's blade, thrown from afar, lies where it fell (the designer's mark, one of its rows, for twenty seconds). */
  private missed(view: View, attackerId: string, targetId: string, now: number): void {
    const attacker = view.puppets.get(attackerId);
    const target = view.puppets.get(targetId);
    if (!attacker || attacker.kind !== 'tengu' || !target) return;
    const a = view.positionInto(attacker, now, SCRATCH);
    const ax = a.x;
    const ay = a.y;
    const b = view.positionInto(target, now, SCRATCH2);
    // Close at hand it is a swing, not a throw.
    if (Math.hypot(b.x - ax, b.y - ay) < TILE * 1.6) return;
    const st = this.staging;
    const dist = Math.hypot(b.x - ax, b.y - ay) / TILE;
    const flight = Math.max(90, dist * 45);
    this.art(st.tenguMark, (b.x + TILE / 2) / TILE + rnd(-0.18, 0.18), (b.y + FEET_PX) / TILE + rnd(-0.1, 0.15), now + flight, { rowAdd: Math.floor(Math.random() * st.tenguMarkRows) });
  }

  /** A boss's body or its summoned one is struck. */
  private struck(target: Puppet, damage: number, attackerId: string, now: number): void {
    const state = this.stateOf(target.id, target.kind);
    state.hitAt = now;
    const view = this.view!;
    const attacker = view.puppets.get(attackerId);
    const at = view.positionInto(target, now, SCRATCH);
    const x = (at.x + TILE / 2) / TILE;
    const z = (at.y + FEET_PX) / TILE;
    const share = clamp01(damage / Math.max(1, target.ht));
    let side: number | undefined;
    if (attacker) {
      const from = view.positionInto(attacker, now, SCRATCH2);
      side = Math.atan2(at.y - from.y, at.x - from.x);
    }
    const height = Math.max(0.5, target.sprite.sheet.h / TILE);
    if (target.kind === 'goo') {
      // The designer's splash on the slime (its middle), and drops flying in 3D over it; a blow that does not hurt much throws fewer.
      this.art(this.staging.gooHit, (at.x + TILE / 2) / TILE, (at.y + TILE / 2) / TILE, now);
      emit.slimeSplatter(x, z, height * 0.45, 0.1 + share * 1.5);
    } else if (target.kind === 'dm300') {
      emit.sparks(x, height * 0.5, z, 6 + Math.round(share * 20), side === undefined ? undefined : side + Math.PI);
    } else if (target.kind === 'yog') {
      const fight = this.fights.get(target.id);
      if (fight && Math.random() < 0.45) this.glare(fight, now);
    }
  }

  /** A boss falls: its own death for each. */
  private died(kind: BossKind, id: string, puppet: Puppet | undefined, pos: number, now: number): void {
    const fight = this.fights.get(id);
    if (fight) fight.fell = true;
    const state = this.stateOf(id, kind);
    state.deathAt = now;
    const cell = cellOf(pos);
    const at = puppet ? this.cellFeet(puppet, now) ?? cell : cell;
    const height = Math.max(0.5, (puppet?.sprite.sheet.h ?? 16) / TILE);
    this.bar?.fall(kind === 'yog' ? 2600 : 1700);
    if (this.primary === id) this.primary = '';
    switch (kind) {
      case 'goo': {
        // It swells (the look) and bursts: the designer's pop, a puddle that stays eight seconds, and drops flying over it.
        this.later(now + POP_MS, () => {
          const drawn = this.art(this.staging.gooDeath, at.x, at.z, now + POP_MS);
          emit.slimePop(at.x, at.z, height * 0.5, 0, !drawn);
          audio.play('pop', 0.7, 0.9);
          audio.play('puff', 0.6, 0.5);
        });
        break;
      }
      case 'dm300': {
        // A string of blasts through its body, flickering, then one big one; and the smoke stays (see `frame`).
        const blasts = 6;
        for (let i = 0; i < blasts; i++) {
          const when = now + 80 + (i * (DM_BLAST_MS - 250)) / blasts + rnd(-40, 40);
          const dx = rnd(-0.55, 0.55);
          const dz = rnd(-0.35, 0.35);
          const dy = rnd(0.2, height * 0.9);
          this.later(when, () => {
            emit.explosion(at.x + dx, dy, at.z + dz, 1 + Math.random() * 0.6);
            fx.shake(2.5, 200, when);
            audio.play('blast', rnd(1, 1.5), 0.45);
          });
        }
        const big = now + DM_BLAST_MS;
        this.later(big, () => {
          // The designer's burst, with the light, shake and tint it carries, and six pieces thrown out of it (a plate, a gear or a bolt
          // each); ours is only the smoke that stays and a flash.
          const st = this.staging;
          const drawn = this.art(st.dmDeath, at.x, at.z, big);
          if (drawn) {
            for (let i = 0; i < st.dmDebrisCount; i++) {
              const a = (i / st.dmDebrisCount) * Math.PI * 2 + Math.random();
              const reach = rnd(0.8, 2.2);
              this.art(st.dmDebris, at.x + Math.cos(a) * reach, at.z + Math.sin(a) * reach * 0.7, big + 120, { rowAdd: Math.floor(Math.random() * 3), delay: rnd(0, 120) });
            }
          } else {
            emit.explosion(at.x, height * 0.5, at.z, 3.2);
            emit.shockwave(at.x, at.z, 4, ['#ffb040', '#ffe9a0', '#ff7a20'], 3);
            fx.shake(9, 800, big);
          }
          emit.smoke(at.x, 0.4, at.z, { dark: false, n: 10, size: 0.6, rise: 1.1, life: 3200 });
          // The floor under it is blackened for good (the baked blood layer takes it, as a pool): a scorch.
          for (let i = 0; i < 3; i++) gore.addSplat(poolSplat(at.x * TILE, at.z * TILE - 2, 9 + i * 5, 0x161412));
          fx.flash('255, 214, 150', 0.4, 420, big);
          fx.hitStop(160);
          audio.play('blast', 0.6, 1);
          audio.play('rocks', 0.8, 0.7);
        });
        break;
      }
      case 'king': {
        this.throne.fall = now;
        const fall = this.staging.kingFall;
        // He turns over in four steps; the dust of it, and then the crown, lying where he fell (the designer's, for six seconds).
        this.later(now + 250, () => {
          emit.collapse(at.x, at.z);
          fx.shake(6, 700, now + 250);
          audio.play('rocks', 0.7, 0.8);
          audio.play('rumble', 0.8, 0.8);
        });
        this.later(now + fall.ms, () => {
          this.art(fall.then, at.x + (puppet?.flip ? 0.55 : -0.55), at.z, now + fall.ms);
        });
        break;
      }
      case 'yog': {
        this.yogFall(id, at, now);
        break;
      }
      case 'tengu': {
        this.art(this.staging.tenguJump, at.x, at.z, now) || emit.blinkSmoke(at.x, at.z, at.x, at.z, true);
        break;
      }
      default:
    }
  }

  /** The old god dies: a slow push in, the shockwave, the red pulse, the white-out, and the Amulet in the light. */
  private yogFall(id: string, at: { x: number; z: number }, now: number): void {
    const calm = quality.reducedMotion;
    this.pushFor(id, { at: now, inMs: 1500, holdMs: 1500, outMs: 1600, amount: 0.32, slide: 0.7 });
    this.pulse();
    this.later(now + 350, () => {
      // The designer's fall (its red rings, light, shake and tint), three times as big as drawn; ours are the rings of light that run out
      // along the floor far beyond it, if it is not there.
      const st = this.staging;
      const drawn = this.art(st.yogDeath, at.x, at.z, now + 350, { scale: 3 });
      if (!drawn) {
        emit.shockwave(at.x, at.z, 9, ['#ff3a2a', '#ffb0a0', '#ffffff'], 4);
        fx.wave(at.x * TILE, at.z * TILE, now + 350, { colors: ['#ff4030', '#ffd0c0', '#ffffff'], rings: 3, tiles: 9, duration: 1100, width: 3, stagger: 160 });
      } else {
        emit.shockwave(at.x, at.z, 9, ['#ff3a2a', '#ffb0a0'], 2, 150);
      }
      fx.shake(10, 1200, now + 350);
      fx.hitStop(220);
      audio.play('blast', 0.5, 1);
      audio.play('roar', 0.6, 0.8);
    });
    this.later(now + 900, () => this.pulse());
    // The white-out: up over a second (gentler for reduced motion), held, then lifting while the Amulet shows.
    const veil = this.veilEl;
    const upAt = now + 1000;
    this.later(upAt, () => {
      if (!veil) return;
      veil.style.transition = `opacity ${calm ? 1800 : 1100}ms ease-in`;
      veil.style.opacity = calm ? '0.8' : '1';
    });
    // The Amulet stands in the light the white-out leaves (the designer's, as tall as it is drawn, twice over), with a word on where it waits.
    this.later(upAt + 1500, () => this.revealAmulet());
    // The white lifts, and the Amulet is standing in the light where the old god was.
    this.later(upAt + 2700, () => {
      this.art(this.staging.yogAmulet, at.x, at.z, upAt + 2700, { scale: 2 });
      audio.play('amulet', 1, 0.8);
      if (!veil) return;
      veil.style.transition = `opacity ${calm ? 2600 : 2200}ms ease-out`;
      veil.style.opacity = '0';
    });
  }

  /** The Amulet in the white: its picture lifted in light, and a word on where it waits. */
  private revealAmulet(): void {
    if (!this.host) return;
    const old = this.amuletEl;
    old?.remove();
    const root = document.createElement('div');
    root.className = 'fl-amulet';
    root.setAttribute('aria-hidden', 'true');
    const title = document.createElement('div');
    title.className = 'fl-amulet-text';
    title.textContent = TEXT.amulet;
    const sub = document.createElement('div');
    sub.className = 'fl-amulet-sub';
    sub.textContent = TEXT.amuletSub;
    root.append(title, sub);
    this.host.append(root);
    this.amuletEl = root;
    void root.offsetWidth;
    root.classList.add('on');
    window.setTimeout(() => {
      root.remove();
      if (this.amuletEl === root) this.amuletEl = null;
    }, 4800);
  }

  /** The machine mends itself on a spent trap: shown so it cannot be missed. */
  private repaired(id: string, now: number): void {
    const view = this.view!;
    const puppet = view.puppets.get(id);
    const state = this.stateOf(id, 'dm300');
    state.repairAt = now;
    const hpBefore = this.fights.get(id)?.hp ?? puppet?.hp ?? 0;
    this.pendingRepair.set(id, hpBefore);
    const at = puppet ? this.cellFeet(puppet, now) : null;
    if (at) {
      const height = Math.max(0.5, (puppet?.sprite.sheet.h ?? 16) / TILE);
      emit.mendColumn(at.x, at.z, height);
      // The steam of the trap's vents: the designer's jets either side of it and through it.
      const steam = this.staging.steam;
      for (const dx of [-0.42, 0, 0.42]) this.art(steam, at.x + dx, at.z + 0.1, now, { ms: 1500, lift: 0 }) || emit.smoke(at.x + dx, 0.3, at.z, { n: 2, size: 0.35, rise: 1.1, life: 1500 });
    }
    this.bar?.say(TEXT.mending(0), now, REPAIR_MS + 400);
    fx.flash('120, 255, 150', 0.22, 600, now);
    audio.play('sparkle', 0.7, 0.8);
    audio.play('puff', 0.9, 0.6);
    audio.play('zapSlow', 1.4, 0.4);
  }

  // ---- the frame ------------------------------------------------------------------------------------------------------------

  /** Whether anything wants the picture drawn at full pace (pace.ts). */
  busy(now: number): boolean {
    if (this.pushes.length > 0 || this.timers.length > 0 || bossVfx.busy || this.shown !== null || this.queue.length > 0 || now < this.throne.start + 3000) return true;
    // A bar whose trace is still catching up; a boss whose arena makes its own show (the machine's sparks and dust, the eye's glint).
    for (const f of this.fights.values()) if (!f.fell && (f.ghost.ghost > f.ghost.hp + 1e-4 || f.kind === 'dm300' || f.kind === 'yog')) return true;
    return false;
  }

  /** The music's intensity for the boss fight now: 0 when there is none. */
  get intensity(): number {
    return this.smoothed;
  }

  /** Once a frame: the bosses' health, the bar, the phases, the ambient show of the arena, what falls due. */
  frame(view: View, world: World, now: number, dt: number): void {
    this.view = view;
    this.world = world;
    if (this.depth !== view.depth) {
      this.reset();
      this.depth = view.depth;
    }
    const calm = quality.reducedMotion;
    // What was set for a time comes due.
    if (this.timers.length > 0) {
      const due = this.timers.filter((tm) => tm.at <= now);
      if (due.length > 0) {
        for (const tm of due) this.timers.splice(this.timers.indexOf(tm), 1);
        for (const tm of due) tm.run();
      }
    }
    const mobs = world.floors[view.depth]?.mobs ?? [];
    // A boss found fighting that no cry announced (a game loaded in the middle of the fight): its bar and body come as they are.
    for (const mob of mobs) {
      if (!BOSS_SET.has(mob.kind) || mob.hp <= 0 || this.fights.has(mob.id)) continue;
      if (mob.state === 'hunting' && view.puppets.has(mob.id)) this.begin(mob.kind as BossKind, mob.id, now, true);
    }
    let focus: Fight | null = null;
    for (const fight of this.fights.values()) {
      const mob = mobs.find((m) => m.id === fight.id);
      if (mob) {
        const was = fight.hp;
        fight.hp = mob.hp;
        fight.ht = mob.ht;
        this.stateOf(fight.id, fight.kind).frac = clamp01(mob.hp / Math.max(1, mob.ht));
        if (mob.hp > was && this.pendingRepair.has(fight.id)) {
          const got = mob.hp - this.pendingRepair.get(fight.id)!;
          this.pendingRepair.delete(fight.id);
          this.bar?.say(TEXT.mending(got), now, REPAIR_MS + 600);
        }
      } else if (!fight.fell) {
        // Gone with no death seen (it fell away, or the floor was left).
        fight.fell = true;
        this.bar?.fall();
      }
      const frac = clamp01(fight.hp / Math.max(1, fight.ht));
      if (!fight.fell) {
        fight.ghost.update(frac, now, dt, calm);
        if (fight.id === this.primary) {
          focus = fight;
          this.bar?.draw(fight.ghost, now, frac <= 0.5);
        }
        if (fight.kind === 'king' && this.throne.armed) this.kingSeen(fight, now);
        this.phases(fight, frac, now);
        this.ambient(fight, frac, now, dt);
      } else if (fight.id === this.primary || this.bar?.visible) {
        fight.ghost.update(0, now, dt, calm);
        this.bar?.draw(fight.ghost, now, false);
      }
      if (frac <= 0.5 && !fight.rageSeen) fight.rageSeen = true;
    }
    // The music: a step for each phase of the boss in front of the party, eased.
    const target = focus ? bossIntensity(clamp01(focus.hp / Math.max(1, focus.ht))) : 0;
    this.smoothed += (target - this.smoothed) * Math.min(1, dt / 900);
    if (Math.abs(this.smoothed - target) < 0.01) this.smoothed = target;
    this.risers(view, now);
    this.wrecks(view, world, now);
    // Where the camera should look when it leans toward a boss.
    this.focus.ok = false;
    const lead = focus ?? this.fights.get(this.pushes[0]?.id ?? '') ?? null;
    const body = lead ? view.puppets.get(lead.id) : undefined;
    if (body) {
      const p = view.positionInto(body, now, SCRATCH);
      this.focus.x = p.x + TILE / 2;
      this.focus.y = p.y + TILE / 2;
      this.focus.ok = true;
    }
    const pushes = this.pushes;
    for (let i = pushes.length - 1; i >= 0; i--) {
      const p = pushes[i]!.push;
      if (now > p.at + p.inMs + p.holdMs + p.outMs) pushes.splice(i, 1);
    }
    if (this.fights.size > 0 && [...this.fights.values()].every((f) => f.fell) && !this.bar?.visible) this.fights.clear();
  }

  /** The king is first in sight: the throne room's light rises round him (the accent light, the throne's beams on its pedestals, motes). */
  private kingSeen(f: Fight, now: number): void {
    const view = this.view!;
    const puppet = view.puppets.get(f.id);
    if (!puppet || !seenCells(this.world!, view.depth)[puppet.to]) return;
    const at = this.cellFeet(puppet, now);
    if (!at) return;
    this.throne.armed = false;
    this.throne.start = now;
    emit.motes(at.x, at.z, 2.6, 14);
    audio.play('rumble', 1.2, 0.35);
    fx.shake(2, 500, now);
  }

  /** The lines and the pulses of a boss's phases: half health, and the last quarter. */
  private phases(f: Fight, frac: number, now: number): void {
    if (!f.half && frac <= 0.5 && f.hp > 0) {
      f.half = true;
      this.speak(f.kind, f.id, 'half', now, null);
      this.bar?.say(TEXT.enraged, now, 2600);
      if (f.kind === 'yog') {
        this.pulse();
        this.pushFor(f.id, { at: now, inMs: 900, holdMs: 900, outMs: 1200, amount: 0.1, slide: 0.35 });
        this.glare(f, now);
      } else if (f.kind === 'dm300') {
        fx.shake(4, 400, now);
        audio.play('alert', 0.7, 0.5);
      } else if (f.kind === 'king') {
        fx.shake(3, 300, now);
      }
    }
    if (!f.quarter && frac <= 0.25 && f.hp > 0) {
      f.quarter = true;
      if (f.kind === 'yog') {
        this.pulse();
        this.glare(f, now);
      }
    }
  }

  /** Loops of the designer's art kept alive while their cause is in sight: each is put again a little before it runs out. */
  private readonly loops = new Map<string, number>();

  private loop(key: string, id: string, x: number, z: number, now: number, o: PlayOpts): boolean {
    const next = this.loops.get(key) ?? 0;
    if (now < next) return true;
    const drawn = this.art(id, x, z, now, { ms: LOOP_MS, ...o });
    if (drawn) this.loops.set(key, now + LOOP_MS - 300);
    return drawn;
  }

  /** The wall cells of the level a vent stands at (every third wall cell facing the floor), found once for each floor. */
  private vents: number[] | null = null;

  private ventsOf(level: Level | undefined): number[] {
    if (this.vents) return this.vents;
    const out: number[] = [];
    if (level) {
      let n = 0;
      for (let cell = WIDTH; cell < level.map.length - WIDTH; cell++) {
        // A floor cell with a wall to its north: the pipe runs along the foot of that wall.
        if (isFloor(level, cell) && !isFloor(level, cell - WIDTH) && n++ % 3 === 0) out.push(cell);
      }
    }
    this.vents = out;
    return out;
  }

  /** What the arena does round the fight: the machine's loops, falling dust and hissing pipes; the old god's glint; the king's throne. */
  private ambient(f: Fight, frac: number, now: number, dt: number): void {
    const view = this.view!;
    const puppet = view.puppets.get(f.id);
    if (!puppet || (quality.light && f.kind !== 'dm300')) return;
    const world = this.world!;
    const visible = seenCells(world, view.depth);
    if (!visible[puppet.to]) return;
    const at = this.cellFeet(puppet, now);
    if (!at) return;
    const height = Math.max(0.5, puppet.sprite.sheet.h / TILE);
    const st = this.staging;
    if (f.kind === 'dm300') {
      const stage = damageStage(frac);
      // The designer's loop over the body for the stage it is at (sparks and smoke, the worse ones lit), a third as big again as the sprite.
      const loop = stageAt(st.dmStages, frac);
      if (loop !== f.loop) {
        if (f.loop >= 0) fxp.stop(st.dmStages[f.loop]!.fx, f.id);
        f.loop = loop;
        this.loops.delete(`dm:${f.id}`);
        if (loop >= 0) audio.play('crackle', 0.9, 0.4);
      }
      const drawn = loop < 0 || this.loop(`dm:${f.id}`, st.dmStages[loop]!.fx, at.x, at.z - 0.5 + 0.0, now, { follow: f.id, lift: 0.55, scale: 1.3 });
      // Sparks off the body now and then, as a blow throws them; and where the designer's art is not there, smoke as well.
      const sparkEvery = [0, 3200, 1500, 650][stage]!;
      if (sparkEvery > 0 && now >= f.nextSpark) {
        f.nextSpark = now + sparkEvery * rnd(0.6, 1.4);
        emit.sparks(at.x + rnd(-0.4, 0.4), rnd(0.3, height * 0.9), at.z + rnd(-0.2, 0.2), 3 + stage * 2);
        if (stage >= 2) audio.play('crackle', rnd(1, 1.5), 0.18);
      }
      const smokeEvery = [0, 1500, 650, 280][stage]!;
      if (!drawn && smokeEvery > 0 && now >= f.nextSmoke) {
        f.nextSmoke = now + smokeEvery * rnd(0.6, 1.4);
        emit.smoke(at.x + rnd(-0.35, 0.35), rnd(0.5, height), at.z + rnd(-0.15, 0.15), { dark: stage >= 2, n: 1, size: 0.28 + stage * 0.06, rise: 0.8, life: 1500 + stage * 300 });
      }
      // The arena reacts: dust falls from the ceiling, and the pipes along the walls hiss steam (the designer's vents).
      if (now >= f.nextDust) {
        f.nextDust = now + [4200, 3200, 2200, 1200][stage]! * rnd(0.7, 1.3);
        emit.fallingDust(at.x, at.z, 3.6, 5 + stage * 3, stage >= 1 ? 1 + stage : 0);
        if (stage >= 2) audio.play('rumble', rnd(1.1, 1.6), 0.18);
      }
      this.steam(f, at.x, at.z, world.levels[view.depth], visible, now);
    } else if (f.kind === 'yog') {
      // The eye glints about every three seconds; now and then it glares, with a beam to the hero and a pulse of the screen's edge.
      if (now >= f.nextGlare) {
        f.nextGlare = now + rnd(st.yogGlintEvery[0], st.yogGlintEvery[1]);
        const drawn = this.art(st.yogGlint, at.x, at.z, now, { lift: height * 0.6 });
        if (!drawn || ++f.glints % 4 === 0) this.glare(f, now);
      }
    } else if (f.kind === 'king') {
      // The throne room's light stands on his two pedestals while he stands, and motes drift in it.
      if (this.throne.start > 0 && this.throne.fall < 0) {
        for (const cell of this.pedestals(world.levels[view.depth])) {
          if (visible[cell]) this.loop(`throne:${cell}`, st.kingThrone, (cell % WIDTH) + 0.5, Math.trunc(cell / WIDTH) + 0.6, now, { lift: 0 });
        }
        if (now >= f.nextDust) {
          f.nextDust = now + 700;
          emit.motes(at.x, at.z, 2.5, 4);
        }
      }
    }
    void dt;
  }

  /** The two pedestals of the hall (where the king summons from, and the throne's light stands). */
  private pedestals(level: Level | undefined): number[] {
    if (this.pedestalCells) return this.pedestalCells;
    const out: number[] = [];
    if (level) for (let cell = 0; cell < level.map.length; cell++) if (level.map[cell] === T.PEDESTAL) out.push(cell);
    this.pedestalCells = out;
    return out;
  }
  private pedestalCells: number[] | null = null;

  /** Steam from the pipes near the fight, the nearest few in sight; and the hiss of one now and then. */
  private steam(f: Fight, x: number, z: number, level: Level | undefined, visible: readonly boolean[], now: number): void {
    const near: Array<{ cell: number; d: number }> = [];
    for (const cell of this.ventsOf(level)) {
      if (!visible[cell]) continue;
      const d = Math.hypot((cell % WIDTH) + 0.5 - x, Math.trunc(cell / WIDTH) + 0.5 - z);
      if (d < 9) near.push({ cell, d });
    }
    near.sort((a, b) => a.d - b.d);
    const steam = this.staging.steam;
    for (const { cell } of near.slice(0, 6)) this.loop(`steam:${cell}`, steam, (cell % WIDTH) + 0.5, Math.trunc(cell / WIDTH) + 0.55, now, { lift: 0 });
    if (near.length > 0 && now >= f.nextSteam) {
      f.nextSteam = now + rnd(2600, 5200);
      audio.play('gust', rnd(1.5, 2.1), 0.2);
    }
  }

  /** The eye's glare: a beam runs to the hero, the screen's edges pulse (the glint itself is the designer's, above). */
  private glare(f: Fight, now: number): void {
    const view = this.view!;
    const world = this.world!;
    const puppet = view.puppets.get(f.id);
    if (!puppet || f.fell) return;
    const state = this.stateOf(f.id, f.kind);
    if (state.glareAt !== undefined && now - state.glareAt < GLARE_MS * 0.8) return;
    state.glareAt = now;
    const at = this.cellFeet(puppet, now);
    if (!at) return;
    const height = Math.max(0.5, puppet.sprite.sheet.h / TILE);
    if (!fxp.has(this.staging.yogGlint)) emit.glareFlare(at.x, height * 0.55, at.z);
    const me = world.heroes.find((h) => h.depth === view.depth && h.hp > 0);
    if (me) {
      const to = cellOf(me.pos);
      bossVfx.beam(at.x, at.z, to.x, to.z, height * 0.5, now + 120, 420, '#ff4060', 0.18);
      this.later(now + 520, () => emit.sparks(to.x, 0.5, to.z, 8));
    }
    this.pulse(true);
    audio.play('zapShadow', 0.55, 0.45);
  }

  /** Bodies that came up out of the floor in this fight: dwarves from the king's summons, the fists of the old god. */
  private risers(view: View, now: number): void {
    if (this.fights.size === 0) return;
    const st = this.staging;
    for (const puppet of view.puppets.values()) {
      if (!RISERS.has(puppet.kind) || !puppet.alive || this.riserSeen.has(puppet.id)) continue;
      this.riserSeen.add(puppet.id);
      const undead = puppet.kind === 'undead';
      // Only what comes in a summoning or in the fists' entrance rises; one already there (a game loaded in the fight) just stands.
      if (!(undead ? now - this.summonAt < 1800 : now - this.fistsAt < 3600)) continue;
      const order = undead ? 0 : this.fistsDone++;
      const delay = undead ? 0 : 420 + order * 520;
      const state = this.stateOf(puppet.id, puppet.kind);
      const at = this.cellFeet(puppet, now);
      if (!at) continue;
      if (undead) {
        // The designer's rising (its light, its green) plays on the cell for six frames, and the dwarf stands up out of it.
        const drawn = this.art(st.kingSummon, at.x, at.z, now + delay);
        state.riseAt = now + (drawn ? 480 : 0);
        state.riseMs = drawn ? 320 : 780;
        if (!drawn) this.later(now, () => emit.riseBurst(at.x, at.z, { bone: true, color: '#b8ffb0', n: 10 }));
        this.later(now + 200, () => audio.play('bones', rnd(0.8, 1.1), 0.5));
        continue;
      }
      state.riseAt = now + delay;
      state.riseMs = 640;
      this.later(now + delay, () => {
        const drawn = this.art(st.yogFists[puppet.kind] ?? '', at.x, at.z, now + delay);
        if (!drawn) {
          const burning = puppet.kind === 'burningFist';
          emit.riseBurst(at.x, at.z, { bone: false, color: burning ? '#ff9040' : '#8be04a', n: 16 });
          if (burning) emit.explosion(at.x, 0.3, at.z, 0.8);
          else emit.slimeSplatter(at.x, at.z, 0.2, 0.6);
          emit.shockwave(at.x, at.z, 2.4, burning ? ['#ff9040', '#ffe9a0'] : ['#8be04a', '#c8ff9a'], 2);
          fx.shake(5, 380, now + delay);
        }
        audio.play('rocks', 0.7, 0.8);
      });
      this.pushFor(puppet.id, { at: now + delay, inMs: 300, holdMs: 100, outMs: 500, amount: 0.04, slide: 0 });
    }
  }
  private readonly riserSeen = new Set<string>();

  /** What is left of the machine stays and smokes: from each wreck of a boss in sight, smoke, a spark now and then, the red of a coal. */
  private wrecks(view: View, world: World, now: number): void {
    if (gore.bodies.length === 0) return;
    const visible = seenCells(world, view.depth);
    for (const body of gore.bodies) {
      if (body.kind !== 'dm300' || !visible[body.cell]) continue;
      if (this.wreckAt.get(body.cell) === undefined) this.wreckAt.set(body.cell, now);
      const next = this.wreckNext.get(body.cell) ?? 0;
      if (now < next) continue;
      this.wreckNext.set(body.cell, now + (quality.light ? 1500 : 600) * rnd(0.7, 1.3));
      const c = cellOf(body.cell);
      // Only once the death has played out (the body is laid when its picture has played its last frame).
      if (body.at !== undefined && now < body.at) continue;
      // The designer's worst loop (sparks, black smoke, the glow of a fire) stays over it, and our smoke rises from it.
      const stages = this.staging.dmStages;
      this.loop(`wreck:${body.cell}`, stages[stages.length - 1]!.fx, c.x, c.z, now, { lift: 0.4 });
      emit.smoke(c.x + rnd(-0.3, 0.3), 0.3, c.z + rnd(-0.15, 0.1), { dark: false, n: 1, size: 0.3, rise: 0.7, life: 2800 });
      if (Math.random() < 0.18) emit.sparks(c.x + rnd(-0.3, 0.3), 0.3, c.z, 3);
      if (Math.random() < 0.25) bossVfx.emit({ x: c.x + rnd(-0.3, 0.3), y: 0.12, z: c.z + rnd(-0.1, 0.1), life: 900, size: 0.1, color: '#ff6a20', alpha: 0.8, glow: true, soft: true });
    }
  }
  private readonly wreckAt = new Map<number, number>();
  private readonly wreckNext = new Map<number, number>();

  // ---- the bodies -----------------------------------------------------------------------------------------------------------

  private stateOf(id: string, kind: string): BodyState {
    let s = this.states.get(id);
    if (!s || s.kind !== kind) {
      s = { kind, frac: 1, seed: Math.random() * 6.28 };
      this.states.set(id, s);
    }
    return s;
  }

  /** How a body is drawn now (null for any that is none of the fight's: the scene draws it as it is). Written into one shared object. */
  lookFor(puppet: Puppet, now: number): BodyLook | null {
    if (this.states.size === 0) return null;
    const state = this.states.get(puppet.id);
    if (!state || state.kind !== puppet.kind) return null;
    return lookOf(state, now, quality.reducedMotion, this.look, this.staging);
  }

  /**
   * The arena's accent light now, as a multiple of the kit's and a colour to turn it toward (or none): the throne room's light rises
   * when the king appears and goes out when he falls; the old god's light beats with its glare.
   */
  accentFor(kind: string | null, now: number): { k: number; color: number } {
    const out = ACCENT;
    out.k = 1;
    out.color = -1;
    if (kind === 'king') {
      if (this.throne.fall > 0) {
        const t = clamp01((now - this.throne.fall) / 1600);
        out.k = (0.2 + 1.8 * (1 - t)) * (1 - 0.9 * t);
        out.color = 0xffd070;
      } else if (this.throne.start > 0) {
        const t = clamp01((now - this.throne.start) / 2600);
        // (It stays at its height while he stands: a warm, brighter hall.)
        out.k = 0.1 + 1.7 * (t * t * (3 - 2 * t));
        out.color = 0xffd070;
      }
    } else if (kind === 'yog') {
      const st = this.stateOf(this.primary || '#', 'yog');
      if (st.glareAt !== undefined && now - st.glareAt < GLARE_MS) out.k = 1 + 1.6 * Math.sin(clamp01((now - st.glareAt) / GLARE_MS) * Math.PI);
    } else if (kind === 'dm300') {
      const st = this.primary ? this.states.get(this.primary) : undefined;
      if (st && st.kind === 'dm300') {
        const stage = damageStage(st.frac);
        // The red of a failing machine flickers.
        if (stage >= 2) out.k = 1 + 0.25 * stage * (0.5 + 0.5 * Math.sin(now / 90 + (st.seed ?? 0)));
        if (st.repairAt !== undefined && now - st.repairAt < REPAIR_MS) {
          out.k = 1.8;
          out.color = 0x7fff7f;
        }
      }
    }
    return out;
  }

  // ---- the camera -----------------------------------------------------------------------------------------------------------

  private pushFor(id: string, push: Push): void {
    const p = quality.reducedMotion ? calmPush(push) : push;
    this.pushes.push({ push: p, id });
    if (this.pushes.length > 6) this.pushes.shift();
  }

  /**
   * Bends the camera for a push: closer, and a little toward the boss. `width` and `height` are the view's, in device pixels (the height
   * as the camera sees it, un-squeezed), `camera` is what the frame has just computed, and is changed in place.
   */
  camera(camera: { x: number; y: number; zoom: number }, width: number, height: number, now: number): void {
    if (this.pushes.length === 0) return;
    let amount = 0;
    let slide = 0;
    for (const { push } of this.pushes) {
      const k = pushEnvelope(push, now);
      if (k * push.amount > amount) {
        amount = k * push.amount;
        slide = k * push.slide;
      }
    }
    if (amount <= 0.0005) return;
    const z0 = camera.zoom;
    const z1 = z0 * (1 + amount);
    let cx = camera.x + width / (2 * z0);
    let cy = camera.y + height / (2 * z0);
    if (this.focus.ok && slide > 0) {
      cx += (this.focus.x - cx) * slide;
      cy += (this.focus.y - cy) * slide;
    }
    camera.zoom = z1;
    camera.x = cx - width / (2 * z1);
    camera.y = cy - height / (2 * z1);
  }

  // ---- the bubble -----------------------------------------------------------------------------------------------------------

  /**
   * Once a frame, after the camera: shows what is due to be said, over the boss's head if it is in sight, hanging under the bar if not.
   * `anchorOf` gives a boss's head on the interface layer (or none); `covered` is a window over the game (the bubble waits); `scale` is
   * the layer's (the HUD's) scale, to put the bar's bottom in the layer's own units.
   */
  place(now: number, anchorOf: (id: string) => BubbleAnchor | null, covered: boolean, scale: number): void {
    const dt = Math.max(0, now - this.lastFrame);
    this.lastFrame = now;
    if (!this.shown && this.queue.length > 0 && this.queue[0]!.at <= now && !covered) this.showLine(this.queue.shift()!, now);
    const shown = this.shown;
    const node = this.bubble;
    if (!shown || !node) return;
    if (covered) {
      shown.at += dt;
      node.style.visibility = 'hidden';
      return;
    }
    const age = now - shown.at;
    if (age >= shown.hold + 220) {
      node.hidden = true;
      this.shown = null;
      return;
    }
    if (age >= shown.hold) node.classList.add('out');
    node.style.visibility = '';
    const layerBox = this.host?.getBoundingClientRect();
    // Under the bar if it is up, else under the HUD (main.ts keeps its bottom in --hud-bottom).
    const hudBottom = parseFloat(document.documentElement.style.getPropertyValue('--hud-bottom')) || 0;
    const barBottom = this.bar?.visible && layerBox ? (this.bar.bottom() - layerBox.top) / scale : hudBottom / scale;
    const anchor = anchorOf(shown.line.id);
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    if (anchor && anchor.y - h - 14 > barBottom) {
      const left = Math.min(Math.max(anchor.x - w / 2, 8), Math.max(8, anchor.w - w - 8));
      node.classList.remove('under');
      node.style.transform = `translate(${Math.round(left)}px, ${Math.round(anchor.y - h - 12)}px)`;
      node.style.setProperty('--tail', `${Math.round(Math.min(Math.max(anchor.x - left, 14), Math.max(14, w - 14)))}px`);
    } else {
      // Hanging from the bar, its tail up at the boss's name.
      const width = (layerBox?.width ?? 360) / scale;
      node.classList.add('under');
      node.style.transform = `translate(${Math.round(Math.max(8, (width - w) / 2))}px, ${Math.round(barBottom + 12)}px)`;
      node.style.setProperty('--tail', '40px');
    }
  }

  private showLine(line: Line, now: number): void {
    if (!this.host) return;
    if (!this.bubble) {
      const node = document.createElement('div');
      node.className = 'fl-bossline';
      node.setAttribute('aria-hidden', 'true');
      const body = document.createElement('div');
      body.className = 'fl-bossline-body';
      const who = document.createElement('span');
      who.className = 'fl-bossline-who';
      const text = document.createElement('span');
      body.append(who, text);
      node.append(body);
      this.host.append(node);
      this.bubble = node;
      this.bubbleBody = text;
      this.bubbleWho = who;
    }
    const node = this.bubble!;
    const card = fxState()?.lib.bossCards.bosses[line.kind];
    node.style.setProperty('--boss', card?.accent ?? '#ff6a4a');
    this.bubbleWho!.textContent = t.mobs[line.kind] ?? line.kind;
    this.bubbleBody!.textContent = line.text;
    node.hidden = false;
    node.classList.remove('out', 'pop', 'under');
    node.classList.toggle('last', line.last);
    node.style.visibility = 'hidden';
    void node.offsetWidth;
    node.classList.add('pop');
    const hold = Math.min(4600, 1700 + line.text.length * 55);
    this.shown = { line, at: now, hold };
    audio.play('quip', 0.7, 0.5);
  }

  /** The bubble is up (or waiting): the frame is drawn at full pace meanwhile. */
  /** The bar is on screen, and whose it is (the boss it follows). */
  get barUp(): boolean {
    return this.bar?.visible === true;
  }

  get bossId(): string {
    return this.primary;
  }

  /**
   * Once a frame while the bar is up: when a figure stands under it (the boss, the hero: their boxes on the page, px), the bar all but
   * fades, so it never hides the fight; it comes back once they step out from under it.
   */
  veil(figures: ReadonlyArray<{ left: number; right: number; top: number; bottom: number } | null>): void {
    const bar = this.bar;
    if (!bar?.visible) return;
    const r = bar.rect();
    let under = false;
    for (const f of figures) if (f && f.right > r.left && f.left < r.right && f.bottom > r.top && f.top < r.bottom) under = true;
    bar.setVeiled(under);
  }

  get speaking(): boolean {
    return this.shown !== null || this.queue.length > 0;
  }

  // ---- housekeeping ---------------------------------------------------------------------------------------------------------

  private later(at: number, run: () => void): void {
    if (this.timers.length > 80) this.timers.shift();
    this.timers.push({ at, run });
  }

  private puppetCell(id: string): { x: number; z: number } | null {
    const puppet = this.view?.puppets.get(id);
    return puppet ? this.cellFeet(puppet, fx.now) : null;
  }

  /** The middle of a puppet's cell, in cells. */
  private cellCenter(puppet: Puppet, now: number): { x: number; z: number } | null {
    if (!this.view) return null;
    const p = this.view.positionInto(puppet, now, SCRATCH);
    return { x: (p.x + TILE / 2) / TILE, z: (p.y + TILE / 2) / TILE };
  }

  /** Where a puppet's feet are, in cells. */
  private cellFeet(puppet: Puppet, now: number): { x: number; z: number } | null {
    if (!this.view) return null;
    const p = this.view.positionInto(puppet, now, SCRATCH);
    return { x: (p.x + TILE / 2) / TILE, z: (p.y + FEET_PX) / TILE };
  }

  /** A new floor or a new run: nothing of the last fight stays. */
  reset(): void {
    this.fights.clear();
    this.states.clear();
    this.timers.length = 0;
    this.pushes.length = 0;
    this.queue.length = 0;
    this.shown = null;
    this.primary = '';
    this.smoothed = 0;
    this.summonAt = this.fistsAt = -1e9;
    this.fistsDone = 0;
    this.throne = { start: -1e9, fall: -1e9, armed: false };
    this.pendingRepair.clear();
    this.lastRepairHp.clear();
    this.wreckAt.clear();
    this.loops.clear();
    this.vents = null;
    this.pedestalCells = null;
    this.riserSeen.clear();
    this.wreckNext.clear();
    this.focus.ok = false;
    bossVfx.clear();
    this.bar?.clear();
    if (this.bubble) this.bubble.hidden = true;
    this.amuletEl?.remove();
    this.amuletEl = null;
    if (this.veilEl) {
      this.veilEl.style.transition = 'none';
      this.veilEl.style.opacity = '0';
    }
    this.pulseEl?.classList.remove('beat', 'soft');
  }
}

const SCRATCH = { x: 0, y: 0 };
const SCRATCH2 = { x: 0, y: 0 };
const ACCENT = { k: 1, color: -1 };

const cellOf = (cell: number): { x: number; z: number } => ({ x: (cell % WIDTH) + 0.5, z: Math.trunc(cell / WIDTH) + 0.5 });

const mobOf = (world: World, depth: number, id: string): Mob | undefined => world.floors[depth]?.mobs.find((m) => m.id === id);

/** Ground the party can stand on (steam jets stand on it with a wall behind). */
const isFloor = (level: Level, cell: number): boolean => ((terrainFlags[level.map[cell] ?? 0] ?? 0) & F.PASSABLE) !== 0;

/** The original's cry for a moment, in the language shown (the log has it from view.ts); none for the moment with no cry. */
function originalLine(kind: BossKind, moment: 'notice' | 'death', cls: string): string | null {
  const notice = moment === 'notice';
  switch (kind) {
    case 'goo': return notice ? t.gooNotice : t.gooDeath;
    case 'tengu': return notice ? t.tenguNotice(cls) : t.tenguDeath;
    case 'dm300': return notice ? t.dm300Notice : t.dm300Death;
    case 'king': return notice ? t.kingNotice : t.kingDeath(cls);
    case 'yog': return notice ? t.yogNotice : t.yogDeath;
    default: return null;
  }
}

export const bossFx = new BossFx();

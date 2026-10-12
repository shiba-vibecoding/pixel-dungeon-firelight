import { FURY_LEVEL, type Hero, isAlive, isHungry, isStarving, itemDef, maxExp } from '@pd/core';
import { t } from './i18n';
import { FONT } from './render';
import { type Assets, ICONS } from './sprites';
import { COLORS, type LogLine } from './view';

/*
 * The in-game HUD, drawn with the original textures: the status pane on top
 * (StatusPane: avatar, health and experience bars, level, depth, menu) and
 * the toolbar at the bottom (Toolbar: wait, search, help).
 */

export type HudButton = 'wait' | 'search' | 'help' | 'backpack' | 'quick' | 'menu' | 'hero';

interface Area {
  id: HudButton;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HudState {
  me: Hero;
  /** Other heroes in the party, for the co-op roster. */
  party: Hero[];
  online: readonly string[];
  /** Companions the dungeon is waiting for, when my action is queued. */
  waitingFor: string[];
  status: string;
  log: readonly LogLine[];
  /** BuffIndicator icons to show under the health bar. */
  buffs: readonly number[];
  /** The quickslot: a thrown weapon or a wand, ready to use. */
  quick: { sprite: number; label: string; aiming: boolean } | null;
  /** Iron keys for the current depth. */
  keys: number;
}

/** Buff icons in buffs.png (BuffIndicator). */
export const BUFF_ICONS = {
  mindVision: 0, fire: 2, poison: 3, paralysis: 4, hunger: 5, starvation: 6, slow: 7, ooze: 8, roots: 11, invisible: 12,
  weakness: 14, combo: 17, fury: 18, healing: 19, bark: 20, charm: 21, light: 22, cripple: 23, barkskin: 24, dizzy: 29,
  levitation: 1, blindness: 16, immunity: 25, deferred: 28, bleeding: 26,
} as const;
export type BuffName = keyof typeof BUFF_ICONS;

/** What ails or helps a hero, with the turns it has left where that is known (BuffIndicator). */
export function heroBuffs(me: Hero): Array<{ name: BuffName; turns?: number }> {
  const turns = (left: number): number => Math.ceil(left);
  return [
    ...(me.mindVision > 0 ? [{ name: 'mindVision' as const, turns: turns(me.mindVision) }] : []),
    ...(me.invisible > 0 ? [{ name: 'invisible' as const, turns: turns(me.invisible) }] : []),
    ...(me.ooze >= 0 ? [{ name: 'ooze' as const }] : []),
    ...(me.poison > 0 ? [{ name: 'poison' as const, turns: turns(me.poison) }] : []),
    ...(me.burning > 0 ? [{ name: 'fire' as const, turns: turns(me.burning) }] : []),
    ...(me.paralysed > 0 ? [{ name: 'paralysis' as const, turns: turns(me.paralysed) }] : []),
    ...(me.rooted > 0 ? [{ name: 'roots' as const, turns: turns(me.rooted) }] : []),
    ...(me.slowed > 0 ? [{ name: 'slow' as const, turns: turns(me.slowed) }] : []),
    ...(me.weakened > 0 ? [{ name: 'weakness' as const, turns: turns(me.weakened) }] : []),
    ...(me.crippled > 0 ? [{ name: 'cripple' as const, turns: turns(me.crippled) }] : []),
    ...(me.charmed > 0 ? [{ name: 'charm' as const, turns: turns(me.charmed) }] : []),
    ...(me.light > 0 ? [{ name: 'light' as const, turns: turns(me.light) }] : []),
    ...(me.dizzy > 0 ? [{ name: 'dizzy' as const, turns: turns(me.dizzy) }] : []),
    ...((me.levitating ?? 0) > 0 ? [{ name: 'levitation' as const, turns: turns(me.levitating!) }] : []),
    ...((me.gasImmune ?? 0) > 0 ? [{ name: 'immunity' as const, turns: turns(me.gasImmune!) }] : []),
    ...((me.blind ?? 0) > 0 ? [{ name: 'blindness' as const, turns: turns(me.blind!) }] : []),
    ...((me.deferred ?? 0) > 0 ? [{ name: 'deferred' as const, turns: turns(me.deferred!) }] : []),
    ...((me.bleeding ?? 0) > 0 ? [{ name: 'bleeding' as const }] : []),
    ...(me.sungrass !== undefined && me.sungrass === me.pos ? [{ name: 'healing' as const }] : []),
    ...(me.earthroot && me.earthroot.pos === me.pos ? [{ name: 'bark' as const }] : []),
    ...(me.subclass === 'gladiator' && me.combo >= 3 && me.time <= me.comboUntil ? [{ name: 'combo' as const }] : []),
    ...(me.subclass === 'berserker' && me.hp > 0 && me.hp <= me.ht * FURY_LEVEL ? [{ name: 'fury' as const }] : []),
    ...(me.barkskin > 0 ? [{ name: 'barkskin' as const, turns: turns(me.barkskin) }] : []),
    ...(isStarving(me) ? [{ name: 'starvation' as const }] : isHungry(me) ? [{ name: 'hunger' as const }] : []),
  ];
}

const TOOLS: ReadonlyArray<{ id: HudButton; sx: number; w: number }> = [
  { id: 'wait', sx: 0, w: 20 },
  { id: 'search', sx: 20, w: 20 },
  { id: 'help', sx: 40, w: 21 },
];
const BACKPACK = { id: 'backpack' as const, sx: 60, w: 23 };
const QUICKSLOT = { id: 'quick' as const, sx: 83, w: 22 };

export class Hud {
  /** Device pixels per HUD pixel. */
  ui = 3;
  width = 0;
  height = 0;
  private areas: Area[] = [];
  private pressed: { id: HudButton; until: number } | null = null;

  constructor(private readonly assets: Assets) {}

  /** HUD pixels kept clear at the top (notch, Telegram's buttons) and bottom (home indicator). */
  private top = 0;
  private bottom = 0;

  layout(deviceWidth: number, deviceHeight: number, insetTop = 0, insetBottom = 0): void {
    // Roughly the original's proportions: a phone is about 240 HUD pixels wide.
    this.ui = Math.max(2, Math.round(Math.min(deviceWidth, deviceHeight * 0.75) / 240));
    this.width = Math.floor(deviceWidth / this.ui);
    this.height = Math.floor(deviceHeight / this.ui);
    this.top = Math.ceil(insetTop / this.ui);
    this.bottom = Math.ceil(insetBottom / this.ui);
    let x = 0;
    const y = this.height - this.bottom - 25;
    this.areas = TOOLS.map((tool) => {
      const area = { id: tool.id, x, y, w: tool.w, h: 25 };
      x += tool.w;
      return area;
    });
    this.areas.push({ id: BACKPACK.id, x: this.width - BACKPACK.w, y, w: BACKPACK.w, h: 25 });
    this.areas.push({ id: QUICKSLOT.id, x: this.width - BACKPACK.w - QUICKSLOT.w, y, w: QUICKSLOT.w, h: 25 });
    this.areas.push({ id: 'menu', x: this.width - 20, y: this.top, w: 20, h: 20 });
    // The portrait opens the hero's details.
    this.areas.push({ id: 'hero', x: 0, y: this.top, w: 30, h: 30 });
  }

  /** The button under a point in device pixels, if any. */
  hit(px: number, py: number, hasQuickslot = true): HudButton | null {
    const x = px / this.ui;
    const y = py / this.ui;
    const area = this.areas.find(
      (a) => (hasQuickslot || a.id !== 'quick') && x >= a.x && x < a.x + a.w && y >= a.y && y < a.y + a.h,
    );
    if (area) this.pressed = { id: area.id, until: performance.now() + 150 };
    return area?.id ?? null;
  }

  /** True if a point (device pixels) is covered by the HUD, so taps there do not walk. */
  covers(px: number, py: number): boolean {
    const y = py / this.ui;
    return y < this.top + 34 || y >= this.height - this.bottom - 25;
  }

  draw(ctx: CanvasRenderingContext2D, state: HudState, now: number): void {
    const { assets, ui } = this;
    const W = this.width;
    const T = this.top;
    const B = this.height - this.bottom;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    if (T > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W * ui + ui, T * ui);
    }

    // Status pane: a nine-patch whose middle column stretches.
    ctx.setTransform(ui, 0, 0, ui, 0, T * ui);
    const status = assets.status;
    ctx.drawImage(status, 0, 0, 80, 64, 0, 0, 80, 64);
    if (W > 128) ctx.drawImage(status, 80, 0, 1, 64, 80, 0, W - 128, 64);
    ctx.drawImage(status, 80, 0, 48, 64, W - 48, 0, 48, 64);

    const me = state.me;
    if (isAlive(me)) {
      const sheet = assets.heroes[me.heroClass].sheet.image;
      ctx.drawImage(sheet, 1, (itemDef(me.armor.kind).tier ?? 0) * 15, 11, 15, 10, 8, 11, 15);
      if (me.hp <= me.ht / 4) {
        ctx.fillStyle = `rgba(204, 0, 0, ${0.25 + 0.15 * Math.sin(now / 150)})`;
        ctx.fillRect(10, 8, 11, 15);
      }
    } else {
      const [sx, sy, w, h] = ICONS.skull;
      ctx.drawImage(assets.icons, sx, sy, w, h, 11, 11, w, h);
    }

    const hp = Math.max(0, me.hp) / me.ht;
    ctx.drawImage(assets.hpBar, 0, 0, Math.ceil(64 * hp), 4, 30, 3, Math.ceil(64 * hp), 4);
    const exp = me.exp / maxExp(me);
    if (exp > 0) ctx.drawImage(assets.expBar, 0, 0, 16, 1, 0, 0, W * exp, 1);
    state.buffs.forEach((icon, i) => {
      ctx.drawImage(assets.buffs, (icon % 18) * 7, Math.floor(icon / 18) * 7, 7, 7, 32 + i * 8, 11, 7, 7);
    });
    ctx.setTransform(ui, 0, 0, ui, 0, 0);

    // Pressed toolbar buttons light up briefly.
    for (const area of this.areas) {
      const tool =
        TOOLS.find((tl) => tl.id === area.id) ??
        (area.id === BACKPACK.id ? BACKPACK : area.id === QUICKSLOT.id && state.quick ? QUICKSLOT : undefined);
      if (!tool) continue;
      ctx.drawImage(assets.toolbar, tool.sx, 7, tool.w, 25, area.x, area.y, tool.w, 25);
      if (tool === QUICKSLOT && state.quick) {
        const { sprite, aiming } = state.quick;
        ctx.drawImage(assets.items, (sprite % 8) * 16, Math.floor(sprite / 8) * 16, 16, 16, area.x + 3, area.y + 5, 16, 16);
        if (aiming) {
          ctx.strokeStyle = `rgba(255, 235, 164, ${0.6 + 0.4 * Math.sin(now / 120)})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(area.x + 1.5, area.y + 1.5, area.w - 3, area.h - 3);
        }
      }
      if (this.pressed?.id === area.id && now < this.pressed.until) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(area.x, area.y, area.w, area.h);
      }
    }
    if (state.quick?.label) {
      const area = this.areas.find((a) => a.id === QUICKSLOT.id)!;
      this.text(ctx, state.quick.label, area.x + area.w - 2, area.y + area.h - 2, 6, '#ffffff', 'right');
      ctx.setTransform(ui, 0, 0, ui, 0, 0);
    }

    // Text at device resolution.
    this.text(ctx, String(me.lvl), 27.5, T + 31, 8, '#ffeba4', 'center');
    this.text(ctx, String(me.depth), W - 42, T + 11.5, 8, '#cacfc2', 'right');
    if (state.keys > 0) this.text(ctx, String(state.keys), W - 26, T + 11.5, 8, '#cacfc2', 'right');
    this.text(ctx, `${Math.max(0, me.hp)}/${me.ht}`, 34 + state.buffs.length * 8, T + 17, 7, '#ffffff', 'left');

    let y = T + 40;
    for (const hero of state.party) {
      const online = state.online.includes(hero.id);
      const color = !isAlive(hero) ? '#888888' : online ? '#ffffff' : '#aaaaaa';
      this.text(ctx, `${hero.name}${online ? '' : ' ⌁'}`, 4, y, 6, color, 'left');
      ctx.setTransform(ui, 0, 0, ui, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(4, y + 1.5, 26, 2);
      ctx.fillStyle = isAlive(hero) ? '#cc2222' : '#444';
      ctx.fillRect(4.5, y + 2, 25 * Math.max(0, hero.hp / hero.ht), 1);
      y += 10;
    }

    const notice = state.status || (state.waitingFor.length > 0 ? t.waitingFor(state.waitingFor.join(', ')) : '');
    if (notice) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = `${Math.round(7 * ui)}px ${FONT}`;
      const lines = this.wrap(ctx, notice, (W - 24) * ui);
      const top = T + 44 + state.party.length * 10;
      const [sx, sy, w, h] = ICONS.busy;
      ctx.setTransform(ui, 0, 0, ui, 0, 0);
      ctx.save();
      ctx.translate(8, top - 2);
      ctx.rotate(now / 300);
      ctx.drawImage(assets.icons, sx, sy, w, h, -w / 2, -h / 2, w, h);
      ctx.restore();
      lines.forEach((line, i) => this.text(ctx, line, W / 2 + 4, top + i * 9, 7, COLORS.highlight, 'center'));
    }

    // Message log above the toolbar, wrapped to the screen; old lines fade away.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `${Math.round(8 * ui)}px ${FONT}`;
    const rows: Array<{ text: string; color: string; alpha: number }> = [];
    for (const line of state.log.filter((l) => now - l.time < 8000).slice(-4)) {
      const age = now - line.time;
      const alpha = age < 6000 ? 1 : 1 - (age - 6000) / 2000;
      for (const text of this.wrap(ctx, line.text, (W - 6) * ui)) rows.push({ text, color: line.color, alpha });
    }
    rows.slice(-5).forEach((row, i, shown) => {
      this.text(ctx, row.text, 3, B - 29 - (shown.length - 1 - i) * 10, 8, row.color, 'left', row.alpha);
    });
    if (this.bottom > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, B * ui, W * ui + ui, this.bottom * ui + ui);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Splits text into lines no wider than `width` device pixels, at spaces. */
  private wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > width) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  private text(
    ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string,
    align: CanvasTextAlign, alpha = 1,
  ): void {
    const { ui } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.font = `${Math.round(size * ui)}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, ui * 0.9);
    ctx.strokeStyle = '#000';
    ctx.strokeText(text, x * ui, y * ui);
    ctx.fillStyle = color;
    ctx.fillText(text, x * ui, y * ui);
    ctx.globalAlpha = 1;
  }
}

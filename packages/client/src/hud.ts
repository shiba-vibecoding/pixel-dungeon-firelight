import { type Hero, isAlive, maxExp } from '@pd/core';
import { t } from './i18n';
import { FONT } from './render';
import { type Assets, ICONS } from './sprites';
import { COLORS, type LogLine } from './view';

/*
 * The in-game HUD, drawn with the original textures: the status pane on top
 * (StatusPane: avatar, health and experience bars, level, depth, menu) and
 * the toolbar at the bottom (Toolbar: wait, search, help).
 */

export type HudButton = 'wait' | 'search' | 'help' | 'backpack' | 'menu';

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
}

/** Buff icons in buffs.png (BuffIndicator). */
export const BUFF_ICONS = { mindVision: 0, fire: 2, poison: 3, paralysis: 4, ooze: 8, invisible: 12 } as const;

const TOOLS: ReadonlyArray<{ id: HudButton; sx: number; w: number }> = [
  { id: 'wait', sx: 0, w: 20 },
  { id: 'search', sx: 20, w: 20 },
  { id: 'help', sx: 40, w: 21 },
];
const BACKPACK = { id: 'backpack' as const, sx: 60, w: 23 };

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
    this.areas.push({ id: 'menu', x: this.width - 20, y: this.top, w: 20, h: 20 });
  }

  /** The button under a point in device pixels, if any. */
  hit(px: number, py: number): HudButton | null {
    const x = px / this.ui;
    const y = py / this.ui;
    const area = this.areas.find((a) => x >= a.x && x < a.x + a.w && y >= a.y && y < a.y + a.h);
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
      ctx.drawImage(sheet, 1, 0, 11, 15, 10, 8, 11, 15);
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
      const tool = TOOLS.find((tl) => tl.id === area.id) ?? (area.id === BACKPACK.id ? BACKPACK : undefined);
      if (!tool) continue;
      ctx.drawImage(assets.toolbar, tool.sx, 7, tool.w, 25, area.x, area.y, tool.w, 25);
      if (this.pressed?.id === area.id && now < this.pressed.until) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(area.x, area.y, area.w, area.h);
      }
    }

    // Text at device resolution.
    this.text(ctx, String(me.lvl), 27.5, T + 31, 8, '#ffeba4', 'center');
    this.text(ctx, String(me.depth), W - 42, T + 11.5, 8, '#cacfc2', 'right');
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
      const [sx, sy, w, h] = ICONS.busy;
      ctx.setTransform(ui, 0, 0, ui, 0, 0);
      ctx.save();
      ctx.translate(W / 2 - 4 - notice.length * 1.6, T + 42 + state.party.length * 10);
      ctx.rotate(now / 300);
      ctx.drawImage(assets.icons, sx, sy, w, h, -w / 2, -h / 2, w, h);
      ctx.restore();
      this.text(ctx, notice, W / 2 + 2, T + 44 + state.party.length * 10, 7, COLORS.highlight, 'center');
    }

    // Message log above the toolbar; old lines fade away.
    const lines = state.log.filter((line) => now - line.time < 8000).slice(-4);
    lines.forEach((line, i) => {
      const age = now - line.time;
      const alpha = age < 6000 ? 1 : 1 - (age - 6000) / 2000;
      this.text(ctx, line.text, 3, B - 29 - (lines.length - 1 - i) * 10, 8, line.color, 'left', alpha);
    });
    if (this.bottom > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, B * ui, W * ui + ui, this.bottom * ui + ui);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
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

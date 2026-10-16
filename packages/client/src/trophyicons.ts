/** Ranked-mode sprites from assets/meta/trophies16.png and trophies32.png (Design System «Pixel Dungeon UI», v15). They replace 🔥 ❄ 🏆 🥇 🥈 🥉 🏅 in rankui.ts. */
export type TrophyKind = 'gold' | 'silver' | 'bronze' | 'week';
export type RankIcon = TrophyKind | 'flame' | 'flame-off' | 'frost';

/** The icon of a trophy record: `board` is like "daily:2026-10-12", "week:2026-W41". */
export function trophyKind(board: string, place: number): TrophyKind {
  const kind = board.split(':')[0];
  if (kind === 'week') return 'week';
  return place === 1 ? 'gold' : place === 2 ? 'silver' : 'bronze';
}

/** `<i class="pd-tro …">`: 16 px, or 32 px with `big`; `x1` draws it at ×1. */
export function rankIcon(kind: RankIcon, opts: { big?: boolean; x1?: boolean } = {}): HTMLElement {
  const i = document.createElement('i');
  i.className = `pd-tro ${kind}${opts.big ? ' big' : ''}${opts.x1 ? ' x1' : ''}`;
  i.setAttribute('aria-hidden', 'true');
  return i;
}

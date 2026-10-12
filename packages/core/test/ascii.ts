import { HEIGHT, T, WIDTH } from '../src/index';

/* Debug view of a map: one character per cell. */

const GLYPHS = new Map<number, string>([
  [T.WALL, '#'], [T.WALL_DECO, '#'], [T.EMPTY, '.'], [T.EMPTY_SP, '.'], [T.EMPTY_DECO, ','],
  [T.GRASS, '"'], [T.HIGH_GRASS, '&'], [T.DOOR, '+'], [T.SECRET_DOOR, 'S'], [T.ENTRANCE, '<'],
  [T.EXIT, '>'], [T.SIGN, '?'], [T.CHASM, ' '], [T.EMBERS, ':'], [T.BOOKSHELF, 'B'],
  [T.PEDESTAL, 'P'], [T.INACTIVE_TRAP, '_'], [T.FIRE_TRAP, '^'],
]);

export function ascii(map: readonly number[]): string {
  const rows: string[] = [];
  for (let y = 0; y < HEIGHT; y++) {
    let row = '';
    for (let x = 0; x < WIDTH; x++) {
      const t = map[x + y * WIDTH]!;
      if (t >= T.WATER_TILES && t <= T.WATER) row += '~';
      else if (t >= T.CHASM_FLOOR && t <= T.CHASM_WATER) row += ' ';
      else row += GLYPHS.get(t) ?? (String(t).length === 1 ? String(t) : '^');
    }
    rows.push(row);
  }
  return rows.join('\n');
}

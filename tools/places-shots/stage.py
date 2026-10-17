"""Staging for the places' screenshots: puts a place on the floor beside the hero, in the running game (client side only, nothing is saved)."""
import time

STAGE = """
(args) => {
  const { kind, dx, dy, water, extra } = args;
  const c = __pd.core, w = __pd.session.world, h = w.heroes[0];
  const W = c.WIDTH;
  const level = c.levelAt(w, h.depth);
  const floor = w.floors[h.depth];
  const cell = h.pos + dx + dy * W;
  const set = (pos, terrain) => { level.map[pos] = terrain; };
  const T = c.T;
  switch (kind) {
    case 'well': set(cell, T.WELL); level.wells = level.wells.filter((x) => x.pos !== cell); level.wells.push({ pos: cell, water }); break;
    case 'dry': set(cell, T.EMPTY_WELL); break;
    case 'pot': set(cell, T.ALCHEMY); break;
    case 'shelf': set(cell, T.BOOKSHELF); break;
    case 'sign': set(cell, T.SIGN); break;
    case 'statue': set(cell, T.STATUE); break;
    case 'altar':
      for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) set(cell + x + y * W, T.EMBERS);
      set(cell, T.PEDESTAL); floor.altar = { pos: cell, volume: 60 }; level.altar = { pos: cell, volume: 60 }; break;
    case 'pedestal':
      set(cell, T.PEDESTAL);
      floor.heaps = floor.heaps.filter((x) => x.pos !== cell);
      floor.heaps.push({ pos: cell, kind: 'heap', items: [c.createItem(extra || 'ring.accuracy', 1, 0)] }); break;
    case 'dew':
      floor.heaps = floor.heaps.filter((x) => x.pos !== cell);
      floor.heaps.push({ pos: cell, kind: 'heap', items: [c.createItem('dew', 1, 0)] }); break;
    case 'sungrass':
      set(cell, T.GRASS); floor.plants = (floor.plants || []).filter((x) => x.pos !== cell); floor.plants.push({ pos: cell, kind: 'sungrass' }); break;
    case 'clear':
      for (let y = -4; y <= 4; y++) for (let x = -5; x <= 5; x++) {
        const p = h.pos + x + y * W;
        if ([T.WELL, T.EMPTY_WELL, T.ALCHEMY, T.BOOKSHELF, T.SIGN, T.STATUE, T.PEDESTAL, T.EMBERS].includes(level.map[p])) set(p, T.EMPTY);
      }
      level.wells = []; floor.altar = undefined; floor.heaps = []; floor.plants = []; break;
    default: break;
  }
  w.turn += 1;
  return cell;
}
"""

ROOM = """
() => {
  // The biggest open stretch round the hero: how far it goes in each of the four ways, for choosing where to stage.
  const c = __pd.core, w = __pd.session.world, h = w.heroes[0];
  const level = c.levelAt(w, h.depth); const W = c.WIDTH;
  const open = (p) => level.map[p] === c.T.EMPTY || level.map[p] === c.T.EMPTY_SP || level.map[p] === c.T.GRASS;
  const reach = (d) => { let n = 0; while (n < 8 && open(h.pos + d * (n + 1))) n++; return n; };
  return { pos: h.pos, x: h.pos % W, y: Math.trunc(h.pos / W), east: reach(1), west: reach(-1), south: reach(W), north: reach(-W) };
}
"""


def stage(page, kind, dx=0, dy=0, water='health', extra=None):
    cell = page.evaluate(STAGE, {'kind': kind, 'dx': dx, 'dy': dy, 'water': water, 'extra': extra})
    return cell


def room(page):
    return page.evaluate(ROOM)


def zoom(page, steps=2):
    for _ in range(steps):
        page.evaluate("__pd.cam.zoomStep(1, null)")


OPEN = """
(radius) => {
  // A cell with open floor all round it for `radius` cells, nearest the middle of the level: where there is room to stage a scene.
  const c = __pd.core, w = __pd.session.world, h = w.heroes[0];
  const level = c.levelAt(w, h.depth); const W = c.WIDTH, H = c.HEIGHT;
  const open = (p) => [c.T.EMPTY, c.T.EMPTY_SP, c.T.GRASS, c.T.EMPTY_DECO].includes(level.map[p]);
  let best = -1, bestD = 1e9;
  for (let y = radius + 1; y < H - radius - 1; y++) for (let x = radius + 1; x < W - radius - 1; x++) {
    let ok = true;
    for (let dy = -radius; dy <= radius && ok; dy++) for (let dx = -radius; dx <= radius; dx++) if (!open(x + dx + (y + dy) * W)) { ok = false; break; }
    if (!ok) continue;
    const d = Math.hypot(x - W / 2, y - H / 2);
    if (d < bestD) { bestD = d; best = x + y * W; }
  }
  return best;
}
"""

MOVE = """
(pos) => {
  const c = __pd.core, w = __pd.session.world, h = w.heroes[0];
  c.levelAt(w, h.depth);
  h.pos = pos; w.turn += 1;
  return pos;
}
"""


def open_spot(page, radius=3):
    return page.evaluate(OPEN, radius)


def move_hero(page, pos):
    page.evaluate(MOVE, pos)


CARVE = """
(args) => {
  // A plain lit hall to stage in: floor from (x0, y0) to (x1, y1), walls round it, no monsters, no heaps; the hero in the middle of it.
  const { x0, y0, x1, y1 } = args;
  const c = __pd.core, w = __pd.session.world, h = w.heroes[0];
  const level = c.levelAt(w, h.depth); const floor = w.floors[h.depth]; const W = c.WIDTH;
  for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
    const edge = x < x0 || x > x1 || y < y0 || y > y1;
    level.map[x + y * W] = edge ? c.T.WALL : c.T.EMPTY;
  }
  floor.mobs = []; floor.heaps = []; floor.plants = []; floor.gas = {};
  c.exploredCells(w, h.depth).fill(true);
  h.pos = Math.trunc((x0 + x1) / 2) + Math.trunc((y0 + y1) / 2) * W;
  w.turn += 1;
  return h.pos;
}
"""


def carve(page, x0=10, y0=9, x1=22, y1=19):
    return page.evaluate(CARVE, {'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1})

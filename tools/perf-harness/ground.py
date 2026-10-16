from shot import *
import sys, math
from PIL import Image
tag = sys.argv[1]
only = sys.argv[2].split(',') if len(sys.argv) > 2 else None
folder = r'C:\pixel_dungeon\pd-fl-engine3\docs\r3d-ground'
os.makedirs(folder, exist_ok=True)
FIND = """([d, what]) => {
  const c = __pd.core; const w = __pd.session.world; const l = c.levelAt(w, d); const W = c.WIDTH; const m = l.map; const T = c.T;
  const flags = (t) => c.terrainFlags[t] || 0;
  const plain = (t) => t === T.EMPTY || t === 14 || t === 24;
  const water = (t) => t >= 48 && t <= 63;
  const ok = (i) => i > 3 * W && i < m.length - 3 * W;
  let best = -1, bs = -1;
  for (let i = 3 * W + 3; i < m.length - 3 * W - 3; i++) {
    const t = m[i]; let s = 0;
    const around = (f) => { let n = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (f(m[i + dx + dy * W])) n++; return n; };
    if (what === 'dry') { if (!plain(t)) continue; s = around(plain) - 3 * around((x) => water(x) || x === 15 || x === 2); if (around((x) => (flags(x) & c.F.PASSABLE) === 0) > 4) continue; }
    else if (what === 'water') { if (!water(t)) continue; s = around(water); }
    else if (what === 'grass') { if (t !== 2 && t !== 15) continue; if (t !== 2) continue; s = around((x) => x === 15) * 2 + around((x) => x === 2) + (m[i + W] === 15 ? 30 : 0); }
    if (s > bs) { bs = s; best = i; }
  }
  return best;
}"""
SPAWN = """([d, kind, pos]) => { const w = __pd.session.world; const f = w.floors[d]; f.mobs = f.mobs.filter((m) => m.id[0] !== '%');
  f.mobs.push({id: '%' + kind, kind, pos, hp: 8, ht: 8, state: 'sleeping', target: -1, enemy: null, enemySeen: false, alerted: false, time: 0}); }"""
with sync_playwright() as p:
    b, pg = launch_seeded(p, query='perf=1&reveal=1')
    set_tier(pg, 'high')
    def hero_xy():
        return pg.evaluate("""() => { const c = __pd.camera; const h = __pd.session.world.heroes[0]; const W = __pd.core.WIDTH;
          const x = ((h.pos % W) * 16 + 8 - c.x) * c.zoom; const y = ((Math.floor(h.pos / W) * 16 + 7 - c.y) * c.zoom) * Math.sin(70 * Math.PI / 180); return [x, y, c.zoom]; }""")
    def shot(name, d, cell, extra=None, others=None):
        view_at(pg, d, cell)
        for _ in range(2): pg.evaluate("__pd.cam.zoomStep(1, null)")
        if extra: pg.evaluate(extra[0], extra[1])
        pg.evaluate("__pd.advance(900)")
        pg.evaluate("__pd.cam.recentre()")
        pg.evaluate("__pd.advance(1200)")
        pg.evaluate("document.getElementById('game').style.visibility = 'hidden'")
        path = snap(pg, f'tmp-{name}', folder=os.environ['TEMP'])
        x, y, z = hero_xy()
        im = Image.open(path)
        s = 230
        box = (int(x - s), int(y - s * 1.25), int(x + s), int(y + s * 0.75))
        # the camera keeps the hero a little above the middle: crop around where the hero is
        im.crop(box).resize((800, 800), Image.NEAREST).save(os.path.join(folder, f'{tag}-{name}.jpg'), quality=88)
        return im
    scenes = {}
    d = 1
    dry = pg.evaluate(FIND, [d, 'dry']); print('dry', dry)
    cases = [
      ('dry', d, dry, None),
      ('rat', d, dry, (SPAWN, [d, 'rat', dry + 1])),
      ('bat', d, dry, (SPAWN, [d, 'bat', dry + 1])),
      ('item', d, dry, ("""([d, pos]) => { const f = __pd.session.world.floors[d]; f.heaps.push({pos, kind: 'heap', items: [{kind: 'potion.healing', qty: 1, level: 0}]}); }""", [d, dry])),
    ]
    wat = pg.evaluate(FIND, [d, 'water']); print('water', wat)
    cases.append(('water', d, wat, None))
    gr = pg.evaluate(FIND, [2, 'grass']); print('grass', gr)
    cases.append(('grass', 2, gr, None))
    for name, dd, cell, extra in cases:
        if only and name not in only: continue
        shot(name, dd, cell, extra)
        if extra:
            pg.evaluate("""() => { const w = __pd.session.world; for (const f of Object.values(w.floors)) { f.mobs = f.mobs.filter((m) => m.id[0] !== '%'); f.heaps = f.heaps.filter((h) => !(h.items[0].kind === 'potion.healing' && h.kind === 'heap' && h.pos === w.heroes[0].pos)); } }""")
    b.close()

from shot import *
import sys, json
out = sys.argv[1]
only = sys.argv[2].split(',') if len(sys.argv) > 2 else None
FIND = open('ground.py', encoding='utf-8').read().split('FIND = """')[1].split('"""')[0]
TIMED = """async ([n, setup]) => {
  const gl = __pd.r3.renderer.getContext(); let v = performance.now() + 100; const times = [];
  if (setup) eval(setup);
  for (let i = 0; i < n; i++) { const t0 = performance.now(); __pd.tick(v += 33); gl.finish(); times.push(performance.now() - t0); await new Promise(r => setTimeout(r, 4)); }
  return times; }"""
SCEN = {
  'bolt': """(() => { const h = __pd.session.world.heroes[0]; const W = __pd.core.WIDTH; __pd.view.projectiles.push({from: h.pos, to: h.pos + 3, start: __pd.fx.now, duration: 500, sprite: null, bolt: 'lightning'}); __pd.view.projectiles.push({from: h.pos, to: h.pos - 3, start: __pd.fx.now, duration: 500, sprite: null, bolt: 'fire'}); })()""",
  'bright': """(() => { const h = __pd.session.world.heroes[0]; const W = __pd.core.WIDTH; const x = (h.pos % W) * 16 + 8, y = Math.floor(h.pos / W) * 16 + 8; __pd.fx.pulse(x, y, __pd.fx.now, '255, 240, 200', 9, 700); __pd.fx.burst(x, y, __pd.fx.now, {count: 30, colors: ['#ffe080', '#ff9040'], speed: [20, 60], life: [300, 700], glow: true}); })()""",
  'kill': """(() => { const w = __pd.session.world; const h = w.heroes[0]; const f = w.floors[h.depth]; f.mobs.push({id: '%k', kind: 'rat', pos: h.pos + 1, hp: 1, ht: 8, state: 'sleeping', target: -1, enemy: null, enemySeen: false, alerted: false, time: 0}); __pd.advance(300); for (let i = 0; i < 6; i++) { if (!f.mobs.some((m) => m.id === '%k')) break; __pd.session.send({type: 'attack', target: '%k'}); } })()""",
  'newmob': """(() => { const w = __pd.session.world; const h = w.heroes[0]; const f = w.floors[h.depth]; f.mobs.push({id: '%b', kind: 'bat', pos: h.pos + 1, hp: 8, ht: 8, state: 'sleeping', target: -1, enemy: null, enemySeen: false, alerted: false, time: 0}); f.mobs.push({id: '%g', kind: 'gnoll', pos: h.pos - 1, hp: 8, ht: 8, state: 'sleeping', target: -1, enemy: null, enemySeen: false, alerted: false, time: 0}); })()""",
}
res = {}
with sync_playwright() as p:
    for name in ('idle', 'bolt', 'bright', 'kill', 'newmob', 'mirror'):
        if only and name not in only: continue
        b, pg = launch_seeded(p, query='perf=1')
        set_tier(pg, 'high')
        d = 1
        dry = pg.evaluate(FIND, [d, 'dry'])
        view_at(pg, d, dry)
        pg.evaluate("__pd.advance(1500)")
        if name == 'mirror':
            wat = pg.evaluate(FIND, [d, 'water'])
            # teleport to the shore: the first frame with water in view
            setup = "(() => { const w = __pd.session.world; w.heroes[0].pos = %d; __pd.session.send({type: 'wait'}); })()" % wat
        else:
            setup = SCEN.get(name)
        times = pg.evaluate(TIMED, [40, setup])
        s = sorted(times)
        res[name] = {'max': round(max(times), 1), 'first5': [round(t, 1) for t in times[:5]], 'median': round(s[len(s) // 2], 1)}
        print(name, res[name], flush=True)
        b.close()
json.dump(res, open(out, 'w'), indent=1)

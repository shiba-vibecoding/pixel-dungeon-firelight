from shot import *
import sys, json
FIND = open('ground.py', encoding='utf-8').read().split('FIND = """')[1].split('"""')[0]
mode = sys.argv[1]            # a tier name, or 'auto' (the governor decides)
rate = float(sys.argv[2]) if len(sys.argv) > 2 else 6
secs = float(sys.argv[3]) if len(sys.argv) > 3 else 12
out = sys.argv[4] if len(sys.argv) > 4 else None
DRIVER = """([cell]) => {
  const w = __pd.session.world; const h = w.heroes[0]; const f = w.floors[h.depth]; const W = __pd.core.WIDTH; let n = 0;
  h.hp = h.ht = 99999;
  const ring = [1, -1, W, -W, W + 1, W - 1, -W + 1, -W - 1];
  const alive = () => f.mobs.filter((m) => m.id[0] === '%' && m.hp > 0);
  window.__drv = setInterval(() => {
    h.hp = h.ht;
    const mobs = alive();
    for (let i = mobs.length; i < 4; i++) { const pos = h.pos + ring[(n++) % ring.length]; if (!f.mobs.some((m) => m.pos === pos)) f.mobs.push({id: '%' + n, kind: n % 2 ? 'rat' : 'gnoll', pos, hp: 5, ht: 5, state: 'hunting', target: h.pos, enemy: h.id, enemySeen: true, alerted: true, time: 0}); }
    const m = mobs.find((m) => Math.abs((m.pos % W) - (h.pos % W)) <= 1 && Math.abs(Math.floor(m.pos / W) - Math.floor(h.pos / W)) <= 1);
    if (m) __pd.session.send({type: 'attack', target: m.id}); else __pd.session.send({type: 'wait'});
    const v = __pd.view; const now = __pd.fx.now;
    v.projectiles.push({from: h.pos, to: h.pos + 4, start: now, duration: 260, sprite: null, bolt: n % 3 ? 'fire' : 'lightning'});
    const x = (h.pos % W) * 16 + 8, y = Math.floor(h.pos / W) * 16 + 8;
    __pd.fx.pulse(x, y, now, '255, 230, 180', 7, 500);
    f.gas = {toxic: [[h.pos + 2, 40], [h.pos + 3, 30], [h.pos + 2 + W, 30], [h.pos - 2, 30], [h.pos - 2 - W, 25]]};
  }, 380);
}"""
RAF = """async ([ms]) => {
  const gaps = []; const cpu = []; let last = performance.now(); const end = last + ms; const tiers = []; const t0 = last;
  await new Promise((resolve) => { const step = (t) => { const g = t - last; last = t; gaps.push(g); cpu.push(__pd.r3.sample.cpuMs); if (tiers.length === 0 || tiers[tiers.length - 1][1] !== __pd.governor.tier.name) tiers.push([Math.round(t - t0), __pd.governor.tier.name]); if (t < end) requestAnimationFrame(step); else resolve(); }; requestAnimationFrame(step); });
  return {gaps, cpu, tiers, calls: __pd.r3.sample.calls}; }"""
with sync_playwright() as p:
    b, pg = launch_seeded(p, query='perf=1')
    cdp = pg.context.new_cdp_session(pg)
    d = 3
    wts = {'water': 3, 'grass': 3, 'shore': 12}
    s = spot(pg, d, wts)
    view_at(pg, d, s['cell'])
    if mode != 'auto':
        set_tier(pg, mode)
    else:
        pg.evaluate("(() => { const g = __pd.governor; g.index = 0; g.holding = 0; g.hold(1500); })()")
        pg.evaluate("__pd.r3.applyTier(__pd.governor.tier)")
    pg.evaluate(DRIVER, [s['cell']])
    time.sleep(float(os.environ.get('SETTLE', '4.5')))
    if rate > 1: cdp.send('Emulation.setCPUThrottlingRate', {'rate': rate})
    prof = len(sys.argv) > 5 and sys.argv[5] == 'prof'
    if prof:
        cdp.send('Profiler.enable'); cdp.send('Profiler.setSamplingInterval', {'interval': 500}); cdp.send('Profiler.start')
    r = pg.evaluate(RAF, [secs * 1000])
    if prof:
        import collections
        pr = cdp.send('Profiler.stop')['profile']
        nodes = {n['id']: n for n in pr['nodes']}
        selft = collections.Counter(); total = 0
        for sid, dt in zip(pr['samples'], pr['timeDeltas']):
            cf = nodes[sid]['callFrame']; selft[(cf['functionName'] or '(anon)', cf['url'].split('/')[-1].split('?')[0], cf['lineNumber'])] += dt; total += dt
        parent = {}
        for n in pr['nodes']:
            for c in n.get('children', []): parent[c] = n['id']
        callers = collections.Counter()
        for sid, dt in zip(pr['samples'], pr['timeDeltas']):
            cf = nodes[sid]['callFrame']
            if cf['functionName'] in ('getBoundingClientRect', 'getImageData', 'fillText', 'get clientWidth', 'getParameter'):
                chain = []; cur = sid
                for _ in range(4):
                    cur = parent.get(cur)
                    if cur is None: break
                    c2 = nodes[cur]['callFrame']; chain.append((c2['functionName'] or '(anon)') + ':' + c2['url'].split('/')[-1].split('?')[0] + ':' + str(c2['lineNumber']))
                callers[(cf['functionName'], ' < '.join(chain))] += dt
        print('CALLERS')
        for k, v in callers.most_common(12): print(round(v / 1000), k)
        print('PROFILE total ms', round(total / 1000))
        for k, v in selft.most_common(30): print(round(v / 1000), k)
    if rate > 1: cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
    g = sorted(r['gaps'][5:]); c = sorted(r['cpu'][5:])
    q = lambda a, f: a[min(len(a) - 1, int(len(a) * f))]
    res = {'mode': mode, 'rate': rate, 'frames': len(g), 'gap_ms': {'median': round(q(g, .5), 1), 'p95': round(q(g, .95), 1), 'p99': round(q(g, .99), 1), 'max': round(g[-1], 1)},
           'cpu_ms': {'median': round(q(c, .5), 2), 'p95': round(q(c, .95), 2), 'p99': round(q(c, .99), 2), 'max': round(c[-1], 2)}, 'tiers': r['tiers'], 'calls': r['calls'],
           'tier_end': pg.evaluate("__pd.governor.tier.name")}
    print(json.dumps(res))
    if out: json.dump(res, open(out, 'w'))
    b.close()

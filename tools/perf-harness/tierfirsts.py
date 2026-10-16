from shot import *
import sys, json
exec(open('firsts.py', encoding='utf-8').read().split("res = {}")[0].split("out = sys.argv[1]")[1])
res = {}
with sync_playwright() as p:
    b, pg = launch_seeded(p, query='perf=1')
    d = 1
    dry = pg.evaluate(FIND, [d, 'dry'])
    view_at(pg, d, dry)
    pg.evaluate("__pd.advance(2000)")
    for k, name in ((1, 'mid'), (2, 'low'), (3, 'min')):
        setup = "(() => { const g = __pd.governor; g.index = %d; __pd.r3.applyTier(g.tier); __pd.resize(); })()" % k
        times = pg.evaluate(TIMED, [30, setup])
        res[name] = {'max': round(max(times), 1), 'first5': [round(t, 1) for t in times[:5]]}
        print(name, res[name], flush=True)
        pg.evaluate("__pd.advance(1500)")
    b.close()

"""Draw calls with and without the places on screen: python tools/places-shots/perf.py"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, __import__('os').path.dirname(__file__))
from shots import *  # noqa: E402,F403

with sync_playwright() as p:
    browser, page = launch(p, query='lang=ru&perf=1')
    settle(page, 3000)
    hall(page)
    def calls():
        page.evaluate("__pd.advance(400)")
        return page.evaluate("(() => { const s = __pd.r3.sample; return [s.calls, s.triangles, Math.round(s.cpuMs * 100) / 100]; })()")
    print('empty hall', calls())
    stage(page, 'well', -2, -1, 'health'); stage(page, 'well', 0, -2, 'awareness'); stage(page, 'well', 2, -1, 'transmutation')
    stage(page, 'altar', -3, -3); stage(page, 'pot', 3, -3); stage(page, 'sungrass', 0, 2)
    for k in (-2, -1, 0, 1): stage(page, 'shelf', k, 3)
    print('all places', calls())
    fire(page, "[{type:'well', hero: me, water:'health'}]")
    print('beam', calls())
    browser.close()

import sys, json, time, os
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:%s/pixel-dungeon-firelight/' % os.environ.get('PD_PORT', '5173')
OUT = r'C:\pixel_dungeon\pd-fl-engine3\docs\r3d-m3'
os.makedirs(OUT, exist_ok=True)

FIND = """
(args) => {
  const [depth, kind] = args;
  const c = __pd.core;
  const w = __pd.session.world;
  const lvl = c.levelAt(w, depth);
  const m = lvl.map;
  const W = 32;
  const T = c.T;
  const hits = [];
  for (let i = 0; i < m.length; i++) {
    const t = m[i];
    if (kind === 'entrance' && t === T.ENTRANCE) hits.push(i);
    else if (kind === 'exit' && (t === T.EXIT || t === T.UNLOCKED_EXIT || t === T.LOCKED_EXIT)) hits.push(i);
    else if (kind === 'water' && t >= 48 && t <= 63) hits.push(i);
    else if (kind === 'grass' && t === T.HIGH_GRASS) hits.push(i);
    else if (kind === 'deco' && t === T.WALL_DECO) hits.push(i);
    else if (kind === 'embers' && t === T.EMBERS) hits.push(i);
  }
  return {W: c.WIDTH, hits, entrance: lvl.entrance, exit: lvl.exit};
}
"""


def launch(p, width=375, height=812, dpr=2, query='perf=1', gpu=True):
    args = ['--use-angle=d3d11', '--ignore-gpu-blocklist'] if gpu else []
    b = p.chromium.launch(args=args)
    pg = b.new_page(viewport={'width': width, 'height': height}, device_scale_factor=dpr)
    pg.logs = []
    pg.on('console', lambda m: pg.logs.append(m.text))
    pg.on('pageerror', lambda e: pg.logs.append('ERR ' + str(e)))
    pg.goto(BASE + '?' + query)
    time.sleep(2)
    pg.evaluate("__pd.startSolo('new')")
    time.sleep(2)
    try:
        pg.get_by_text('Играть без рейтинга').click(timeout=3000)
    except Exception:
        pass
    time.sleep(3)
    # close the how-to-play window
    try:
        pg.mouse.click(width - 36, 36)
    except Exception:
        pass
    time.sleep(0.5)
    return b, pg


def goto_depth(pg, depth, pos=None):
    pg.evaluate("""([d, pos]) => {
      const c = __pd.core; const w = __pd.session.world; const h = w.heroes[0];
      const lvl = c.levelAt(w, d);
      h.depth = d; h.pos = pos == null ? lvl.entrance : pos;
    }""", [depth, pos])
    pg.evaluate("__pd.advance(1500)")


def find(pg, depth, kind):
    return pg.evaluate(FIND, [depth, kind])


def place(pg, depth, pos, ms=1500):
    pg.evaluate("""([d, pos]) => {
      const c = __pd.core; const w = __pd.session.world; const h = w.heroes[0];
      c.levelAt(w, d);
      h.depth = d; h.pos = pos;
    }""", [depth, pos])
    pg.evaluate("__pd.advance(%d)" % ms)


def stats(pg):
    return pg.evaluate("""() => { const r = __pd.r3; if (!r) return null; const s = r.sample;
      return {cpu: s.cpuMs, render: s.renderMs, gpu: s.gpuMs, calls: s.calls, maxCalls: s.maxCalls, tris: s.triangles, tier: __pd.governor.tier.name}; }""")


def measure(pg, ms=3000):
    """Real-time frames for `ms`; average of the overlay's numbers sampled over the run."""
    return pg.evaluate("""async (ms) => {
      const out = {cpu: 0, render: 0, gpu: 0, calls: 0, n: 0}; const end = performance.now() + ms;
      while (performance.now() < end) {
        __pd.tick(performance.now());
        await new Promise(r => setTimeout(r, 16));
        const s = __pd.r3.sample; out.cpu += s.cpuMs; out.render += s.renderMs; out.gpu += s.gpuMs; out.calls = s.calls; out.tris = s.triangles; out.n++;
      }
      out.cpu /= out.n; out.render /= out.n; out.gpu /= out.n; return out; }""", ms)


SPOT = """
([depth, weights]) => {
  const c = __pd.core; const w = __pd.session.world; const lvl = c.levelAt(w, depth); const m = lvl.map; const W = c.WIDTH; const H = c.HEIGHT;
  const T = c.T;
  const kindOf = (t) => (t >= 48 && t <= 63) ? 'water' : t === T.HIGH_GRASS ? 'grass' : t === T.WALL_DECO ? 'deco'
    : (t === T.ENTRANCE) ? 'entrance' : (t === T.EXIT || t === T.UNLOCKED_EXIT) ? 'exit' : (t === T.EMBERS) ? 'embers' : t === T.GRASS ? 'sgrass' : 'other';
  const pass = (t) => { const f = c.terrainFlags[t] || 0; return (f & c.F.PASSABLE) !== 0 && !(t >= 48 && t <= 63 && false); };
  let best = -1, bs = -1;
  for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) {
    const i = x + y * W; const t = m[i];
    if (!pass(t) || (t >= 48 && t <= 63) ) continue;
    let s = 0;
    for (let dy = -5; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const k = kindOf(m[(x + dx) + (y + dy) * W]); s += weights[k] || 0; }
    if (weights.shore) { let adj = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (kindOf(m[(x + dx) + (y + dy) * W]) === 'water') adj++; s += adj * weights.shore; }
    if (s > bs) { bs = s; best = i; }
  }
  return {cell: best, score: bs, entrance: lvl.entrance, exit: lvl.exit};
}
"""


def spot(pg, depth, weights):
    return pg.evaluate(SPOT, [depth, weights])


def set_tier(pg, name):
    idx = {'high': 0, 'mid': 1, 'low': 2, 'min': 3}[name]
    pg.evaluate("""(i) => { const g = __pd.governor; g.index = i; g.hold(1e9); __pd.r3.applyTier(g.tier); __pd.resize(); }""", idx)


def hide_ui(pg):
    pg.evaluate("""() => { for (const sel of ['#ui', '#overlay', '#toast', '.pd-hover']) document.querySelectorAll(sel).forEach(e => e.style.visibility = 'hidden'); }""")


def snap(pg, name, ui=False, folder=None):
    if not ui:
        hide_ui(pg)
    pg.evaluate("__pd.advance(200)")
    time.sleep(0.2)
    path = os.path.join(folder or OUT, name + '.jpg')
    pg.screenshot(path=path, type='jpeg', quality=82)
    return path


def launch_seeded(p, width=375, height=812, dpr=2, query='perf=1', gpu=True, mobile=True):
    args = ['--use-angle=d3d11', '--ignore-gpu-blocklist'] if gpu else []
    b = p.chromium.launch(args=args)
    ctx = b.new_context(viewport={'width': width, 'height': height}, device_scale_factor=dpr, is_mobile=mobile, has_touch=mobile)
    ctx.route('http://127.0.0.1:8787/**', lambda route: route.abort())
    pg = ctx.new_page()
    pg.logs = []
    pg.on('console', lambda m: pg.logs.append(m.text))
    pg.on('pageerror', lambda e: pg.logs.append('ERR ' + str(e)))
    pg.add_init_script("""localStorage.setItem('pd-hints-off', '1');""")
    pg.goto(BASE + '?' + query)
    time.sleep(2)
    pg.evaluate("(() => { const g = __pd.governor; g.index = 0; g.hold(1e9); })()")
    pg.evaluate("window.__r = Math.random; Math.random = () => 0.31415926")
    pg.evaluate("__pd.startSolo('new')")
    time.sleep(1.5)
    try:
        pg.get_by_text('Играть без рейтинга').click(timeout=3000)
    except Exception:
        pass
    pg.wait_for_function("() => window.__pd && window.__pd.session && window.__pd.session.world", timeout=20000)
    pg.evaluate("(() => { const w = __pd.session.world; __pd.core.restartWorld(w, 1234567); })()")
    pg.evaluate("(() => { let a = 0x9e3779b9; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })()")
    time.sleep(2)
    try:
        pg.mouse.click(width - 36, 36)
    except Exception:
        pass
    time.sleep(0.5)
    return b, pg


REGIONS = {
    'sewers': (1, {'water': 3, 'grass': 2, 'shore': 12}),
    'prison': (6, {'water': 3, 'grass': 2, 'shore': 12}),
    'caves': (12, {'deco': 3, 'water': 2, 'grass': 2, 'shore': 12}),
    'city': (16, {'water': 3, 'grass': 2, 'shore': 12}),
    'halls': (24, {'water': 3, 'embers': 1, 'shore': 3}),
}


def view_at(pg, depth, cell, ms=1500):
    place(pg, depth, cell, 400)
    pg.evaluate("__pd.session.send({type: 'search'})")
    pg.evaluate("__pd.advance(400)")
    pg.evaluate("__pd.view.skipIntro(__pd.fx.now)")
    pg.evaluate("__pd.cam.recentre()")
    pg.evaluate("__pd.advance(%d)" % ms)

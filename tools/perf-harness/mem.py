from shot import *
import sys, json
TRACK = """
(() => {
  const P = WebGL2RenderingContext.prototype; const gl2 = WebGL2RenderingContext;
  const bpp = {}; // internal format -> bytes per pixel
  const G = WebGL2RenderingContext;
  bpp[G.RGBA8] = 4; bpp[G.SRGB8_ALPHA8] = 4; bpp[G.RGBA16F] = 8; bpp[G.RGBA32F] = 16; bpp[G.R8] = 1; bpp[G.RGB8] = 3; bpp[G.RGBA] = 4; bpp[G.RGB] = 3;
  bpp[G.DEPTH_COMPONENT24] = 4; bpp[G.DEPTH_COMPONENT16] = 2; bpp[G.DEPTH_COMPONENT32F] = 4; bpp[G.DEPTH24_STENCIL8] = 4; bpp[G.R16F] = 2; bpp[G.RG8] = 2; bpp[G.LUMINANCE] = 1;
  const tex = new Map(); const rb = new Map(); let bound = null; let boundRb = null; const live = {tex: 0, rb: 0};
  window.__mem = () => { let t = 0; for (const v of tex.values()) t += v; let r = 0; for (const v of rb.values()) r += v; return {textures: tex.size, texBytes: t, renderbuffers: rb.size, rbBytes: r}; };
  const wrap = (name, f) => { const o = P[name]; P[name] = function (...a) { const r = o.apply(this, a); f.call(this, a, r); return r; }; };
  wrap('createTexture', function (a, r) { tex.set(r, 0); });
  wrap('deleteTexture', function (a) { tex.delete(a[0]); });
  wrap('bindTexture', function (a) { if (a[0] === G.TEXTURE_2D) bound = a[1]; });
  wrap('texStorage2D', function (a) { if (!bound) return; const [t, levels, fmt, w, h] = a; let bytes = 0, ww = w, hh = h; for (let i = 0; i < levels; i++) { bytes += ww * hh * (bpp[fmt] || 4); ww = Math.max(1, ww >> 1); hh = Math.max(1, hh >> 1); } tex.set(bound, bytes); });
  wrap('texImage2D', function (a) { if (!bound || a[0] !== G.TEXTURE_2D || a[1] !== 0) return; const fmt = a[2]; const w = a[3], h = a[4]; if (typeof w === 'number' && typeof h === 'number' && a.length >= 9) tex.set(bound, Math.max(tex.get(bound) || 0, w * h * (bpp[fmt] || 4))); });
  wrap('createRenderbuffer', function (a, r) { rb.set(r, 0); });
  wrap('deleteRenderbuffer', function (a) { rb.delete(a[0]); });
  wrap('bindRenderbuffer', function (a) { boundRb = a[1]; });
  wrap('renderbufferStorage', function (a) { if (boundRb) rb.set(boundRb, a[2] * a[3] * (bpp[a[1]] || 4)); });
  wrap('renderbufferStorageMultisample', function (a) { if (boundRb) rb.set(boundRb, a[3] * a[4] * (bpp[a[2]] || 4) * Math.max(1, a[1])); });
})();
"""
out = sys.argv[1]
def snap_mem(pg, label):
    pg.evaluate('gc()'); pg.evaluate('gc()')
    m = pg.evaluate("""() => { const i = __pd.r3.renderer.info.memory; return {...window.__mem(), infoTextures: i.textures, infoGeometries: i.geometries, programs: __pd.r3.renderer.info.programs.length, heap: performance.memory ? performance.memory.usedJSHeapSize : 0}; }""")
    m['label'] = label
    return m
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'])
    ctx = b.new_context(viewport={'width': 375, 'height': 812}, device_scale_factor=2, is_mobile=True, has_touch=True)
    ctx.add_init_script(TRACK)
    ctx.route('http://127.0.0.1:8787/**', lambda route: route.abort())
    pg = ctx.new_page()
    pg.add_init_script("localStorage.setItem('pd-hints-off', '1');")
    pg.goto(BASE + '?perf=1')
    time.sleep(2)
    pg.evaluate("(() => { const g = __pd.governor; g.index = 0; g.hold(1e9); })()")
    pg.evaluate("window.__r = Math.random; Math.random = () => 0.31415926")
    pg.evaluate("__pd.startSolo('new')")
    time.sleep(1.5)
    try: pg.get_by_text('Играть без рейтинга').click(timeout=3000)
    except Exception: pass
    pg.wait_for_function("() => window.__pd && window.__pd.session && window.__pd.session.world", timeout=20000)
    pg.evaluate("(() => { __pd.core.restartWorld(__pd.session.world, 1234567); })()")
    time.sleep(2)
    pg.evaluate("__pd.advance(800)")
    rows = [snap_mem(pg, 'start d1')]
    seq = list(range(1, 21)) + list(range(1, 21))
    for i, d in enumerate(seq):
        pg.evaluate("""([d]) => { const c = __pd.core; const w = __pd.session.world; const l = c.levelAt(w, d); const h = w.heroes[0]; h.depth = d; h.pos = l.entrance; }""", [d])
        pg.evaluate("__pd.advance(900)")
        if d in (1, 6, 11, 16, 20) or i in (0, 19, 39):
            rows.append(snap_mem(pg, f'#{i + 1} d{d}'))
    for r in rows: print(r)
    json.dump(rows, open(out, 'w'), indent=1)
    b.close()

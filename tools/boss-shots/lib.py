"""Headless shots of the five boss fights (docs/bosses). Needs the dev server: npm run dev -w @pd/client -- --port 5191 (PD_PORT)."""
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

PORT = os.environ.get('PD_PORT', '5191')
BASE = 'http://127.0.0.1:%s/pixel-dungeon-firelight/' % PORT
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'docs', 'bosses')


def launch(p, width=412, height=760, dpr=2, query='lang=en&reveal=1', gpu=False, reduced=False):
    args = ['--use-angle=d3d11', '--ignore-gpu-blocklist'] if gpu else ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    browser = p.chromium.launch(args=args)
    context = browser.new_context(viewport={'width': width, 'height': height}, device_scale_factor=dpr, reduced_motion='reduce' if reduced else 'no-preference')
    page = context.new_page()
    page.add_init_script("localStorage.setItem('pd-hints', 'off'); localStorage.setItem('pd-coach-done', '1'); localStorage.setItem('pd-moved', '1'); localStorage.setItem('pd-fx', 'full'); localStorage.setItem('pd-hints-off', '1');")
    page.logs = []
    page.on('console', lambda m: page.logs.append(m.type + ': ' + m.text))
    page.on('pageerror', lambda e: page.logs.append('ERR ' + str(e)))
    page.route(re.compile(r'127\.0\.0\.1:8787'), lambda route: route.abort())
    page.goto(BASE + '?' + query)
    time.sleep(2.5)
    page.evaluate("__pd.startSolo('new')")
    time.sleep(2)
    for label in ('Играть без рейтинга', 'Play without ranking'):
        try:
            page.get_by_role('button', name=label, exact=True).click(timeout=4000)
            break
        except Exception:
            pass
    page.wait_for_function("() => window.__pd && window.__pd.session && window.__pd.session.world", timeout=30000)
    time.sleep(2)
    try:
        page.mouse.click(width - 36, 36)
    except Exception:
        pass
    time.sleep(0.5)
    return browser, page


def adv(page, ms):
    page.evaluate('__pd.advance(%d)' % ms)


def explore(page, depth):
    page.evaluate("(d) => { const w = __pd.session.world; w.explored[d] = new Array(__pd.core.LENGTH).fill(true); }", depth)


def goto(page, depth, pos=None, ms=800):
    page.evaluate("""([d, pos]) => {
      const c = __pd.core; const w = __pd.session.world; const h = w.heroes[0];
      const lvl = c.levelAt(w, d);
      h.depth = d; h.pos = pos == null ? lvl.entrance : pos;
    }""", [depth, pos])
    explore(page, depth)
    adv(page, ms)


def mobs(page, depth):
    return page.evaluate("""(d) => __pd.session.world.floors[d].mobs.map(m => ({id: m.id, kind: m.kind, pos: m.pos, hp: m.hp, ht: m.ht, state: m.state}))""", depth)


def snap(page, name, folder=None, ui=True):
    folder = folder or os.environ['TEMP']
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, name)
    page.screenshot(path=path)
    return path


def near(page, depth, target, dist=3):
    """A passable cell `dist` cells from `target` with a clear line (approximated by straight row/column), or -1."""
    return page.evaluate("""([d, target, dist]) => {
      const c = __pd.core; const w = __pd.session.world; const l = c.levelAt(w, d); const W = c.WIDTH;
      const tx = target % W, ty = Math.floor(target / W);
      const free = (i) => ((c.terrainFlags[l.map[i]] || 0) & c.F.PASSABLE) !== 0 && !w.floors[d].mobs.some(m => m.pos === i);
      const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];
      for (const [dx, dy] of dirs) {
        let ok = true;
        for (let k = 1; k <= dist; k++) { const i = (tx + dx * k) + (ty + dy * k) * W; if (!free(i) || (c.terrainFlags[l.map[i]] & c.F.LOS_BLOCKING)) { ok = false; break; } }
        if (ok) return (tx + dx * dist) + (ty + dy * dist) * W;
      }
      return -1;
    }""", [depth, target, dist])


def god(page, hp=9999):
    page.evaluate("(hp) => { const h = __pd.session.world.heroes[0]; h.ht = hp; h.hp = hp; }", hp)


def settle_view(page, ms=1200):
    page.evaluate("__pd.session.send({type: 'search'})")
    adv(page, 300)
    page.evaluate("__pd.cam.recentre()")
    adv(page, ms)


def errors(page):
    return [l for l in page.logs if l.startswith('ERR') or ('error' in l.lower() and 'Failed to load resource' not in l)]


from PIL import Image

BOX = """(id) => {
  const v = __pd.view; const p = v.puppets.get(id); if (!p) return null;
  const c = __pd.camera; const cv = document.getElementById('game') || document.querySelector('canvas');
  const ratio = cv.width / (cv.clientWidth || 1);
  const pos = v.position(p, __pd.fx.now);
  const ys = Math.sin(70 * Math.PI / 180);
  const x = (pos.x + 8 - c.x) * c.zoom / ratio;
  const feet = ((pos.y + 7 - c.y) * ys) * c.zoom / ratio;
  return {x, feet, zoom: c.zoom / ratio};
}"""


def box(page, id):
    return page.evaluate(BOX, id)


LAST = {}


def crop_of(page, id, w=230, h=250, up=0.72):
    """A clip (css px) round a figure's feet: `up` of its height above them."""
    b = box(page, id)
    if not b:
        return LAST.get(id)
    vw = page.viewport_size['width']
    vh = page.viewport_size['height']
    x = max(0, min(vw - w, b['x'] - w / 2))
    y = max(0, min(vh - h, b['feet'] - h * up))
    LAST[id] = {'x': x, 'y': y, 'width': w, 'height': h}
    return LAST[id]


def strip(page, id, times, name, folder=None, w=230, h=250, scale=1.0, act=None, hide_ui=True, cols=None):
    """Frames at the given times (ms after the call; `act` runs first at t=0): a contact sheet."""
    folder = folder or OUT
    os.makedirs(folder, exist_ok=True)
    if act:
        act()
    if hide_ui:
        page.add_style_tag(content='#ui, #overlay, .pd-overlay, #toast, .pd-hover { visibility: hidden !important; }')
    frames = []
    t0 = 0
    for t in times:
        if t > t0:
            adv(page, t - t0)
            t0 = t
        clip = crop_of(page, id, w, h)
        if clip is None:
            break
        path = os.path.join(os.environ['TEMP'], 'frame.png')
        page.screenshot(path=path, clip=clip)
        frames.append(Image.open(path).convert('RGB').copy())
    if hide_ui:
        page.evaluate("() => { const s = [...document.querySelectorAll('style')].filter(e => e.textContent.includes('visibility: hidden !important')); s.forEach(e => e.remove()); }")
    if not frames:
        return None
    cols = cols or len(frames)
    rows = (len(frames) + cols - 1) // cols
    fw, fh = frames[0].size
    sheet = Image.new('RGB', (fw * cols, fh * rows), (12, 10, 10))
    for i, f in enumerate(frames):
        sheet.paste(f, ((i % cols) * fw, (i // cols) * fh))
    if scale != 1.0:
        sheet = sheet.resize((int(sheet.width * scale), int(sheet.height * scale)), Image.LANCZOS)
    out = os.path.join(folder, name)
    sheet.save(out)
    return out


def zoom(page, steps=2):
    for _ in range(steps):
        page.evaluate("__pd.cam.zoomStep(1, null)")
    adv(page, 600)
    page.evaluate("__pd.cam.recentre()")
    adv(page, 1500)


def hero_id(page):
    return page.evaluate("__pd.session.world.heroes[0].id")


def fake(page, effects):
    """Plays effects as the core would send them (a look, never a rule)."""
    page.evaluate("(list) => __pd.takeEffects(list)", effects)


def mob_of(page, depth, kind):
    return page.evaluate("([d, k]) => { const m = __pd.session.world.floors[d].mobs.find(m => m.kind === k); return m ? {id: m.id, pos: m.pos, hp: m.hp, ht: m.ht, state: m.state} : null; }", [depth, kind])


def set_hp(page, depth, id, hp):
    page.evaluate("([d, id, hp]) => { const m = __pd.session.world.floors[d].mobs.find(m => m.id === id); m.hp = hp; }", [depth, id, hp])


def hit(page, depth, id, damage=6):
    fake(page, [{'type': 'attack', 'depth': depth, 'attacker': hero_id(page), 'target': id, 'hit': True, 'damage': damage}])


def step_hero(page, depth, cell, ms=400):
    page.evaluate("([d, c]) => { const h = __pd.session.world.heroes[0]; h.pos = c; }", [depth, cell])
    adv(page, ms)


def tap_mob(page, depth, kind):
    page.evaluate("([d, k]) => { const m = __pd.session.world.floors[d].mobs.find(m => m.kind === k); if (m) __pd.tapCell(m.pos); }", [depth, kind])


def kill_now(page, depth, kind, id, tries=40):
    """Taps the boss (the game's own attack, with all its effects) until it is gone from the world: its death has just begun."""
    for _ in range(tries):
        m = mob_of(page, depth, kind)
        if not m:
            return True
        # Next to it.
        c = near(page, depth, m['pos'], 1)
        if c >= 0:
            page.evaluate("(c) => { __pd.session.world.heroes[0].pos = c; }", c)
        set_hp_keep(page, depth, id)
        tap_mob(page, depth, kind)
        adv(page, 34)
        if not mob_of(page, depth, kind):
            return True
        adv(page, 250)
    return not mob_of(page, depth, kind)


def set_hp_keep(page, depth, id):
    page.evaluate("([d, id]) => { const m = __pd.session.world.floors[d].mobs.find(m => m.id === id); if (m && m.hp > 1) m.hp = 1; }", [depth, id])


TRIGGER = {  # depth: (cell to stand on, cell to step to)
    10: None, 15: (926, 926 + 48), 20: (831, 831 - 48), 25: (784, 785),
}


def enter(page, depth, kind):
    """Walks the hero over the line that wakes the boss of a depth (the core's own trigger), and returns the boss's mob."""
    god(page)
    goto(page, depth)
    if depth == 10:
        # Inside the arena room (a BOSS_EXIT room): one step wakes Tengu.
        cells = page.evaluate("""() => { const c = __pd.core; const w = __pd.session.world; const l = c.levelAt(w, 10); const r = l.rooms.find(r => r.type === c.RoomType.BOSS_EXIT);
          const out = []; const W = c.WIDTH;
          for (let y = r.top + 1; y < r.bottom; y++) for (let x = r.left + 1; x < r.right; x++) { const i = x + y * W; if (((c.terrainFlags[l.map[i]] || 0) & c.F.PASSABLE) !== 0) out.push(i); }
          return out; }""")
        a = cells[len(cells) // 2]
        b = a + 1 if a + 1 in cells else a - 1
        page.evaluate("(c) => { __pd.session.world.heroes[0].pos = c; }", a)
        adv(page, 400)
        page.evaluate("(c) => __pd.tapCell(c)", b)
    else:
        a, b = TRIGGER[depth]
        page.evaluate("(c) => { __pd.session.world.heroes[0].pos = c; }", a)
        adv(page, 400)
        page.evaluate("(c) => __pd.tapCell(c)", b)
    adv(page, 600)
    return mob_of(page, depth, kind)


from PIL import ImageDraw


def spawn_mob(page, depth, kind, pos, state='hunting'):
    return page.evaluate("""([d, kind, pos, state]) => {
      const w = __pd.session.world; const f = w.floors[d]; const id = '#t' + (++w.nextId);
      const m = __pd.core.createMob(id, kind, pos, state, f.now);
      m.enemy = w.heroes[0].id; m.target = w.heroes[0].pos;
      f.mobs.push(m); __pd.core.enterCell ? 0 : 0; return id; }""", [depth, kind, pos, state])


def remove_mobs(page, depth, kinds):
    page.evaluate("([d, kinds]) => { const f = __pd.session.world.floors[d]; f.mobs = f.mobs.filter(m => !kinds.includes(m.kind)); }", [depth, kinds])


def hero_pos(page):
    return page.evaluate("__pd.session.world.heroes[0].pos")


def look_at(page, depth, boss_pos, dist=3, zoom_steps=2, ms=900):
    """Brings the hero within sight of the boss and the camera onto them both."""
    c = near(page, depth, boss_pos, dist)
    if c < 0:
        c = near(page, depth, boss_pos, 2)
    goto(page, depth, c, 500)
    settle_view(page, ms)
    if zoom_steps:
        zoom(page, zoom_steps)
    return c


def panel(page, id, name, items, folder=None, w=200, h=200, scale=1.0, label=True):
    """One picture of several moments: items are (label, function that sets it up, ms to let it run); each is cropped round the figure."""
    folder = folder or OUT
    os.makedirs(folder, exist_ok=True)
    page.add_style_tag(content='#ui, #overlay, .pd-overlay, #toast, .pd-hover { visibility: hidden !important; }')
    frames = []
    for text, setup, ms in items:
        setup()
        adv(page, ms)
        clip = crop_of(page, id, w, h)
        path = os.path.join(os.environ['TEMP'], 'panel.png')
        page.screenshot(path=path, clip=clip)
        im = Image.open(path).convert('RGB').copy()
        if label:
            d = ImageDraw.Draw(im)
            d.rectangle([0, 0, im.width, 18], fill=(0, 0, 0))
            d.text((4, 3), text, fill=(255, 235, 170))
        frames.append(im)
    page.evaluate("() => { document.querySelectorAll('style').forEach(e => { if (e.textContent.includes('visibility: hidden !important')) e.remove(); }); }")
    fw, fh = frames[0].size
    sheet = Image.new('RGB', (fw * len(frames), fh), (12, 10, 10))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * fw, 0))
    if scale != 1.0:
        sheet = sheet.resize((int(sheet.width * scale), int(sheet.height * scale)), Image.LANCZOS)
    path = os.path.join(folder, name)
    sheet.save(path)
    return path

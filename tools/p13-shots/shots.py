"""Part 13 as the running game draws it (375x812, Russian, clean register): python tools/p13-shots/shots.py [group ...]
Needs the dev server for this worktree, offline: VITE_SERVER_URL=ws://127.0.0.1:9 npm run dev -w @pd/client -- --port 5220 (PD_PORT, default 5220).
Groups: dialog journal examine places smith mining statue garden library minor (nothing: all). Each writes docs/p13/<name>.png.
The quest and place staging is the one of tools/quest-shots and tools/places-shots (client-side only, nothing is saved)."""
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

PORT = os.environ.get('PD_PORT', '5220')
BASE = 'http://127.0.0.1:%s/pixel-dungeon-firelight/' % PORT
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'docs', 'p13')


def launch(p, width=375, height=812, dpr=2, query='lang=ru', gpu=True):
    args = ['--use-angle=d3d11', '--ignore-gpu-blocklist'] if gpu else ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    browser = p.chromium.launch(args=args)
    context = browser.new_context(viewport={'width': width, 'height': height}, device_scale_factor=dpr)
    page = context.new_page()
    page.add_init_script("localStorage.setItem('pd-hints', 'off'); localStorage.setItem('pd-coach-done', '1'); localStorage.setItem('pd-moved', '1'); localStorage.setItem('pd-fx', 'full'); localStorage.setItem('pd-quips', 'clean');")
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
            page.get_by_text(label).click(timeout=4000)
            break
        except Exception:
            pass
    time.sleep(3)
    try:
        page.mouse.click(width - 36, 36)
    except Exception:
        pass
    time.sleep(0.5)
    return browser, page


def shot(page, name):
    os.makedirs(OUT, exist_ok=True)
    page.screenshot(path=os.path.join(OUT, name))


def settle(page, ms=1000):
    page.evaluate('__pd.advance(%d)' % ms)
    time.sleep(0.3)


def effects(page, list_js):
    page.evaluate("(() => { const h = __pd.session.world.heroes[0]; const me = h.id; const depth = h.depth; __pd.takeEffects(%s); })()" % list_js)


def hide_toasts(page):
    page.evaluate("document.querySelectorAll('.pd-toast').forEach((n) => { if (n.id !== 'toast') n.remove(); }); const t = document.getElementById('toast'); if (t) t.hidden = true")


def close_all(page):
    page.keyboard.press('Escape')
    settle(page, 300)
    for _ in range(3):
        try:
            btn = page.locator('.pd-window .pd-close').first
            if btn.count():
                btn.click(timeout=800)
                time.sleep(0.2)
        except Exception:
            break
    settle(page, 300)


def strip(page):
    page.evaluate("""(() => { const h = __pd.session.world.heroes[0]; h.items = h.items.filter((i) => !i.kind.startsWith('quest.') && i.kind !== 'weapon.pickaxe' && i.kind !== 'weapon.sword'); })()""")


# ---- the floor: a hall carved round the hero, and the places put in it -------------------------------------------------------------

CARVE = """
(a) => {
  const c = __pd.core, w = __pd.session.world, h = w.heroes[0];
  const level = c.levelAt(w, h.depth); const W = c.WIDTH;
  const x0 = (h.pos % W) - 6, y0 = Math.trunc(h.pos / W) - 6;
  for (let y = y0; y <= y0 + 12; y++) for (let x = x0; x <= x0 + 12; x++) {
    const border = y === y0 || y === y0 + 12 || x === x0 || x === x0 + 12;
    const p = x + y * W;
    level.map[p] = border ? c.T.WALL : c.T.EMPTY;
    if (!border) w.explored[h.depth][p] = true;
  }
  w.floors[h.depth].mobs = w.floors[h.depth].mobs.filter((m) => Math.abs((m.pos % W) - (h.pos % W)) > 8 || Math.abs(Math.trunc(m.pos / W) - Math.trunc(h.pos / W)) > 8);
  w.floors[h.depth].heaps = []; level.wells = []; level.blacksmith = undefined; level.rooms = []; w.turn += 1;
}
"""

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
    case 'pot': set(cell, T.ALCHEMY); break;
    case 'shelf': set(cell, T.BOOKSHELF); break;
    case 'sign': set(cell, T.SIGN); break;
    case 'statue': set(cell, T.STATUE); break;
    case 'grass': set(cell, T.HIGH_GRASS); break;
    case 'pedestal':
      set(cell, T.PEDESTAL);
      floor.heaps = floor.heaps.filter((x) => x.pos !== cell);
      floor.heaps.push({ pos: cell, kind: 'heap', items: [c.createItem(extra || 'ring.accuracy', 1, 0)] }); break;
    case 'dew':
      floor.heaps = floor.heaps.filter((x) => x.pos !== cell);
      floor.heaps.push({ pos: cell, kind: 'heap', items: [c.createItem('dew', 1, 0)] }); break;
    case 'garden': level.rooms = [{ left: (cell % W) - 4, top: Math.trunc(cell / W) - 3, right: (cell % W) + 4, bottom: Math.trunc(cell / W) + 3, type: c.RoomType.GARDEN }]; break;
    case 'smith': level.blacksmith = cell; break;
    case 'mob': { const m = c.createMob('#9' + (floor.mobs.length + 10), extra, cell, water || 'sleeping', 0); m.ht = m.hp = 20; floor.mobs.push(m); break; }
    default: break;
  }
  w.turn += 1;
  return cell;
}
"""


def stage(page, kind, dx=0, dy=0, water=None, extra=None):
    return page.evaluate(STAGE, {'kind': kind, 'dx': dx, 'dy': dy, 'water': water, 'extra': extra})


def hall(page, zoom_steps=2):
    page.evaluate(CARVE, {})
    settle(page, 700)
    for _ in range(zoom_steps):
        page.evaluate("__pd.cam.zoomStep(1, null)")
    settle(page, 400)
    hide_toasts(page)


# ---- the quests --------------------------------------------------------------------------------------------------------------------

def talk(page, effect, name, wait=9.0):
    effects(page, effect)
    time.sleep(wait)
    shot(page, name)


def dialog(page):
    strip(page)
    page.evaluate("""(() => { const c = __pd.core, w = __pd.session.world, h = w.heroes[0];
      w.quest = { depth: 1, type: 'rose', given: true, dropped: false, killsLeft: 8, done: false, weapon: c.createItem('weapon.sword', 1, 2), armor: c.createItem('armor.mail', 1, 1) };
      h.items.push(c.createItem('quest.rose')); })()""")
    talk(page, "[{type:'ghost', hero:'me', line:'reward', errand:'rose'}]", 'dialog-ghost-pleased-reward.png')
    close_all(page)
    page.evaluate("""(() => { const c = __pd.core, w = __pd.session.world, h = w.heroes[0]; w.quest = null;
      w.smithQuest = { depth: 1, given: true, done: false, reforged: false, wants: 'gold' };
      h.items.push(c.createItem('weapon.pickaxe'), c.createItem('quest.ore', 3)); })()""")
    talk(page, "[{type:'smith', hero:'me', line:'noGold'}]", 'dialog-smith-annoyed.png', 7.0)
    close_all(page)
    page.evaluate("""(() => { const c = __pd.core, w = __pd.session.world, h = w.heroes[0];
      w.smithQuest.done = true; h.items = h.items.filter((i) => i.kind !== 'weapon.pickaxe' && i.kind !== 'quest.ore');
      h.items.push(c.createItem('weapon.sword', 1, 1), c.createItem('weapon.sword', 1, 2));
      for (const i of h.items) { if (i.kind === 'weapon.sword') { i.levelUnknown = false; i.curseUnknown = false; } } })()""")
    talk(page, "[{type:'smith', hero:'me', line:'completed'}]", 'dialog-smith-pleased-reforge.png', 7.0)
    close_all(page)
    page.evaluate("""(() => { const c = __pd.core, w = __pd.session.world; w.smithQuest = null;
      w.wandQuest = { depth: 1, given: false, done: false, wants: 'dust', battle: c.createItem('wand.firebolt', 1, 2), utility: c.createItem('wand.blink', 1, 1) }; })()""")
    talk(page, "[{type:'wandmaker', hero:'me', line:'intro'}]", 'dialog-wandmaker-calm.png', 9.0)
    close_all(page)
    page.evaluate("""(() => { const c = __pd.core, w = __pd.session.world, h = w.heroes[0]; w.wandQuest = null;
      w.impQuest = { depth: 1, given: true, done: false, prey: 'monk', reward: c.createItem('ring.accuracy', 1, 2) };
      h.items.push(c.createItem('quest.token', 8)); })()""")
    talk(page, "[{type:'imp', hero:'me', line:'reward'}]", 'dialog-imp-pleased-reward.png', 9.0)
    close_all(page)
    page.evaluate("(() => { const w = __pd.session.world; w.impQuest = null; })()")


def journal(page):
    strip(page)
    page.evaluate("""(() => { const c = __pd.core, w = __pd.session.world, h = w.heroes[0];
      w.quest = { depth: 2, type: 'rose', given: true, dropped: false, killsLeft: 8, done: false, weapon: c.createItem('weapon.sword', 1, 2), armor: c.createItem('armor.mail', 1, 1) };
      w.wandQuest = { depth: 4, given: true, done: false, wants: 'dust', battle: c.createItem('wand.firebolt', 1, 2), utility: c.createItem('wand.blink', 1, 1) };
      w.smithQuest = { depth: 12, given: true, done: false, reforged: false, wants: 'gold' };
      w.impQuest = { depth: 17, given: true, done: false, prey: 'monk', reward: c.createItem('ring.accuracy', 1, 2) };
      h.items.push(c.createItem('quest.dust'), c.createItem('weapon.pickaxe'), c.createItem('quest.ore', 9), c.createItem('quest.token', 3)); })()""")
    settle(page, 800)
    shot(page, 'journal-chip.png')
    page.keyboard.press('j')
    settle(page, 700)
    shot(page, 'journal-cards.png')
    page.evaluate("document.querySelector('.pd-scroll') && (document.querySelector('.pd-scroll').scrollTop = 400)")
    settle(page, 300)
    shot(page, 'journal-cards-2.png')
    close_all(page)
    page.evaluate("(() => { const w = __pd.session.world; w.quest = null; w.wandQuest = null; w.smithQuest = null; w.impQuest = null; })()")


def examine(page):
    hall(page)
    well = stage(page, 'well', -2, -1, 'awareness')
    shelf = stage(page, 'shelf', 3, 0)
    pot = stage(page, 'pot', 0, -2)
    stage(page, 'statue', 2, 2)
    settle(page, 600)
    hide_toasts(page)
    for name, cell in (('well', well), ('shelf', shelf), ('pot', pot)):
        page.evaluate("(c) => __pd.examineCell(c)", cell)
        settle(page, 500)
        shot(page, 'examine-%s.png' % name)
        close_all(page)


def places(page):
    hall(page)
    stage(page, 'well', -2, -1, 'health')
    stage(page, 'well', 0, -2, 'awareness')
    stage(page, 'well', 2, -1, 'transmutation')
    stage(page, 'pot', -2, 1)
    stage(page, 'pedestal', 2, 1)
    stage(page, 'dew', 0, 2)
    stage(page, 'sign', -3, 2)
    settle(page, 2500)
    hide_toasts(page)
    shot(page, 'places-wells-pot-pedestal.png')
    # Drinking from the awareness well: the designer's beam.
    cell = stage(page, 'well', 0, -1, 'awareness')
    page.evaluate("(c) => { const w = __pd.session.world; w.heroes[0].pos = c; w.turn += 1; }", cell)
    settle(page, 500)
    effects(page, "[{type:'well', hero: me, water:'awareness'}]")
    settle(page, 420)
    shot(page, 'places-well-beam.png')


def smith(page):
    hall(page)
    strip(page)
    page.evaluate("(() => { const w = __pd.session.world; w.smithQuest = { depth: 1, given: true, done: true, reforged: false, wants: 'gold' }; })()")
    cell = stage(page, 'smith', 0, -2)
    stage(page, 'mob', 0, -2, 'passive', 'blacksmith')
    settle(page, 2000)
    shot(page, 'smith-forge.png')
    effects(page, "[{type:'smith', hero:'me', line:'completed'}]")
    close_all(page)
    time.sleep(0.25)
    settle(page, 200)
    shot(page, 'smith-anvil.png')


def mining(page):
    hall(page)
    strip(page)
    page.evaluate("""(() => { const c = __pd.core, w = __pd.session.world, h = w.heroes[0];
      w.smithQuest = { depth: 1, given: true, done: false, reforged: false, wants: 'gold' };
      h.items.push(c.createItem('weapon.pickaxe'), c.createItem('quest.ore', 3)); })()""")
    vein = page.evaluate("""(() => { const c = __pd.core, w = __pd.session.world, h = w.heroes[0], level = c.levelAt(w, h.depth);
      const q = h.pos - 2 * c.WIDTH; level.map[q] = c.T.WALL_DECO; level.map[h.pos - c.WIDTH] = c.T.WALL_DECO; w.turn += 1; return h.pos - c.WIDTH; })()""")
    settle(page, 800)
    page.evaluate("""(pos) => { const w = __pd.session.world, h = w.heroes[0]; h.items.find((x) => x.kind === 'quest.ore').qty++;
      __pd.takeEffects([{ type: 'mined', depth: h.depth, pos, hero: h.id }]); }""", vein)
    # (A capture takes a good part of a second: the shots follow one another with no wait, so that the strike, the nugget and the ore going to the pack are caught.)
    for i in range(5):
        shot(page, 'mining-%d.png' % (i + 1))


def statue(page):
    hall(page)
    stage(page, 'statue', 0, -2)
    settle(page, 800)
    page.evaluate("""(() => { const c = __pd.core, w = __pd.session.world, h = w.heroes[0], f = w.floors[h.depth];
      const pos = h.pos - 2 * c.WIDTH; const lvl = c.levelAt(w, h.depth); lvl.map[pos] = c.T.EMPTY;
      const m = c.createMob('#9statue', 'statue', pos, 'sleeping', 0); m.ht = m.hp = 20; f.mobs.push(m); w.turn += 1; })()""")
    settle(page, 900)
    page.evaluate("""(() => { const w = __pd.session.world, f = w.floors[w.heroes[0].depth]; const m = f.mobs.find((x) => x.kind === 'statue'); m.state = 'hunting'; w.turn += 1; })()""")
    for i, wait in enumerate((0.2, 0.3, 0.3, 0.4)):
        time.sleep(wait)
        settle(page, 160)
        shot(page, 'statue-%d.png' % (i + 1))


def garden(page):
    hall(page)
    stage(page, 'garden', 0, 0)
    for dx in range(-3, 4):
        for dy in range(-2, 3):
            if dx or dy:
                stage(page, 'grass', dx, dy)
    settle(page, 2400)
    hide_toasts(page)
    shot(page, 'garden-fireflies.png')


def library(page):
    hall(page)
    for dx in range(-4, 5):
        stage(page, 'shelf', dx, -3)
    stage(page, 'sign', 0, 2)
    settle(page, 2400)
    hide_toasts(page)
    shot(page, 'library-shelves.png')


def minor(page):
    hall(page)
    effects(page, "[{type:'flock', depth, cells:[%s]}]" % ','.join(str(page.evaluate("(a) => __pd.session.world.heroes[0].pos + a[0] + a[1] * __pd.core.WIDTH", [dx, dy])) for dx, dy in ((-2, -1), (2, -1), (0, -2))))
    time.sleep(0.15)
    settle(page, 120)
    shot(page, 'minor-sheep-appear.png')
    settle(page, 1200)
    effects(page, "[{type:'glyph', depth, hero: me, glyph:'affection'}]")
    time.sleep(0.15)
    settle(page, 120)
    shot(page, 'minor-glyph.png')
    effects(page, "[{type:'trap', depth, pos: __pd.session.world.heroes[0].pos - 3 * __pd.core.WIDTH, kind:'alarm', hero: me}]")
    time.sleep(0.2)
    settle(page, 700)
    shot(page, 'minor-alarm.png')


def run(names):
    with sync_playwright() as p:
        browser, page = launch(p)
        settle(page, 3000)
        hide_toasts(page)
        groups = (('dialog', dialog), ('journal', journal), ('examine', examine), ('places', places), ('smith', smith), ('mining', mining),
                  ('statue', statue), ('garden', garden), ('library', library), ('minor', minor))
        for name, fn in groups:
            if not names or name in names:
                fn(page)
        errors = [m for m in page.logs if m.startswith('ERR')]
        print('\n'.join(errors) or 'no page errors')
        browser.close()


if __name__ == '__main__':
    run(set(sys.argv[1:]))

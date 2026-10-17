"""The places and the weak things made vivid, as the running game draws them (375x812, Russian): python tools/places-shots/shots.py [group ...]
Needs the dev server: npm run dev -w @pd/client -- --port 5200 (PD_PORT). Groups: wells altar pot places statue cards flock thorns lullaby mirror psionic purity
levitate statuses glyph alarm haggler."""
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, __import__('os').path.dirname(__file__))
from lib import *  # noqa: E402,F403
from stage import *  # noqa: E402,F403

_shot = shot

HERO = "(() => __pd.session.world.heroes[0].id)()"


def hide_toasts(page):
    page.evaluate("document.querySelectorAll('.pd-toast').forEach((n) => { if (n.id !== 'toast') n.remove(); }); const t = document.getElementById('toast'); if (t) t.hidden = true")


def fire(page, effects_js):
    page.evaluate("(() => { const h = __pd.session.world.heroes[0]; const me = h.id; const depth = h.depth; __pd.takeEffects(%s); })()" % effects_js)


def hero(page):
    return page.evaluate(HERO)


def hall(page, zoom_steps=2):
    carve(page)
    settle(page, 700)
    zoom(page, zoom_steps)
    settle(page, 400)
    hide_toasts(page)


def at_hero(page, dx, dy):
    return page.evaluate("(a) => { const h = __pd.session.world.heroes[0]; return h.pos + a[0] + a[1] * __pd.core.WIDTH; }", [dx, dy])


def put_hero(page, cell):
    page.evaluate("(c) => { const w = __pd.session.world; w.heroes[0].pos = c; w.turn += 1; }", cell)


def add_mob(page, kind, dx, dy, state='sleeping', extra=None):
    return page.evaluate("""(a) => { const c = __pd.core, w = __pd.session.world, h = w.heroes[0];
      const pos = h.pos + a.dx + a.dy * c.WIDTH; const f = w.floors[h.depth];
      const m = c.createMob('#9' + (f.mobs.length + 10), a.kind, pos, a.state, 0);
      m.ht = m.hp = a.hp || m.ht || 10; if (a.extra) Object.assign(m, a.extra);
      f.mobs.push(m); w.turn += 1; return m.id; }""", {'kind': kind, 'dx': dx, 'dy': dy, 'state': state, 'extra': extra, 'hp': 20})


def run(names):
    want = lambda n: not names or n in names  # noqa: E731
    shot = lambda page, name: _shot(page, name)  # noqa: E731
    with sync_playwright() as p:
        browser, page = launch(p)
        settle(page, 3000)
        hall(page)
        h = hero(page)

        if want('wells'):
            stage(page, 'well', -2, -1, 'health')
            stage(page, 'well', 0, -2, 'awareness')
            stage(page, 'well', 2, -1, 'transmutation')
            settle(page, 1800)
            shot(page, 'wells-three.png')
            # Drinking from each: a column of light, rings, what it did.
            for water, name in (('health', 'health'), ('awareness', 'awareness'), ('transmutation', 'transmutation')):
                stage(page, 'clear')
                cell = stage(page, 'well', 0, -1, water)
                put_hero(page, cell)
                settle(page, 500)
                fire(page, "[{type:'well', hero: me, water:'%s'}]" % water)
                settle(page, 380)
                shot(page, 'well-use-%s.png' % name)
                settle(page, 2500)
            # A well run dry, and the water of change taking an item.
            stage(page, 'clear')
            move_hero_to = at_hero(page, 0, 0)
            cell = stage(page, 'well', 0, -1, 'transmutation')
            put_hero(page, cell)
            settle(page, 400)
            fire(page, "[{type:'transmuted', hero: me, from: __pd.core.createItem('scroll.upgrade',1,0), to: __pd.core.createItem('scroll.enchantment',1,0)}]")
            settle(page, 420)
            shot(page, 'well-transmute-use.png')
            settle(page, 2500)
            stage(page, 'clear')
            carve(page)
            settle(page, 400)
            hide_toasts(page)

        if want('altar'):
            stage(page, 'clear')
            stage(page, 'altar', 0, -2)
            settle(page, 1800)
            shot(page, 'altar-fire.png')
            fire(page, "[{type:'sacrifice', depth, pos: __pd.session.world.floors[depth].altar.pos, outcome:'worthy'}]")
            settle(page, 350)
            shot(page, 'altar-offering.png')
            settle(page, 2500)
            fire(page, "[{type:'sacrifice', depth, pos: __pd.session.world.floors[depth].altar.pos, outcome:'unworthy'}]")
            settle(page, 400)
            shot(page, 'altar-refused.png')
            # The fire out: the pedestal alone, the scroll on it.
            page.evaluate("(() => { const w = __pd.session.world, h = w.heroes[0]; w.floors[h.depth].altar.volume = 0; w.floors[h.depth].heaps.push({pos: w.floors[h.depth].altar.pos, kind:'heap', items:[__pd.core.createItem('wipeOut',1,0)]}); w.turn += 1; })()")
            settle(page, 1500)
            shot(page, 'altar-cold.png')
            stage(page, 'clear')

        if want('pot'):
            stage(page, 'clear')
            cell = stage(page, 'pot', 0, -2)
            settle(page, 1800)
            shot(page, 'pot-bubbling.png')
            fire(page, "[{type:'brewed', depth, pos: %d, hero: me}]" % cell)
            settle(page, 400)
            shot(page, 'pot-brewed.png')
            stage(page, 'clear')

        if want('places'):
            stage(page, 'clear')
            stage(page, 'pedestal', -2, -2, extra='ring.accuracy')
            stage(page, 'sungrass', 0, -2)
            stage(page, 'dew', 2, -2)
            for k in (-2, -1, 0):
                stage(page, 'shelf', k, 2)
            stage(page, 'sign', 2, 1)
            settle(page, 2200)
            shot(page, 'places-small.png')
            stage(page, 'clear')
            stage(page, 'pedestal', 0, -2, extra='ring.accuracy')
            settle(page, 1800)
            shot(page, 'pedestal-prize.png')
            stage(page, 'clear')
            stage(page, 'sungrass', 0, -2)
            stage(page, 'sungrass', -2, -1)
            settle(page, 1800)
            shot(page, 'garden-sungrass.png')
            stage(page, 'clear')
            for k in (-3, -2, -1, 0, 1, 2):
                stage(page, 'shelf', k, -3)
            stage(page, 'sign', 2, 0)
            settle(page, 2200)
            shot(page, 'library-shelves-sign.png')
            stage(page, 'clear')
            stage(page, 'dew', -1, -1)
            stage(page, 'dew', 1, -2)
            settle(page, 1800)
            shot(page, 'dew.png')
            stage(page, 'clear')

        if want('statue'):
            # The animated statue wakes: shaking and cracking, then breaking free.
            stage(page, 'clear')
            carve(page)
            settle(page, 400)
            hide_toasts(page)
            sid = add_mob(page, 'statue', 0, -2, 'sleeping')
            settle(page, 900)
            shot(page, 'statue-1-still.png')
            page.evaluate("(id) => { const w = __pd.session.world, h = w.heroes[0]; const m = w.floors[h.depth].mobs.find((x) => x.id === id); m.state = 'hunting'; w.turn += 1; }", sid)
            page.evaluate("__pd.advance(120)")
            shot(page, 'statue-2-cracking.png')
            page.evaluate("__pd.advance(260)")
            shot(page, 'statue-3-shaking.png')
            page.evaluate("__pd.advance(380)")
            shot(page, 'statue-4-breaking.png')
            settle(page, 1500)

        if want('cards'):
            stage(page, 'clear')
            carve(page)
            settle(page, 400)
            hide_toasts(page)
            cells = {
                'health': stage(page, 'well', -2, -1, 'health'),
                'awareness': stage(page, 'well', 0, -2, 'awareness'),
                'transmutation': stage(page, 'well', 2, -1, 'transmutation'),
                'altar': stage(page, 'altar', -3, -3),
                'pedestal': stage(page, 'pedestal', 3, -3, extra='ring.accuracy'),
                'shelf': stage(page, 'shelf', 0, 3),
                'sign': stage(page, 'sign', 3, 1),
            }
            settle(page, 800)
            for name, cell in cells.items():
                page.evaluate("(c) => __pd.examineCell(c)", cell)
                settle(page, 500)
                shot(page, 'card-%s.png' % name)
                close_windows(page)
                settle(page, 300)

        browser.close()


if __name__ == '__main__':
    run(set(sys.argv[1:]))

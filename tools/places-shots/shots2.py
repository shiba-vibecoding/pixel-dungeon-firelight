"""The weak things made vivid (375x812, Russian): python tools/places-shots/shots2.py [group ...]
Groups: flock lullaby mirror thorns psionic purity levitate statuses glyph alarm haggler. Dev server on PD_PORT (default 5200)."""
import sys

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, __import__('os').path.dirname(__file__))
from shots import *  # noqa: E402,F403
from shots import _shot  # noqa: E402


def fresh(page):
    stage(page, 'clear')
    carve(page)
    settle(page, 400)
    hide_toasts(page)


def run(names):
    want = lambda n: not names or n in names  # noqa: E731
    shot = lambda page, name: _shot(page, name)  # noqa: E731
    with sync_playwright() as p:
        browser, page = launch(p)
        settle(page, 3000)
        hall(page)

        if want('flock'):
            fresh(page)
            # The wand of flock: four sheep pop in round the hero, bleat, and scatter; later one fades in a puff.
            cells = [at_hero(page, -2, -1), at_hero(page, 2, -1), at_hero(page, -1, -2), at_hero(page, 1, -3)]
            for i, c in enumerate(cells):
                page.evaluate("""(a) => { const c = __pd.core, w = __pd.session.world, h = w.heroes[0]; const f = w.floors[h.depth];
                  const m = c.createMob('#8' + a.i, 'sheep', a.cell, 'wandering', 0); m.ht = m.hp = 4; f.mobs.push(m); }""", {'i': i, 'cell': c})
            fire(page, "[{type:'flock', depth, cells:%s}]" % cells)
            page.evaluate("__pd.session.world.turn += 1")
            page.evaluate("__pd.advance(70)")
            shot(page, 'flock-1-pop.png')
            page.evaluate("__pd.advance(160)")
            shot(page, 'flock-2-bounce.png')
            settle(page, 900)
            fire(page, "[{type:'faded', depth, mob:'#80', pos:%d}]" % cells[0])
            page.evaluate("(id) => { const w = __pd.session.world, h = w.heroes[0]; const f = w.floors[h.depth]; f.mobs = f.mobs.filter((m) => m.id !== id); w.turn += 1; }", '#80')
            page.evaluate("__pd.advance(140)")
            shot(page, 'flock-3-puff.png')
            settle(page, 1200)

        if want('lullaby'):
            fresh(page)
            for dx, dy in ((-2, -1), (2, -2), (0, -3)):
                add_mob(page, 'rat', dx, dy, 'sleeping')
            settle(page, 400)
            fire(page, "[{type:'scroll', hero: me, kind:'lullaby', count: 3}]")
            settle(page, 1000)
            shot(page, 'lullaby-z.png')
            settle(page, 800)
            shot(page, 'lullaby-z-2.png')

        if want('mirror'):
            fresh(page)
            cells = [at_hero(page, -2, 0), at_hero(page, 2, 0), at_hero(page, 0, -2)]
            for i, c in enumerate(cells):
                page.evaluate("""(a) => { const c = __pd.core, w = __pd.session.world, h = w.heroes[0]; const f = w.floors[h.depth];
                  const m = c.createMob('#7' + a.i, 'mirror', a.cell, 'wandering', 0); m.ht = m.hp = 5; m.image = { owner: h.id, left: 20 }; f.mobs.push(m); }""", {'i': i, 'cell': c})
            fire(page, "[{type:'mirrored', depth, hero: me, cells:%s}]" % cells)
            page.evaluate("__pd.session.world.turn += 1")
            page.evaluate("__pd.advance(90)")
            shot(page, 'mirror-1-shimmer.png')
            page.evaluate("__pd.advance(250)")
            shot(page, 'mirror-2-in.png')
            settle(page, 800)

        if want('thorns'):
            fresh(page)
            page.evaluate("""() => { const c = __pd.core, w = __pd.session.world, h = w.heroes[0]; const r = c.createItem('ring.thorns', 1, 1); h.rings = [r]; if (!w.known.includes('ring.thorns')) w.known.push('ring.thorns'); }""")
            mid = add_mob(page, 'gnoll', 1, -1, 'hunting')
            settle(page, 400)
            fire(page, "[{type:'attack', depth, attacker:'%s', target: me, hit:true, damage:3},{type:'hurt', depth, who:'%s', damage:2}]" % (mid, mid))
            page.evaluate("__pd.advance(130)")
            shot(page, 'thorns-spikes.png')
            page.evaluate("__pd.advance(200)")
            shot(page, 'thorns-spikes-2.png')
            settle(page, 800)

        if want('psionic'):
            fresh(page)
            add_mob(page, 'gnoll', -2, -2, 'hunting')
            add_mob(page, 'rat', 2, -1, 'hunting')
            settle(page, 400)
            fire(page, "[{type:'scroll', hero: me, kind:'psionic', count: 2}]")
            page.evaluate("__pd.advance(60)")
            shot(page, 'psionic-1-warning.png')
            page.evaluate("__pd.advance(190)")
            shot(page, 'psionic-2-blast.png')
            settle(page, 1200)

        if want('purity'):
            fresh(page)
            page.evaluate("(() => { const w = __pd.session.world, h = w.heroes[0]; const f = w.floors[h.depth]; const W = __pd.core.WIDTH; f.gas = { toxic: [] }; for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) f.gas.toxic.push([h.pos + x + y * W, 40]); f.gas.toxic.sort((a, b) => a[0] - b[0]); w.turn += 1; })()")
            settle(page, 700)
            shot(page, 'purity-0-gas.png')
            fire(page, "[{type:'used', hero: me, kind:'potion.purity', identified:true},{type:'burst', depth, pos: __pd.session.world.heroes[0].pos, kind:'purity', radius:2}]")
            page.evaluate("(() => { const w = __pd.session.world, h = w.heroes[0]; w.floors[h.depth].gas = {}; w.turn += 1; })()")
            page.evaluate("__pd.advance(260)")
            shot(page, 'purity-1-wave.png')
            page.evaluate("__pd.advance(380)")
            shot(page, 'purity-2-wave.png')
            settle(page, 800)

        if want('levitate'):
            fresh(page)
            settle(page, 300)
            shot(page, 'levitation-0-walking.png')
            fire(page, "[{type:'used', hero: me, kind:'potion.levitation', identified:true}]")
            page.evaluate("(() => { const w = __pd.session.world; w.heroes[0].levitating = 20; w.turn += 1; })()")
            page.evaluate("__pd.advance(260)")
            shot(page, 'levitation-1-drink.png')
            settle(page, 900)
            shot(page, 'levitation-2-hover.png')

        if want('statuses'):
            fresh(page)
            add_mob(page, 'gnoll', -2, -2, 'hunting', {'slowed': 12})
            add_mob(page, 'crab', 2, -2, 'hunting', {'poison': 9})
            plain = add_mob(page, 'rat', 0, -3, 'hunting')
            settle(page, 1500)
            shot(page, 'status-slowed-poisoned.png')
            # The wand of teleportation: gone in a violet draw-in, there in another place in a shimmer.
            fire(page, "[{type:'zapped', depth, from: __pd.session.world.heroes[0].pos, to: __pd.session.world.floors[depth].mobs.find((m) => m.id === '%s').pos, bolt:'teleport'}]" % plain)
            page.evaluate("(id) => { const w = __pd.session.world, h = w.heroes[0]; const m = w.floors[h.depth].mobs.find((x) => x.id === id); m.pos = m.pos + 3 * __pd.core.WIDTH + 4; w.turn += 1; }", plain)
            page.evaluate("__pd.advance(140)")
            shot(page, 'teleport-1.png')
            page.evaluate("__pd.advance(280)")
            shot(page, 'teleport-2.png')
            settle(page, 800)

        if want('glyph'):
            fresh(page)
            for glyph in ('bounce', 'affection', 'potential'):
                fire(page, "[{type:'glyph', depth, hero: me, glyph:'%s'}]" % glyph)
                page.evaluate("__pd.advance(170)")
                shot(page, 'glyph-%s.png' % glyph)
                settle(page, 700)

        if want('alarm'):
            fresh(page)
            cell = at_hero(page, 0, -2)
            page.evaluate("(c) => { const w = __pd.session.world, h = w.heroes[0]; __pd.core.levelAt(w, h.depth).map[c] = __pd.core.T.ALARM_TRAP; w.turn += 1; }", cell)
            settle(page, 400)
            fire(page, "[{type:'trap', depth, pos: %d, kind:'alarm', hero: me}]" % cell)
            page.evaluate("__pd.advance(220)")
            shot(page, 'alarm-1.png')
            page.evaluate("__pd.advance(380)")
            shot(page, 'alarm-2.png')
            page.evaluate("__pd.advance(400)")
            shot(page, 'alarm-3.png')
            settle(page, 1200)

        if want('haggler'):
            fresh(page)
            page.evaluate("""() => { const c = __pd.core, w = __pd.session.world, h = w.heroes[0];
              h.rings = [c.createItem('ring.haggler', 1, 1)]; h.gold = 500; if (!w.known.includes('ring.haggler')) w.known.push('ring.haggler');
              w.known.push('weapon.sword'); h.items.push(c.createItem('weapon.sword', 1, 0)); }""")
            for known in (True, False):
                page.evaluate("(k) => { const w = __pd.session.world; const i = w.known.indexOf('ring.haggler'); if (k && i < 0) w.known.push('ring.haggler'); if (!k && i >= 0) w.known.splice(i, 1); }", known)
                page.evaluate("() => { const c = __pd.core, w = __pd.session.world, h = w.heroes[0]; __pd.openTrade(w, h, c.createItem('weapon.sword', 1, 0)); }")
                settle(page, 500)
                shot(page, 'haggler-%s.png' % ('known' if known else 'unknown'))
                close_windows(page)
                settle(page, 300)

        browser.close()


if __name__ == '__main__':
    run(set(sys.argv[1:]))

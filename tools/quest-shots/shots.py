"""The quests as the running game draws them (375x812, Russian, clean register): python tools/quest-shots/shots.py [name ...]
(dev server on PD_PORT, default 5199). Names: ghost wand smith imp mining foul wide (nothing: all but foul and wide). Each writes docs/quests/<name>-*.png."""
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, __import__('os').path.dirname(__file__))
from lib import *  # noqa: E402,F403

_shot = shot


def effects(page, list_js):
    page.evaluate("(() => { __pd.takeEffects(%s); })()" % list_js)


def wait_quiet(page):
    """Lets the region card and the first toasts go."""
    settle(page, 6000)
    page.evaluate("document.querySelectorAll('.pd-toast').forEach((n) => { if (n.id !== 'toast') n.remove(); }); document.getElementById('toast').hidden = true")


def close_all(page):
    page.keyboard.press('Escape')
    settle(page, 300)
    close_windows(page)
    settle(page, 300)


def talk(page, js_effect, name, pause=(1.3, 8.0)):
    """Opens a dialogue by effect: a shot while the words are coming and one when they are out."""
    effects(page, js_effect)
    time.sleep(pause[0])
    shot(page, name + '-typing.png')
    time.sleep(pause[1])
    shot(page, name + '.png')


def spawn_npc(page, kind):
    page.evaluate("""(kind) => { const c = __pd.core, w = __pd.session.world, h = w.heroes[0], f = w.floors[h.depth];
      const level = w.levels[h.depth];
      for (const d of [1, 2, -1, -2, 3]) { const pos = h.pos + d; if (c.hasFlag(level.map[pos], c.F.PASSABLE) && !f.mobs.some((m) => m.pos === pos)) {
        f.mobs.push(c.createMob('#npc' + kind, kind, pos, 'passive', 0)); return pos; } }
      return -1; }""", kind)
    settle(page, 700)


def tap_first_reply(page):
    page.locator('.fl-reply-grid .pd-button').first.click()


def tap_yes(page):
    page.locator('.fl-replies .pd-button.primary').first.click()


def farewell_in_world(page, kind, effect, name):
    """The leave-taking as the map shows it: the window is put away at once, the figure fades with its sparkle or smoke."""
    spawn_npc(page, kind)
    effects(page, effect)
    time.sleep(0.25)
    close_windows(page)
    for i, wait in enumerate((0.1, 0.25, 0.35)):
        time.sleep(wait)
        shot(page, '%s-%d.png' % (name, i + 1))
    time.sleep(1.5)


def strip(page):
    page.evaluate("""(() => { const h = __pd.session.world.heroes[0]; h.items = h.items.filter((i) => !i.kind.startsWith('quest.') && i.kind !== 'weapon.pickaxe' && i.kind !== 'weapon.sword'); })()""")


def ghost(page):
    page.evaluate("""(() => { const c = __pd.core, w = __pd.session.world;
      w.quest = { depth: 1, type: 'rose', given: false, dropped: false, killsLeft: 8, done: false, weapon: c.createItem('weapon.sword', 1, 2), armor: c.createItem('armor.mail', 1, 1) }; })()""")
    talk(page, "[{type:'ghost', hero:'me', line:'intro', errand:'rose'}]", 'ghost-1-intro')
    tap_first_reply(page)  # «And what do I get for it?»
    time.sleep(1.2)
    shot(page, 'ghost-2-ask-typing.png')
    time.sleep(6)
    shot(page, 'ghost-2-ask.png')
    tap_yes(page)
    settle(page, 600)
    page.evaluate("(() => { const w = __pd.session.world; w.quest.given = true; })()")
    settle(page, 800)
    shot(page, 'ghost-3-chip.png')
    page.keyboard.press('j')
    settle(page, 700)
    shot(page, 'ghost-4-card.png')
    close_all(page)
    page.evaluate("(() => { const c = __pd.core, h = __pd.session.world.heroes[0]; h.items.push(c.createItem('quest.rose')); })()")
    settle(page, 600)
    talk(page, "[{type:'ghost', hero:'me', line:'reward', errand:'rose'}]", 'ghost-5-reward', pause=(1.0, 8.0))
    close_all(page)
    farewell_in_world(page, 'ghost', "[{type:'ghost', hero:'me', line:'farewell', errand:'rose'}]", 'ghost-6-leaves')
    close_all(page)
    effects(page, "[{type:'ghost', hero:'me', line:'farewell', errand:'rose'}]")
    time.sleep(6)
    shot(page, 'ghost-7-farewell.png')
    close_all(page)


def wand(page):
    strip(page)
    page.evaluate("""(() => { const c = __pd.core, w = __pd.session.world;
      w.wandQuest = { depth: 1, given: true, done: false, wants: 'dust', battle: c.createItem('wand.firebolt', 1, 2), utility: c.createItem('wand.blink', 1, 1) }; })()""")
    talk(page, "[{type:'wandmaker', hero:'me', line:'intro'}]", 'wand-1-intro', pause=(1.3, 9.0))
    page.locator('.fl-reply-grid .pd-button').nth(1).click()  # «Where do I look?»
    time.sleep(5)
    shot(page, 'wand-2-where.png')
    tap_yes(page)
    settle(page, 600)
    page.keyboard.press('j')
    settle(page, 700)
    shot(page, 'wand-3-card.png')
    close_all(page)
    page.evaluate("(() => { const c = __pd.core, h = __pd.session.world.heroes[0]; h.items.push(c.createItem('quest.dust')); })()")
    settle(page, 600)
    talk(page, "[{type:'wandmaker', hero:'me', line:'reward'}]", 'wand-4-reward', pause=(1.0, 9.0))
    close_all(page)
    farewell_in_world(page, 'wandmaker', "[{type:'wandmaker', hero:'me', line:'farewell'}]", 'wand-5-leaves')
    close_all(page)
    effects(page, "[{type:'wandmaker', hero:'me', line:'farewell'}]")
    time.sleep(5)
    shot(page, 'wand-6-farewell.png')
    close_all(page)
    page.evaluate("(() => { __pd.session.world.wandQuest = null; })()")


def smith(page):
    strip(page)
    page.evaluate("""(() => { const w = __pd.session.world; w.smithQuest = { depth: 1, given: false, done: false, reforged: false, wants: 'gold' }; })()""")
    talk(page, "[{type:'smith', hero:'me', line:'intro'}]", 'smith-1-intro', pause=(1.3, 8.0))
    tap_yes(page)
    settle(page, 500)
    page.evaluate("""(() => { const c = __pd.core, w = __pd.session.world, h = w.heroes[0]; w.smithQuest.given = true;
      h.items.push(c.createItem('weapon.pickaxe'), c.createItem('quest.ore', 3)); })()""")
    talk(page, "[{type:'smith', hero:'me', line:'noGold'}]", 'smith-2-nogold', pause=(1.0, 6.0))
    tap_first_reply(page)
    time.sleep(1.5)
    shot(page, 'smith-3-where-typing.png')
    time.sleep(5)
    shot(page, 'smith-3-where.png')
    tap_yes(page)
    settle(page, 600)
    shot(page, 'smith-4-chip.png')
    page.keyboard.press('j')
    settle(page, 700)
    shot(page, 'smith-5-card.png')
    close_all(page)
    page.evaluate("""(() => { const c = __pd.core, w = __pd.session.world, h = w.heroes[0];
      w.smithQuest.done = true; h.items = h.items.filter((i) => i.kind !== 'weapon.pickaxe' && i.kind !== 'quest.ore');
      h.items.push(c.createItem('weapon.sword', 1, 1), c.createItem('weapon.sword', 1, 2));
      for (const i of h.items) { if (i.kind === 'weapon.sword') { i.levelUnknown = false; i.curseUnknown = false; } } })()""")
    spawn_npc(page, 'blacksmith')
    effects(page, "[{type:'smith', hero:'me', line:'completed'}]")
    time.sleep(0.5)
    shot(page, 'smith-6-forge.png')
    time.sleep(6)
    shot(page, 'smith-7-completed.png')
    close_all(page)
    page.evaluate("(() => { __pd.session.world.smithQuest = null; })()")


def imp(page):
    strip(page)
    page.evaluate("""(() => { const c = __pd.core, w = __pd.session.world;
      w.impQuest = { depth: 1, given: false, done: false, prey: 'monk', reward: c.createItem('ring.accuracy', 1, 2) }; })()""")
    talk(page, "[{type:'imp', hero:'me', line:'intro'}]", 'imp-1-intro', pause=(1.3, 9.0))
    tap_first_reply(page)
    time.sleep(4)
    shot(page, 'imp-2-ask.png')
    tap_yes(page)
    settle(page, 500)
    page.evaluate("""(() => { const c = __pd.core, w = __pd.session.world, h = w.heroes[0]; w.impQuest.given = true; h.items.push(c.createItem('quest.token', 2)); })()""")
    effects(page, "[{type:'pickedUp', hero:'me', item:{kind:'quest.token', qty:2, level:0}}]")
    settle(page, 600)
    shot(page, 'imp-3-chip-toast.png')
    page.keyboard.press('j')
    settle(page, 700)
    shot(page, 'imp-4-card.png')
    close_all(page)
    page.evaluate("""(() => { const c = __pd.core, h = __pd.session.world.heroes[0]; h.items = h.items.filter((i) => i.kind !== 'quest.token'); h.items.push(c.createItem('quest.token', 8)); })()""")
    settle(page, 400)
    talk(page, "[{type:'imp', hero:'me', line:'reward'}]", 'imp-5-reward', pause=(1.0, 9.0))
    close_all(page)
    farewell_in_world(page, 'imp', "[{type:'imp', hero:'me', line:'farewell'}]", 'imp-6-leaves')
    close_all(page)
    effects(page, "[{type:'imp', hero:'me', line:'farewell'}]")
    time.sleep(5)
    shot(page, 'imp-7-farewell.png')
    close_all(page)
    page.evaluate("(() => { __pd.session.world.impQuest = null; })()")


def mining(page):
    """Swings at a vein beside the hero (a wall cell made a vein for the shot), the pickaxe in hand, the juice, the toast."""
    strip(page)
    page.evaluate("""(() => { const c = __pd.core, w = __pd.session.world, h = w.heroes[0];
      w.smithQuest = { depth: 1, given: true, done: false, reforged: false, wants: 'gold' };
      h.items.push(c.createItem('weapon.pickaxe'), c.createItem('quest.ore', 3)); })()""")
    # The hero walks to a floor cell beside a wall nearby (that wall is made dark gold for the shot): the walk is the game's own.
    spot = page.evaluate("""(() => { const c = __pd.core, w = __pd.session.world, h = w.heroes[0], level = w.levels[h.depth], f = w.floors[h.depth], seen = w.explored[h.depth];
      const ok = (p) => seen[p] && c.hasFlag(level.map[p], c.F.PASSABLE) && !f.mobs.some((m) => m.pos === p) && level.map[p] !== c.T.ENTRANCE && level.map[p] !== c.T.EXIT && level.map[p] !== c.T.SIGN;
      let best = null;
      for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
        const p = h.pos + dy * c.WIDTH + dx;
        if (!ok(p) || !c.findPath) continue;
        for (const d of [-c.WIDTH, 1, -1, c.WIDTH]) { const q = p + d; if (level.map[q] === c.T.WALL && seen[q] && level.map[q - c.WIDTH] !== undefined) {
          const dist = Math.abs(dx) + Math.abs(dy); if (!best || dist < best.dist) best = { p, q, dist }; } }
      }
      if (best) __pd.tapCell(best.p);
      return best ? { p: best.p, q: best.q } : null; })()""")
    print('walk to', spot)
    time.sleep(4)
    cell = page.evaluate("""(q) => { const c = __pd.core, w = __pd.session.world, level = w.levels[w.heroes[0].depth]; level.map[q] = c.T.WALL_DECO; return q; }""", spot['q'])
    print('vein at', cell)
    settle(page, 900)
    shot(page, 'mining-0-vein.png')
    for i in range(3):
        page.evaluate("""(pos) => { const c = __pd.core, w = __pd.session.world, h = w.heroes[0], ore = h.items.find((x) => x.kind === 'quest.ore'); ore.qty++;
          __pd.takeEffects([{ type: 'mined', depth: h.depth, pos, hero: h.id }]); }""", cell)
        for j, wait in enumerate((0.07, 0.12, 0.2)):
            time.sleep(wait)
            if i == 0:
                shot(page, 'mining-1-swing-%d.png' % (j + 1))
        time.sleep(0.6)
    shot(page, 'mining-2-toast.png')
    page.keyboard.press('j')
    settle(page, 700)
    shot(page, 'mining-3-card.png')
    close_all(page)
    page.evaluate("(() => { __pd.session.world.smithQuest = null; })()")


def foul(page):
    """The foul register (the fork's default setting) for one dialogue each, to show the two side by side with the clean ones."""
    for name, quest, effect in (
        ('ghost', "w.quest = { depth: 1, type: 'rose', given: false, dropped: false, killsLeft: 8, done: false, weapon: c.createItem('weapon.sword', 1, 2), armor: c.createItem('armor.mail', 1, 1) }", "{type:'ghost', hero:'me', line:'intro', errand:'rose'}"),
        ('smith', "w.smithQuest = { depth: 1, given: false, done: false, reforged: false, wants: 'blood' }", "{type:'smith', hero:'me', line:'intro'}"),
        ('imp', "w.impQuest = { depth: 1, given: false, done: false, prey: 'golem', reward: c.createItem('ring.accuracy', 1, 2) }", "{type:'imp', hero:'me', line:'intro'}"),
        ('wand', "w.wandQuest = { depth: 1, given: false, done: false, wants: 'fish', battle: c.createItem('wand.firebolt', 1, 2), utility: c.createItem('wand.blink', 1, 1) }", "{type:'wandmaker', hero:'me', line:'intro'}"),
    ):
        page.evaluate("(() => { const c = __pd.core, w = __pd.session.world; %s; })()" % quest)
        effects(page, '[%s]' % effect)
        time.sleep(9)
        shot(page, 'foul-%s-intro.png' % name)
        close_all(page)


def run(names):
    with sync_playwright() as p:
        use_foul = 'foul' in names
        browser, page = launch(p, quips='foul' if use_foul else 'clean')
        want = lambda n: (n in names) if names else n not in ('foul', 'wide')  # noqa: E731
        wait_quiet(page)
        for name, fn in (('ghost', ghost), ('wand', wand), ('smith', smith), ('imp', imp), ('mining', mining), ('foul', foul)):
            if want(name):
                fn(page)
        errors = [m for m in page.logs if m.startswith('ERR')]
        print('\n'.join(errors) or 'no page errors')
        browser.close()


if __name__ == '__main__':
    run(set(sys.argv[1:]))

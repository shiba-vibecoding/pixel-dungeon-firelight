"""The screens of part 11 as the running game draws them: python tools/growth-shots/shots.py [name ...] (dev server on PD_PORT, default 5199)."""
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, __import__('os').path.dirname(__file__))
from lib import *  # noqa: E402,F403

SETUP = """() => {
  const c = __pd.core, w = __pd.session.world, h = w.heroes[0];
  const mk = (kind, level = 0, o = {}) => { const it = c.createItem(kind, o.qty ?? 1, level);
    if (o.hidden) { it.levelUnknown = true; it.curseUnknown = true; }
    for (const k of ['enchant', 'glyph', 'cursed', 'familiarity', 'worn']) if (o[k] !== undefined) it[k] = o[k]; return it; };
  Object.assign(h, { lvl: 10, exp: 22, ht: 65, hp: 56, str: 14, attackSkill: 19, defenseSkill: 14, subclass: undefined, kills: 214 });
  h.weapon = mk('weapon.longsword', 3, { enchant: 'fire' });
  h.armor = mk('armor.mail', 2);
  h.rings = [mk('ring.accuracy', 1), mk('ring.evasion', 2, { hidden: true, worn: 140 })];
  h.items = [mk('weapon.battleAxe', 1, { hidden: true, familiarity: 7 }), mk('armor.plate', 2), mk('armor.scale', 0, { hidden: true, glyph: 'bounce' }),
    mk('wand.lightning', 2), mk('potion.healing', 0, { qty: 2 }), mk('potion.frost'), mk('potion.experience', 0, { qty: 2 }), mk('scroll.upgrade'), mk('scroll.teleportation', 0, { qty: 2 }),
    mk('scroll.identify'), mk('food.ration', 0, { qty: 2 }), mk('seed.sungrass', 0, { qty: 3 }), mk('missile.dart', 0, { qty: 12 }), mk('ring.detection', -1, { hidden: true, cursed: true }),
    mk('weapon.mace', 1, { enchant: 'shock' })];
  w.known.push('potion.healing', 'scroll.upgrade', 'scroll.identify', 'scroll.removeCurse', 'scroll.enchantment', 'wand.lightning', 'ring.accuracy', 'potion.mindVision');
  return 'ok';
}"""


_shot = shot


def effects(page, list_js):
    page.evaluate("(() => { const w = __pd.session.world; const h = w.heroes[0]; __pd.takeEffects(%s); })()" % list_js)


def wait_quiet(page):
    """Lets the region card and the first toasts go."""
    settle(page, 6000)
    page.evaluate("document.querySelectorAll('.pd-toast').forEach((n) => { if (n.id !== 'toast') n.remove(); }); document.getElementById('toast').hidden = true")


def open_bag(page):
    page.locator('.pd-tool.bag').click()
    settle(page, 400)


def close_all(page):
    page.keyboard.press('Escape')
    settle(page, 300)
    close_windows(page)
    settle(page, 300)


def run(names):
    reduced = 'reduced' in names
    names = names - {'reduced'}
    out = OUT + '/reduced' if reduced else OUT
    shot = lambda page, name: _shot(page, name, out)  # noqa: E731
    with sync_playwright() as p:
        browser, page = launch(p, reduced=reduced)
        page.evaluate(SETUP)
        wait_quiet(page)
        want = lambda n: not names or n in names  # noqa: E731

        if want('level'):
            page.evaluate("(() => { const h = __pd.session.world.heroes[0]; h.lvl = 11; h.ht = 70; h.attackSkill = 20; h.defenseSkill = 15; })()")
            effects(page, "[{type:'levelUp', hero:'me', lvl:11}]")
            settle(page, 450)
            shot(page, '01-level-toast.png')
            page.evaluate("document.querySelectorAll('.fl-lvl-toast').forEach((n) => n.remove())")

        if want('strength'):
            page.evaluate("(() => { __pd.session.world.heroes[0].str = 15; })()")
            effects(page, "[{type:'strength', hero:'me'}]")
            settle(page, 500)
            shot(page, '02-strength-toast.png')
            page.evaluate("document.querySelectorAll('.fl-str-toast').forEach((n) => n.remove())")
            open_bag(page)
            shot(page, '03-backpack.png')
            close_all(page)

        if want('passport'):
            page.evaluate("(() => { __pd.session.world.heroes[0].subclass = 'gladiator'; })()")
            settle(page, 300)
            page.locator('.pd-avatar').first.click()
            settle(page, 400)
            shot(page, '04-passport.png')
            close_all(page)

        if want('mastery'):
            effects(page, "[{type:'mastered', hero:'me', subclass:'gladiator'}]")
            settle(page, 500)
            shot(page, '05-mastery.png')
            page.evaluate("document.querySelectorAll('.fl-banner').forEach((n) => n.remove())")

        if want('chips'):
            effects(page, "h.items.map((item) => ({type: 'pickedUp', hero: 'me', item}))")
            settle(page, 300)
            open_bag(page)
            shot(page, '06-backpack-new.png')
            page.get_by_text('Неопознанное').first.click()
            settle(page, 300)
            shot(page, '06b-backpack-unknown-filter.png')
            grid = page.locator('.pd-bag-grid .pd-slot')
            grid.nth(0).click()
            settle(page, 400)
            shot(page, '07-item-card-unknown-axe.png')
            grid.nth(1).click()
            settle(page, 400)
            shot(page, '08-item-card-plate.png')
            close_all(page)

        if want('moments'):
            open_bag(page)
            page.evaluate("(() => { const h = __pd.session.world.heroes[0]; h.items[1].level = 3; })()")
            effects(page, "[{type:'upgraded', hero:'me', item: h.items[1]}]")
            shot(page, '09-moment-upgrade.png')
            close_all(page)

        if want('journal'):
            effects(page, "[{type:'died', depth: 1, who:'#1', pos: 0, kind:'rat', by:'me'}, {type:'died', depth: 1, who:'#2', pos: 0, kind:'gnoll', by:'me'}, {type:'died', depth: 2, who:'#3', pos: 0, kind:'crab', by:'me'}, {type:'bossSlain', depth: 5, kind:'goo'}, {type:'upgraded', hero:'me', item: h.weapon}, {type:'mastered', hero:'me', subclass:'gladiator'}]")
            settle(page, 300)
            page.locator('.pd-menu').first.click()
            settle(page, 300)
            page.get_by_text('Журнал').first.click()
            settle(page, 400)
            shot(page, '10-journal-notes.png')
            tabs = page.locator('.fl-journal-tabs .pd-tab')
            for i, name in ((1, '11-collection'), (2, '12-bestiary'), (3, '13-chronicle'), (4, '14-guide')):
                tabs.nth(i).click()
                settle(page, 300)
                shot(page, name + '.png')
            tabs.nth(1).click()
            settle(page, 300)
            page.locator('.fl-book-tabs .pd-tab').nth(1).click()
            settle(page, 300)
            shot(page, '11b-collection-scrolls.png')
            page.get_by_text('Исключение').first.click()
            settle(page, 300)
            page.locator('.fl-elim .cell').nth(2).click()
            settle(page, 200)
            page.locator('.fl-elim .cell').nth(3).click()
            page.locator('.fl-elim .cell').nth(3).click()
            settle(page, 300)
            shot(page, '11c-collection-elimination.png')
            tabs.nth(2).click()
            settle(page, 300)
            page.locator('.fl-beast').first.click()
            settle(page, 300)
            shot(page, '12b-bestiary-card.png')
            tabs.nth(4).click()
            settle(page, 300)
            page.locator('.fl-mcard').nth(3).click()
            settle(page, 400)
            shot(page, '14b-mechanic-traps.png')
            close_all(page)

        if want('truth'):
            # enchant: the rune is drawn on the mark
            open_bag(page)
            page.evaluate("(() => { const h = __pd.session.world.heroes[0]; h.items[14].enchant = 'shock'; })()")
            effects(page, "[{type:'imbued', hero:'me', item: h.items[14]}]")
            shot(page, '16-moment-enchant.png')
            close_all(page)
            # uncurse: a curse known and lifted
            page.evaluate("(() => { const h = __pd.session.world.heroes[0]; delete h.items[13].curseUnknown; })()")
            open_bag(page)
            page.evaluate("(() => { const h = __pd.session.world.heroes[0]; h.items[13].cursed = false; })()")
            effects(page, "[{type:'scroll', hero:'me', kind:'removeCurse', count: 1}]")
            shot(page, '17-moment-uncurse.png')
            close_all(page)
            # identify: a scroll of identify read on the axe (the card turns its face over)
            open_bag(page)
            grid = page.locator('.pd-bag-grid .pd-slot')
            grid.nth(9).click()
            settle(page, 300)
            page.locator('.pd-pick-actions button').first.click()
            settle(page, 400)
            grid = page.locator('.pd-bag-grid .pd-slot')
            grid.nth(0).click()
            settle(page, 300)
            shot(page, '18-identify-pick.png')
            for label in ('Да', 'Использовать', 'Читать'):
                try:
                    page.get_by_role('button', name=label).first.click(timeout=800)
                    break
                except Exception:
                    pass
            shot(page, '18b-identify-moment.png')
            close_all(page)

        if want('end'):
            page.evaluate("(() => { const w = __pd.session.world; const h = w.heroes[0]; h.hp = 0; h.killedBy = 'rat'; w.over = true; })()")
            for _ in range(4):
                settle(page, 2000)
                time.sleep(1.5)
            page.evaluate("document.querySelector('.pd-runend .pd-scroll').scrollTo(0, 400)")
            settle(page, 300)
            shot(page, '19-end.png')

        browser.close()


if __name__ == '__main__':
    run(set(sys.argv[1:]))

"""python shots.py goo|tengu|dm300|king|yog|all [ru] : the boss storyboards into docs/bosses (frame strips and screenshots)."""
from lib import *

ARGS = sys.argv[1:]
LANG = 'ru' if 'ru' in ARGS else 'en'
FOLDER = os.path.join(OUT, LANG if LANG == 'ru' else '')
FOLDER = os.path.normpath(FOLDER)
os.makedirs(FOLDER, exist_ok=True)
TMP = os.environ['TEMP']


def out(name):
    return os.path.join(FOLDER, name)


def goo(pg):
    god(pg)
    goto(pg, 5)
    g = mob_of(pg, 5, 'goo')
    gid = g['id']
    cell = near(pg, 5, g['pos'], 2)
    goto(pg, 5, cell, 600)
    settle_view(pg)
    zoom(pg, 2)
    pg.evaluate("([d, id]) => { const m = __pd.session.world.floors[d].mobs.find(m => m.id === id); m.state = 'hunting'; m.enemy = __pd.session.world.heroes[0].id; }", [5, gid])
    # the notice: the boss's cry, the bar, the first lines
    fake(pg, [{'type': 'noticed', 'depth': 5, 'mob': gid}, {'type': 'yell', 'depth': 5, 'mob': gid, 'kind': 'goo', 'line': 'notice', 'hero': hero_id(pg)}])
    adv(pg, 400)
    snap(pg, 'goo-1-notice.png', FOLDER)
    adv(pg, 2200)
    snap(pg, 'goo-2-taunt.png', FOLDER)
    adv(pg, 4500)
    # a blow: the jiggle
    strip(pg, gid, [0, 50, 100, 150, 220, 300, 380, 480], 'goo-3-jiggle.png', folder=FOLDER, w=170, h=150, act=lambda: hit(pg, 5, gid, 6), scale=0.8)
    # a heavy blow and the splatter
    strip(pg, gid, [0, 80, 160, 260, 380, 520], 'goo-4-splatter.png', folder=FOLDER, w=190, h=170, act=lambda: (set_hp(pg, 5, gid, 62), hit(pg, 5, gid, 18)), scale=0.8)
    # half health
    set_hp(pg, 5, gid, 40)
    adv(pg, 200)
    snap(pg, 'goo-5-half.png', FOLDER)
    adv(pg, 2600)
    snap(pg, 'goo-6-half-line.png', FOLDER)
    # the death: a real killing blow
    set_hp(pg, 5, gid, 1)
    pg.evaluate("__pd.session.world.heroes[0].pos = %d" % near(pg, 5, g['pos'], 1))
    print('killed', kill_now(pg, 5, 'goo', gid), mob_of(pg, 5, 'goo'), pg.evaluate('__pd.session.world.heroes[0].pos'))
    strip(pg, gid, [0, 60, 120, 180, 240, 320, 420, 560, 720, 1000], 'goo-7-death.png', folder=FOLDER, w=190, h=170, scale=0.7, cols=5)
    adv(pg, 800)
    snap(pg, 'goo-8-aftermath.png', FOLDER)


import scenes


BOSS = {'goo': goo, 'tengu': lambda pg: scenes.tengu(pg, FOLDER), 'dm300': lambda pg: scenes.dm300(pg, FOLDER), 'king': lambda pg: scenes.king(pg, FOLDER), 'yog': lambda pg: scenes.yog(pg, FOLDER)}

if __name__ == '__main__':
    names = [a for a in ARGS if a in BOSS or a == 'all']
    names = list(BOSS) if 'all' in names else names
    with sync_playwright() as p:
        for n in names:
            b, pg = launch(p, query='lang=%s&reveal=1' % LANG)
            BOSS[n](pg)
            print(n, 'errors:', errors(pg))
            b.close()

"""The storyboards of the four bosses after Goo (shots.py runs them)."""
from lib import *

TMP = os.environ['TEMP']


def tengu(pg, FOLDER):
    m = enter(pg, 10, 'tengu')
    tid = m['id']
    snap(pg, 'tengu-1-notice.png', FOLDER)
    adv(pg, 2300)
    snap(pg, 'tengu-2-taunt.png', FOLDER)
    look_at(pg, 10, mob_of(pg, 10, 'tengu')['pos'], 3)
    adv(pg, 5000)
    # a blink: he vanishes in smoke and is somewhere else
    cur = mob_of(pg, 10, 'tengu')['pos']
    dest = near(pg, 10, cur, 3)

    def blink():
        pg.evaluate("([d, id, to]) => { const m = __pd.session.world.floors[d].mobs.find(m => m.id === id); m.pos = to; }", [10, tid, dest])
        fake(pg, [{'type': 'jumped', 'depth': 10, 'mob': tid, 'from': cur, 'to': dest}])

    strip(pg, tid, [0, 80, 160, 260, 380, 520, 700, 950], 'tengu-3-blink.png', folder=FOLDER, w=200, h=170, act=blink, scale=0.8, cols=4)
    # shuriken: streaks to the hero
    hp = hero_pos(pg)
    pos = mob_of(pg, 10, 'tengu')['pos']

    def throw():
        fake(pg, [{'type': 'missile', 'depth': 10, 'from': pos, 'to': hp, 'sprite': 15}])

    strip(pg, tid, [0, 40, 80, 120, 170, 240], 'tengu-4-shuriken.png', folder=FOLDER, w=260, h=170, act=throw, scale=0.8, cols=3)
    set_hp(pg, 10, tid, 58)
    adv(pg, 300)
    snap(pg, 'tengu-5-half.png', FOLDER)
    adv(pg, 2500)
    snap(pg, 'tengu-6-half-line.png', FOLDER)
    print('killed', kill_now(pg, 10, 'tengu', tid))
    strip(pg, tid, [0, 100, 250, 450, 700, 1000], 'tengu-7-death.png', folder=FOLDER, w=200, h=170, scale=0.8, cols=3)
    adv(pg, 2000)
    snap(pg, 'tengu-8-aftermath.png', FOLDER)


def dm300(pg, FOLDER):
    m = enter(pg, 15, 'dm300')
    did = m['id']
    snap(pg, 'dm300-1-notice.png', FOLDER)
    adv(pg, 2300)
    snap(pg, 'dm300-2-taunt.png', FOLDER)
    look_at(pg, 15, mob_of(pg, 15, 'dm300')['pos'], 3)
    ht = m['ht']

    def stage(frac):
        return lambda: set_hp(pg, 15, did, max(1, int(ht * frac)))

    panel(pg, did, 'dm300-3-damage-stages.png', [
        ('whole', stage(1.0), 2500), ('75%', stage(0.72), 3500), ('50%', stage(0.48), 3500), ('25%', stage(0.22), 3500),
    ], folder=FOLDER, w=190, h=190, label=True)
    set_hp(pg, 15, did, int(ht * 0.4))
    adv(pg, 400)
    snap(pg, 'dm300-4-half-ui.png', FOLDER)
    adv(pg, 2500)
    snap(pg, 'dm300-5-half-line.png', FOLDER)
    # the arena: dust and steam, a wide frame
    set_hp(pg, 15, did, int(ht * 0.3))
    adv(pg, 3000)
    snap(pg, 'dm300-6-arena.png', FOLDER)

    # the mending
    def mend():
        set_hp(pg, 15, did, int(ht * 0.55))
        fake(pg, [{'type': 'repaired', 'depth': 15, 'mob': did}])

    strip(pg, did, [0, 120, 260, 420, 600, 850, 1150, 1500], 'dm300-7-repair.png', folder=FOLDER, w=200, h=190, act=mend, scale=0.75, cols=4)
    snap(pg, 'dm300-7b-repair-ui.png', FOLDER)
    # the death
    set_hp(pg, 15, did, 2)
    adv(pg, 300)
    print('killed', kill_now(pg, 15, 'dm300', did))
    strip(pg, did, [0, 150, 300, 500, 750, 1000, 1200, 1400, 1700, 2100, 2600, 3300], 'dm300-8-death.png', folder=FOLDER, w=220, h=200, scale=0.6, cols=4)
    adv(pg, 3000)
    snap(pg, 'dm300-9-debris.png', FOLDER)


def reenact(pg, depth, kind, dist=3, extra=()):
    """The boss comes in again in sight, as the core brings it (a new mob and its cry), to be filmed from its first frame."""
    remove_mobs(pg, depth, [kind, *extra])
    adv(pg, 100)
    hero = hero_pos(pg)
    cell = near(pg, depth, hero, dist)
    mid = spawn_mob(pg, depth, kind, cell)
    return mid, cell


def king(pg, FOLDER):
    m = enter(pg, 20, 'king')
    kid = m['id']
    snap(pg, 'king-1-notice.png', FOLDER)
    adv(pg, 2300)
    # in sight at last: the throne room's light rises
    look_at(pg, 20, mob_of(pg, 20, 'king')['pos'], 3)
    adv(pg, 200)
    strip(pg, kid, [0, 400, 900, 1500, 2200, 3200], 'king-2-throne-light.png', folder=FOLDER, w=240, h=220, scale=0.8, cols=3, hide_ui=False)
    snap(pg, 'king-3-taunt.png', FOLDER)
    # a summoning
    cells = []
    kp = mob_of(pg, 20, 'king')['pos']
    for d in (1, 2):
        c = near(pg, 20, kp, d)
        if c >= 0 and c not in cells and c != hero_pos(pg):
            cells.append(c)

    def summon():
        for c in cells:
            spawn_mob(pg, 20, 'undead', c)
        fake(pg, [{'type': 'yell', 'depth': 20, 'mob': kid, 'kind': 'king', 'line': 'summon'}])

    strip(pg, kid, [0, 120, 260, 420, 620, 900, 1300, 1800], 'king-4-summon.png', folder=FOLDER, w=240, h=200, scale=0.8, cols=4, act=summon)
    ht = m['ht']
    set_hp(pg, 20, kid, int(ht * 0.45))
    adv(pg, 400)
    snap(pg, 'king-5-half.png', FOLDER)
    adv(pg, 2600)
    snap(pg, 'king-6-half-line.png', FOLDER)
    set_hp(pg, 20, kid, 2)
    adv(pg, 200)
    print('killed', kill_now(pg, 20, 'king', kid))
    strip(pg, kid, [0, 150, 350, 600, 900, 1300, 1800, 2500], 'king-7-death.png', folder=FOLDER, w=240, h=200, scale=0.8, cols=4)
    adv(pg, 3000)
    snap(pg, 'king-8-aftermath.png', FOLDER)


def yog(pg, FOLDER):
    enter(pg, 25, 'yog')
    snap(pg, 'yog-1-notice.png', FOLDER)
    adv(pg, 2300)
    snap(pg, 'yog-2-taunt.png', FOLDER)
    # again, in sight, to be filmed: the fists come up
    yid, ycell = reenact(pg, 25, 'yog', 3, ['rottingFist', 'burningFist'])
    look_at(pg, 25, ycell, 3, zoom_steps=1)
    around = []
    for d in (1, 2):
        c = near(pg, 25, ycell, d)
        if c >= 0 and c != hero_pos(pg):
            around.append(c)

    def awaken():
        fake(pg, [{'type': 'yell', 'depth': 25, 'mob': yid, 'kind': 'yog', 'line': 'notice', 'hero': hero_id(pg)}])
        for kind, c in zip(('rottingFist', 'burningFist'), around):
            spawn_mob(pg, 25, kind, c, 'wandering')

    strip(pg, yid, [0, 250, 600, 1000, 1500, 2100, 2800, 3600, 4800, 6000], 'yog-3-entrance.png', folder=FOLDER, w=300, h=240, scale=0.6, cols=5, act=awaken, hide_ui=False)
    ht = mob_of(pg, 25, 'yog')['ht']
    set_hp(pg, 25, yid, int(ht * 0.45))
    adv(pg, 400)
    snap(pg, 'yog-4-half.png', FOLDER)
    adv(pg, 2200)
    snap(pg, 'yog-5-half-line.png', FOLDER)
    strip(pg, yid, [0, 400, 800, 1200, 1800, 3000], 'yog-6-glare.png', folder=FOLDER, w=300, h=240, scale=0.6, cols=3, hide_ui=False)
    set_hp(pg, 25, yid, 3)
    adv(pg, 300)
    print('killed', kill_now(pg, 25, 'yog', yid))
    strip(pg, yid, [0, 300, 700, 1100, 1500, 2000, 2600, 3200, 3900, 4600, 5400, 6500], 'yog-7-death.png', folder=FOLDER, w=412, h=380, scale=0.4, cols=4, hide_ui=False)
    adv(pg, 5000)
    snap(pg, 'yog-8-aftermath.png', FOLDER)

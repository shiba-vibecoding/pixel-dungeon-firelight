# Firelight · part 6: fx.json, every effect in one place: its sheet and frames, speed, how it moves, how it blends, the light it gives
# in 3D (Three.js r169 PointLight: colour, intensity, distance in cells, how long), the screen's shake and tint, and the game events
# that call it. The same sheets serve the 2D canvas.
import json
from PIL import Image
from px import *
from bolts import K, NAMES as BN
from waves import WAVES
from potions import COLORS, NAMES as PN, GAS, LIQ
from traps import TRAPS
from boss import BOSSES

fx = {}


def frames_of(path, w, h, row=0):
    im = Image.open(OUT + path); return im.width // w


def add(id_, sheet, w, h, fps, behaviour, *, row=0, loop=False, blend='add', anchor='center', light=None, shake=None, tint=None, name=None, **kw):
    e = dict(sheet='fx/' + sheet, w=w, h=h, row=row, frames=frames_of(sheet, w, h), fps=fps, loop=loop, behaviour=behaviour, blend=blend, anchor=anchor)
    if light: e['light'] = light
    if shake: e['shake'] = shake
    if tint: e['tint'] = tint
    if name: e['name'] = dict(en=name[0], ru=name[1])
    e.update(kw); fx[id_] = e


L = lambda color, intensity, radius, ms, curve='flash': dict(color=color, intensity=intensity, radius=radius, ms=ms, curve=curve)

# ---- 1. bolts of the wands (PD 1.9.2a) and the warlock's shadow bolt
SPEED = dict(magic=14, fire=11, poison=10, slow=8, teleport=16, blink=22, shadow=10, amok=12, reach=14, regrowth=9, flock=8, rocks=0)
for k, (col, lc, inten, dist) in K.items():
    if k in ('beam', 'lightning'): continue
    beh = 'drop' if k == 'rocks' else 'fly'
    add(f'bolt.{k}', f'bolts/{k}-fly.png', 16, 16, 16, beh, loop=True, blend='normal' if k in ('rocks', 'flock', 'shadow') else 'add',
        anchor='head', orient=k not in ('rocks', 'flock', 'slow', 'teleport', 'reach'), speed=SPEED[k] or None, hit=f'bolt.{k}.hit',
        light=L(lc, inten, dist, 0, 'follow') if lc else None, name=BN[k], **({'from': 'above', 'fall': 3} if k == 'rocks' else {}))
    big = k == 'fire'
    add(f'bolt.{k}.hit', f'bolts/{k}-hit.png', 32 if big else 16, 32 if big else 16, 14, 'flash', blend='normal' if k in ('rocks', 'flock') else 'add',
        light=L(lc, inten * (1.6 if big else 1.2), dist + (1 if big else 0), 260 if big else 160) if lc else None,
        shake=dict(px=2, ms=220) if big else None)
add('bolt.beam', 'bolts/beam-ray.png', 16, 16, 20, 'beam', loop=True, start='bolt.beam.start', end='bolt.beam.end', ms=420, hit='bolt.beam.hit',
    light=L('#c83aff', 4, 4, 420, 'along'), name=BN['beam'])
add('bolt.beam.start', 'bolts/beam-start.png', 16, 16, 20, 'flash', loop=True)
add('bolt.beam.end', 'bolts/beam-end.png', 16, 16, 20, 'flash', loop=True)
add('bolt.beam.hit', 'bolts/beam-hit.png', 16, 16, 14, 'flash', light=L('#c83aff', 4, 3, 160))
add('bolt.lightning', 'bolts/lightning-arc.png', 16, 16, 24, 'arc', loop=True, ms=180, hit='bolt.lightning.strike', reroll=True,
    light=L('#9fd8ff', 8, 6, 80, 'flash'), tint=dict(color='#e6f0ff', alpha=0.35, ms=180), name=BN['lightning'], note='the whole room flashes for 0.08 s; shamans throw the same')
add('bolt.lightning.strike', 'bolts/lightning-strike.png', 32, 32, 16, 'flash', light=L('#c0e8ff', 6, 4, 140), shake=dict(px=3, ms=200))
add('bolt.lightning.hit', 'bolts/lightning-hit.png', 16, 16, 16, 'flash', light=L('#c0e8ff', 3, 3, 120))

# ---- thrown weapons (the stones are firelight-stones)
for k, (n, spin, orient) in dict(boomerang=(('Boomerang', 'Бумеранг'), 18, False), shuriken=(('Shuriken', 'Сюрикен'), 16, False), tomahawk=(('Tomahawk', 'Томагавк'), 14, False),
                                 javelin=(('Javelin', 'Дротик'), 0, True), arrow=(('Arrow / dart', 'Стрела / дротик'), 0, True)).items():
    add(f'thrown.{k}', f'thrown/{k}.png', 16, 16, spin or 1, 'fly', loop=bool(spin), blend='normal', anchor='center', speed=12, name=n,
        **({'directions': ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE']} if orient else {}), **({'returns': True} if k == 'boomerang' else {}))

# ---- 2. scroll waves
WSHAKE = dict(challenge=dict(px=3, ms=300), terror=dict(px=1, ms=250), lullaby=None, psionic=dict(px=4, ms=260))
WTINT = dict(challenge=dict(color='#e0402a', alpha=0.3, ms=500), terror=dict(color='#1e0032', alpha=0.35, ms=700), lullaby=dict(color='#bfe0ff', alpha=0.15, ms=900),
             psionic=dict(color='#ffffff', alpha=0.55, ms=220))
WLIGHT = dict(challenge=L('#ff7a3a', 5, 6, 700), terror=L('#8a4ac0', 3, 5, 1100), lullaby=L('#bfe0ff', 2, 5, 1500), psionic=L('#ffffff', 5, 8, 350))
WFPS = dict(challenge=12, terror=8, lullaby=6, psionic=22)
for k, st in WAVES.items():
    add(f'wave.{k}', f'waves/{k}-ring.png', 48, 48, WFPS[k], 'wave', anchor='feet-floor', radius={'challenge': 6, 'terror': 5, 'lullaby': 5, 'psionic': 8}[k],
        scaleSteps=[1, 2, 3], rings={'challenge': 2, 'terror': 2, 'lullaby': 3, 'psionic': 1}[k], stagger={'challenge': 120, 'terror': 200, 'lullaby': 260, 'psionic': 0}[k],
        specks=dict(id=f'wave.{k}.specks', count={'challenge': 18, 'terror': 10, 'lullaby': 8, 'psionic': 12}[k]),
        light=WLIGHT[k], shake=WSHAKE[k], tint=WTINT[k], tintOnlyForReader=k != 'psionic', name=(st['en'], st['ru']))
    add(f'wave.{k}.specks', f'waves/{k}-specks.png', 16, 16, 8, 'particle', blend='normal' if k == 'terror' else 'add', life=[500, 1100], rise=12 if k in ('lullaby', 'terror') else 0)

# ---- 3. potions: the splash of each colour and the clouds
for i, c in enumerate(COLORS):
    add(f'potion.splash.{c}', 'potions/splash.png', 32, 32, 14, 'splat', row=i, blend='normal', anchor='floor', stay=dict(frame=5, ms=1400),
        light=L(LIQ[c][0], 1.5, 2, 180), name=PN[c])
GAS_LIGHT = dict(fire=L('#ff7a2a', 3, 3, 0, 'flicker'), frost=L('#ace8ff', 1, 2, 0, 'steady'), purity=L('#fff6c8', 1.2, 2, 600))
for k, st in GAS.items():
    add(f'gas.{k}', f'gas/{k}.png', 16, 16, 6, 'tile', loop=True, blend='add' if k in ('fire', 'purity') else 'normal', anchor='floor',
        rows=dict(thin=0, mid=1, thick=2), volume=dict(thin=[1, 5], mid=[6, 15], thick=[16, None]), lift=0.25 if k not in ('web', 'fire') else 0.02,
        light=GAS_LIGHT.get(k), name=(st['en'], st['ru']), note='one cell of cloud: drawn flat over the floor at `lift` cells, neighbours overlap 2 px; the frame offset by (x + y) so a cloud never pulses as one')

# ---- 4. traps
TLIGHT = dict(alarm=L('#ff5a3a', 3, 5, 900, 'pulse'), fire=L('#ff7a2a', 6, 4, 600), paralytic=L('#f0e070', 2, 3, 500), toxic=L('#7fdc4a', 2, 3, 500),
              lightning=L('#c0f4ff', 8, 6, 120), poison=L('#c070ff', 1.5, 2, 300), summoning=L('#e8eef8', 4, 4, 700), gripping=None)
TSHAKE = dict(fire=dict(px=2, ms=220), lightning=dict(px=4, ms=300), gripping=dict(px=2, ms=160), alarm=dict(px=1, ms=400))
THEN = dict(fire='gas.fire', paralytic='gas.paralytic', toxic='gas.toxic')
for i, (k, (legend, ramp, en, ru)) in enumerate(TRAPS.items()):
    add(f'trap.{k}', 'traps/traps.png', 32, 32, 12, 'flash', row=i, blend='normal' if k in ('gripping', 'toxic', 'paralytic') else 'add', anchor='floor',
        legend=legend, light=TLIGHT[k], shake=TSHAKE.get(k), then=THEN.get(k), name=(en, ru), **({'tint': dict(color='#e6f0ff', alpha=0.5, ms=220)} if k == 'lightning' else {}))

# ---- 5. bosses
BNAMES = dict(goo=('Goo', 'Жижа'), tengu=('Tengu', 'Тенгу'), dm300=('DM-300', 'DM-300'), king=('King of Dwarves', 'Король гномов'), yog=('Yog-Dzewa', 'Йог-Дзева'))
BSUB = dict(goo=('master of the sewers', 'владыка сточных вод'), tengu=('the assassin of the prison', 'убийца из тюрьмы'), dm300=('the guardian machine', 'машина-страж'),
            king=('lord of the undead court', 'владыка мёртвого двора'), yog=('the Old God', 'Древний бог'))
bosscards = {k: dict(portrait=f'fx/boss/portrait-{k}.png', accent=BOSSES[k][3], name=dict(en=BNAMES[k][0], ru=BNAMES[k][1]), sub=dict(en=BSUB[k][0], ru=BSUB[k][1]),
                     depth=dict(goo=5, tengu=10, dm300=15, king=20, yog=25)[k]) for k in BOSSES}

# ---- 6. the hero's moments and the blows
add('hero.levelup', 'combat/levelup.png', 48, 48, 11, 'flash', anchor='feet', light=L('#ffcc66', 4, 4, 800), tint=dict(color='#ffcc66', alpha=0.12, ms=500), name=('Level up', 'Новый уровень'))
add('hero.ankh', 'combat/ankh.png', 48, 48, 10, 'flash', anchor='feet', light=L('#ffeba4', 4, 5, 1200), tint=dict(color='#fff6c8', alpha=0.35, ms=900), shake=dict(px=2, ms=300), name=('Ankh: back to life', 'Анкх: воскрешение'))
add('hero.amulet', 'combat/amulet.png', 48, 48, 10, 'hang', loop=True, blend='normal', anchor='feet', rise=0.3, light=L('#ffcc66', 4, 6, 2400, 'pulse'), tint=dict(color='#ffcc66', alpha=0.25, ms=1200), shake=dict(px=3, ms=600),
    name=('The Amulet of Yendor', 'Амулет Йендора'), hold=2400, when='the first pick-up only (effect.first)')
add('hero.heal', 'combat/heal.png', 32, 32, 10, 'flash', anchor='feet', light=L('#80ff80', 2, 3, 500), name=('Healing', 'Исцеление'))
add('hit', 'combat/hit.png', 16, 16, 18, 'flash', anchor='center', light=None, name=('Hit', 'Удар'))
add('hit.crit', 'combat/crit.png', 32, 32, 16, 'flash', anchor='center', light=L('#ffe9a0', 3, 2, 120), shake=dict(px=3, ms=180), name=('Critical hit', 'Крит'), when='damage >= 30% of the target\'s max HP')
add('hit.miss', 'combat/miss.png', 16, 16, 14, 'flash', blend='normal', anchor='center', name=('Miss', 'Промах'))

EVENTS = {
    **{f'zapped.{b}': f'bolt.{b}' for b in ['magic', 'fire', 'poison', 'slow', 'teleport', 'blink', 'beam', 'rocks', 'shadow', 'amok', 'reach', 'flock', 'regrowth', 'lightning']},
    'thrown.missile.boomerang': 'thrown.boomerang', 'thrown.missile.shuriken': 'thrown.shuriken', 'thrown.missile.tomahawk': 'thrown.tomahawk', 'thrown.missile.javelin': 'thrown.javelin', 'missile': 'thrown.arrow',
    **{f'scroll.{k}': f'wave.{k}' for k in WAVES},
    **{f'shattered.{c}': f'potion.splash.{c}' for c in COLORS},
    'gas.toxic': 'gas.toxic', 'gas.paralytic': 'gas.paralytic', 'gas.web': 'gas.web', 'burst.fire': 'gas.fire', 'burst.frost': 'gas.frost', 'burst.purity': 'gas.purity', 'special.smokeBomb': 'gas.smoke',
    **{f'trap.{k}': f'trap.{k}' for k in TRAPS},
    **{f'yell.notice.{k}': f'boss.{k}' for k in BOSSES},
    'levelUp': 'hero.levelup', 'resurrected': 'hero.ankh', 'amulet': 'hero.amulet', 'healed': 'hero.heal',
    'attack.hit': 'hit', 'attack.crit': 'hit.crit', 'attack.miss': 'hit.miss',
}
doc = dict(
    version=1, tile=16, note='Every sheet is frames in a row (or rows) of w x h, nearest, whole multiples of 16. The same sheets in 2D and 3D.',
    blends=dict(add='additive (light, fire, magic): in 3D the added batch, in 2D globalCompositeOperation lighter', normal='blended (gas, smoke, glass, liquid, rocks)'),
    behaviours=dict(
        fly='moves from the caster to the target at `speed` cells/s, loops its frames; `orient` turns it along the path (2D rotate, 3D billboard about the view axis); `directions` picks a frame by the 8-way heading instead; on arrival plays `hit`',
        drop='falls onto the target from `fall` cells above (avalanche rocks), then `hit`',
        beam='a straight ray at once: `start` at the caster, the sheet tiled along the path, `end` at the target, for `ms`, then `hit`',
        arc='as beam, but the tiles pick a random frame every step (`reroll`): a crackling lightning; `strike` at the target',
        flash='plays once at a cell; `anchor` center (the cell middle, standing), feet (the figure\'s feet, standing, leaned like a sprite), floor (flat on the floor)',
        splat='a flash flat on the floor whose `stay.frame` is left for `stay.ms`, fading',
        wave='a ring flat on the floor round the caster, shown at the whole scale step that reaches `radius` cells, `rings` times `stagger` ms apart; throws `specks`; `tint` the screen (only the reader\'s if tintOnlyForReader) and `shake`',
        tile='one cell of a cloud on the floor, looping; the row by the cell\'s gas volume (rows / volume); neighbours overlap, frames offset by (x + y)',
        hang='stays over the figure for `hold` ms, looping', particle='a speck thrown by a wave: drifts out (and up by `rise` px) for `life` ms'),
    light='PointLight in 3D: color, intensity (r169 physical, the scale of hd2d-kit bolts), radius = distance in cells (decay 1.4), ms = how long, curve: flash (up 15 % then down), follow (with the bolt while it flies), along (the beam: the light at its middle), pulse (1.5 Hz), flicker (fire), steady. 2D: a soft disc of `color` at intensity / 8 alpha',
    shake='px = art pixels of the camera kick (fx.shake strength), ms', tint='a flash of the whole screen: color, alpha, ms (fx.flash)',
    reducedMotion='quality.reducedMotion: no shake, every tint at half its alpha',
    mobTrap='a trap set off by a monster: its flash and light, no shake and no tint',
    fx=fx, bossCards=dict(
        timeline=dict(dur=2600, band=[0, 220], portrait=[120, 380], name=[260, 520], sub=[480, 700], hold=[700, 2200], out=[2200, 2600]),
        portraitScale=dict(phone=2, monitor=3), plate=dict(sheet='fx/boss/plate.png', slice=10),
        light=L('#ff3a2a', 4, 6, 900), shake=dict(px=2, ms=400), bosses=bosscards),
    events=EVENTS)
json.dump(doc, open(OUT + 'fx.json', 'w'), ensure_ascii=False, indent=1)
print('fx.json', len(fx), 'effects', len(EVENTS), 'events')

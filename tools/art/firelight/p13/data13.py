# Firelight · part 13: the data. Adds the part's effects to fx/fx.json (kept whole: part 6's entries are untouched but for the
# alarm's `then`), with the ambient loops of places and arenas, the boss bar and the bosses' staging; writes ui/quest/quest.json
# and ui/places/places.json. Run after the art (it counts the frames of the sheets). Rerunning gives the same bytes.
import json, os
from PIL import Image
from px import OUT, SRC

FX_IN = os.environ.get('P13_FX_IN', SRC + 'fx/fx.json')
PREFIXES = ('quest.', 'place.', 'minor.', 'status.', 'glyph.', 'arena.')
L = lambda color, intensity, radius, ms, curve: {'color': color, 'intensity': intensity, 'radius': radius, 'ms': ms, 'curve': curve}


def e(sheet, w, h, row=0, frames=None, fps=10, loop=False, behaviour='flash', blend='add', anchor='center', **kw):
    if frames is None:
        frames = Image.open(OUT + sheet).width // w
    d = {'sheet': sheet, 'w': w, 'h': h, 'row': row, 'frames': frames, 'fps': fps, 'loop': loop, 'behaviour': behaviour, 'blend': blend, 'anchor': anchor}
    d.update(kw)
    return d


N = lambda en, ru: {'en': en, 'ru': ru}
FX = {
    # ---- quests: the smith's work, the reward podiums
    'quest.ore.hit': e('fx/quest/ore-hit.png', 32, 32, fps=14, light=L('#ffcc66', 2, 2, 220, 'flash'), shake={'px': 1, 'ms': 120}, name=N('Ore struck', 'Удар по руде'), then='quest.ore.nugget'),
    'quest.ore.nugget': e('fx/quest/nugget.png', 16, 16, fps=8, behaviour='hang', blend='normal', anchor='floor', name=N('Dark gold', 'Тёмное золото'), note='the nugget on the floor for a moment (the item is the game\'s own after it); the gleam crosses it'),
    'quest.forge': e('fx/quest/forge.png', 16, 32, fps=8, loop=True, behaviour='hang', anchor='feet', light=L('#ff8a3a', 2.4, 4, 0, 'flicker'), name=N('Forge', 'Горн'), note='a loop at the blacksmith\'s side'),
    'quest.anvil': e('fx/quest/anvil.png', 32, 32, fps=14, light=L('#ffeba4', 3, 3, 180, 'flash'), shake={'px': 1, 'ms': 100}, name=N('Anvil', 'Наковальня')),
    **{f'quest.reward.{k}': e('fx/quest/reward.png', 32, 48, row=i, fps=8, loop=True, behaviour='hang', anchor='feet', light=L(c, 2.2, 3, 0, 'pulse'), name=N(*nm))
       for i, (k, c, nm) in enumerate([
           ('ghost.weapon', '#bfe0ff', ('The ghost\'s weapon', 'Оружие призрака')), ('ghost.armor', '#bfe0ff', ('The ghost\'s armour', 'Броня призрака')),
           ('wandmaker.battle', '#ffcc66', ('A battle wand', 'Боевая палочка')), ('wandmaker.utility', '#c8b0ff', ('A utility wand', 'Палочка-помощник')),
           ('blacksmith.reforge', '#ffaa5a', ('Reforged', 'Перековано')), ('imp.ring', '#9aff8a', ('The imp\'s ring', 'Кольцо беса'))])},
    # ---- places
    **{f'place.well.{k}': e('fx/places/wells.png', 16, 16, row=i, fps=6, loop=True, behaviour='tile', blend='normal', anchor='floor',
                            light=L(c, 1.2, 2.5, 0, 'pulse'), rows={'thin': 0, 'mid': 0, 'thick': 0}, volume={'thin': [1, None], 'mid': [1, None], 'thick': [1, None]}, lift=0.06,
                            name=N(*nm), note='the water inside the well\'s rim, a loop; one row a kind of water')
       for i, (k, c, nm) in enumerate([('awareness', '#7fd0ff', ('Well of awareness', 'Колодец знания')), ('health', '#ff8a9a', ('Well of health', 'Колодец здоровья')), ('transmutation', '#b88aff', ('Well of transmutation', 'Колодец превращения'))])},
    **{f'place.well.{k}.beam': e('fx/places/well-beam.png', 16, 48, row=i, fps=12, behaviour='flash', anchor='feet', light=L(c, 4, 5, 900, 'flash'), tint={'color': c, 'alpha': 0.1, 'ms': 500})
       for i, (k, c) in enumerate([('awareness', '#7fd0ff'), ('health', '#ff8a9a'), ('transmutation', '#b88aff')])},
    **{f'place.pot.{k}': e('fx/places/pot.png', 16, 32, row=i, fps=7, loop=True, behaviour='hang', blend='normal', anchor='feet', light=L(c, 1.4, 2.5, 0, 'flicker'), name=N(*nm))
       for i, (k, c, nm) in enumerate([('amber', '#ffb84a', ('Alchemy pot', 'Котёл')), ('green', '#8ae05a', ('Alchemy pot (green)', 'Котёл (зелёное варево)')),
                                        ('crimson', '#ff5a5a', ('Alchemy pot (crimson)', 'Котёл (алое варево)')), ('azure', '#6ab0ff', ('Alchemy pot (azure)', 'Котёл (лазурное варево)'))])},
    'place.statue.wake': e('fx/places/statue.png', 16, 32, fps=8, behaviour='hang', blend='normal', anchor='feet', hold=200, light=L('#ffcc66', 1.5, 2, 500, 'flash'), then='place.statue.dust', name=N('A statue wakes', 'Статуя оживает')),
    'place.statue.dust': e('fx/places/dust.png', 32, 32, fps=10, behaviour='flash', blend='normal', anchor='feet', shake={'px': 1, 'ms': 200}),
    'place.firefly': e('fx/places/motes.png', 16, 16, row=0, fps=5, loop=True, behaviour='particle', anchor='center', life=[1800, 3200], rise=6, light=L('#f0ff8a', 0.4, 1, 0, 'pulse'), name=N('Fireflies', 'Светлячки')),
    'place.dust': e('fx/places/motes.png', 16, 16, row=1, fps=4, loop=True, behaviour='particle', blend='normal', anchor='center', life=[2400, 4000], rise=-4, name=N('Dust', 'Пыль')),
    'place.dew': e('fx/places/motes.png', 16, 16, row=2, fps=6, loop=True, behaviour='hang', anchor='floor', name=N('Dew', 'Роса')),
    'place.shelf': e('fx/places/glints.png', 16, 16, row=0, fps=10, loop=True, behaviour='hang', anchor='center', name=N('Bookshelf', 'Книжная полка'), note='plays once every 4-7 s on a lit shelf; the frames run the light over the spines'),
    'place.sign': e('fx/places/glints.png', 16, 16, row=1, fps=4, loop=True, behaviour='hang', anchor='center', name=N('Sign', 'Табличка')),
    'place.prize': e('fx/places/glints.png', 16, 16, row=2, fps=8, loop=True, behaviour='hang', anchor='center'),
    'place.pedestal': e('fx/places/pedestal.png', 16, 32, fps=6, loop=True, behaviour='hang', anchor='feet', light=L('#ffcc66', 1.6, 2.5, 0, 'pulse'), name=N('Pedestal', 'Постамент')),
    # ---- the small magic
    'minor.sheep.appear': e('fx/minor/sheep.png', 16, 16, row=0, fps=12, blend='normal', anchor='feet', name=N('Sheep', 'Овца')),
    'minor.sheep.vanish': e('fx/minor/sheep.png', 16, 16, row=1, fps=10, blend='normal', anchor='feet'),
    'minor.thorns': e('fx/minor/thorns.png', 32, 32, fps=16, anchor='center', light=L('#ff8585', 1.2, 2, 160, 'flash'), name=N('Thorns', 'Шипы')),
    'minor.sleep': e('fx/minor/sleep.png', 16, 16, fps=4, loop=True, behaviour='hang', anchor='head', name=N('Asleep', 'Спит')),
    'minor.mirror': e('fx/minor/mirror.png', 16, 32, fps=8, loop=True, behaviour='hang', anchor='feet', name=N('Mirror image', 'Зеркальный образ')),
    'minor.purity': e('fx/minor/purity.png', 48, 48, fps=12, behaviour='wave', anchor='feet-floor', radius=2, scaleSteps=[1, 2], rings=1, stagger=0,
                      light=L('#fff6c8', 2.5, 4, 600, 'flash'), name=N('Purity', 'Очищение')),
    'minor.levitate': e('fx/minor/levitate.png', 32, 16, fps=8, loop=True, behaviour='hang', anchor='floor', name=N('Levitation', 'Левитация')),
    'minor.alarm': e('fx/minor/alarm.png', 32, 32, fps=10, behaviour='flash', anchor='head', hold=600, name=N('Alarm bell', 'Колокол тревоги')),
    'status.slow': e('fx/minor/status.png', 16, 16, row=0, fps=4, loop=True, behaviour='hang', anchor='floor', name=N('Slowed', 'Замедлен')),
    'status.poison': e('fx/minor/status.png', 16, 16, row=1, fps=6, loop=True, behaviour='hang', blend='normal', anchor='center', name=N('Poisoned', 'Отравлен')),
    'status.teleport.out': e('fx/minor/status.png', 16, 16, row=2, fps=14, anchor='center', light=L('#b88aff', 1.5, 2, 200, 'flash')),
    'status.teleport.in': e('fx/minor/status.png', 16, 16, row=3, fps=14, anchor='center', light=L('#d8b0ff', 1.5, 2, 200, 'flash')),
    **{f'glyph.{g}': e('fx/minor/glyphs.png', 32, 32, row=i, fps=12, anchor='center', light=L(c, 1.2, 2, 240, 'flash'), name=N(*nm))
       for i, (g, c, nm) in enumerate([
           ('bounce', '#cfe6ff', ('Bounce', 'Отскок')), ('affection', '#ff7ab0', ('Affection', 'Привязанность')), ('antiEntropy', '#bfe8ff', ('Anti-entropy', 'Антиэнтропия')),
           ('potential', '#ffff8a', ('Potential', 'Потенциал')), ('metabolism', '#7ad05a', ('Metabolism', 'Метаболизм')), ('stench', '#8aa83a', ('Stench', 'Зловоние')),
           ('viscosity', '#a070e0', ('Viscosity', 'Вязкость')), ('displacement', '#b88aff', ('Displacement', 'Смещение')), ('entanglement', '#8a6a3a', ('Entanglement', 'Опутывание')),
           ('multiplicity', '#e8f4ff', ('Multiplicity', 'Множественность')), ('autoRepair', '#ffcc66', ('Auto-repair', 'Самопочинка'))])},
    # ---- the arenas and the bosses
    **{f'arena.dm300.damage{s}': e('fx/boss/dm300.png', 32, 32, row=s - 1, fps=8, loop=True, behaviour='hang', blend='normal' if s > 1 else 'add', anchor='center',
                                   light=L('#ff9a3a', 0.6 * s, 2, 0, 'flicker') if s > 1 else None, name=N(f'DM-300, damaged {s}', f'DM-300, повреждение {s}'))
       for s in (1, 2, 3)},
    'arena.steam': e('fx/boss/steam.png', 16, 32, fps=8, loop=True, behaviour='hang', blend='normal', anchor='feet', name=N('Steam', 'Пар')),
    'arena.dm300.explode': e('fx/boss/explode.png', 64, 64, fps=12, anchor='feet', light=L('#ffcc66', 6, 7, 900, 'flash'), shake={'px': 3, 'ms': 600},
                             tint={'color': '#ff9a3a', 'alpha': 0.18, 'ms': 500}, then='arena.dm300.debris', name=N('DM-300 bursts', 'DM-300 взрывается')),
    'arena.dm300.debris': e('fx/boss/debris.png', 16, 16, row=0, fps=10, loop=True, behaviour='drop', blend='normal', anchor='center', fall=1.2, ms=900, reroll=True,
                            note='pieces thrown out of the burst: rows 0 plate, 1 gear, 2 bolt; the player picks a row a piece'),
    'arena.tengu.smoke': e('fx/boss/tengu.png', 32, 32, fps=14, blend='normal', anchor='feet', name=N('Tengu\'s smoke', 'Дым Тенгу'), note='at both ends of the jump'),
    'arena.tengu.mark': e('fx/boss/shuriken.png', 16, 16, row=0, frames=1, fps=1, behaviour='splat', blend='normal', anchor='floor', stay={'frame': 0, 'ms': 20000},
                          note='where a shuriken struck the floor; rows 0-2 are three marks'),
    'arena.throne': e('fx/boss/throne.png', 32, 32, fps=6, loop=True, behaviour='hang', anchor='feet', light=L('#ffcc66', 2.6, 5, 0, 'pulse'), name=N('Throne light', 'Свет трона')),
    'arena.king.undead': e('fx/boss/undead.png', 16, 32, fps=10, behaviour='flash', blend='normal', anchor='feet', light=L('#b88aff', 2, 2.5, 600, 'flash'), name=N('Undead rising', 'Нежить из-под земли'),
                           note='before the undead dwarf\'s own sprite appears on the cell'),
    'arena.king.crown': e('fx/boss/crown.png', 16, 16, fps=10, behaviour='splat', blend='normal', anchor='floor', stay={'frame': 5, 'ms': 6000}, name=N('The King falls', 'Падение короля')),
    'arena.goo.splash': e('fx/boss/goo.png', 32, 32, fps=16, blend='normal', anchor='center', name=N('Goo splashes', 'Брызги Жижи')),
    'arena.goo.pop': e('fx/boss/goo-pop.png', 48, 48, fps=12, behaviour='splat', blend='normal', anchor='floor', stay={'frame': 7, 'ms': 8000}, shake={'px': 2, 'ms': 300},
                       light=L('#7fdc4a', 3, 4, 500, 'flash'), name=N('Goo bursts', 'Жижа лопается')),
    'arena.yog.glint': e('fx/boss/yog.png', 32, 32, fps=10, behaviour='hang', anchor='center', light=L('#ff2a4a', 2, 3, 400, 'flash'), name=N('Yog\'s eye', 'Глаз Йога')),
    'arena.yog.fist.rotting': e('fx/boss/fist.png', 32, 32, row=0, fps=10, blend='normal', anchor='feet', shake={'px': 1, 'ms': 300}, name=N('Rotting fist', 'Гниющий кулак')),
    'arena.yog.fist.burning': e('fx/boss/fist.png', 32, 32, row=1, fps=10, anchor='feet', shake={'px': 1, 'ms': 300}, light=L('#ff9a3a', 3, 4, 600, 'flash'), name=N('Burning fist', 'Горящий кулак')),
    'arena.yog.death': e('fx/boss/yog-death.png', 64, 64, fps=10, behaviour='flash', anchor='feet-floor', light=L('#ff2a4a', 6, 8, 1200, 'flash'), shake={'px': 4, 'ms': 800},
                         tint={'color': '#ff2a4a', 'alpha': 0.22, 'ms': 700}, then='arena.yog.amulet', name=N('Yog falls', 'Падение Йога')),
    'arena.yog.amulet': e('fx/boss/amulet.png', 32, 64, fps=8, behaviour='flash', anchor='feet', hold=1600, light=L('#ffcc66', 5, 6, 2400, 'flash'), name=N('The Amulet of Yendor', 'Амулет Йендора')),
}
for v in FX.values():
    if v.get('light') is None: v.pop('light', None)

EVENTS = {
    'mined': 'quest.ore.hit', 'smith': 'quest.anvil', 'flock': 'minor.sheep.appear', 'faded': 'minor.sheep.vanish', 'mirrored': 'minor.mirror',
    'teleported': 'status.teleport.in', 'jumped': 'arena.tengu.smoke', 'yell.summon.king': 'arena.king.undead', 'died.king': 'arena.king.crown',
    'died.goo': 'arena.goo.pop', 'hurt.goo': 'arena.goo.splash', 'died.dm300': 'arena.dm300.explode', 'died.yog': 'arena.yog.death',
    'spawn.rottingFist': 'arena.yog.fist.rotting', 'spawn.burningFist': 'arena.yog.fist.burning', 'burst.purity.wave': 'minor.purity',
    'well.awareness': 'place.well.awareness.beam', 'well.health': 'place.well.health.beam', 'well.transmutation': 'place.well.transmutation.beam',
    'statue.wake': 'place.statue.wake', 'thorns': 'minor.thorns',
    **{f'glyph.{g}': f'glyph.{g}' for g in ['bounce', 'affection', 'antiEntropy', 'potential', 'metabolism', 'stench', 'viscosity', 'displacement', 'entanglement', 'multiplicity', 'autoRepair']},
}

AMBIENT = {
    'note': 'loops the 3D view keeps while their cause is in sight; a key a terrain or a state, the value the effect (and its row)',
    'terrain': {'WELL': {'awareness': 'place.well.awareness', 'health': 'place.well.health', 'transmutation': 'place.well.transmutation'},
                'ALCHEMY': 'place.pot.amber', 'PEDESTAL': 'place.pedestal', 'SIGN': 'place.sign', 'BOOKSHELF': 'place.shelf', 'HIGH_GRASS': 'place.firefly'},
    'garden': {'fx': 'place.firefly', 'per': 6, 'note': 'a firefly every 6 cells of high grass in a garden room, at night lights'},
    'library': {'fx': 'place.dust', 'per': 4, 'shelfEvery': [4000, 7000]},
    'heap': {'dew': 'place.dew', 'pedestalPrize': 'place.prize'},
    'npc': {'blacksmith': 'quest.forge'},
    'state': {'levitating': 'minor.levitate', 'slowed': 'status.slow', 'poisoned': 'status.poison', 'asleep': 'minor.sleep', 'mirrorImage': 'minor.mirror'},
    'arena': {'dm300': {'steam': {'fx': 'arena.steam', 'cells': 'the vents of the arena walls (pipes): every 3rd wall cell facing the arena'}},
              'king': {'throne': 'arena.throne'}},
}

BOSSES = {
    'note': 'the staging of the bosses: what the 3D view does that is not a sheet',
    'goo': {'squash': {'onHit': [[1.25, 0.75, 60], [0.9, 1.12, 60], [1, 1, 80]], 'note': '[scaleX, scaleY, ms] of the sprite, feet fixed'}, 'hit': 'arena.goo.splash', 'death': 'arena.goo.pop'},
    'tengu': {'jump': 'arena.tengu.smoke', 'mark': 'arena.tengu.mark', 'markRows': 3},
    'dm300': {'stages': [{'from': 0.66, 'fx': 'arena.dm300.damage1'}, {'from': 0.4, 'fx': 'arena.dm300.damage2'}, {'from': 0.2, 'fx': 'arena.dm300.damage3'}],
              'note': 'a stage while health ≤ its share of the maximum (dents and black smoke at the last)', 'death': 'arena.dm300.explode', 'debris': 6},
    'king': {'throne': 'arena.throne', 'summon': 'arena.king.undead', 'fall': {'rotate': 90, 'ms': 600, 'steps': 4, 'then': 'arena.king.crown'}},
    'yog': {'glintEvery': [2200, 3600], 'glint': 'arena.yog.glint', 'fists': {'rotting': 'arena.yog.fist.rotting', 'burning': 'arena.yog.fist.burning'},
            'death': 'arena.yog.death', 'amulet': 'arena.yog.amulet', 'amuletLight': L('#ffcc66', 3, 5, 0, 'pulse')},
}

BOSS_BAR = {
    'sheet': 'ui/boss/bar.png', 'frameSheet': 'ui/boss/bar-frame.png', 'frame': [0, 0, 64, 16], 'slice': 6, 'fill': {'hp': [64, 0, 16, 16], 'trace': [80, 0, 16, 16], 'armor': [96, 0, 16, 16]}, 'skull': [112, 0, 16, 16],
    'icons': {'sheet': 'ui/boss/icons.png', 'order': ['goo', 'tengu', 'dm300', 'king', 'yog'], 'size': 16},
    'trace': {'ms': 600, 'note': 'the lost health stays pale this long, then shrinks in 4 steps (as the HUD\'s wound trace)'},
    'show': 'from the boss card\'s end (bossCards.timeline.out) until the boss dies or leaves sight; the name and the icon from bossCards',
    'scale': {'phone': 2, 'monitor': 3},
}

from portraits import NPCS, MOODS
from quest import ICONS as GOALS, BADGES, REWARDS
from places import ICON_NAMES

QUEST = {
    'version': 1,
    'portraits': {'sheet': 'ui/quest/portraits.png', 'size': 48, 'rows': NPCS, 'moods': MOODS,
                  'frame': {'sheet': 'ui/quest/portrait-frame.png', 'size': 64, 'inset': 8},
                  'mood': {'calm': 'the greeting, the reminder', 'pleased': 'the quest done, the reward given', 'annoyed': 'not yet / not enough / refused (noGold, noPickaxe, noBlood, a busy smith)'},
                  'scale': {'phone': 1, 'monitor': 2}},
    'dialog': {'sheet': 'ui/quest/dialog-frame.png', 'size': 48, 'slice': 8},
    'icons': {'sheet': 'ui/quest/icons.png', 'size': 16, 'goals': list(GOALS), 'badges': list(BADGES)},
    'goals': {
        'ghost': {'rose': {'item': 'quest.rose', 'of': 1}, 'rat': {'item': 'quest.skull', 'of': 1, 'icon': 'skull'}, 'curse': {'icon': 'curse', 'of': 1}},
        'wandmaker': {'dust': {'item': 'quest.dust', 'of': 1}, 'berry': {'item': 'seed.rotberry', 'of': 1, 'icon': 'seed'}, 'fish': {'item': 'quest.fish', 'of': 1}},
        'blacksmith': {'gold': {'item': 'quest.ore', 'of': 15, 'icon': 'ore', 'tool': 'pickaxe'}, 'blood': {'icon': 'blood', 'of': 1, 'tool': 'pickaxe', 'note': 'the pickaxe stained with a vampire bat\'s blood (item.bloody)'}},
        'imp': {'monk': {'item': 'quest.token', 'of': 8, 'icon': 'token'}, 'golem': {'item': 'quest.token', 'of': 6, 'icon': 'golem'}},
    },
    'names': {
        'rose': {'en': 'Dried rose', 'ru': 'Засохшая роза'}, 'skull': {'en': 'Rat skull', 'ru': 'Крысиный череп'}, 'dust': {'en': 'Corpse dust', 'ru': 'Трупная пыль'},
        'seed': {'en': 'Rotberry seed', 'ru': 'Семя гнилоягоды'}, 'fish': {'en': 'Phantom fish', 'ru': 'Призрачная рыба'}, 'ore': {'en': 'Dark gold ore', 'ru': 'Руда тёмного золота'},
        'blood': {'en': 'Vampire bat\'s blood', 'ru': 'Кровь летучей мыши-вампира'}, 'token': {'en': 'Dwarf token (monk)', 'ru': 'Жетон гнома (монах)'},
        'golem': {'en': 'Dwarf token (golem)', 'ru': 'Жетон гнома (голем)'}, 'pickaxe': {'en': 'Pickaxe', 'ru': 'Кирка'}, 'curse': {'en': 'The curse', 'ru': 'Проклятие'},
    },
    'progress': {'sheet': 'ui/quest/progress.png', 'track': [0, 0, 48, 16], 'slice': 6, 'fill': {'empty': [48, 0, 16, 16], 'ember': [64, 0, 16, 16], 'gold': [80, 0, 16, 16], 'done': [96, 0, 16, 16]}, 'tick': [112, 0, 16, 16],
                 'note': 'a step a unit while «of» ≤ 15 (ore 15, tokens 8 or 6), else a share; the last step gold, all green when done'},
    'rewards': {k: 'quest.reward.' + k for k, *_ in REWARDS},
    'smith': {'mine': 'quest.ore.hit', 'nugget': 'quest.ore.nugget', 'forge': 'quest.forge', 'anvil': 'quest.anvil',
              'pickaxe': {'held': 'weapons/held/pickaxe.png', 'style': 'blunt', 'note': 'the part 9 pickaxe in the hand; a blow at an ore wall plays the blunt attack, quest.ore.hit at the wall\'s face'}},
}

PLACES = {
    'version': 1, 'icons': {'sheet': 'ui/places/icons.png', 'size': 16, 'order': ICON_NAMES},
    'cards': {
        'well-awareness': {'en': ['Well of awareness', 'One drink: what you wear is known, the level is mapped, its secrets shown. Drop an unknown item in: it is identified.'],
                           'ru': ['Колодец знания', 'Один глоток: надетое опознано, уровень на карте, тайники видны. Бросьте неопознанную вещь — она опознается.']},
        'well-health': {'en': ['Well of health', 'One drink: full health, poison, burning and weakness gone. A dew vial dropped in comes out full.'],
                        'ru': ['Колодец здоровья', 'Один глоток: здоровье полностью, яд, горение и слабость проходят. Брошенная фляга для росы выйдет полной.']},
        'well-transmutation': {'en': ['Well of transmutation', 'Drinking does nothing. An item dropped in turns into another of its kind; the well dries.'],
                               'ru': ['Колодец превращения', 'Пить бесполезно. Брошенная вещь станет другой того же рода; колодец пересохнет.']},
        'pot': {'en': ['Alchemy pot', 'Three seeds make a potion: 1 in N a random one, else by the seeds.'], 'ru': ['Котёл', 'Три семени — зелье: с шансом 1/N случайное, иначе по семенам.']},
        'garden': {'en': ['Garden', 'Tall grass and plants; trampled grass gives dew and seeds.'], 'ru': ['Сад', 'Высокая трава и растения; примятая трава даёт росу и семена.']},
        'statue': {'en': ['Statue', 'A statue holding a weapon may wake and fight; it drops that weapon.'], 'ru': ['Статуя', 'Статуя с оружием может ожить и напасть; оружие останется после неё.']},
        'library': {'en': ['Library', 'Bookshelves burn; scrolls lie among them.'], 'ru': ['Библиотека', 'Книжные полки горят; среди них лежат свитки.']},
        'pedestal': {'en': ['Pedestal', 'A prize lies on it.'], 'ru': ['Постамент', 'На нём лежит награда.']},
        'sign': {'en': ['Sign', 'Read it: a word from the dungeon.'], 'ru': ['Табличка', 'Прочтите: весточка подземелья.']},
        'dew': {'en': ['Dew', 'A drop heals a little; a vial gathers it.'], 'ru': ['Роса', 'Капля немного лечит; фляга её собирает.']},
        'altar': {'en': ['Altar', 'Sacrifice a monster in its flames for a prize.'], 'ru': ['Алтарь', 'Принесите монстра в жертву в его пламени — получите награду.']},
    },
}

if __name__ == '__main__':
    fx = json.load(open(FX_IN))
    fx['fx'] = {k: v for k, v in fx['fx'].items() if not k.startswith(PREFIXES)}
    fx['fx'].update(FX)
    fx['fx']['trap.alarm']['then'] = 'minor.alarm'
    # the part's moments are keys the client's eventKey does not make yet (fxsheet.ts): kept apart from `events`, which holds only
    # what the game can already ask for; once eventKey learns a key, it moves into `events`
    fx['moments'] = {'note': 'part 13: event keys for eventKey to learn (migration-p13.md), each to the effect it plays', **EVENTS}
    fx['ambient'], fx['bosses'], fx['bossBar'] = AMBIENT, BOSSES, BOSS_BAR
    os.makedirs(OUT + 'fx', exist_ok=True)
    with open(OUT + 'fx/fx.json', 'w') as f: json.dump(fx, f, ensure_ascii=False, indent=1)
    print('fx.json', len(fx['fx']), 'effects', len(fx['events']), 'events')
    os.makedirs(OUT + 'ui/quest', exist_ok=True); os.makedirs(OUT + 'ui/places', exist_ok=True)
    with open(OUT + 'ui/quest/quest.json', 'w') as f: json.dump(QUEST, f, ensure_ascii=False, indent=1)
    with open(OUT + 'ui/places/places.json', 'w') as f: json.dump(PLACES, f, ensure_ascii=False, indent=1)
    print('quest.json, places.json')

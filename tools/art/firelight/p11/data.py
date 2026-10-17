# Firelight · part 11: growth.json — where every icon and effect frame is, the motion and sound of each moment, the steps of
# the 3D shine, the variants. Read by the client (growth art, fl-grow.css) and by the previews. Python 3 + Pillow.
import json
import os
import icons
import fx
from c11 import DIR, PAL

os.makedirs(DIR, exist_ok=True)
ic, icon_where = icons.sheet()
fxi, fx_where = fx.sheet()
ic.save(DIR + 'growth-icons.png', optimize=False)
fxi.save(DIR + 'growth-fx.png', optimize=False)

data = {
    'version': 1,
    'part': 11,
    'sheets': {'icons': 'growth-icons.png', 'fx': 'growth-fx.png'},
    'icons': icon_where,
    'masks': list(icons.MASKS),
    'fx': fx_where,
    # The palette letters of the art, every one a token of ui.css or named here (curse, cold).
    'palette': PAL,
    # Motion: every moment is short and never holds the turn; reduced motion keeps the end state and a still highlight instead.
    'motion': {
        'max': 400, 'pop': 160, 'reveal': 320, 'stagger': 40, 'hold': 1200,
        'easing': 'steps', 'fps': 15,
        'moments': {
            'levelUp':    {'ms': 360, 'frames': 6, 'sound': 'levelup', 'reduced': 'badge and card shown at once, the card held 2.4 s'},
            'expTick':    {'ms': 160, 'frames': 3, 'sound': None, 'reduced': 'the bar is set, no flash'},
            'strength':   {'ms': 400, 'frames': 6, 'sound': 'thump', 'then': 'sparkle', 'reduced': 'the red tags turn plain at once, the feathers shown 1.2 s'},
            'identify':   {'ms': 320, 'frames': 5, 'sound': 'found', 'reduced': 'the card face changes at once'},
            'upgrade':    {'ms': 320, 'frames': 5, 'sound': 'hammer', 'then': 'sparkle', 'reduced': 'the new number at once, gold for 1.2 s'},
            'enchant':    {'ms': 360, 'frames': 4, 'sound': 'evoke', 'reduced': 'the rune shown whole'},
            'uncurse':    {'ms': 360, 'frames': 6, 'sound': 'shatter', 'reduced': 'the violet frame gone at once'},
            'newItem':    {'ms': 240, 'frames': 4, 'sound': None, 'reduced': 'the spark mark only'},
            'mastery':    {'ms': 400, 'frames': 4, 'sound': 'badge', 'reduced': 'the sigil and title shown still'},
            'classArmor': {'ms': 400, 'frames': 4, 'sound': 'equip', 'then': 'badge', 'reduced': 'the new armour row at once'},
            'shine':      {'period': [1600, 1200, 900, 0], 'note': 'the 3D sparks: one twinkle per period per tier 1..3; tier 4 keeps its orbit lit'},
        },
    },
    # The 3D shine of an upgraded weapon or armour (growth.ts shineTier): from +1, +3, +6, +10. Nothing for a hidden level.
    'shine': {
        'from': [1, 3, 6, 10],
        'A': {'sparks': [1, 2, 3, 4], 'halo': [0, 0, 0.10, 0.18]},
        'B': {'glintEvery': [2400, 1600, 1000, 600]},
        'C': {'segments': 10, 'radius': 0.42},
    },
    # ItemSprite.Glowing, as the game already draws enchanted things (view.ts ENCHANT_COLORS): the rune is tinted with it.
    'enchant': {
        'fire': '255, 68, 0', 'poison': '68, 0, 170', 'death': '40, 40, 40', 'paralysis': '255, 255, 68', 'leech': '170, 0, 40', 'slow': '0, 68, 255',
        'shock': '255, 255, 255', 'instability': '255, 255, 255', 'horror': '90, 90, 90', 'luck': '0, 255, 0', 'tempering': '204, 136, 136',
    },
    'glyph': '94, 200, 192',
    'curse': {'light': PAL['v'], 'shade': PAL['V'], 'bg': '#3a2126'},
    # The corner marks of a slot (growth.ts slotMarks): top left the level or «?», top right the strength, bottom right the count,
    # bottom left one mark in this order.
    'marks': {'order': ['cursed', 'new', 'enchant', 'glyph', 'note'], 'size': 8, 'scale': 2},
    'variants': {
        'growth':    {'A': 'Spark', 'B': 'Hearth', 'C': 'Chronicle'},
        'strength':  {'A': 'Feathers', 'B': 'Ladder', 'C': 'Weight'},
        'passport':  {'A': 'Passport', 'B': 'Paper doll', 'C': 'By depth'},
        'ceremony':  {'A': 'Seal', 'B': 'By the fire', 'C': 'Chapter'},
        'shine':     {'A': 'Sparks', 'B': 'Glint', 'C': 'Floor ring'},
        'slot':      {'A': 'Corners', 'B': 'Frames', 'C': 'Tags'},
        'card':      {'A': 'Was / will be', 'B': 'Side by side', 'C': 'Verdict'},
        'truth':     {'A': 'Slot', 'B': 'Card', 'C': 'Quiet'},
        'filters':   {'A': 'Chips', 'B': 'Rail', 'C': 'Lenses'},
        'catalog':   {'A': 'Showcase', 'B': 'Alchemist\'s book', 'C': 'Elimination'},
        'bestiary':  {'A': 'Cards', 'B': 'By region', 'C': 'Trophies'},
        'chronicle': {'A': 'Ribbon', 'B': 'Descent map', 'C': 'Pages'},
        'mechanic':  {'A': 'Card', 'B': 'Diagram', 'C': 'Cheat sheet'},
        'end':       {'A': 'Growth card', 'B': 'Scroll', 'C': 'Was / is'},
    },
}

with open(DIR + 'growth.json', 'w') as f:
    json.dump(data, f, ensure_ascii=False, indent=1, sort_keys=True)
    f.write('\n')
print('growth.json', len(icon_where['8']) + len(icon_where['12']) + len(icon_where['16']), 'icons', len(fx_where), 'effects')

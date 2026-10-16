# Firelight · part 5: pets that follow the hero (looks only). Each sheet: 8 frames of 12 x 12, feet at (6, 11) - idle 0-3, walk 4-7.
# Flyers hover (the renderer lifts them, kit.sprites.fly) and their glow parts have a mask of the same layout.
import json
from PIL import Image
from common import *

O = dict(o='#151612')
PETS = {
    'firefly': dict(fly=True, glow=True, en='Firefly', ru='Светлячок', stars=50, pal=dict(o='#2a2a1c', b='#5a5a32', w='#d8f0ff', g='#f0ff9a', y='#c8ff5a'),
        a=['............', '............', '............', '............', '....w..w....', '...wwwww....', '....obbo....', '....oggo....', '.....yy.....', '............', '............', '............'],
        b=['............', '............', '............', '...w....w...', '....w..w....', '.....ww.....', '....obbo....', '....oggo....', '.....yy.....', '............', '............', '............']),
    'rat': dict(en='Little Rat', ru='Крысёнок', stars=50, pal=dict(o='#151612', a='#9a8a7a', b='#6a5a4c', p='#e8a0a0', e='#000000', w='#ffffff'),
        a=['............', '............', '............', '............', '............', '......pp....', '..aaaaaaa...', '.abbbbbbaew.', 'bbaaaaaaaaap', '....b...b...', '............', '............'],
        b=['............', '............', '............', '............', '............', '......pp....', '..aaaaaaa...', '.abbbbbbaew.', 'bbaaaaaaaaap', '...b.....b..', '............', '............']),
    'slime': dict(en='Slime', ru='Слизнячок', stars=50, pal=dict(o='#1a3a16', a='#7fdc4a', b='#4a9a2a', h='#d8ffb0', e='#0e1a0a'),
        a=['............', '............', '............', '............', '....oooo....', '...oahaao...', '..oaaeaeao..', '..oaaaaaao..', '..obbbbbbo..', '...oooooo...', '............', '............'],
        b=['............', '............', '............', '............', '............', '...oooooo...', '..oahaaaao..', '.oaaaeaeaao.', '.obbbbbbbbo.', '..oooooooo..', '............', '............']),
    'bat': dict(fly=True, en='Pocket Bat', ru='Карманная мышь', stars=75, pal=dict(o='#151612', a='#4a3a4a', b='#2a202a', r='#ff3a2a'),
        a=['............', '............', '............', '.a........a.', '.aa..bb..aa.', '.aaabrrbaaa.', '..aabbbbaa..', '....bbbb....', '.....bb.....', '............', '............', '............'],
        b=['............', '............', '............', '............', '.....bb.....', '...abrrba...', '.aaabbbbaaa.', 'aa..bbbb..aa', 'a....bb....a', '............', '............', '............']),
    'skull': dict(fly=True, en='Grinning Skull', ru='Весёлый череп', stars=75, pal=dict(o='#151612', a='#f0eadc', b='#b8b0a0', e='#151612', g='#7fdc4a'),
        a=['............', '............', '............', '...aaaaa....', '..aaaaaaa...', '..aeeaeea...', '..aggaggab..', '..aaaeaaab..', '...ababab...', '...bbbbb....', '............', '............'],
        b=['............', '............', '............', '...aaaaa....', '..aaaaaaa...', '..aeeaeea...', '..aggaggab..', '..aaaeaaab..', '...ababab...', '............', '...bbbbb....', '............']),
    'ember': dict(fly=True, glow=True, en='Ember Spirit', ru='Огонёк', stars=100, pal=dict(o='#6a1410', r='#c0301a', f='#f06a1e', y='#ffb02e', w='#fff6c8', e='#1a0a06'),
        a=['............', '.....r......', '....rf......', '....rfr.....', '...rffyr....', '...ffyyfr...', '..rfweywfr..', '..rfyyyyfr..', '..rffyyffr..', '...rfffr....', '....rrr.....', '............'],
        b=['............', '......r.....', '......fr....', '.....rfr....', '....ryffr...', '...rfyyff...', '..rfweywfr..', '..rfyyyyfr..', '..rffyyffr..', '....rfffr...', '.....rrr....', '............']),
}


def frames(p):
    pal = {k: hx(v) for k, v in p['pal'].items()}
    A, B = grid(p['a'], pal), grid(p['b'], pal)
    out_ = []
    for i, (im, dy) in enumerate([(A, 0), (A, 0), (A, -1), (B if p.get('fly') else A, -1)] + [(A, 0), (B, -1), (A, 0), (B, -1)]):
        c = Image.new('RGBA', (12, 12), (0, 0, 0, 0)); c.alpha_composite(im, (0, dy) if dy >= 0 else (0, 0), (0, -dy) if dy < 0 else (0, 0)); out_.append(c)
    if not p.get('fly'):          # walkers blink on idle frame 2
        out_[2] = A.copy()
    return out_


def glow_of(fr, p):
    g = []
    for f in fr:
        m = Image.new('RGBA', f.size, (0, 0, 0, 0)); a = f.load(); b = m.load()
        for y in range(12):
            for x in range(12):
                c = a[x, y]
                if c[3] and hsv(c)[2] > .78 and hsv(c)[1] > .2 or (c[3] and to_hex(c) in ('#fff6c8', '#f0ff9a', '#c8ff5a', '#ffb02e')): b[x, y] = c
        g.append(m)
    return g


catalog = []
chk = Image.new('RGBA', (8 * 13, 6 * 13), (40, 40, 40, 255))
for r, (key, p) in enumerate(PETS.items()):
    fr = frames(p); save(strip(fr), f'pets/{key}.png')
    if p.get('glow'): save(strip(glow_of(fr, p)), f'pets/{key}-glow.png')
    save(fr[0], f'pets/icons/{key}.png')
    gif([x_n(f, 6) for f in fr[4:] * 3 + fr[:4] * 2], f'pets/preview/{key}-x6.gif', 140)
    for i, f in enumerate(fr): chk.alpha_composite(f, (i * 13, r * 13))
    catalog.append(dict(sku=f'pet.{key}', kind='pet', pet=key, stars=p['stars'], name=dict(en=p['en'], ru=p['ru']), fly=bool(p.get('fly')),
                        sheet=dict(file=f'mart/fl/pets/{key}.png', w=12, h=12, frames=8, idle=[0, 1, 2, 3], walk=[4, 5, 6, 7], feet=[6, 11], ms=150),
                        **({'glow': f'mart/fl/pets/{key}-glow.png'} if p.get('glow') else {}), follow=dict(behind=1, lag_ms=220), icon=f'mart/fl/pets/icons/{key}.png'))
json.dump(catalog, open(out('catalog-pets.json'), 'w'), ensure_ascii=False, indent=1)
x_n(chk, 6).save(os.path.join(os.environ.get('P5_CHECK', '/tmp'), 'pets.png')); print('pets', len(catalog))

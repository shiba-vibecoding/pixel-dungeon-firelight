# Firelight · part 7: the honour titles, as the part 5 title plates (24 x 12, border-image slice 4, the icon 9 x 9 at the left).
# They are won, never sold: a new plate «honour» (coal red with a gold rim) for the circle, speed, depth and duel titles, and the
# part 5 legend plate for the season's Beacon.
import json
from PIL import Image
import c7
from c7 import hx, grid, save, out

PAL = dict(y=hx('#ffcc66'), l=hx('#fff6c8'), o=hx('#ff9a3a'), r=hx('#b22a2a'), s=hx('#e8e2c8'), S=hx('#a89c90'), k=hx('#151612'), b=hx('#bff4ff'),
           w=hx('#ffffff'), d=hx('#3a3c38'), g=hx('#6a6c66'))
ICONS = {
    'circle':  ['..yyyyy..', '.y.....y.', 'y..l.l..y', 'y.lylyl.y', 'y.yyyyy.y', 'y.......y', '.y.....y.', '..yyyyy..', '.........'],   # a crown in the circle
    'swift':   ['.....lll.', '....lyy..', '...lyy...', '..lyyyyy.', '....yyy..', '...yy....', '..yy.....', '.yy......', 'y........'],   # a bolt
    'deep':    ['sssssssss', '...sssss.', '......sss', 'ss.......', '.sss.....', '...l.....', '..lyl....', '...y.....', '...y.....'],   # stairs, the light going down
    'duelist': ['s.......s', '.s.....s.', '..s...s..', '...s.s...', '....s....', '...s.s...', '.yy...yy.', 'ky.....yk', 'k.......k'],   # crossed swords
    'beacon':  ['b..lll..b', '.b.lyl.b.', '...ddd...', '..ggggg..', '...www...', '...rrr...', '...www...', '..rrrrr..', '.ggggggg.'],   # the lighthouse
}
TITLES = [   # key, icon, plate, en, ru, how it is won (compete.json -> titles)
    ('circle_champion', 'circle', 'honour', 'Circle Champion', 'Чемпион круга', 'first in one of your circles at the end of a week'),
    ('swift', 'swift', 'honour', 'Swift', 'Скоростной', 'top 10 of a day on the speed board'),
    ('deep', 'deep', 'honour', 'Deep Delver', 'Глубинный', 'top 10 of a day on the depth board'),
    ('duelist', 'duelist', 'honour', 'Duelist', 'Дуэлянт', 'ten duels won on one seed (when duels open)'),
    ('season_beacon', 'beacon', 'legend', 'Beacon of the Season', 'Маяк сезона', 'the Beacon league at the season\'s end, or the season\'s top 10 by Heat'),
]


def plate_honour():
    a, b, c = hx('#7a1a16'), hx('#b22a2a'), hx('#3a0a0a'); im = Image.new('RGBA', (24, 12), (0, 0, 0, 0)); px = im.load()
    for y in range(12):
        for x in range(24):
            if x in (0, 23) and y in (0, 11): continue
            edge = x in (0, 23) or y in (0, 11)
            px[x, y] = (hx('#151612') if edge else (hx('#ffcc66') if y == 1 else (c if y == 10 else (b if y == 2 else a)))) + (255,)
    for x in (1, 22):
        for y in (1, 10): px[x, y] = hx('#fff6c8') + (255,)
    return im


def main():
    save(plate_honour(), 'titles/title-plate-honour.png')
    data = []
    for key, ic, pl, en, ru, how in TITLES:
        save(grid(ICONS[ic], PAL), f'titles/title-{key}.png')
        data.append(dict(sku=f'title.{key}', kind='title', title=key, rarity=pl, honour=True, name=dict(en=en, ru=ru), how=how,
                         icon=f'compete/titles/title-{key}.png', plate='compete/titles/title-plate-honour.png' if pl == 'honour' else 'mart/fl/profile/title-plate-legend.png'))
    json.dump(data, open(out('titles/titles.json'), 'w'), ensure_ascii=False, indent=1)
    print('titles ok')


if __name__ == '__main__':
    main()

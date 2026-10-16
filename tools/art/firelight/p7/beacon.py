# Firelight · part 7: the campfire style «Beacon» («Маяк»), by the scheme of the part 5 fires (fires/<style>-flame|logs|sparks.png):
# 6 flame frames 13 x 17, logs 16 x 6 (here a stone brazier with a gold rim), 4 spark frames 3 x 3, the light colour.
# Not sold: it is the season's honour (the Beacon league at the season's end, see compete.json). A white-hot core, gold body,
# a pale cyan crown at the tips (the signal colour of the Beacon tier), the sparks rising straight in a column.
import json
from PIL import Image
import c7
from c7 import hx, grid, save, out, x_n, strip

FIRE = Image.open(c7.SRC + 'camp/fire.png').convert('RGBA')
SRCRAMP = ['#fff6c8', '#ffe066', '#ffb02e', '#f06a1e', '#c0301a', '#6a1410']   # camp/fire.png's own ramp (as part 5 fires.py)


def recolour(ramp):
    src = [hx(c) for c in SRCRAMP]; dst = [hx(c) for c in ramp]; out_ = []
    for f in range(6):
        fr = FIRE.crop((f * 13, 0, f * 13 + 13, 17)); px = fr.load()
        for y in range(17):
            for x in range(13):
                p = px[x, y]
                if p[3]: px[x, y] = dst[min(range(6), key=lambda j: sum((p[t] - src[j][t]) ** 2 for t in range(3)))] + (255,)
        out_.append(fr)
    return out_

STYLE = dict(ramp=['#ffffff', '#fffbe6', '#ffe48a', '#ffc040', '#e88a2a', '#7a3a16'], light='#ffe9b0', logs='brazier')
CROWN = hx('#bff4ff')
BRAZIER = ['..bbbbbbbbbbbb..', '.aeeeeeeeeeeeea.', 'abbbbbbbbbbbbbba', '.bcbccbbccbcbcb.', '..bccbbbbccbb...', '...cc......cc...']


def flame_frames():
    fr = recolour(STYLE['ramp'])
    for k, im in enumerate(fr):
        px = im.load()
        for x in range(13):              # the tips of the tongues take the beacon's crown colour
            for y in range(17):
                if px[x, y][3]:
                    if y <= 3 or (y <= 5 and (x + k) % 3 == 0): px[x, y] = CROWN + (230,)
                    break
    return fr


def logs():
    return grid(BRAZIER, dict(a=hx('#d8c68a'), b=hx('#6a6c66'), c=hx('#3a3c38'), e=hx('#ffcc66')))


def sparks():
    cs = [hx('#ffffff'), hx('#bff4ff'), hx('#ffe48a')]; fr = []
    for f, sh in enumerate([[(1, 2)], [(1, 1), (1, 2)], [(1, 0), (1, 1)], [(1, 0)]]):    # a short streak climbing
        im = Image.new('RGBA', (3, 3), (0, 0, 0, 0)); px = im.load()
        for x, y in sh: px[x, y] = cs[min(2, f)] + ((255, 255, 220, 150)[f],)
        fr.append(im)
    return fr


def icon(flame, lg):
    im = Image.new('RGBA', (16, 23), (0, 0, 0, 0)); im.alpha_composite(lg, (0, 17)); im.alpha_composite(flame, (2, 1))
    return im


def main():
    fl = flame_frames(); lg = logs(); sp = sparks()
    save(strip(fl), 'fires/beacon-flame.png'); save(lg, 'fires/beacon-logs.png'); save(strip(sp), 'fires/beacon-sparks.png')
    save(icon(fl[2], lg), 'fires/icons/beacon.png')
    data = dict(flame=dict(sheet='compete/fires/beacon-flame.png', frames=6, w=13, h=17, ms=90), logs='compete/fires/beacon-logs.png', logsAt=[-8, -4],
                sparks=dict(sheet='compete/fires/beacon-sparks.png', frames=4, w=3, h=3, rise='straight up in a column, 1 px a frame'), light=STYLE['light'],
                icon='compete/fires/icons/beacon.png', honour=True)
    json.dump(data, open(out('fires/beacon.json'), 'w'), indent=1)
    print('beacon ok')


if __name__ == '__main__':
    main()

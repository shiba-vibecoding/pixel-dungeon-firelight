# Firelight · part 8: the six pets of Pixel-Mart (part 5) by facing. Each sheet is 8 frames of 12 x 12 (idle 0-3, walk 4-7).
#   - firefly: the same from every side (marked symmetric, no new sheet);
#   - slime, bat, skull, ember: their part 5 picture already faces the camera, so it is the front and the side; the back is the
#     same body without the face (eyes, teeth, the ember's glowing eyes take the body's colour);
#   - rat: drawn sideways in part 5; here a front (snout at the camera, body behind, ears either side) and a back (ears,
#     back, the tail coming at the camera), walking with its feet in turn.
import json
from PIL import Image
import c8
from c8 import hx, save

PETS = c8.SRC + 'mart/fl/pets/'
FACE = {   # the back: colour of the face -> the body colour that covers it
    'slime': {'#0e1a0a': '#7fdc4a'},
    'bat':   {'#ff3a2a': '#2a202a'},
    'skull': {'#151612': '#f0eadc', '#7fdc4a': '#f0eadc'},
    'ember': {'#fff6c8': '#ffb02e', '#1a0a06': '#ffb02e'},
}
RAT = dict(a='#e8a0a0', b='#9a8a7a', c='#6a5a4c', d='#000000', e='#ffffff')
RAT_FRONT = ['............', '............', '............', '....cbbc....', '...cbbbbc...', '..aabbbbaa..', '..abbbbbba..', '...bdbbdb...', '....bbbb....',
             '....cbbc....', '.....aa.....', '............']
RAT_BACK = ['............', '............', '............', '...aa..aa...', '...bbbbbb...', '..bbbbbbbb..', '..bcbbbbcb..', '..bbbbbbbb..', '...bbbbbb...',
            '.....aa.....', '......a.....', '............']


def grid(rows):
    im = Image.new('RGBA', (12, 12), (0, 0, 0, 0)); p = im.load()
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch != '.': p[x, y] = hx(RAT[ch]) + (255,)
    return im


def rat_frames(rows, front):
    out = []
    for k in range(8):
        im = grid(rows); p = im.load(); walk = k >= 4; ph = k % 2
        if front:                                    # front feet under the snout's sides, in turn when walking; the nose twitches
            feet = [(4, 11), (7, 11)] if not walk else ([(3, 11), (8, 10)] if ph == 0 else [(3, 10), (8, 11)])
            for x, y in feet: p[x, y] = hx(RAT['c']) + (255,)
            if k % 4 == 1: p[5, 10] = p[6, 10] = hx(RAT['e']) + (255,)
        else:                                        # hind feet and the tail swinging
            feet = [(3, 9), (8, 9)] if not walk else ([(3, 9), (8, 8)] if ph == 0 else [(3, 8), (8, 9)])
            for x, y in feet: p[x, y] = hx(RAT['c']) + (255,)
            p[6, 10] = (0, 0, 0, 0); p[5 + (k % 3 == 1) * 2, 10] = hx(RAT['a']) + (255,)
            p[6, 11] = (0, 0, 0, 0); p[[5, 6, 7, 6][k % 4], 11] = hx(RAT['a']) + (255,)
        if walk and ph == 1: im = c8.shift(im, 0, -1)
        out.append(im)
    return out


def strip(frames):
    o = Image.new('RGBA', (12 * len(frames), 12), (0, 0, 0, 0))
    for i, f in enumerate(frames): o.alpha_composite(f, (i * 12, 0))
    return o


def deface(key):
    im = Image.open(PETS + f'{key}.png').convert('RGBA'); p = im.load(); m = {hx(k): hx(v) for k, v in FACE[key].items()}
    for y in range(im.height):
        for x in range(im.width):
            c = p[x, y]
            if c[3] and c[:3] in m: p[x, y] = m[c[:3]] + (c[3],)
    return im


def main():
    data = {}
    save(strip(rat_frames(RAT_FRONT, True)), 'mart/fl/pets/rat-front.png'); save(strip(rat_frames(RAT_BACK, False)), 'mart/fl/pets/rat-back.png')
    data['rat'] = dict(side='mart/fl/pets/rat.png', front='mart/fl/pets/rat-front.png', back='mart/fl/pets/rat-back.png')
    for key in FACE:
        save(deface(key), f'mart/fl/pets/{key}-back.png')
        data[key] = dict(side=f'mart/fl/pets/{key}.png', front=f'mart/fl/pets/{key}.png', back=f'mart/fl/pets/{key}-back.png', note='the part 5 picture faces the camera: front = side')
    data['firefly'] = dict(symmetric=True, side='mart/fl/pets/firefly.png', note='the same from every side')
    print('pets ok'); return data


if __name__ == '__main__':
    main()

# Pixel Dungeon: Firelight — thrown stones in PD 1.9 item style (16x16 cells, 1 px outline of black at alpha 102).
import numpy as np
from PIL import Image
P = {
    'W': (255, 255, 255), 'A': (230, 230, 230), 'B': (205, 205, 205), 'C': (180, 180, 180), 'D': (154, 154, 154),
    'E': (129, 129, 129), 'F': (102, 102, 102), 'G': (76, 76, 76), 'H': (62, 62, 62), 'I': (48, 48, 48), 'J': (19, 19, 19),
    'y': (255, 213, 0), 'Y': (255, 245, 91), 'o': (255, 158, 33), 'O': (255, 84, 0), 'R': (227, 31, 0), 'r': (163, 21, 22),
    'p': (44, 20, 6), 'b': (38, 35, 63), 'n': (113, 122, 129), 'w': (255, 255, 255),
}
OUTLINE = (0, 0, 0, 102)
def sprite(rows, outline=True, nodiag=False):
    h, w = len(rows), len(rows[0])
    a = np.zeros((h, w, 4), np.uint8)
    for y, row in enumerate(rows):
        assert len(row) == w, (y, row, len(row), w)
        for x, ch in enumerate(row):
            if ch in P: a[y, x] = (*P[ch], 255)
    if outline:
        filled = a[..., 3] == 255; o = np.zeros_like(filled)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if nodiag and dx and dy: continue
                o |= np.roll(np.roll(filled, dy, 0), dx, 1)
        o &= ~filled
        a[o] = OUTLINE
    return a

STONE = [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '.....CCDD.......',
    '...CBAACCDE.....',
    '..CBAWBCDDEE....',
    '..CBBBCCDDEEF...',
    '..DCCCCDDEEEF...',
    '...DDDDEEEFFG...',
    '....EEEFFFGG....',
    '................',
    '................',
    '................',
]
ROCK = [
    '................',
    '................',
    '............y...',
    '............Y...',
    '..........yYwYy.',
    '.....E......Y...',
    '....EDF..EF.y...',
    '...FDCEFEDFG....',
    '..GEDDCEEFFGH...',
    '..GFEEDEFFGGH...',
    '.HGFFFEFGGHHI...',
    '.HGGGGFGGHHII...',
    '..IHHGHHHIII....',
    '...II.IIHI......',
    '................',
    '................',
]
FLINT = [
    '................',
    '................',
    '..o.o...........',
    '...Y....nnG.....',
    '..o.o.nnGGHI....',
    '.....nGGnHHIJ...',
    '....nGHHGnIIJ...',
    '...nGHHIIHnJJI..',
    '...GHHIIoIJJI...',
    '..OoGHIoIJJII...',
    '..RYoHIIJJII....',
    '.rOYoRIJII......',
    '.ROoYORr........',
    '.rROoRr.........',
    '..rrr...........',
    '................',
]
cells = {'stone': sprite(STONE), 'rock': sprite(ROCK), 'flint': sprite(FLINT)}

# In flight, 8x8: the stone and the rock spin (a quarter turn a frame); the flint flies point first with a spark trail
# (drawn flying right; the game turns it to the throw's angle).
P_STONE = ['........', '........', '...CB...', '..CAWD..', '..DCDE..', '...EF...', '........', '........']
P_ROCK = ['........', '...D....', '..EDDF..', '.FDCEG..', '.GEFFH..', '..HGH...', '........', '........']
P_FLINT_BODY = ['........', '........', '.....nG.', '....nGHI', '....OrIJ', '.....Or.', '........', '........']
TRAIL = [  # behind the flint, no outline: sparks shed by the burning crust
    ['........', '........', '........', '..o.....', 'Y..o....', '.o......', '........', '........'],
    ['........', '........', '.o......', '...o....', '.Y......', '..o.....', '........', '........'],
    ['........', '........', '........', 'o..Y....', '..o.....', '...o....', '........', '........'],
    ['........', '........', '..o.....', '.....  .'.replace(' ', '.'), 'o..Y....', '........', '.o......', '........'],
]
def with_trail(body, trail):
    a = sprite(body).copy(); t = sprite(trail, outline=False); m = t[..., 3] == 255; a[m] = t[m]; return a
def rot(rows, k):
    a = np.array([list(r) for r in rows]); return [''.join(r) for r in np.rot90(a, -k)]
proj = {
    'stone': [sprite(rot(P_STONE, k)) for k in range(4)],
    'rock': [sprite(rot(P_ROCK, k)) for k in range(4)],
    'flint': [with_trail(P_FLINT_BODY, t) for t in TRAIL],
}
# The hit, 8x8, 4 frames, no outline (an effect, like PD's specks): a flash, chips flying out, the last few fading.
SHATTER = [
    ['........', '........', '...C....', '..CWB...', '...BD...', '........', '........', '........'],
    ['........', '..C..B..', '........', '...W....', '........', '.D...C..', '........', '........'],
    ['.C....B.', '........', '........', '........', '........', '........', 'D.....E.', '...E....'],
    ['C.......', '.......E', '........', '........', '........', '........', '........', 'E....F..'],
]
SPARKS = [
    ['........', '........', '...Y....', '..YwO...', '...OR...', '........', '........', '........'],
    ['........', '..Y..o..', '........', '...w....', '........', '.O...Y..', '........', '........'],
    ['.Y....o.', '........', '........', '........', '........', '........', 'R.....O.', '...o....'],
    ['o.......', '.......R', '........', '........', '........', '........', '........', 'r....R..'],
]
burst = {'shatter': [sprite(f, outline=False) for f in SHATTER], 'sparks': [sprite(f, outline=False) for f in SPARKS]}

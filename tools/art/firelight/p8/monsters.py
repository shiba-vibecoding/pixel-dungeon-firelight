# Firelight · part 8, stage 2: the monsters of the first depths seen from the front (coming at the camera, down the screen) and
# from the back (going away, up the screen). One sheet per facing in the layout of the monster's PD 1.9 sheet: the same frame
# numbers, the same animations, so the game only swaps the sheet.
#   - humanoids (gnoll, gnoll shaman, skeleton): PD draws the body square to the viewer and turns only the head, so the front is
#     a front head drawn in the sheet's own palette on the side body; the back is the back of that head on the body without its
#     front lights. Walking lifts the legs in turn; the blow comes a pixel at the camera (front) or away from it (back);
#   - thief, rat, bee, sheep: drawn whole in the sheet's palette (the thief's face, the rat's snout, the bee's eyes and the
#     sheep's face turned to the camera, or their backs), every frame of PD re-posed from that picture;
#   - bandit and albino rat: the thief and rat views in the colours of their own PD row (the palette PD swaps between the rows);
#     the fetid rat uses the rat's sheets, as it does in PD;
#   - spinner and bat: already facing the camera, so the front is the side; the back is the same picture without the eyes;
#   - die frames stay as they are: the body falling is the same picture from every side.
from collections import Counter
from PIL import Image
import c8
from c8 import hx, to_hex, save, blank


def img(name): return Image.open(c8.SRC + name + '.png').convert('RGBA')


def frm(sh, f, w, h):
    cols = sh.width // w; x, y = (f % cols) * w, (f // cols) * h
    return sh.crop((x, y, x + w, y + h))


def put(dst, im, f, w, h):
    cols = dst.width // w; dst.alpha_composite(im, ((f % cols) * w, (f // cols) * h))


def grid(rows, pal, w, h, x0=0, y0=0):
    im = blank(w, h); p = im.load()
    for y, r in enumerate(rows):
        assert len(r) <= w, (r, w)
        for x, ch in enumerate(r):
            if ch != '.':
                c = pal[ch]; p[x0 + x, y0 + y] = hx(c[:7]) + (int(c[7:9], 16) if len(c) > 7 else 255,)   # '#rrggbbaa': PD's see-through wings
    return im


def lay(o, im, dx=0, dy=0):
    """im over o, moved by (dx, dy); see-through pixels keep their own alpha."""
    sx, sy = max(0, -dx), max(0, -dy); src = im.crop((sx, sy, im.width, im.height))
    o.alpha_composite(src, (max(0, dx), max(0, dy))) if src.width and src.height else None
    return o


def moved(im, dx=0, dy=0): return lay(blank(im.width, im.height), im, dx, dy)


def band(im, y0, y1):
    o = blank(im.width, im.height); o.paste(im.crop((0, y0, im.width, y1)), (0, y0)); return o


def recolour(im, m):
    o = im.copy(); p = o.load(); mm = {hx(k): hx(v) for k, v in m.items()}
    for y in range(o.height):
        for x in range(o.width):
            c = p[x, y]
            if c[3] and c[:3] in mm: p[x, y] = mm[c[:3]] + (c[3],)
    return o


def setpx(im, pts, col):
    p = im.load()
    for x, y in pts: p[x, y] = (hx(col) + (255,)) if col else (0, 0, 0, 0)
    return im


def bbox(im):
    b = im.getchannel('A').getbbox(); return b or (0, 0, 0, 0)


def swap_map(sh, a_frames, b_frames, w, h):
    """The palette PD swaps between two rows of a sheet (thief -> bandit, rat -> albino): for each colour of row a, the colour
    found most often at the same pixel of row b (ties by colour, so every run gives the same map)."""
    votes = {}
    for fa, fb in zip(a_frames, b_frames):
        A, B = frm(sh, fa, w, h).load(), frm(sh, fb, w, h).load()
        for y in range(h):
            for x in range(w):
                if A[x, y][3] and B[x, y][3]: votes.setdefault(to_hex(A[x, y]), Counter())[to_hex(B[x, y])] += 1
    return {k: sorted(v.items(), key=lambda kv: (-kv[1], kv[0]))[0][0] for k, v in sorted(votes.items())}


def split_legs(b, y0, h, mid):
    L, R = blank(b.width, h), blank(b.width, h); p = b.load(); lp, rp = L.load(), R.load(); top = b.copy(); tp = top.load()
    for y in range(y0, h):
        for x in range(b.width):
            if p[x, y][3]: (lp if x < mid else rp)[x, y] = p[x, y]; tp[x, y] = (0, 0, 0, 0)
    return top, L, R


def lift(leg, n, y0):
    if n == 0: return leg
    o = blank(leg.width, leg.height); p, q = leg.load(), o.load()
    for y in range(y0, leg.height):
        for x in range(leg.width):
            if p[x, y][3] and y - n >= y0: q[x, y - n] = p[x, y]
    return o


def walk(whole, legs_y, mid, lifts):
    """Steps towards (or away from) the camera: the legs below legs_y lift in turn, the body bobs up while a foot is off the ground."""
    top, L, R = split_legs(whole, legs_y, whole.height, mid); out = []
    for l, r in lifts:
        bob = -1 if (l == 2 or r == 2) else 0
        o = blank(whole.width, whole.height); lay(o, lift(L, l, legs_y), 0, bob); lay(o, lift(R, r, legs_y), 0, bob); lay(o, top, 0, bob)
        out.append(o)
    return out


LIFTS4 = [(2, 0), (1, 0), (0, 2), (0, 1)]
LIFTS6 = [(1, 0), (2, 0), (1, 0), (0, 1), (0, 2), (0, 1)]


# ---------------------------------------------------------------- humanoids: gnoll, gnoll shaman, skeleton
GNOLL = dict(a='#240d01', b='#401603', c='#9b581c', d='#5c2004', e='#804b1a', f='#c79654', g='#612e07', h='#9d6c2a', i='#000000',
             j='#ae9d86', k='#82745c', l='#423521', m='#776146', n='#f7c684', o='#ddceb8')
SHAMAN = dict(a='#170e06', b='#29190a', c='#b78231', d='#9d6c2a', e='#3a230f', f='#665033', g='#aa9671', h='#ab4920', i='#ca4836', j='#d1885b',
              k='#b94030', l='#861009', m='#715832', n='#a0140b', o='#000000', p='#402e14', q='#806c47', r='#ae9d86', s='#d8b670', t='#ad734a',
              u='#753415', v='#82745c', w='#dac6a1', x='#ddceb8')
BONE = dict(a='#cecece', b='#e5e5e5', c='#a3a3a3', d='#b3b3b3', e='#7e7e7e', f='#000000', g='#cccccc')

HUMANOIDS = {
    # the hyena head: ears up, the muzzle at the camera with the black nose; from behind the mane down the nape
    'gnoll': dict(sheet='gnoll', w=12, h=15, head=8, legs=12, pal=GNOLL, count=11,
                  front=['...a....a...', '...ac..ca...', '..dcffffcd..', '..cffffffc..', '..gfihhifg..', '..ghjjjjhg..', '..ghjaajhg..', '...gkjjkg...'],
                  back=['...a....a...', '...ac..ca...', '..dcffffcd..', '..cfcffcfc..', '..gcffffcg..', '..gecffceg..', '..gecccceg..', '...ggeegg...'],
                  back_map={'#f7c684': '#c79654'},
                  frames=dict(pose=[0, 2], nod=[1], lunge=[3], walk=([4, 5, 6, 7], LIFTS4), copy=[8, 9, 10])),
    # the shaman's red mask across the eyes, the pale muzzle under it; from behind the mask's strap over the fur
    'shaman': dict(sheet='shaman', w=12, h=15, head=8, legs=12, pal=SHAMAN, count=11,
                   front=['...a....a...', '...abccba...', '..ecciicce..', '..kiokkoik..', '..lihiihil..', '..pqrssrqp..', '..pqsoosqp..', '...pvrrvp...'],
                   back=['...a....a...', '...abccba...', '..ecccccce..', '..kllllllk..', '..pccddccp..', '..pcdccdcp..', '..pqcddcqp..', '...ppqqpp...'],
                   back_map={'#dac6a1': '#ddceb8'},
                   frames=dict(pose=[0, 2], nod=[1], lunge=[3], walk=([4, 5, 6, 7], LIFTS4), copy=[8, 9, 10])),
    # PD's skull is almost frontal already: here square to the camera (the sockets either side of the middle); from behind the
    # round back of the skull, the spine and the shoulder blades instead of the ribs. Idle 1-3 is PD's skull spinning round.
    'skeleton': dict(sheet='skeleton', w=12, h=15, head=8, legs=12, pal=BONE, count=17,
                     front=['............', '....aaaaaa..', '...abbbbbba.', '...cbddddbc.', '...cbfbbfbc.', '....ebbbbe..', '.....eaae...', '......ee....'],
                     back=['............', '....aaaaaa..', '...abbbbbba.', '...cbbbbbbc.', '...cbbdbbbc.', '....ebddbe..', '.....eeee...', '......ee....'],
                     back_map={},
                     frames=dict(pose=[0, 14, 16], spin=[1, 2, 3], lunge=[15], walk=([4, 5, 6, 7, 8, 9], LIFTS6), copy=[10, 11, 12, 13])),
}


def skeleton_back(b):
    """The ribs from behind: the spine down the middle, a shoulder blade either side."""
    o = b.copy(); p = o.load()
    for x, y, c in ((7, 8, 'e'), (5, 9, 'c'), (6, 9, 'd'), (7, 9, 'e'), (8, 9, 'c'), (7, 10, 'e'), (7, 11, 'e')):
        if p[x, y][3] or y >= 9: p[x, y] = hx(BONE[c]) + (255,)
    return o


def humanoid(kind):
    S = HUMANOIDS[kind]; sh = img(S['sheet']); w, h, HR = S['w'], S['h'], S['head']
    heads = {False: grid(S['front'], S['pal'], w, h), True: grid(S['back'], S['pal'], w, h)}
    head0 = bbox(band(frm(sh, 0, w, h), 0, HR))

    def body(f, back):
        b = band(frm(sh, f, w, h), HR, h)
        if back:
            b = recolour(b, S['back_map'])
            if kind == 'skeleton': b = skeleton_back(b)
        return b

    def head_at(f):                                   # where the side frame carries its head, relative to frame 0
        hb = bbox(band(frm(sh, f, w, h), 0, HR)); return hb[0] - head0[0], hb[1] - head0[1]

    def pose(f, back, extra=0, head=None):
        o = blank(w, h); lay(o, body(f, back), 0, extra); dx, dy = head_at(f)
        lay(o, head if head is not None else heads[back], dx, dy + extra); return o

    F = Image.new('RGBA', sh.size, (0, 0, 0, 0)); B = Image.new('RGBA', sh.size, (0, 0, 0, 0)); fr = S['frames']
    for back, dst in ((False, F), (True, B)):
        for f in fr.get('pose', []): put(dst, pose(f, back), f, w, h)
        for f in fr.get('nod', []): put(dst, lay(lay(blank(w, h), body(0, back)), heads[back], 0, 1), f, w, h)    # breathing: the head nods a pixel
        for f in fr.get('lunge', []): put(dst, pose(f, back, -1 if back else 1), f, w, h)                    # the blow: at the camera, or away
        for i, f in enumerate(fr.get('spin', [])):                                                             # PD's spinning skull, the other way round from behind
            src = fr['spin'][::-1][i] if back else f
            put(dst, lay(lay(blank(w, h), body(0, back)), band(frm(sh, src, w, h), 0, HR)), f, w, h)
        if 'walk' in fr:
            fs, lifts = fr['walk']; base = pose(0, back)
            for f, im in zip(fs, walk(base, S['legs'], w // 2, lifts)): put(dst, im, f, w, h)
        for f in fr.get('copy', []): put(dst, frm(sh, f, w, h), f, w, h)
    return F, B


# ---------------------------------------------------------------- thief and bandit
THIEF = dict(a='#0a5f12', b='#063a0d', c='#339c43', d='#287a3a', e='#75685e', f='#65564b', g='#796656', h='#ffffff', i='#887360',
             j='#a38a78', k='#97806b', l='#b59a86', m='#07270e', n='#2a643c')
THIEF_FRONT = ['...aaaabb...', '..acddddbb..', '.acbeeeefbb.', '.adghgghgbb.', '.bbijjjjibb.', '.bbkllllkbb.', '..mbkllkbm..',
               '..abdmmdba..', '.adddnndddb.', '.addlhhlddb.', '.adddnndddb.', '.adnddddndb.', '.mmmmmmmbbb.']
THIEF_BACK = ['...aaaabb...', '..acddddbb..', '.acdcddddbb.', '.adcddddddb.', '.addddddddb.', '.abddddddbb.', '..abdnndbb..',
              '..adddddddb.', '.addddddddb.', '.adddnddddb.', '.adddnddddb.', '.addndddndb.', '.mmmmmmmbbb.']


def sway(im, dx):
    """The hem of the cloak (the last two rows) a pixel to one side."""
    top, hem = band(im, 0, im.height - 2), band(im, im.height - 2, im.height)
    return lay(top, hem, dx, 0)


def thief_views():
    sh = img('thief'); w, h = 12, 13; F = Image.new('RGBA', sh.size, (0, 0, 0, 0)); B = Image.new('RGBA', sh.size, (0, 0, 0, 0))
    for back, dst in ((False, F), (True, B)):
        base = grid(THIEF_BACK if back else THIEF_FRONT, THIEF, w, h); fr = {}
        fr[0] = base
        fr[1] = base if back else setpx(base.copy(), [(4, 3), (7, 3)], THIEF['g'])       # a blink
        fr[2] = moved(base, 0, 1)                                                          # run: the bob of PD's frame 2
        fr[3], fr[4] = sway(moved(base, 0, 1), -1), sway(base, 1)                          # the cloak swinging
        fr[10] = moved(base, 0, 1 if back else -1)                                         # wind-up: drawing back
        fr[11] = moved(base, 0, -1 if back else 1)                                         # the stab: at the camera, or away
        if not back: setpx(fr[11], [(5, 11), (6, 11)], THIEF['h'])                          # the blade comes out of the hands
        fr[12] = base
        for f in (5, 6, 7, 8, 9): fr[f] = frm(sh, f, w, h)
        for f, im in fr.items(): put(dst, im, f, w, h)
    # the bandit: PD's row 1 is the thief in purple
    m = swap_map(sh, range(0, 13), range(21, 34), w, h)
    for f in range(13):
        put(F, recolour(frm(F, f, w, h), m) if f not in (5, 6, 7, 8, 9) else frm(sh, 21 + f, w, h), 21 + f, w, h)
        put(B, recolour(frm(B, f, w, h), m) if f not in (5, 6, 7, 8, 9) else frm(sh, 21 + f, w, h), 21 + f, w, h)
    return F, B


# ---------------------------------------------------------------- rat, albino rat (and the fetid rat on the rat's sheets)
RAT = dict(a='#523c26', b='#cc7e82', c='#917c62', d='#73634f', e='#ff674c', f='#554839', g='#1c140d', h='#ce4f55', i='#884136',
           j='#342618', k='#f5989d', l='#e58e93', m='#a33e42', r='#ff1717')
# sitting up with the snout at the camera: the ears either side, red eyes, the pink nose, the paws at the chest, the tail curling out
RAT_FRONT = ['....aa....aa....', '...abba..abba...', '....aacddcaa....', '....acddddca....', '....adeddeda....', '....afdccdfa....',
             '.....afhhfa.....', '....acdggdca....', '...acddddddca...', '...aicddddcia...', '...acddddddca...', '....jgg..ggjlkk.']
# from behind: the backs of the ears, the back, the tail coming at the camera between the feet
RAT_BACK = ['....aa....aa....', '...acca..acca...', '....aacddcaa....', '....acddddca....', '....acddddca....', '....afddddfa....',
            '.....afddfa.....', '....acddddca....', '...acddddddca...', '...acdfddfdca...', '...acdfmmfdca...', '....jgglkggj....']
RAT_Y = 3


def rat_views():
    sh = img('rat'); w, h = 16, 15; F = Image.new('RGBA', sh.size, (0, 0, 0, 0)); B = Image.new('RGBA', sh.size, (0, 0, 0, 0))
    for back, dst in ((False, F), (True, B)):
        base = grid(RAT_BACK if back else RAT_FRONT, RAT, w, h, 0, RAT_Y); s = -1 if back else 1; fr = {}
        fr[0] = base
        fr[1] = setpx(setpx(base.copy(), [(7, 14)], RAT['k']), [(8, 14)], RAT['l']) if back else setpx(base.copy(), [(7, 9), (8, 9)], RAT['k'])   # the tail / the nose twitch
        up = moved(base, 0, -s)                                                              # attack: rear up, lunge, bite, back
        fr[2] = up if back else setpx(up, [(3, 9), (12, 9)], RAT['i'])                      # the paws come up beside the snout
        fr[3] = moved(base, 0, s)
        if not back: setpx(fr[3], [(7, 11), (8, 11)], RAT['r'])                              # the open red mouth (row 10, a pixel lower)
        fr[4] = moved(base, 0, s); fr[5] = base
        lf = setpx(base.copy(), [(4, 14), (5, 14), (6, 14)], None)                          # run: a foot up, a hop, the other foot up
        rf = setpx(base.copy(), [(9, 14), (10, 14), (11, 14)], None)
        fr[6], fr[7], fr[8], fr[9], fr[10] = lf, moved(base, 0, -1), moved(base, 0, -2), moved(base, 0, -1), rf
        for f in (11, 12, 13, 14): fr[f] = frm(sh, f, w, h)
        for f, im in fr.items(): put(dst, im, f, w, h)
    m = swap_map(sh, range(0, 15), range(16, 31), w, h)                                     # the albino: PD's row 1
    for dst in (F, B):
        for f in range(15):
            put(dst, frm(sh, 16 + f, w, h) if f >= 11 else recolour(frm(dst, f, w, h), m), 16 + f, w, h)
    return F, B


# ---------------------------------------------------------------- bee
BEE = dict(L='#ededdc4d', M='#dcdcbd4d', N='#cecea163', P='#b9b9797a', u='#4d4743', d='#312c2a', k='#000000', q='#baa58f', G='#d3d3ac',
           Y='#ffef00', y='#ffff78', o='#c19040', t='#704522', e='#8a662b')
# the 70-degree camera looks down on the bee: coming at it, the head and its eyes are nearest (low), the striped abdomen rises
# behind between the wings; going away, the abdomen and its sting are nearest and the head is a grey dome far behind
BEE_FRONT = ['.LM...oYYo...ML.', 'LLMN.oYkkYo.NMLL', 'LMMNPoYYYYoPNMML', '.MNPoYttttYoPNM.', '..NPuGkuukGuPN..', '...PukkuukkuP...', '....duuqquud....']
BEE_BACK = ['.LM...tuut...ML.', 'LLMN.tkkkkt.NMLL', 'LMMNPoYYYYoPNMML', '.MNPoYkkkkYoPNM.', '..NPoYYYYYYoPN..', '...PoykkkkyoP...', '....oYYYYYYo....',
            '.....oekkeo.....', '.......kk.......']
WING = set('LMNP')


def split_wings(rows):
    wing = [''.join(c if c in WING else '.' for c in r) for r in rows]; body = [''.join('.' if c in WING else c for c in r) for r in rows]
    return wing, body


def bee_views():
    sh = img('bee'); w, h = 16, 16; F = Image.new('RGBA', sh.size, (0, 0, 0, 0)); B = Image.new('RGBA', sh.size, (0, 0, 0, 0))
    side0 = bbox(band(frm(sh, 0, w, h), 0, 15))
    for back, dst in ((False, F), (True, B)):
        wing, body = split_wings(BEE_BACK if back else BEE_FRONT); W, Bd = grid(wing, BEE, w, h, 0, 3), grid(body, BEE, w, h, 0, 3)
        flap = {0: 0, 1: -1, 2: 1, 3: -1, 4: 0, 5: 1, 6: 0}
        for f in range(7):                                    # hover 0-2 and the attack 3-6: PD's own heights of the bee over its shadow
            side = frm(sh, f, w, h); dy = bbox(band(side, 0, 15))[1] - side0[1]
            if f in (5, 6): dy += -1 if back else 1           # the sting comes at the target: at the camera, or away from it
            o = band(side, 15, 16); lay(o, W, 0, dy + flap[f]); lay(o, Bd, 0, dy); put(dst, o, f, w, h)
        for f in (7, 8, 9, 10): put(dst, frm(sh, f, w, h), f, w, h)
    return F, B


# ---------------------------------------------------------------- sheep
SHEEP = dict(a='#a39e85', b='#ccc9b8', c='#b3b0a1', d='#7e7966', e='#a37168', f='#e6e6e6', g='#a6a395', h='#000000', i='#4d4b45',
             j='#b3b3b3', k='#cccccc')
LEGS = ['..k..j....j..k..', '..k..k....k..k..']
SHEEP_FRONT = ['...aaaaaaaaaa...', '..abbbbcbbbbba..', '.abbbbbbbcbbbba.', '.abcbbbbbbbbcba.', 'abbbbcddddbbbbba', 'acbbeeffffeebbca',
               'abbbcghffhgcbbba', 'dbbbbgffffgbbbbd', 'dcbcbgffffgbcbcd', 'dcbbcgfiifgcbbcd', 'dcccccggggcccccd', '.dccccccccccccd.',
               '.jddddddddddddj.'] + LEGS
SHEEP_BACK = ['...aaaaaaaaaa...', '..abbbbcbbbbba..', '.abbbbbbbcbbbba.', '.abcbbbbbbbbcba.', 'abbbbcbbbbbcbbba', 'acbbbbbbcbbbbbca',
              'abbbcbbbbbbcbbba', 'dbbbbcbbbbcbbbbd', 'dcbcbbbbbbbbcbcd', 'dcbbcbbbbbbcbbcd', 'dccccccccccccccd', '.dccccccccccccd.',
              '.jddddddddddddj.'] + LEGS


def tail(im, dx=0):
    """The stub of a tail, a white puff in the middle of the rump."""
    o = im.copy()
    for (x, y), c in {(7, 8): 'f', (8, 8): 'f', (6, 9): 'c', (7, 9): 'b', (8, 9): 'b', (9, 9): 'c', (7, 10): 'd', (8, 10): 'd'}.items():
        setpx(o, [(x + dx, y)], SHEEP[c])
    return o


def sheep_views():
    """The sheep's face is PD's own (it is drawn frontal at the right edge of the wool): here in the middle, chewing as in PD's
    idle frames 1-3; from behind, wool and the stub of a tail."""
    sh = img('sheep'); w, h = 16, 15; F = Image.new('RGBA', sh.size, (0, 0, 0, 0)); B = Image.new('RGBA', sh.size, (0, 0, 0, 0))
    f0 = frm(sh, 0, w, h).load(); front, back = grid(SHEEP_FRONT, SHEEP, w, h), grid(SHEEP_BACK, SHEEP, w, h)
    for f in range(4):
        o = front.copy(); p = o.load(); s = frm(sh, f, w, h).load()
        for y in range(4, 12):                                 # what PD changes in the face between its frames, moved to the middle
            for x in range(8, 16):
                if s[x, y] != f0[x, y] and 0 <= x - 4 < w: p[x - 4, y] = s[x, y]
        put(F, o, f, w, h)
        put(B, tail(back, 1 if f == 2 else 0), f, w, h)                                       # the tail wags while it chews
    put(F, frm(sh, 4, w, h), 4, w, h); put(B, frm(sh, 4, w, h), 4, w, h)
    return F, B




# ---------------------------------------------------------------- spinner and bat: the back without the eyes
EYES = {'spinner': ['#000000', '#e1f8d7', '#cfe5d7'], 'bat': ['#ff3333', '#ff0000']}
SHEETS = {'spinner': (16, 16, 10), 'bat': (15, 15, 7)}


def deface(kind):
    """Each eye pixel takes the colour most common among its non-eye neighbours (ties by colour)."""
    sh = img(kind); w, h, n = SHEETS[kind]; eyes = {hx(c) for c in EYES[kind]}; o = Image.new('RGBA', sh.size, (0, 0, 0, 0))
    for f in range(n):
        fr = frm(sh, f, w, h); p = fr.load(); src = fr.copy().load()
        for y in range(h):
            for x in range(w):
                if not (src[x, y][3] and src[x, y][:3] in eyes): continue
                if kind == 'spinner' and f >= 8: continue                                   # the burst of its death: as it is
                nb = Counter(to_hex(src[x + dx, y + dy]) for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                             if 0 <= x + dx < w and 0 <= y + dy < h and src[x + dx, y + dy][3] and src[x + dx, y + dy][:3] not in eyes)
                if nb: p[x, y] = hx(sorted(nb.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]) + (255,)
        put(o, fr, f, w, h)
    return o


def main():
    for kind in HUMANOIDS:
        F, B = humanoid(kind); save(F, f'dirs/{kind}-front.png'); save(B, f'dirs/{kind}-back.png')
    for kind, fn in (('thief', thief_views), ('rat', rat_views), ('bee', bee_views), ('sheep', sheep_views)):
        F, B = fn(); save(F, f'dirs/{kind}-front.png'); save(B, f'dirs/{kind}-back.png')
    for kind in EYES: save(deface(kind), f'dirs/{kind}-back.png')
    print('monsters ok')


if __name__ == '__main__':
    main()

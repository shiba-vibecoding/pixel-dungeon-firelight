# Firelight · part 8, stage 1: the heroes seen from the front (walking towards the camera, down the screen) and from the back
# (away from it, up the screen). One sheet per facing in the layout of the class sheet (21 frames x 7 armour tiers of 12 x 15),
# built from the PD 1.9 sheet itself, pixel for pixel in its palette:
#   - the front head is PD's own: frames 16-17 (operate) and 19 (read) already face the camera, looking down at the hands, which
#     is what a 70-degree camera sees; the body is the side sheet's (PD draws it square to the viewer, legs apart);
#   - the back head is that head with the face, eyes and beard turned to hair; the back keeps the armour's colours without the
#     front's buckles and lights;
#   - run, attack, operate, fly and read are re-posed for the facing (legs lift in turn, the fist comes at the camera or goes off
#     over the shoulder); die (8-12) is the skull of the tomb and stays as it is.
import json
from PIL import Image
import c8
from c8 import FW, FH, COLS, TIERS, CLASSES, hx, to_hex, sheet, cell, blank, save, out

SKIN = {'#dcb497', '#b89778', '#ffdabf', '#855938', '#be7f59', '#ffba8f', '#000000'}
EYE = '#000000'
HAIR = {'warrior': ['#dc7937', '#c4703a', '#be390c', '#ad693c', '#97310d', '#752b0e'],
        'mage': ['#f3f3f4', '#e8e8e9', '#ced1d2', '#a7acae', '#a6abad', '#6d7477'],
        'rogue': ['#d19b3f', '#b88837', '#ab5e10', '#85490c', '#623709'],
        'ranger': ['#fcf683', '#f9ed43', '#e2da5f', '#c8ba23', '#9e791c']}
HEAD_ROWS, BODY_TOP = 8, 8
FRAMES = dict(idle=[0, 1], run=[2, 3, 4, 5, 6, 7], die=[8, 9, 10, 11, 12], attack=[13, 14, 15], operate=[16, 17], fly=[18], read=[19, 20])


def lum(c): r, g, b = hx(c); return 0.3 * r + 0.59 * g + 0.11 * b


def px_of(im): return im.load()


def rows(im, y0, y1):
    o = blank(); o.paste(im.crop((0, y0, FW, y1)), (0, y0)); return o


def front_head(sh, t): return rows(cell(sh, 16, t), 0, HEAD_ROWS)


# The backs of the heads, drawn over the outline of PD's own front head (frame 16, rows 0-7) in the class's hair colours:
# warrior and huntress hair to the nape (her braid down the middle), the mage's white hair, the rogue's hood.
BACK_HEADS = {
    'warrior': (['....a.bba...', '...acbccca..', '...adccccda.', '..efdcdcdda.', '..efddcdddda', '..efdcddcda.', '...edddddae.', '...eeaaaaee.'],
                dict(a='#97310d', b='#be390c', c='#dc7937', d='#c4703a', e='#752b0e', f='#ad693c')),
    'mage':    (['......aa....', '....aabbac..', '...cdbbbbbc.', '...edbabadc.', '...edadaddc.', '..eddadaddc.', '...eddddddc.', '...ecddce...'],
                dict(a='#e8e8e9', b='#f3f3f4', c='#a6abad', d='#ced1d2', e='#6d7477')),
    'rogue':   (['............', '....aaaaa...', '...bcddddb..', '...ecdcdcb..', '...ecccccb..', '..eebcbcbe..', '...ebbbbbe..', '...eeeeeee..'],
                dict(a='#ab5e10', b='#85490c', c='#b88837', d='#d19b3f', e='#623709')),
    'ranger':  (['....aaa.....', '...abbbbb...', '...acccccb..', '...adcbcda..', '...fdbdbda..', '..fadbcbda..', '...fadcdaf..', '...ffacaff..'],
                dict(a='#c8ba23', b='#f9ed43', c='#fcf683', d='#e2da5f', f='#9e791c')),
}


def back_head(cls, head):
    """The class's back of the head; what the armour puts on the head (the archmage's collar, a hood) is kept from the front head.
    When the head is mostly such gear (the huntress's top-tier hood), the back is that hood, its face turned to the hood's cloth."""
    fp = head.load(); hair = set(HAIR[cls]); gear = {}
    for y in range(HEAD_ROWS):
        for x in range(FW):
            if fp[x, y][3]:
                k = to_hex(fp[x, y])
                if k not in SKIN and k not in hair: gear[(x, y)] = fp[x, y]
    solid = sum(1 for y in range(HEAD_ROWS) for x in range(FW) if fp[x, y][3])
    if len(gear) > solid * 0.4:                                         # a hood: the face and fringe become its cloth
        h = head.copy(); p = h.load(); cloth = sorted({to_hex(c) for c in gear.values()}, key=lambda c: (-lum(c), c))
        for y in range(HEAD_ROWS):
            for x in range(FW):
                if p[x, y][3] and (x, y) not in gear:
                    p[x, y] = hx(cloth[0 if y <= 3 else (1 if y <= 5 else min(2, len(cloth) - 1))]) + (255,)
        return h
    rows_, pal = BACK_HEADS[cls]; h = blank(); p = h.load()
    for y, r in enumerate(rows_):
        for x, ch in enumerate(r):
            if ch != '.': p[x, y] = hx(pal[ch]) + (255,)
    for (x, y), c in gear.items(): p[x, y] = c                          # collars and trims of the armour
    return h


def body(sh, f, t): return rows(cell(sh, f, t), BODY_TOP, FH)


def back_body(b):
    """The back of the armour: the chest (columns 4-7 of rows 8-10) takes the torso's own colour, row 10 its shade, so the
    buckles, the shirt's V and the front lights go; the belt keeps its colour but loses the buckle; arms, hands and legs stay."""
    o = b.copy(); p = o.load()
    tor = [to_hex(p[x, y]) for y in range(8, 12) for x in range(3, 9) if p[x, y][3] and to_hex(p[x, y]) not in SKIN]
    if not tor: return o
    common = sorted(set(tor), key=lambda c: (-tor.count(c), c))   # ties by colour: the same file on every run
    base = common[0]; shade = next((c for c in common[1:] if lum(c) < lum(base)), base)
    for y in range(8, 11):
        for x in range(4, 8):
            if p[x, y][3]: p[x, y] = hx(base if y < 10 else shade) + (255,)
    for y in range(8, 11):                                               # lone accents left beside the chest (a clasp, a gem)
        for x in (3, 8):
            if p[x, y][3] and to_hex(p[x, y]) not in SKIN and tor.count(to_hex(p[x, y])) <= 2: p[x, y] = hx(base) + (255,)
    belt = [to_hex(p[x, 11]) for x in range(3, 9) if p[x, 11][3]]
    if belt:
        m = min(set(belt), key=lambda c: (-belt.count(c), c))
        for x in range(4, 8):
            if p[x, 11][3]: p[x, 11] = hx(m) + (255,)
    return o


def compose(*parts):
    o = blank()
    for im, dx, dy in parts: o.alpha_composite(im, (0, 0)) if (dx, dy) == (0, 0) else o.paste(im, (dx, dy), im)
    return o


def lay(o, im, dx=0, dy=0):
    t = blank(); t.paste(im, (dx, dy), im); o.alpha_composite(t); return o


def split_legs(b):
    """Legs (rows 12-14): left of the middle and right of it."""
    L, R = blank(), blank(); p = b.load(); lp, rp = L.load(), R.load()
    for y in range(12, FH):
        for x in range(FW):
            if p[x, y][3]: (lp if x < 6 else rp)[x, y] = p[x, y]
    top = b.copy(); tp = top.load()
    for y in range(12, FH):
        for x in range(FW): tp[x, y] = (0, 0, 0, 0)
    return top, L, R


def lift(leg, n):
    """A leg lifted n pixels: the foot rises, the thigh stays (rows that would overlap the hips are dropped)."""
    if n == 0: return leg
    o = blank(); p, q = leg.load(), o.load()
    for y in range(12, FH):
        for x in range(FW):
            if p[x, y][3] and y - n >= 12: q[x, y - n] = p[x, y]
    return o


def arms(b):
    """The arms of the body: the outer two columns of rows 8-11 on each side (sleeve and hand)."""
    p = b.load(); xs = [x for y in range(8, 12) for x in range(FW) if p[x, y][3]]
    x0, x1 = min(xs), max(xs); A, B = blank(), blank(); ap, bp = A.load(), B.load()
    rest = b.copy(); rp = rest.load()
    for y in range(8, 12):
        for x in range(FW):
            if not p[x, y][3]: continue
            if x <= x0 + 1 and y >= 9: ap[x, y] = p[x, y]; rp[x, y] = (0, 0, 0, 0)
            elif x >= x1 - 1 and y >= 9: bp[x, y] = p[x, y]; rp[x, y] = (0, 0, 0, 0)
    return rest, A, B, (x0, x1)


def skin_of(b):
    p = b.load()
    for y in range(9, 12):
        for x in range(FW):
            if p[x, y][3] and to_hex(p[x, y]) in ('#dcb497', '#ffdabf'): return p[x, y]
    return hx('#dcb497') + (255,)


def run_frames(head, b, back):
    """Six steps towards (or away from) the camera: one leg lifts 1-2 px while the other carries, the body rises mid-stride,
    the arm on the side of the lifted leg swings back (a pixel up)."""
    top, L, R = split_legs(b); rest, A, B, _ = arms(top); fr = []
    for k in range(6):
        l, r = [1, 2, 1, 0, 0, 0][k], [0, 0, 0, 1, 2, 1][k]; bob = -1 if k in (1, 4) else 0
        o = blank()
        lay(o, lift(L, l), 0, bob); lay(o, lift(R, r), 0, bob)
        lay(o, rest, 0, bob); lay(o, A, 0, bob - (1 if r else 0)); lay(o, B, 0, bob - (1 if l else 0))
        lay(o, head, 0, bob); fr.append(o)
    return fr


def fist(sk, dark):
    f = blank(3, 3); p = f.load()
    for x, y in ((0, 0), (1, 0), (0, 1), (1, 1)): p[x, y] = sk
    p[2, 1] = dark; p[0, 2] = dark; p[1, 2] = dark
    return f


def attack_frames(head, b, back, sh, t):
    """13 wind-up, 14 the blow, 15 back. From the front the right fist (screen left) rises by the head and comes at the camera
    in the middle of the chest; from the back it goes up over the shoulder and off forward, out of sight."""
    rest, A, B, (x0, x1) = arms(b); sk = skin_of(b); dark = hx('#855938') + (255,)
    a = A.load(); sleeve = next((a[x, y] for y in range(9, 12) for x in range(FW) if a[x, y][3] and to_hex(a[x, y]) not in SKIN), hx('#6b635b') + (255,))
    fr = []
    # 13: the arm up beside the head
    o = blank(); lay(o, rest); lay(o, B); lay(o, head)
    if back: lay(o, A, 0, -4)
    else: lay(o, A, 0, -3)
    fr.append(o)
    # 14: the blow
    o = blank()
    if back:
        lay(o, rest, 0, -1); lay(o, B, 0, -1); lay(o, head, 0, -1)
        q = o.load(); q[x0 + 1, 8] = sleeve                               # only the shoulder, the arm is in front of him
    else:
        lay(o, rest, 0, 1); lay(o, B, 0, 1); lay(o, head, 0, 1)
        q = o.load(); q[3, 9] = sleeve; q[4, 10] = sleeve
        lay(o, fist(sk, dark), 4, 10)                                     # the fist at the camera, over the belly
    fr.append(o)
    # 15: coming back
    o = blank(); lay(o, rest); lay(o, B); lay(o, head); lay(o, A, 1 if not back else 0, -1); fr.append(o)
    return fr


def operate_back(head, b, k):
    """Working with the hands in front, seen from behind: the forearms hidden, the elbows out, a shrug every other frame."""
    rest, A, B, (x0, x1) = arms(b); o = blank(); lay(o, rest); lay(o, head, 0, 1 if k else 0)
    a, bb = A.load(), B.load()
    def elbow(src, sx):
        c = next((src[x, y] for y in range(9, 12) for x in range(FW) if src[x, y][3] and to_hex(src[x, y]) not in SKIN), None)
        return c
    ca, cb = elbow(a, x0), elbow(bb, x1); q = o.load()
    for y in (9, 10):
        if ca: q[max(0, x0 - (1 if k == 0 and y == 9 else 0)), y] = ca
        if cb: q[min(FW - 1, x1 + (1 if k == 1 and y == 9 else 0)), y] = cb
    return o


def scroll_front(sh, t, base):
    """Reading, from the front: the scroll held open across the chest (its paper from PD's frame 20)."""
    f20 = cell(sh, 20, t).load(); paper = sorted({f20[x, y][:3] for y in range(5, 13) for x in range(FW) if f20[x, y][3]
                                                  and to_hex(f20[x, y]) in ('#f7e6d1', '#e8d8b8', '#d8c8a0', '#c9b88a', '#fbf2e7')} or {hx('#f7e6d1')}, key=lambda c: -sum(c))
    o = base.copy(); q = o.load(); light, mid = paper[0] + (255,), (paper[-1] if len(paper) > 1 else hx('#c9b88a')) + (255,)
    for y in range(9, 12):
        for x in range(3, 9): q[x, y] = light if y < 11 else mid
    for y in range(9, 12): q[2, y] = hx('#dcb497') + (255,) if y == 10 else q[2, y]; q[9, y] = hx('#dcb497') + (255,) if y == 10 else q[9, y]
    for x in range(4, 8): q[x, 10] = mid if x % 2 == 0 else light                 # the lines of writing
    return o


def build(cls):
    sh = sheet(cls); F = Image.new('RGBA', sh.size, (0, 0, 0, 0)); B = Image.new('RGBA', sh.size, (0, 0, 0, 0))
    for t in range(TIERS):
        fh = front_head(sh, t); bh = back_head(cls, fh)
        b0, b1 = body(sh, 0, t), body(sh, 1, t); bb0 = back_body(b0); bb1 = back_body(b1)
        fr, br = {}, {}
        fr[0] = lay(lay(blank(), b0), fh); br[0] = lay(lay(blank(), bb0), bh)
        fr[1] = lay(lay(blank(), b1), fh, 0, 1); br[1] = lay(lay(blank(), bb1), bh, 0, 1)    # breathing: the head nods a pixel
        for k, im in enumerate(run_frames(fh, b0, False)): fr[2 + k] = im
        for k, im in enumerate(run_frames(bh, bb0, True)): br[2 + k] = im
        for f in FRAMES['die']: fr[f] = br[f] = cell(sh, f, t)                        # the tomb: the same skull from every side
        for k, im in enumerate(attack_frames(fh, b0, False, sh, t)): fr[13 + k] = im
        for k, im in enumerate(attack_frames(bh, bb0, True, sh, t)): br[13 + k] = im
        fr[16], fr[17] = cell(sh, 16, t), cell(sh, 17, t)                              # PD's own: operate faces the camera
        br[16], br[17] = operate_back(bh, bb0, 0), operate_back(bh, bb0, 1)
        _, L, R = split_legs(b0)
        top = split_legs(b0)[0]; fr[18] = lay(lay(lay(blank(), lift(L, 1)), lift(R, 1)), lay(lay(blank(), top), fh))
        topb = split_legs(bb0)[0]; br[18] = lay(lay(lay(blank(), lift(L, 1)), lift(R, 1)), lay(lay(blank(), topb), bh))
        fr[19] = cell(sh, 19, t); fr[20] = scroll_front(sh, t, cell(sh, 19, t))
        br[19] = operate_back(bh, bb0, 0); br[20] = operate_back(bh, bb0, 0)
        for f in range(COLS):
            F.alpha_composite(fr[f], (f * FW, t * FH)); B.alpha_composite(br[f], (f * FW, t * FH))
    return F, B


def main():
    for cls in CLASSES:
        F, B = build(cls); save(F, f'dirs/{cls}-front.png'); save(B, f'dirs/{cls}-back.png')
    print('heroes ok')


if __name__ == '__main__':
    main()

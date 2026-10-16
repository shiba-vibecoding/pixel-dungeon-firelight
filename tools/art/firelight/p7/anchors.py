# Firelight · part 7: anchors.json, the points the hero card is put together by in code from the part 5 sheets (no idle
# sheets of its own): where the hat cell sits on the hero frame, the head of every class on the idle frames, the feet of the
# hero, the pet and the aura, the fire's point (logs, flame, sparks), and the layouts of the card in every size.
import json, os
from PIL import Image
import c7
from c7 import FW, FH, TIERS, CLASSES, MART, SRC, out
import hats   # part 5: anchors(sheet, frame, tier) -> top of the head, head span, eye, neck

IDLE = dict(frames=[0, 1], seq=[0, 0, 0, 1, 0, 0, 1, 1], fps=1, note='PD 1.9 HeroSprite: idle = Animation(1 fps, loop) of frames 0 0 0 1 0 0 1 1')
CAT = json.load(open(MART + 'catalog.json'))
BY = {i['sku']: i for i in CAT['items']}


def heads(cls):
    sheet = c7.hero(cls); res = []
    for t in range(TIERS):
        row = {}
        for f in IDLE['frames']:
            a = hats.anchors(sheet, f, t)
            row[str(f)] = dict(top=[a['top'][0], a['top'][1]], head=list(a['head']), eye=list(a['eye']) if a['eye'] else None, neck=[a['neck'][0], a['neck'][1]])
        res.append(row)
    return res


def same_shape(cls):
    """Looks are recolours of the class sheet: the same silhouette, so the same anchors (checked here, frame by frame)."""
    base = c7.hero(cls); bad = []
    for i in CAT['items']:
        if i['kind'] != 'skin' or i['heroClass'] != cls: continue
        im = Image.open(MART + i['sheet'][len('mart/fl/'):]).convert('RGBA')
        for t in range(TIERS):
            for f in IDLE['frames']:
                a, b = c7.frame(base, f, t).getbbox(), c7.frame(im, f, t).getbbox()
                if a != b: bad.append((i['skin'], t, f, a, b))
    return bad


def main():
    classes = {}
    for cls in CLASSES:
        bad = same_shape(cls)
        classes[cls] = dict(sheet=f'{cls}.png', looks=f'mart/fl/looks/{cls}-<look>.png', legendary=f'mart/fl/legendary/{cls}-<look>.png',
                            heads=heads(cls), lookDiffers=[f'{b[0]} tier {b[1]} frame {b[2]}' for b in bad])
    pets = {i['pet']: dict(sheet=i['sheet']['file'], cell=[i['sheet']['w'], i['sheet']['h']], feet=i['sheet']['feet'], idle=i['sheet']['idle'], ms=i['sheet']['ms'],
                           fly=i['fly'], glow=i.get('glow')) for i in CAT['items'] if i['kind'] == 'pet'}
    fires = {i['fire']: dict(flame=i['flame'], logs=i['logs'], logsAt=i['logsAt'], sparks=i['sparks'], light=i['light']) for i in CAT['items'] if i['kind'] == 'fire'}
    beacon = json.load(open(out('fires/beacon.json')))
    fires['beacon'] = beacon
    A = dict(
        version=1,
        note='Art pixels, origin top-left, y down. Every size of the card is the same little scene (the layouts below) drawn at a whole scale with nearest; '
             'the order is: background and the fire\'s light, logs, flame, sparks, shadows, the aura (legendary looks) behind, the hero, the hat over it, the glow mask, the pet.',
        hero=dict(cell=[FW, FH], feet=[6, 15], tiers=TIERS, tierDefault=1, tierNote='row of the sheet = the armour tier at the end of the run (0 cloth .. 6); a board entry without it uses 1',
                  idle=IDLE, facing='right', classes=classes),
        hat=dict(cell=[16, 22], heroAt=[2, 7], rule='the hat sheet has the hero layout (21 frames x 7 tiers of 16 x 22): take the same frame and tier as the hero and draw the cell at hero origin - heroAt; '
                 'nothing to compute per class, the head points above are what the hats were fitted to', glow='hats with glow have <hat>-glow sheets in the same layout: drawn added, pulsing'),
        aura=dict(cell=[24, 28], feet=[12, 26], frames=8, ms=120, rule='legendary looks: aura frame k at hero feet - feet, behind the hero; glow mask over the hero added at catalog glowPulse'),
        pet=dict(pets=pets, place=dict(dx=11, dy=0, note='pet feet = hero feet + (dx, dy); facing the hero: flipped'), flyLift=5,
                 shadow=dict(ground=[6, 1], fly=[4, 1], alpha=[0.45, 0.3])),
        fire=dict(point='the middle of the logs on the ground', logsAt=[-8, -4], flameAt=[-6, -18], flameCell=[13, 17], sparksAt=[[-3, -22, 1], [2, -26, 0], [4, -20, 2], [-1, -30, 3]],
                  light=dict(radius=46, stops=[[0, 'aa'], [0.5, '33'], [1, '00']], note='a radial light of the style\'s colour at the fire point - 4 y, added; in small layouts radius = layout.light'),
                  styles=fires),
        layouts=dict(
            row=dict(scene=[36, 24], scale=2, fire=[8, 21], hero=[19, 23], pet=[30, 23], light=26, frame=dict(slice=4, scale=1), size=[80, 56],
                     note='the board row: 56 px high on a phone; a frame of 14 x 14 (slice 4) at x1 round a 72 x 48 stage'),
            big=dict(scene=[64, 44], scale=dict(phone=3, monitor=3), fire=[18, 39], hero=[36, 41], pet=[50, 41], light=40, frame=dict(slice=4, scale=3),
                     note='profile and the top 3: 192 x 132 stage in a frame at x3'),
            podium=dict(scene=[40, 40], scale=dict(phone=2, monitor=2), fire=[11, 35], hero=[22, 37], pet=[33, 37], light=30, frame=dict(slice=4, scale=2), note='the hall of fame and the season\'s top 3'),
            story=dict(canvas=[1080, 1920], scene=[90, 104], scale=12, at=[0, 0], bg=dict(sheet='camp/camp-outdoor-summer.png', crop=[2, 36, 90, 104], night=0.30),
                       fire=[22, 82], hero=[44, 84], pet=[57, 85], light=60, note='the camp\'s own picture behind (its fire pit at 24, 118 of the camp)'),
            chat=dict(canvas=[1280, 640], scene=[80, 64], scale=8, at=[40, 64], bg=dict(sheet='camp/camp-outdoor-summer.png', crop=[0, 70, 80, 64], night=0.30),
                      fire=[24, 48], hero=[46, 50], pet=[59, 51], light=50),
            notify=dict(canvas=[640, 360], scene=[56, 40], scale=6, at=[0, 120], fire=[16, 36], hero=[32, 38], pet=[46, 38], light=36),
            notifyCamp=dict(canvas=[640, 360], scene=[64, 36], scale=10, at=[0, 0], bg=dict(sheet='camp/camp-outdoor-summer.png', crop=[12, 90, 64, 36], night=0.35),
                            fire=[12, 28], hero=[25, 30], pet=[34, 31], light=34),
        ),
    )
    json.dump(A, open(out('anchors.json'), 'w'), ensure_ascii=False, indent=1)
    print('anchors ok', {c: len(v['lookDiffers']) for c, v in classes.items()})


if __name__ == '__main__':
    main()

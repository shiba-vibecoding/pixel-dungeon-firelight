# Firelight · part 8: dirs.json, how the game picks a facing and which sheet holds it, for heroes, looks, hats and pets (stage 1),
# and the plan of stages 2 and 3 (the monsters and bosses, and the ones that need no new views).
import json
import c8
from c8 import CLASSES, out
import pets

# stage 2: the monsters of the first depths. sheet: PD's sheet (the facing sheets have its layout); off: the variant's first frame on
# it (albino and bandit are PD's second row); anims: PD's (sprites.ts), the same numbers in every facing
MOBS = {
    'rat': dict(sheet='rat', cell=[16, 15], off=0, anims=dict(idle=[0, 0, 0, 1], run=[6, 7, 8, 9, 10], attack=[2, 3, 4, 5, 0], die=[11, 12, 13, 14])),
    'albino': dict(sheet='rat', cell=[16, 15], off=16, anims=dict(idle=[16, 16, 16, 17], run=[22, 23, 24, 25, 26], attack=[18, 19, 20, 21], die=[27, 28, 29, 30])),
    'fetidRat': dict(sheet='rat', cell=[16, 15], off=0, anims='as rat', note='PD draws the fetid rat with the rat\'s sheet: so do its facings (the stench is the game\'s own effect)'),
    'gnoll': dict(sheet='gnoll', cell=[12, 15], off=0, anims=dict(idle=[0, 0, 0, 1, 0, 0, 1, 1], run=[4, 5, 6, 7], attack=[2, 3, 0], die=[8, 9, 10])),
    'shaman': dict(sheet='shaman', cell=[12, 15], off=0, anims=dict(idle=[0, 0, 0, 1, 0, 0, 1, 1], run=[4, 5, 6, 7], attack=[2, 3, 0], zap='as attack', die=[8, 9, 10])),
    'skeleton': dict(sheet='skeleton', cell=[12, 15], off=0, anims=dict(idle=[0] * 13 + [1, 2, 3], run=[4, 5, 6, 7, 8, 9], attack=[14, 15, 16], die=[10, 11, 12, 13])),
    'thief': dict(sheet='thief', cell=[12, 13], off=0, anims=dict(idle=[0, 0, 0, 1, 0, 0, 0, 0, 1], run=[0, 0, 2, 3, 3, 4], attack=[10, 11, 12, 0], die=[5, 6, 7, 8, 9])),
    'bandit': dict(sheet='thief', cell=[12, 13], off=21, anims=dict(idle=[21, 21, 21, 22, 21, 21, 21, 21, 22], run=[21, 21, 23, 24, 24, 25], attack=[31, 32, 33], die=[25, 27, 28, 29, 30])),
    'bee': dict(sheet='bee', cell=[16, 16], off=0, fly=True, anims=dict(idle=[0, 1, 1, 0, 2, 2], run=[0, 1, 1, 0, 2, 2], attack=[3, 4, 5, 6], die=[7, 8, 9, 10])),
    'sheep': dict(sheet='sheep', cell=[16, 15], off=0, anims=dict(idle=[0] * 12 + [1, 2, 3, 0], run=[0], attack=[0], die=[4])),
    'spinner': dict(sheet='spinner', cell=[16, 16], off=0, same=['front'], anims=dict(idle=[0, 0, 0, 0, 0, 1, 0, 1], run=[0, 2, 0, 3], attack=[0, 4, 5, 0], die=[6, 7, 8, 9])),
    'bat': dict(sheet='bat', cell=[15, 15], off=0, fly=True, same=['front'], anims=dict(idle=[0, 1], run=[0, 1], attack=[2, 3, 0, 1], die=[4, 5, 6])),
}
POSE = {
    'gnoll': 'the hyena head turned to the camera (ears up, the muzzle and its black nose at the camera) on PD\'s body; from behind the mane down the nape, the fur without its light chest',
    'shaman': 'the red mask across the eyes, the pale muzzle under it; from behind the mask\'s strap over the fur',
    'skeleton': 'the skull square to the camera, the sockets either side of the middle; from behind the round back of the skull, the spine and the shoulder blades. Idle 1-3 is PD\'s skull spinning round, the other way round from behind',
    'thief': 'the face in the middle of the hood, the hands holding the loot at the chest; from behind the hood and the cloak. The stab: the blade comes out of the hands at the camera',
    'rat': 'sitting up, the snout at the camera, ears either side, the paws at the chest, the tail curling out; from behind the backs of the ears and the tail between the feet. The bite lunges a pixel at the camera (away from it from behind); the run hops',
    'bee': 'the camera looks down on the bee: coming at it, the head and eyes are nearest, the striped abdomen rises behind between the wings; going away, the abdomen and its sting are nearest. The wings stay see-through and flap; PD\'s own height over the shadow',
    'sheep': 'PD\'s face (drawn frontal at the right edge of the wool) in the middle of the fleece, chewing as in PD\'s idle frames; from behind the fleece and a white tail that wags',
    'spinner': 'already faces the camera: the front is the side; the back is the same picture without the eyes',
    'bat': 'already faces the camera: the front is the side; the back is the same picture without the red eyes and mouth',
    'variants': 'the rat and thief views in the colours of PD\'s second row (the palette PD swaps between the rows)',
    'humanoids': 'PD draws the body square to the viewer and turns only the head, so the front is a front head in the sheet\'s own palette on the side body. Walking lifts the legs in turn; the blow comes a pixel at the camera, or away from it from behind',
    'die': 'as in PD: the body falling is the same picture from every side',
}


def mobs():
    def sheets(k, M):
        s = M['sheet']; same = M.get('same', [])
        return dict(side=f'{s}.png', front=f'{s}.png' if 'front' in same else f'dirs/{s}-front.png', back=f'dirs/{s}-back.png')
    kinds = {k: dict(M, sheets=sheets(k, M)) for k, M in MOBS.items()}
    return dict(
        rule='as for the heroes: the step\'s dx != 0 -> side (flipped when dx < 0), dy > 0 -> front, dy < 0 -> back; standing keeps the last facing; a new monster faces side '
             '(as PD draws it) until it moves; an attack turns it to the target; the facing holds at least 120 ms; die frames are the same picture in every facing',
        fallback='a kind without a facing sheet (stage 3, the symmetric ones) is drawn from the side in every facing',
        kinds=kinds, pose=POSE,
        stage2=dict(done=True, list=list(MOBS)),
        stage3=dict(note='next package: the rest, then the bosses', list=['brute', 'shielded', 'monk', 'senior', 'warlock', 'golem', 'succubus', 'scorpio', 'acidic', 'undead', 'statue',
                                                                         'ratKing', 'imp', 'shopkeeper', 'wandmaker', 'blacksmith'], bosses=['tengu', 'dm300', 'king']),
        symmetric=dict(note='drawn facing the camera or round: the same from every side, no new views',
                       list=['eye', 'goo', 'yog', 'swarm', 'elemental', 'piranha', 'larva', 'rottingFist', 'burningFist', 'wraith', 'ghost', 'crab', 'mimic']))

LOOKS = ['moss', 'ember', 'frost', 'dusk', 'brass']
LEGEND = {'warrior': 'forgeborn', 'mage': 'starflame', 'rogue': 'smoulder', 'ranger': 'wildfire'}
HATS = ['straw', 'tricorn', 'wizard', 'crown', 'horns', 'tophat', 'wreath', 'bandana', 'pompom', 'halo', 'eyepatch', 'scarf']
GLOW_HATS = ['crown', 'halo']


def main():
    pet = pets.main()
    D = dict(
        version=2,
        note='The PD 1.9 sprites face the side (right; left is the mirror). Part 8 adds the front (walking towards the camera, down the screen) '
             'and the back (away from it, up the screen). The side stays as it is; diagonals are shown from the side.',
        facings=['side', 'front', 'back'],
        flip=dict(side=True, front=False, back=False),
        rule=dict(
            move='the step from cell (x0, y0) to (x1, y1): dx = x1 - x0, dy = y1 - y0 (y grows down the screen, towards the camera). '
                 'dx != 0: side, flipped when dx < 0 (as now). dx == 0 and dy > 0: front. dx == 0 and dy < 0: back.',
            act='an attack, a zap, a throw: the same rule for the step towards the target',
            stand='standing keeps the last facing; a hero who has not moved yet (a new level, a load) faces front',
            hold='a facing holds at least 120 ms (one step at 20 fps), so a zigzag of one-cell steps does not flicker',
            dead='die (frames 8-12) is the tomb, the same picture in every facing'),
        layout=dict(cell=[c8.FW, c8.FH], cols=c8.COLS, tiers=c8.TIERS, same='every facing sheet has the layout of the class sheet: the same frame numbers, the same armour rows',
                    frames=dict(idle=[0, 1], run=[2, 3, 4, 5, 6, 7], die=[8, 9, 10, 11, 12], attack=[13, 14, 15], operate=[16, 17], fly=[18], read=[19, 20]),
                    anims=dict(idle=dict(fps=1, frames=[0, 0, 0, 1, 0, 0, 1, 1], loop=True), run=dict(fps=20, frames=[2, 3, 4, 5, 6, 7], loop=True),
                               attack=dict(fps=15, frames=[13, 14, 15, 0]), zap='as attack', operate=dict(fps=8, frames=[16, 17, 16, 17]),
                               die=dict(fps=20, frames=[8, 9, 10, 11, 12, 11]), fly=dict(frames=[18]), read=dict(fps=20, frames=[19, 20, 20, 20, 20, 20, 20, 20, 20, 19])),
                    pose=dict(front='head: PD\'s own front head (frames 16-17 look down at the hands: what a 70-degree camera sees); body: the side sheet\'s, which PD draws square to the viewer. '
                                    'run: the legs lift in turn (1-2 px), the arm opposite swings, the body rises mid-stride. attack: 13 the right fist up by the head, 14 it comes at the camera '
                                    'over the belly (the body a pixel forward), 15 back. operate 16-17 and read 19 are PD\'s own; read 20 holds the scroll open across the chest.',
                              back='head: the back of the head drawn over the outline of the front head in the class\'s hair (the rogue\'s hood, the huntress\'s braid). body: the armour without '
                                   'its front (buckles, lights, the shirt\'s V take the torso\'s colour). attack: the arm up over the shoulder (13), forward out of sight with the body a pixel away (14). '
                                   'operate and read: the hands in front, unseen, the elbows out.',
                              weapon='PD 1.9 draws no weapon in the hero\'s hand: the blow is the arm and the fist. The facings keep that.')),
        heroes={c: dict(side=f'{c}.png', front=f'dirs/{c}-front.png', back=f'dirs/{c}-back.png', heroClass='huntress' if c == 'ranger' else c) for c in CLASSES},
        looks=dict(pattern=dict(side='mart/fl/looks/<cls>-<look>.png', front='mart/fl/looks/<cls>-<look>-front.png', back='mart/fl/looks/<cls>-<look>-back.png'),
                   looks=LOOKS, build='part 5\'s own recolour (tools/art/firelight/p5/looks.py) run on the facing sheets',
                   legendary=dict(ids=LEGEND, sheet='mart/fl/legendary/<cls>-<id>-<facing>.png', glow='mart/fl/legendary/<cls>-<id>-glow-<facing>.png',
                                  aura='mart/fl/legendary/<cls>-<id>-aura.png: the same in every facing (sparks around the figure)')),
        hats=dict(pattern=dict(side='mart/fl/hats/<cls>-<hat>.png', front='mart/fl/hats/<cls>-<hat>-front.png', back='mart/fl/hats/<cls>-<hat>-back.png'),
                  glow=dict(hats=GLOW_HATS, pattern='mart/fl/hats/<cls>-<hat>-glow-<facing>.png'), hats=HATS, cell=[16, 22], heroAt=[2, 7],
                  rule='as on the side: the same frame and armour row as the hero, the cell at hero origin - heroAt; fitted by part 5\'s hats.py on each facing\'s frames',
                  back='from behind: no tricorn cockade, no stargazer\'s star; the eyepatch is its strap and knot; the rest is the hat seen from behind'),
        pets=dict(cell=[12, 12], frames=dict(idle=[0, 1, 2, 3], walk=[4, 5, 6, 7]), facings=pet,
                  rule='the pet takes the facing of its own step behind the hero (the same rule); a symmetric pet has one sheet'),
        mobs=mobs(),
    )
    json.dump(D, open(out('dirs/dirs.json'), 'w'), ensure_ascii=False, indent=1)
    print('dirs.json ok')


if __name__ == '__main__':
    main()

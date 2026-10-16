# Firelight · part 8: dirs.json, how the game picks a facing and which sheet holds it, for heroes, looks, hats and pets (stage 1),
# and the plan of stages 2 and 3 (the monsters and bosses, and the ones that need no new views).
import json
import c8
from c8 import CLASSES, out
import pets

LOOKS = ['moss', 'ember', 'frost', 'dusk', 'brass']
LEGEND = {'warrior': 'forgeborn', 'mage': 'starflame', 'rogue': 'smoulder', 'ranger': 'wildfire'}
HATS = ['straw', 'tricorn', 'wizard', 'crown', 'horns', 'tophat', 'wreath', 'bandana', 'pompom', 'halo', 'eyepatch', 'scarf']
GLOW_HATS = ['crown', 'halo']


def main():
    pet = pets.main()
    D = dict(
        version=1,
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
        mobs=dict(
            stage2=dict(note='the frequent monsters of the first depths, next package', list=['rat', 'albino', 'fetidRat', 'gnoll', 'shaman', 'skeleton', 'thief', 'bandit', 'bee', 'sheep']),
            stage3=dict(note='the rest, then the bosses', list=['brute', 'shielded', 'monk', 'senior', 'warlock', 'golem', 'succubus', 'scorpio', 'acidic', 'undead', 'statue', 'ratKing',
                                                                    'imp', 'shopkeeper', 'wandmaker', 'blacksmith'], bosses=['tengu', 'dm300', 'king']),
            symmetric=dict(note='drawn facing the camera or round: the same from every side, no new views',
                           list=['eye', 'goo', 'yog', 'swarm', 'elemental', 'piranha', 'larva', 'rottingFist', 'burningFist', 'wraith', 'ghost', 'crab', 'spinner', 'mimic'],
                           maybe=dict(bat='front as drawn; a back without the red eyes is one recolour (as the pet bat)', spinner='radial: a back without the eyes, if wanted'))),
    )
    json.dump(D, open(out('dirs/dirs.json'), 'w'), ensure_ascii=False, indent=1)
    print('dirs.json ok')


if __name__ == '__main__':
    main()

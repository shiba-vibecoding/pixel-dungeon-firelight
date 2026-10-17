# Firelight · part 10: doors/doors.json, the sizes of the doors' pieces in cells, the pictures on their faces, the states and the rules.
import json
import c10
import doors

KIT = dict(
    version=1,
    note='Part 10: doors you can read from any side. Every door (DOOR, OPEN_DOOR, LOCKED_DOOR, a found SECRET_DOOR, BARRICADE) is a threshold, a frame, '
         'a leaf and its light, and a locked one a padlock and a plaque; the boss floor\'s exit (LOCKED_EXIT) a grate. Sizes in cells (16 px a cell); '
         'pictures are rects [x, y, w, h] in pixels of the region\'s sheet. packages/client/src/r3d/doorkit.ts builds the quads.',
    sheets=dict(color='doors/doors-<region>.png', glow='doors/doors-<region>-glow.png', fx='doors/doors-fx.png', size=[doors.SHEET_W, doors.SHEET_H],
                filter='nearest, no mipmaps; the glow sheet is an emissive map (black where nothing glows)'),
    regions={r: dict(tiles=i, warm=doors.PAL[r]['glow'], cold=doors.COLD, frame=doors.PAL[r]['frame'][2], cap=doors.PAL[r]['cap'], sill=doors.PAL[r]['sill'][2],
                     materials=m) for i, (r, m) in enumerate([
        ('sewers', 'dark oak leaf with a slot window (PD\'s), tarred timber frame, worn stone sill'),
        ('prison', 'PD\'s arched oak leaf, dark iron frame, iron and stone sill'),
        ('caves', 'rough planks with a Z brace, pale pine pit-props, plank sill'),
        ('city', 'blue-grey steel with amber slits (PD\'s), brass frame, slate sill with brass lips'),
        ('halls', 'black iron with green runes (PD\'s), bone frame, obsidian sill')])},
    heights=dict(wall=1.5, cut=0.95, frameTop=dict(full=1.5625, cut=1.0), shoulder=0.6,
                 note='a frame is a pixel proud of its wall (cut walls: 0.95, their frame 1.0); shoulder: the wall cell south of a door in a north-south wall'),
    post=dict(w=0.125, note='two posts lining the doorway, a cell deep, from the floor to frameTop'),
    lintel=dict(h=0.125, d=0.125, note='two beams across the doorway\'s faces, under frameTop'),
    leaf=dict(w=0.75, t=0.125, h=dict(full=1.25, cut=0.75), lift=0.0625, hinge='the inner edge of a post, in the wall line (z 0.5)',
              swing=dict(open_deg=90, frames_deg=[0, 30, 60, 90], open_ms=240, close_ms=200, note='as doorswing.ts: into the room on the camera\'s side if it can')),
    barricade=dict(t=0.25),
    threshold=dict(w=0.75, l=1.25, h=0.03, note='0.125 of lip out into each room'),
    padlock=dict(w=0.25, h=0.3125, d=0.125, x=0.6875, y=0.35, note='on both faces of a locked leaf, at x (centre) and y (share of the leaf\'s height)'),
    plaque=dict(w=0.25, h=0.3125, d=0.0625, rise=0.0625, note='on both lintels of a locked or vault door, a pixel over the frame'),
    spill=dict(l=0.375),
    grate=dict(y=0.0, t=0.04, open_deg=100, hinge='north edge'),
    secret=dict(stages_ms=[0, 160, 320], sink_ms=220, fx=['sparks', 'dust'], note='crack0-2 over the wall (top, and the south face of an east-west wall), sparks at stage 2, the wall sinks into the floor, then the door'),
    key=dict(frame_ms=90, frames=4, note='doors-fx key: to the lock, in, turned, a spark; then the padlock drops and the chain slides off'),
    atlas=doors.LAYOUT,
    fx=doors.FX,
    states={
        'DOOR': dict(look='closed', light='warm if the cell beyond is lit, else none'),
        'OPEN_DOOR': dict(look='closed', open=1, light=None),
        'LOCKED_DOOR': dict(look='locked', light='cold'),
        'vault': dict(look='vault', light='cold', note='a LOCKED_DOOR of a vault room, if the level says which (else the locked look)'),
        'SECRET_DOOR': dict(look=None, note='the wall, exactly as the original; when found: the cracks, sparks, the wall sinks, then DOOR'),
        'BARRICADE': dict(look='barricade', burning='flames (doors-fx) over it, the glow of the boards', burnt='charred, then gone (the cell is floor)'),
        'LOCKED_EXIT': dict(grate=0), 'UNLOCKED_EXIT': dict(grate=1),
    },
    faces={
        'post': 'S/N: post_face (postcut_face), E/W: post_side (postcut_side), T: post_top',
        'lintel': 'S/N: lintel_face, T: lintel_top',
        'threshold': 'T: threshold_plain|locked|vault (12 x 20: across x along the way through), sides: threshold_side',
        'leaf': 'S: leaf_<look> (leafcut_<look>), N: the same mirrored, T: top_<look>, E/W: edge (edgecut)',
        'padlock': 'S/N: padlock, T: padlock_top, E/W: padlock_side', 'plaque': 'S/N: plaque|plaque_vault, T: plaque_top|plaque_vault_top',
        'light': 'strip_<c> under the leaf and transom_<c> over it (added), spill_<c> on the threshold (added)',
        'grate': 'T: grate (holes cut out), sides: grate_side', 'crack': 'T: crackcap<n>, S: crack<n> (24 px = a whole wall)',
    },
)


def main():
    doors.main()
    json.dump(KIT, open(c10.OUT + 'doors/doors.json', 'w'), ensure_ascii=False, indent=1)
    print('doors.json ok')


if __name__ == '__main__':
    main()

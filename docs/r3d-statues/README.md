# Statues, shelves, barricades and the way down

`before-<region>.png` is firelight/main 9f730b70, `after-<region>.png` this branch: one row of the special tiles on a carved floor, at zoom 4:
statue, the special room's statue, bookshelf, barricade, well, alchemy pot, pedestal (with a rat on it), sign, empty well.
(`before-halls.png` is missing: the harness could not get the old build to draw the halls level in time.)

* Statue, statue (special), bookshelf, barricade and the boss's locked exit are no longer blocks with their tile stretched over the faces (a block 1.0 to 1.4 cells high
  shows a tile as a strip a few pixels deep at 70 degrees: a «square» with a smear on it). They are a low stone base (0.1 cell, `PROP_BASE`) and a card of the region's own tile
  cut out of its floor (`propCutout`, tolerance 6: the tile is drawn on the exact floor tile, so the grey pedestal stays), standing on it at the true pixel scale, leaned like a figure,
  with a soft shadow, in the sprite batch. The special statue stands on the special room's floor.
* The well keeps its rim and gets stone faces. The alchemy pot, the pedestal, the empty well and the sign were fine (flat tiles and a card).
* `after-exit-sewers-*.jpg`: the way down on a real depth-1 level with the 0.95 front walls. The stairwell is not touched by the front-wall cut (its walls are its own geometry), and
  the dark ramp down the well is gentler (far end 0.5 of the rim's light, was 0.3) so the tile's steps stay readable.

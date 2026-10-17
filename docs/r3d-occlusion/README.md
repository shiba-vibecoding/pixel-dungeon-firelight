# Front walls and the canvas alpha

`before-*` is firelight/main 1500012c, `after-*` this branch with `FRONT_WALL_H = 0.95` (`levelgeom.ts`), `h075-*` the same with 0.75, for comparison:
`room` (items on the bottom row of a room), `mobs` (two sleeping rats on it), `corridor` (an east-west corridor with a door in the wall).

A wall cell with floor (or a door's gap) to its north and wall to its south is cut down to `FRONT_WALL_H` (the camera sees its back); every wall whose
south side faces floor, a thin wall between two rooms included, keeps its 1.5. The leaf of a door in a cut wall line is cut by the same share.
It is static geometry: no per-frame cost, one quad fewer per cut wall. In the sample levels three walls in four with floor to their north are cut
(sewers: 82 cut, 26 thin, 74 whole; the thin ones, one in five, are left whole).

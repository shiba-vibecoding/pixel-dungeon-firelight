# Front walls

`before-*` is firelight/main 1387e600 (front walls at 0.95, thin walls whole), `after-*` this branch (`FRONT_WALL_H = 0.5`, thin walls cut too):
`room` (items on the bottom row of a room), `mobs` (two sleeping rats on it), `corridor` (an east-west corridor with doors), `thin` (a thin wall between two rooms, seen from
the room north of it, items and a rat on its bottom row), `thinsouth` (the same wall seen from the room south of it). `stairs-*` and `after-water-mirror.jpg` are the way
down, the way up and water by walls after the change.

Every wall cell with floor (or a door's gap) to its north is cut to 0.5, whatever lies to its south; a wall with wall to its north keeps 1.5. A cut wall's cap has a lighter
one-pixel lip along the cut, its face (when floor lies south of it) is whole pixel rows of the tile's top, and torches are no longer put on cut walls
(`pickTorches`: only walls with wall to their north). It is static geometry: no per-frame cost; a cut wall is one quad more (the lip).

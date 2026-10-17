# Doors of part 10 in the game (3D)

Shots from the running game (headless, seed 2, 800 x 600, swiftshader), not from the designer's viewer. Crops are scaled up 2x.
"before" is `firelight/main` at 5e670ef2 (walls already at half a cell), the rest is `fl-doors10`.

- `<region>_ew_closed.png`, `<region>_ns_closed.png`: a natural level of each region (sewers d1, prison d7, caves d12, city d17, halls d22), a shut door in an east-west wall line and in a north-south one (threshold, frame, leaf, the shoulder south of the north-south door, warm light where a lit room lies beyond). `before/` has the sewers and the prison.
- `open_ew.png`, `open_ns.png`: an open door (the east-west leaf lies against the jamb, the north-south one turns to face the camera).
- `swing_ew.png`, `swing_ns.png`: the leaf held at 0, 30, 60 and 90 degrees of its swing.
- `locked_*.png`: a locked door (cold light, padlock on both faces, keyhole plaque on the lintels); `vault_ns_d9.png`: a vault door told from the map (iron plaque); `before/locked_ew_d8.png`, `before/vault_ns_d9.png`.
- `barricade_*.png`, `burning_*.png`, `charred_*.png`, `burnt_*.png`, `barricade_burning_sewers.png`: a barricade (natural one on d4), burning (three flame frames), charred, then gone.
- `secret_ew_prison.png`, `secret_ns_caves.png`: a secret door found: hidden, three crack stages with sparks, the wall sinking, dust settling, the door. `before/secret_ew_prison_d7.png`: the wall it was.
- `exit_grate_sewers.png`, `exit_locked_d5.png`: the boss floor's exit: grate with the skull lock, the key in and turned, the grate lifting, open. `before/exit_locked_d5.png`.

Stages of the plays were shot on a clock stepped by hand (QA only), so each is exactly where it says.

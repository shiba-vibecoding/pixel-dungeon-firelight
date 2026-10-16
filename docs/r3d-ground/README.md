# Figures on the floor

The owner's report: the hero reads like a sticker floating over the tiles. Layered, cheap cues (all in `packages/client/src/r3d/`):

| cue | where |
|---|---|
| a tight, sharp contact shadow (about 0.45 cell wide) on top of the soft blob, smaller and weaker the higher the figure is off the floor (flyers, a knockback's hop, a leap) | `effects3d.ts contactShadow`, `world3d.ts addPuppet` |
| the lowest opaque row of each frame on the floor plane (clear rows under the feet found once from the sheet's alpha and cached; a frame lifted by more than 3 rows is a leap and is left alone), so a walking figure does not bob above the floor | `feet.ts`, `addPuppet` |
| a dark band of ambient occlusion on the feet, the floor's own colour and light bounced onto the lower 30 percent (the colour is the average of the region's floor tile in the level's light, brighter near a fire's baked pool), and the light taken at the feet, not at each part of the sprite | `fogofwar.ts spriteFragment`, `uFloor` |
| water: the lowest row is under the surface, the next three are wet and cool, a ring on each footfall and every 0.9 s while standing; the mirror keeps the figure's reflection | `fogofwar.ts`, `footsteps` |
| grass: the high grass quads stand in front of the feet by depth; short grass gets three small tufts over the feet (the short-grass tile cut out, one draw) | `grass3d.ts Tufts` |
| footfalls: dust on dry floor, a splash on water, sparks on embers (one a step, hero and mobs, the effects module's own particle pool); a squash of one pixel on landing after a knockback or a leap | `footsteps`, `fx.ts` |
| heaps lie flat on the floor, in the batch that is drawn under every figure (a dropped item on the hero's own cell is under the hero), with a small contact shadow | `addItems` |

Screenshots (headless Chromium, 375x812 at dpr 2, zoom 6, high tier, the same seeded level before and after): `before-*.jpg` is firelight/main
e717352b, `after-*.jpg` this branch: the hero on dry floor (`dry`), in water (`water`), in grass (`grass`), a rat (`rat`), a bat (`bat`) and a
dropped item on the hero's own cell (`item`). `after-walk-dust.jpg` is four frames of the hero walking in water: splash and rings at the feet.

Cost (`perf` overlay numbers, the dry scene with a hero, three rats and three heaps; averages of two 3 s runs on a laptop iGPU, GPU time too noisy to
tell from the baseline): CPU high 0.66 to 0.84 ms (+0.2 at most), mid 0.58 to 0.62 ms, low 0.51 to 0.51 ms; draw calls +0 to +1 (the tufts, only while
someone stands in short grass; heaps moved into the batch of the dead, which is drawn only when it has something in it); no per-frame allocation (the
tufts, the feet attribute and the contact shadows write into arrays made once; the only objects made are the particles of a footstep, on the step).
Dust, splash, sparks and rings are off at low and min (they are particles); the shader parts are a few lines in the sprite fragment shader.

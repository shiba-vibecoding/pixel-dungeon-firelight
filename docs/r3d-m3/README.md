# Renderer milestone 3: costs and screenshots

Headless Chromium on the development PC (AMD Radeon 780M, ANGLE/D3D11), phone emulation 375x812 at device pixel ratio 2, high tier forced,
`?perf=1`: the numbers are the average of two 3-second runs of real frames with the hero at one fixed spot per region (fixed seed),
GPU time from `EXT_disjoint_timer_query_webgl2`. They show what each item adds, not a phone's absolute speed (a laptop iGPU; noise is about 0.3 ms).
Every screenshot is the 3D canvas with `?perf=1&reveal=1` (the whole level lit and seen) with the overlay in the corner; `N-name-region.jpg` is item N.

## CPU ms / GPU ms / draw calls per region (high tier, normal sight)

| after item | sewers | prison | caves | city | halls |
|---|---|---|---|---|---|
| 0 baseline (f45fdba2) | 0.67 / 1.51 / 7 | 0.78 / 2.09 / 7 | 0.67 / 0.85 / 6 | 0.55 / 1.31 / 6 | 0.43 / 1.42 / 6 |
| 1 bloom | 0.66 / 1.98 / 13 | 0.64 / 2.46 / 13 | 0.61 / 1.25 / 12 | 0.60 / 1.76 / 12 | 0.56 / 1.73 / 12 |
| 2 mirror | 0.62 / 2.18 / 13 | 0.72 / 2.41 / 16 | 0.55 / 1.31 / 12 | 0.49 / 1.73 / 12 | 0.50 / 1.78 / 12 |
| 3 stairs | 0.68 / 2.84 / 13 | 0.92 / 2.34 / 16 | 0.63 / 1.26 / 12 | 0.57 / 1.76 / 12 | 0.54 / 1.72 / 12 |
| 4 grass | 0.63 / 2.07 / 14 | 0.90 / 2.43 / 17 | 0.68 / 1.26 / 13 | 0.62 / 1.75 / 13 | 0.59 / 1.77 / 13 |
| 5 gold | 0.76 / 2.03 / 14 | 0.97 / 2.49 / 17 | 0.79 / 1.24 / 13 | 0.87 / 1.66 / 13 | 0.78 / 1.74 / 13 |
| 6 haze | 0.94 / 2.05 / 14 | 0.62 / 2.47 / 17 | 0.45 / 1.18 / 13 | 0.43 / 1.75 / 13 | 0.41 / 1.70 / 13 |

Calls rise by 6 with the bloom (five small passes and the output pass) and by 3 more where a mirror is drawn (only when reflecting water
is in view: walls within three cells north of seen water; `perf-2-mirror-ab.json` has the same spot with the mirror off and on: about +0.25 ms CPU,
+0.1 to +0.25 ms GPU, +3 calls, +2000 triangles). The grass batch is +1 call and takes the place of the sprite cards (`perf-4-grass-ab.json`).
Stairs, gold ore and the halls mist add no calls. Low and min draw straight to the canvas with none of the bloom, mirror and haze: 6 to 7 calls as before.

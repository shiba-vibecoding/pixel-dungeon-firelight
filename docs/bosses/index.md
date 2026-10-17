# The five boss fights: screenshots and frame strips

Headless Chromium (swiftshader WebGL), 412x760 at 2x, English (`ru/` has the same fights in Russian), made by `tools/boss-shots`
(`python tools/boss-shots/shots.py all [ru]` against the dev server on port 5191). The clock is frozen and only the frames the script asks for
are drawn, so each strip is the moments it says, whatever the machine's speed. The core's rules are not touched: every picture is the same
fight with a look added (`bossfx.ts` and the files it names), driven by the effects the core already sends and the boss's health.

Strips are cropped round the boss with the interface hidden; screenshots are the whole screen.

| File | What it shows |
|---|---|
| `goo-1-notice`, `goo-2-taunt` | The boss's card and bar come in; its cry, then one of ours (foul register here). |
| `goo-3-jiggle` | A blow: the designer's squash steps, feet fixed. |
| `goo-4-splatter` | A heavy blow: the designer's splash and drops flying in 3D. |
| `goo-5-half`, `goo-6-half-line` | Half health: the bar's rage state, the line. |
| `goo-7-death`, `goo-8-aftermath` | It swells and bursts: the designer's pop, a puddle that stays, drops everywhere. |
| `tengu-3-blink` | Smoke at both ends of the jump, a trail between, and he flickers back in. |
| `tengu-4-shuriken` | The blade's streak, and where a miss falls (a mark on the floor for twenty seconds). |
| `tengu-7-death` | His end. |
| `dm300-3-damage-stages` | Whole, three quarters, a half, a quarter: tint, dents and soot, cracks that glow, the designer's loops. |
| `dm300-6-arena` | The arena: dust from the ceiling, pipes hissing steam along the walls. |
| `dm300-7-repair`, `dm300-7b-repair-ui` | Mending on a spent trap: green light, a ring, steam from the vents, REPAIR +N on the bar, the bar green. |
| `dm300-8-death`, `dm300-9-debris` | Blasts through the body, the designer's burst with six pieces thrown out, a scorch, the wreck that smokes. |
| `king-1-notice`, `king-2-throne-light` | The throne room's light rises when he is first seen. |
| `king-4-summon` | The designer's rising on each cell; the dwarf stands up out of it. |
| `king-7-death` | He turns over on his back in four steps, dust, the crown lying where he fell. |
| `yog-3-entrance` | The slow push in on the old god, the red pulse, the fists coming up through the floor one after the other. |
| `yog-6-glare` | The eye's glint, and the glare with its beam to the hero. |
| `yog-7-death` | The big shockwave, the white-out, the Amulet's words and light, the white lifting. |

The `-half` and `-half-line` screenshots show the line a boss says at half health, `-notice` and `-taunt` the lines at the start, and
the death strips the last words.

`ru/` has the screenshots of the same moments in Russian (the strips are the same pictures and are left out).

# Final QA: every screen at phone sizes

Headless Chromium (swiftshader WebGL), 360x640, 375x812, 412x915, RU and EN, `--pd-tg-top` 56 px (Telegram full screen). Run-time windows were opened in an offline solo run, the shop and camp against the local worker, the boards on `packages/client/dev/compete.html` (made-up server). Each shot is also checked by a script: horizontal page scroll, buttons off-screen, buttons under the Telegram header, text beyond the screen, covered buttons, clipped text, HUD overlap, contrast.

Result after the fixes: **0 screens with a horizontal scroll, an off-screen control, a control under the header, or text off-screen** in 6 size/language combinations (87 screens each). What the script reports besides is deliberate (ellipsised names, the tab strips that scroll sideways, sticky rows, a coach pointer over the HUD, the boss card over the map buttons while it plays).

Screenshots: `after/<size>-<lang>/<area>-<screen>.png` (first screen of each window; scrolling windows were also shot lower down, not kept), `before/` for the screens that were fixed.

## 2D emergency path

| Screen | Shots (size x language) | Status |
|---|---|---|
| `2d-offline-window` | 6 | OK |
| `2d-hud-2d` | 6 | OK |
| `2d-walked-2d` | 6 | OK |
| `2d-mobs-2d` | 6 | OK |
| `2d-bag-2d` | 6 | OK |

## Boards, league, circles, season, hall, profile (dev page over a made-up server)

| Screen | Shots (size x language) | Status |
|---|---|---|
| `compete-boards-day` | 6 | OK |
| `compete-boards-week` | 6 | OK |
| `compete-boards-all` | 6 | OK |
| `compete-boards-season` | 6 | OK |
| `compete-boards-depth` | 6 | OK |
| `compete-boards-speed-mage` | 6 | OK |
| `compete-boards-mine` | 6 | Fixed: depth was cut off on «not on a board» rows |
| `compete-league` | 6 | OK |
| `compete-league-closed` | 6 | OK |
| `compete-league-rank1` | 6 | OK |
| `compete-week-up` | 6 | OK |
| `compete-week-stay` | 6 | OK |
| `compete-week-down` | 6 | OK |
| `compete-circle` | 6 | OK |
| `compete-circle-friends` | 6 | OK |
| `compete-invite` | 6 | OK |
| `compete-hall` | 6 | OK |
| `compete-season` | 6 | OK |
| `compete-profile` | 6 | OK |
| `compete-profile-noplace` | 6 | OK |

## Death and victory windows

| Screen | Shots (size x language) | Status |
|---|---|---|
| `end-death-class-mage` | 6 | Changed: hero card (mage) |

## Camp, settings, news, report, about, guide, challenges, daily rules, mail, photo mode, crash window

| Screen | Shots (size x language) | Status |
|---|---|---|
| `meta-camp` | 6 | Fixed: settings and camera icons were hidden behind the day block at 360x640 / 375x667 (before/camp-360x640-*.png) |
| `meta-settings` | 6 | OK |
| `meta-news` | 6 | Fixed (same window) |
| `meta-news-all` | 6 | OK |
| `meta-report` | 6 | OK |
| `meta-about` | 6 | OK |
| `meta-guide` | 6 | OK |
| `meta-challenges` | 6 | OK |
| `meta-daily-rules` | 6 | Fixed: opened rules pushed Play/Challenges/Guide off the screen; the sheet now scrolls (before/daily-rules-360x640-en.png) |
| `meta-mail` | 6 | OK |
| `meta-photo` | 6 | OK |
| `meta-crash` | 6 | OK |
| `meta-news-release` | 6 | Fixed: Play was at the end of a whole-window scroll with no cross; now pinned (before/news-375x812-ru.png) |

## In a run: HUD, hero panel, menu, backpack and tabs, item panels

| Screen | Shots (size x language) | Status |
|---|---|---|
| `run-offline-window` | 5 | OK |
| `run-hud` | 5 | OK |
| `run-hero-panel` | 5 | OK |
| `run-menu` | 5 | OK |
| `run-backpack` | 5 | OK |
| `run-tab-potions` | 5 | OK |
| `run-tab-scrolls` | 5 | OK |
| `run-tab-gear` | 5 | OK |
| `run-item-0` | 5 | OK |
| `run-item-1` | 5 | OK |
| `run-item-2` | 5 | OK |
| `run-item-3` | 5 | OK |
| `run-item-5` | 5 | OK |
| `run-item-7` | 5 | OK |
| `run-item-9` | 5 | OK |
| `run-item-11` | 5 | OK |
| `run-item-13` | 5 | OK |
| `run-item-15` | 5 | OK |
| `run-item-17` | 5 | OK |

## In a run: examine, quest windows, dungeon shop, amulet, info, sign, badges, help, confirm, boss card

| Screen | Shots (size x language) | Status |
|---|---|---|
| `run2-examine-mob` | 3 | Fixed: the offline strip covered the examine status bar (before/offline-strip-over-examine-375x812-ru.png) |
| `run2-examine-tile` | 3 | OK |
| `run2-quest-ghost` | 3 | OK |
| `run2-quest-ghost-reward` | 3 | OK |
| `run2-quest-wandmaker` | 3 | OK |
| `run2-quest-imp` | 3 | OK |
| `run2-quest-ratking` | 3 | OK |
| `run2-quest-ghost-curse` | 3 | OK |
| `run2-shop-trade` | 3 | OK |
| `run2-shop-sell` | 3 | OK |
| `run2-amulet` | 3 | OK |
| `run2-info-long` | 3 | OK |
| `run2-sign` | 3 | OK |
| `run2-badges` | 3 | OK |
| `run2-help` | 3 | OK |
| `run2-confirm` | 3 | OK |
| `run2-waiting` | 3 | OK |
| `run2-bosscard-last` | 3 | OK |

## Pixel-Mart: home, every category, item, gift, try-on

| Screen | Shots (size x language) | Status |
|---|---|---|
| `shop-home` | 6 | OK |
| `shop-cat1` | 6 | OK |
| `shop-cat2` | 6 | OK |
| `shop-cat3` | 6 | OK |
| `shop-cat4` | 6 | OK |
| `shop-cat5` | 6 | OK |
| `shop-cat6` | 6 | OK |
| `shop-cat7` | 6 | OK |
| `shop-cat8` | 6 | Fixed: title plates and long words ran out of the cards |
| `shop-cat9` | 6 | OK |
| `shop-tryon` | 6 | OK |

## Not covered / needs a real phone

- Telegram's own safe-area numbers (`--pd-tg-top` was set by hand to 56 px; `safeAreaInset` on a real iPhone/Android may differ), the notch and the home indicator.
- Real WebGL speed and thermals; swiftshader only proves the layout.
- Stars payment sheets, the share sheets of Telegram, saving the photo to the gallery.
- The in-run HUD portrait (`pd-avatar`), the friends in the gift list and the frame/plate previews in the shop still use `avatars.png`; they are not a run's hero.
- The backpack's item panel at 360x640: the description scrolls inside a short panel (by design, min-height 188 px).

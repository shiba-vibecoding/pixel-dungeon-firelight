# Pixel Dungeon — TypeScript

A modern rewrite of Watabou's **Pixel Dungeon** (1.9.2a) for Telegram Mini Apps
and the web, built for **co-op multiplayer** from the start.

- `packages/core` — the whole game as pure, deterministic TypeScript: no globals,
  no rendering, no platform APIs. The world state is plain JSON, so the same code
  runs in the browser and on the authoritative co-op server, and games can be
  saved, sent over the network and replayed.
- `packages/client` — the Mini App: the map on a canvas with the original art; windows, HUD, log and
  toolbar in HTML after the «Pixel Dungeon UI» design system (`docs/design/system`).
- `packages/server` — the co-op server: a Cloudflare Worker with one Durable
  Object per party, WebSockets with hibernation, Telegram login.

## What works

The whole dungeon of the original, from the sewers down to the Amulet of
Yendor on depth 26:

- Seeded random stream, bit-compatible with the Java version.
- The sewers (depths 1–4), the prison (6–9), the caves (11–14, darker:
  everyone sees less far), the dwarven city (16–19), the last shop (21: one
  quiet way through passages, laid in the city's tiles, with no monsters ever)
  and the demon halls (22–24, darker the deeper, where torches help): level
  generation with the original rooms, water and grass, hidden doors,
  searching, traps (poison, fire, toxic and paralytic gas, lightning,
  gripping, alarm, summoning), tall grass that is trampled and sheds healing
  dew and seeds, burnable doors and barricades.
- Special rooms: treasury, armory, library and crypt behind locked doors with
  their iron keys, magic wells (of health, awareness and transmutation, which
  turns what is dropped into it into something else), trap rooms, storage rooms behind barricades,
  gardens, laboratories with an alchemy pot (three seeds brew a potion),
  statue rooms where one statue comes alive with an enchanted weapon, flooded
  pools guarded by piranhas, vaults with locked and crystal chests opened by
  golden keys, and the shops on depths 6, 11 and 16 and, once the imp's
  errand is done, his on depth 21 (they also sell an ankh, to come back once
  from death).
- Chasms you can jump into, landing hurt and crippled on the depth below
  (with whatever was thrown in before you); a weak floor drops you into the
  locked pit room beneath it, where an earlier victim's remains hold its key.
- Monsters with the original stats and behaviour: rats, gnoll scouts, sewer
  crabs; skeletons that explode, thieves that steal and run, swarms of flies
  that split, gnoll shamans with lightning, vampire bats, gnoll brutes, cave
  spinners with their venom; fire elementals, dwarf monks that can knock the
  weapon out of your hands, dwarf warlocks whose
  shadow bolts weaken, and golems; succubi that charm and blink, evil eyes whose
  gaze pierces, and scorpios that sting from afar and cripple; and mimics,
  chests that bite. One in thirty rats, thieves, brutes, monks and scorpios is a
  rare, nastier variant: albino rats that make you bleed, crazy bandits that
  blind, shielded brutes, senior monks and acidic scorpios.
- Bosses: Goo on depth 5; Tengu in its locked arena on depth 10; DM-300 on
  depth 15, leaking gas and repairing itself; the King of Dwarves on depth 20,
  raising his undead court; Yog-Dzewa on depth 25 with its fists and larvae.
  Picking up the Amulet of Yendor below wins the run.
- The sad ghost's quest on depths 2–4 (its dried rose, revenge on the fetid
  rat, or freedom from the curse that binds it), the old wandmaker's
  (corpse dust, a rotberry seed or a phantom fish hidden in the water, for a
  choice of two wands) on depths 7–9,
  the troll blacksmith's on depths 12–14 (dark gold mined with his pickaxe, or a
  bat's blood on it, for reforging two items into one), and the ambitious
  imp's on depths 17–19 (tokens from slain monks or golems, for a ring).
- Hunger and food (rations, pasties, mystery meat), regeneration, experience
  and levels, melee and ranged combat.
- Items: gold, which buys from the shop; potions (including toxic gas,
  paralytic gas, liquid flame and frost, which can be thrown, levitation to
  float over traps and chasms, and purification) and scrolls (including
  enchantment, terror, psionic blast, mirror image and remove curse), unknown
  until used, and shared
  knowledge in a party; all melee weapons and armour with upgrades and
  strength requirements, and the eleven weapon enchantments (blazing,
  venomous, grim, stunning, vampiric, chilling, shocking, unstable, eldritch,
  lucky, tempered) and eleven armour glyphs of the original; thrown weapons (darts, curare and
  incendiary darts, javelins, shuriken, tomahawks) and the boomerang; wands of
  magic missile, firebolt, lightning, poison, slowness, teleportation, blink,
  disintegration, avalanche, amok, reach, flock (magic sheep) and regrowth,
  known by their wood until used; rings of mending, detection, shadows,
  power, accuracy, evasion, satiety, haste, elements, thorns, haggler and
  herbalism, two worn at once, known by their gem until worn a while; seeds of
  firebloom, icecap, sorrowmoss, dreamweed, sungrass, earthroot and fadeleaf
  (and the wandmaker's rotberry), which grow where they are thrown; bombs;
  honeypots, whose golden bee fights for a while for whoever broke the pot;
  weightstones to balance a weapon for speed or accuracy; rations, pasties,
  overpriced rations and mystery meat, which fire chargrills and frost turns
  into carpaccio; Lloyd's beacon (Goo's, now and then), which takes its
  bearer back to where it was set, from any depth.
- Four hero classes with their original starting kits and perks, and their
  subclasses: Tengu leaves a Tome of Mastery for each hero, to become a
  gladiator or berserker, battlemage or warlock, freerunner or assassin, sniper
  or warden. The King of Dwarves leaves an armour kit, which turns the armour
  worn into class armour with a special ability for a third of the hero's
  health: the warrior's heroic leap, the mage's molten earth, the rogue's
  smoke bomb, the huntress's spectral blades.
- Solo runs saved on the device; a daily dungeon with a global leaderboard and
  shareable results; the original's rankings (the eleven best runs on the
  device) and badges (59 of them).
- Co-op: invite friends by a Telegram link; everyone plays in the same dungeon.
  Time flows freely while the party explores; in a fight the dungeon waits for
  each hero in turn (with a timeout, and never for someone who left). A fallen
  hero gets back up when a companion goes deeper; items are handed over by
  dropping them. Every level holds food for the whole party.
- The original art, sounds and music; Russian (names from the original's Russian
  localisation) and English.
- Game feel beyond the original: blows spray blood, ichor, bone dust or sparks
  and leave splats on the floor; attackers lunge; heavy blows, kills, explosions
  and bosses shake the camera and stop time for an instant; damage numbers pop;
  the screen flushes red when the hero is hurt; fire, frost, gas, spells,
  healing and level-ups have particles; each region has its ambience (dripping
  pipes, torches with warm light, glinting veins, smoke, rising embers); the
  view is lit around the hero; bosses arrive with a title card; a fallen hero's
  world drains of colour. Weaker phones get lighter effects by themselves (or
  from the menu).
- The interface: the Galmuri pixel font (SIL OFL, with honest Cyrillic); one red
  main action per window; a HUD with health, experience and satiety bars, buff
  icons and companions; a log of the last lines with a history window; a status
  line for aiming, examining and waiting; a backpack with the equipment row and
  wear bars; tabbed help. `packages/client/scripts/build-ui-css.mjs` regenerates
  `src/ui.css` from the design system's tokens and components.

Fire burns scrolls, lying about or in a burning hero's pack.

Worse-than-plain gear is cursed: once worn, it will not come off until a
scroll of remove curse (or of upgrade) lifts the curse. Weapons, armour, rings
and wands are found unidentified, as in the original: their level and curse
are unknown (the slot shows the typical strength with a «?») until the item is
put on (the curse), used long enough (20 blows with a weapon, 10 taken in
armour, 40 zaps of a wand, 200 turns with a ring on), read on with a scroll of
identify, or the hero drinks from a well of awareness (what is worn, and the
curses of the rest).

Clouds of toxic and paralytic gas (from traps, potions, DM-300, rotberries and
armour of stench) spread through open cells, never through walls or closed
doors, thin out a little every turn, and act on whoever breathes them.

The Rat King keeps a hidden treasury of chests (one of them a mimic) beside
Goo's lair. Opening a tomb raises wraiths around the hero; a skeleton with
something cursed among its belongings takes half the health of whoever
disturbs it.

The dew vial, found somewhere in the first three depths, keeps the dew an
unhurt hero shakes from the grass; drunk, it heals the more the fuller it
is, and a full one saves its bearer from death once (a well of health fills
it, too).

Bags from the shops (a seed pouch, a scroll holder, a wand holster) hold
their kind without taking room in the backpack, out of reach of fire and
thieves; keys never take room, as every hero carries a key ring.

An altar room's sacrificial fire draws every monster on its level; whoever
stands in it is marked, and marked creatures slain are offerings. Once it
has had enough, it goes out and leaves a scroll of wipe out, which kills
every monster on a level but its boss (and frees a shop's wares).

Every item, monster, quest and room of the original is now in. Goo, Tengu,
DM-300 and the King drop a skeleton key that opens the locked way down from
their depth, for the whole party; Yog-Dzewa's fall opens it at once.

Upgraded weapons, armour, wands, rings and the boomerang wear with use, as
in the original: worn out, an item is "broken" and works as if it had never
been upgraded (a ring as +1) until a scroll of upgrade (which then only
mends it), a scroll of enchantment, a weightstone or the blacksmith mends
it. Tempering and auto-repair (a coin per tier a blow) keep their item
whole; the backpack shows how worn each upgraded item is.

Where this port differs on purpose: co-op throughout; Lloyd's beacon is not
blocked by companions standing next to its bearer; heroes swap places with
the sad ghost, magic sheep and quest givers rather than being walled in by
them (as later versions do); a tap past a known trap that bars the only way
walks up to it and says so; the last shop's depth does not swallow the potion
of strength or scroll of upgrade the original rolled for it and never
dropped (the depths below make up for them).

## How co-op works

The server owns the world. A client sends an intention (`move`, `attack`, …);
the server applies it and broadcasts it as an ordered event; every client
applies the same event to its own copy. The core is deterministic, so all
copies stay identical; a client that misses an event asks for a snapshot.

Co-op rooms (and the arena alone, unless turned off in the settings) play
**live turns**, the tactical way. A player's action is an order (`plan`): walk
to a cell (the way found afresh at every step), walk up to a monster and strike
once, rest until healed, stride while a key is held, or any action once. While
a depth is calm, orders are carried out a step a beat (150 ms) and nobody waits
for anyone; with nothing to do, time stands still. Once a hero there is in
danger (or the arena's wave is on), it is the original's turns: time goes on
only when every hero in danger has said what to do — the monsters wait while a
backpack is open — and the moves play out together in one beat, not one after
another. A walking hero counts as having said. The room waits 15 s for someone
who says nothing while a companion plays, and not at all for someone away.
Heroes never fight by themselves. Solo games keep the original's classic turns.

## Development

```bash
npm install
npm test            # vitest
npm run typecheck
npm run server      # co-op server on ws://127.0.0.1:8787
npm run dev         # client on http://127.0.0.1:5173
```

Deployment (GitHub Pages + Cloudflare + Telegram): see [DEPLOY.md](DEPLOY.md).

## Credits and license

Pixel Dungeon by Watabou (Oleg Dolya), GPL-3.0. This rewrite follows the
original's rules and reuses its art; it is distributed under
GPL-3.0-or-later (see LICENSE).

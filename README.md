# Pixel Dungeon — TypeScript

A modern rewrite of Watabou's **Pixel Dungeon** (1.9.2a) for Telegram Mini Apps
and the web, built for **co-op multiplayer** from the start.

- `packages/core` — the whole game as pure, deterministic TypeScript: no globals,
  no rendering, no platform APIs. The world state is plain JSON, so the same code
  runs in the browser and on the authoritative co-op server, and games can be
  saved, sent over the network and replayed.
- `packages/client` — the Mini App: canvas renderer and HUD using the original art.
- `packages/server` — the co-op server: a Cloudflare Worker with one Durable
  Object per party, WebSockets with hibernation, Telegram login.

## What works

The whole dungeon of the original, from the sewers down to the Amulet of
Yendor on depth 26:

- Seeded random stream, bit-compatible with the Java version.
- The sewers (depths 1–4), the prison (6–9), the caves (11–14, darker:
  everyone sees less far), the dwarven city (16–19) and the demon halls (21–24,
  darker the deeper, where torches help): level generation with the
  original rooms, water and grass, hidden doors, searching, traps (poison,
  fire, toxic and paralytic gas, lightning, gripping, alarm, summoning), tall
  grass that is trampled and sheds healing dew and seeds, burnable doors and
  barricades.
- Special rooms: treasury, armory, library and crypt behind locked doors with
  their iron keys, magic wells, trap rooms, storage rooms behind barricades,
  gardens, laboratories with an alchemy pot (three seeds brew a potion),
  and the shops on depths 6, 11, 16 and 21.
- Chasms you can jump into, landing hurt and crippled on the depth below
  (with whatever was thrown in before you); a weak floor drops you into the
  locked pit room beneath it, where an earlier victim's remains hold its key.
- Monsters with the original stats and behaviour: rats, gnoll scouts, sewer
  crabs; skeletons that explode, thieves that steal and run, swarms of flies
  that split, gnoll shamans with lightning, vampire bats, gnoll brutes, cave
  spinners with their venom; fire elementals, dwarf monks, dwarf warlocks whose
  shadow bolts weaken, and golems; succubi that charm and blink, evil eyes whose
  gaze pierces, and scorpios that sting from afar and cripple; and mimics,
  chests that bite.
- Bosses: Goo on depth 5; Tengu in its locked arena on depth 10; DM-300 on
  depth 15, leaking gas and repairing itself; the King of Dwarves on depth 20,
  raising his undead court; Yog-Dzewa on depth 25 with its fists and larvae.
  Picking up the Amulet of Yendor below wins the run.
- The sad ghost's quest (the dried rose) on depths 2–4, and the old
  wandmaker's (corpse dust, for a choice of two wands) on depths 7–9.
- Hunger and food (rations, pasties, mystery meat), regeneration, experience
  and levels, melee and ranged combat.
- Items: gold, which buys from the shop; potions (including toxic gas,
  paralytic gas and liquid flame, which can be thrown) and scrolls, unknown
  until used, and shared knowledge in a party; all melee weapons and armour
  with upgrades and strength requirements; darts and the boomerang; wands of
  magic missile, firebolt, lightning, poison, slowness, teleportation, blink,
  disintegration and avalanche, known by their wood until used; rings of
  mending, detection, shadows, power, accuracy, evasion, satiety, haste,
  elements, thorns and haggler, two worn at once, known by their gem until worn
  a while; seeds of firebloom, icecap, sorrowmoss, dreamweed, sungrass,
  earthroot and fadeleaf, which grow where they are thrown.
- Four hero classes with their original starting kits and perks, and their
  subclasses: Tengu leaves a Tome of Mastery for each hero, to become a
  gladiator or berserker, battlemage or warlock, freerunner or assassin, sniper
  or warden.
- Solo runs saved on the device; a daily dungeon with a global leaderboard and
  shareable results.
- Co-op: invite friends by a Telegram link; everyone plays in the same dungeon.
  Time flows freely while the party explores; in a fight the dungeon waits for
  each hero in turn (with a timeout, and never for someone who left). A fallen
  hero gets back up when a companion goes deeper; items are handed over by
  dropping them. Every level holds food for the whole party.
- The original art, sounds and music; Russian (names from the original's Russian
  localisation) and English.

Not ported yet: weapon enchantments and
armour glyphs; the ankh; the wands of amok, reach, flock and regrowth; the
rotberry and the ring of herbalism; the blacksmith's and the imp's quests and
the wandmaker's rotberry errand; the remaining special rooms (pool, statue,
vault); dwarf monks disarming; the
rare monster variants (albino rats, bandits, fetid rats); and gas clouds (gas
acts at once on everyone within reach instead).

## How co-op works

The server owns the world. A client sends an intention (`move`, `attack`, …);
the server applies it and broadcasts it as an ordered event; every client
applies the same event to its own copy. The core is deterministic, so all
copies stay identical; a client that misses an event asks for a snapshot.

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

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

- Seeded random stream, bit-compatible with the Java version.
- The sewers, depths 1–4: level generation, hidden doors, searching, traps
  (poison, fire, toxic and paralytic gas, lightning, gripping, alarm,
  summoning).
- Rats, gnoll scouts and sewer crabs with the original stats and behaviour;
  melee and ranged combat, experience and levels, regeneration, respawns.
- Depth 5: Goo's lair and the boss fight; leaving the lair wins the run.
- Items: gold; potions and scrolls, unknown until used and shared knowledge in a
  party; all melee weapons and armour with upgrades and strength requirements;
  darts, the boomerang and the wand of magic missile.
- Four hero classes with their original starting kits.
- Solo runs saved on the device; a daily dungeon with a global leaderboard and
  shareable results.
- Co-op: invite friends by a Telegram link; everyone plays in the same dungeon.
  Time flows freely while the party explores; in a fight the dungeon waits for
  each hero in turn (with a timeout, and never for someone who left). A fallen
  hero gets back up when a companion goes deeper; items are handed over by
  dropping them.
- The original art, sounds and music; Russian (names from the original's Russian
  localisation) and English.

Not ported yet: depths 6+ (prison and beyond), hunger and food, rings, most
wands, seeds and plants, special rooms, NPC quests, and gas clouds (gas traps
act at once instead).

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

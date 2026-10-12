# Pixel Dungeon — TypeScript

A modern rewrite of Watabou's **Pixel Dungeon** (1.9.2a) for Telegram Mini Apps
and the web, built for **co-op multiplayer** from the start.

- `packages/core` — the whole game as pure, deterministic TypeScript: no globals,
  no rendering, no platform APIs. The world state is plain JSON, so the same code
  runs in the browser and on the authoritative co-op server, and games can be
  saved, sent over the network and replayed.
- `packages/client` — the Mini App: canvas renderer using the original art.

## Status

- Seeded random stream, bit-compatible with the Java version (verified against
  reference data exported by the Java build).
- Sewer level generation (depths 1–4), checked by invariants on 1200 levels.
- Shared world with several heroes; every change goes through validated actions.
- Client: walk the sewers with tap-to-move and keyboard, descend the stairs.

## Development

```bash
npm install
npm test            # vitest
npm run typecheck
npm run dev         # http://127.0.0.1:5173/?hero=mage&seed=123
```

## Credits and license

Pixel Dungeon by Watabou (Oleg Dolya), GPL-3.0. This rewrite follows the
original's rules and reuses its art; it is distributed under
GPL-3.0-or-later (see LICENSE).

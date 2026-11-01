# Sea Battle

Turn-based 1v1 naval combat for web and mobile, with ship abilities and peer-to-peer multiplayer.

## Status
- [x] M1: rules engine (`src/engine`): fleet placement, shots, abilities, cooldowns, win condition, commit/reveal fair-play check
- [x] M2: 3D board (Three.js): ship placement, aiming previews for every ability, hit/miss effects, touch controls.
- [x] M3: AI opponent (`src/bot/`): heat map over every placement the remaining ships could still have, sharpened by hits, radar and scouting. Uses abilities when ready. Sinks a fleet in ~21 turns on average (random shooting: ~96)
- [x] UI pass: naval command theme, title / how-to / battle report screens, ability cards with cooldown sweep, fleet status, A–J/1–10 labels, radar outlines, last-shot marker, shell and torpedo flights, fires, sinking wrecks, camera shake
- [x] Asset pass: five toon-shaded warships modelled in code (`src/render/models/`, outlined, naval palette in `palettes.ts`), ships bob/list/scorch with damage, GPU toon water, soft instanced particles (fire, smoke, spray), muzzle flashes, fireball + shockwave hits, water-column misses, dusk sky, sun glare, fog wisps, gulls; sea life (`oceanLife.ts`): channel buoys, drifting debris, leaping dolphins and fish, a distant whale, lighthouse and palm islands
- [ ] M4–M6: WebRTC multiplayer, rematch/chat, random matchmaking
- [ ] M7: sound and polish

## Ships and abilities
Using an ability replaces your shot for that turn. Lose the ship, lose the ability. Balance lives in `src/engine/config.ts`.

| Ship | Length | Ability | Cooldown |
|---|---|---|---|
| Carrier | 5 | Airstrike: 3 cells in a line | 4 |
| Battleship | 4 | Salvo: 2 shots | 3 |
| Cruiser | 3 | Radar: count ship cells in a 3×3 area | 3 |
| Submarine | 3 | Torpedo: runs along a row, hits the first ship | 4 |
| Destroyer | 2 | Scout: reveals one enemy ship cell | 5 |

## Code layout
- `src/engine/`: pure game rules, no rendering or networking (see below)
- `src/game/`: match flow (`Match` + the `Opponent` interface a bot or remote peer implements), aiming, status text
- `src/bot/`: computer opponents
- `src/render/`: Three.js scene. `SeaScene` is the one entry point: boards, water, ambient, effects, camera, turn animations. `models/` builds the warships from primitives
- `src/ui/`: HTML overlay: screens, HUD, ability names/icons
- `src/main.ts`: screen flow, input, and wiring between match, scene and HUD

## Engine layout
- `config.ts`: board size, ships, ability balance
- `grid.ts`: cells and cell shapes (line, area, row)
- `fleet.ts`: ships, placement validation, random fleet
- `actions.ts`: `Action` (what the attacker does) and `Outcome` (what the defender reports)
- `resolve.ts`: defender side, works out an action's outcome against their hidden fleet
- `game.ts`: public game state both peers keep in sync: turns, cooldowns, sunk ships, winner
- `commit.ts`: fleet hash before play, reveal and replay check after

## Develop
```bash
npm install
npm run dev      # http://localhost:5173
npm test
npm run typecheck
```

## Controls
- Placement: tap a ship to pick it up, tap water to drop it, Rotate to turn it.
- Battle: pick Shot or an ability, then tap the enemy board. With a mouse, hover to aim and click to fire; on touch, tap to aim and tap the same cell again to fire. Rotate (or R) turns the airstrike. The torpedo launches from the side of the board nearer the tapped cell.

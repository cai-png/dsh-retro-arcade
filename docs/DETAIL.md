# Retro arcade — details

A small arcade cabinet inside DeepSeek Harness. A **街机厅 (arcade)** button appears at the bottom right; it opens a full-screen cabinet with CRT scanlines and four FC classics sharing one 640×400 canvas.

## The four games

- **Super Mario** — side-scrolling platformer. Stomp goombas, bump bricks for coins, grab a mushroom to grow (a hit only shrinks you once grown), lose a life to pits or a side hit, clear the level at the flagpole. Three lives.
- **Contra** — side-scrolling run-and-gun. Eight-direction fire (hold a direction to aim), patrolling soldiers and fixed turrets, one hit kills and respawns you briefly invulnerable, a health-bar boss at the end of the stage.
- **Bomberman** — grid bomb play. Bombs fuse for two seconds and throw a cross-shaped blast; neighbouring bombs chain. Soft blocks drop bomb-count and blast-range upgrades; clearing every enemy opens the exit.
- **Lode Runner** — the classic ladder chase. Collect every gold bar to reveal the exit; dig holes under the guards (the brick returns after six seconds, a caught guard is stuck for four), and two guards actively hunt you.

## Controls

| Key | Action |
|---|---|
| Arrow keys / WASD | Move (also aims in Contra) |
| Z / Space | Jump, confirm, restart |
| X / K | Shoot, drop a bomb, dig |
| Enter | Restart the current game |
| Esc | Close the arcade |

The header also offers sound, restart and close buttons. The sound preference is stored in the browser.

## How it is built

- The Host half registers a single `/dsh-arcade` static route serving `public/`.
- The Client half adds the launcher button and opens the page in a full-screen iframe; the page closes itself with `postMessage('dsh-arcade:close')`.
- The cabinet page is plain HTML + Canvas 2D: no third-party library, no external image or audio assets. Pixel art is drawn in code and sound effects are synthesised with WebAudio.
- Each game is an independent module behind one `create(host)` contract (`reset` / `update` / `draw`). The shell owns input, the fixed-step loop, the HUD and error recovery.

## Limitations

- These are homage re-creations with redesigned stages and numbers, **not** original ROMs or disassembly ports.
- Keyboard only; no touch or gamepad support.
- The canvas is a fixed 640×400 logical surface scaled to fit; audio unlocks after the first user gesture, per browser autoplay rules.

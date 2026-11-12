# INTRUDER rewrite: notes

Read this at the start of every session. One item each: what, and why it mattered. Keep it short and current.

## Where things are
- Branch: `claude/intruder-rebuild-212vns` (the session's branch; mirrors to `rewrite` when pushes there are allowed). `main` is the old game and is left alone.
- Live: old game at the `gh-pages` root (do not touch until the owner says). Rewrite goes to `gh-pages:/next/` only. Publish with `npm run publish:next`.
- Old code and assets are reference only: `git show main:src/...`, models in `assets-src/models/*.glb`, Blender scripts in `art/`.

## Architecture (src/)
- `core/engine.js`: renderer, graphics modes, `makeMat`, the game clock, the shared context `G`. `core/input.js`: one action layer for keys, mouse and touch. `core/audio.js`: all sound synthesised. `core/save.js`: localStorage.
- `world/`: `collision.js` (boxes + optional terrain function), `levelgen.js` (pure data from a seed), `levelbuild.js` (meshes + colliders), `batch.js`, `textures.js`.
- `game/`: `game.js` (owns player and systems, runs chapters), `player.js`, `body.js` (first-person body), `weapon.js`, `projectiles.js`, `enemies.js` + `enemymodels.js`, `absorb.js`, `fx.js`, `gel.js` (the alien flesh shader).
- `scenes/`: one module per chapter, registered in `scenes/index.js` in story order. `ui/`: `hud.js`, `menu.js`, `admin.js`. `debug/debug.js`: test hooks (`?debug`).
- A chapter is `create(game, opts) -> { id, scene, world, spawn:{x,y,z,yaw}, combat, start(), update(dt), dispose(), useLabel? }`. `combat:false` hides health, crosshair and the weapon. End a chapter with `game.nextChapter()`.

## Decisions
- Story answers from the owner (2026-11-11): Act 1 is fully 3D, small but rich. The family character's fate in the invasion is left unknown (separated, never shown). Intro runs 5-6 minutes and is skippable on replay.
- Ship AI is called VIGIL. The deck is "Deck 7, Security and Robotics".
- Everything is procedural geometry and canvas textures (no downloads): small build, one art style, fast on phones. Old GLBs may be reused where they fit, loaded from `public/models/`.
- Retro mode renders about 360 lines and scales up with hard pixels; that fill-rate saving is the main phone optimisation. Realistic is native resolution with Standard materials.
- Machines shut down at 20% health and are then immune to damage, so a held fire button cannot destroy something you meant to absorb.

## Gotchas
- Never set `scene.background`. The first-person body is drawn in a second pass over a cleared depth buffer, and a background makes that pass wipe the world. Set `scene.userData.bg` (a colour) instead; a sky is a mesh.
- A chapter that spawns machines while building must call `game.useScene(scene)` first (combat systems put meshes in the chapter's scene).
- Use `makeMat()` for lit surfaces so they follow the graphics mode. A mesh without a `color` attribute goes black if its material has `vertexColors` on (this bit the doors).
- First-person meshes must be on `VIEW_LAYER` or they are drawn in the world pass and clip into walls.
- Lights are not scaled by pi any more in this three.js version: a hemisphere light needs about 2 to look "fully lit".
- Tests: the test machine draws 2-3 frames a second. Never wait on real time; use `__dbg.hold(true)` then `__dbg.step(seconds)`, which runs fixed game-time steps without drawing. HUD timers divide by `G.timeScale`.
- Playwright lives in `/opt/node-tools`; `tests/lib.mjs` loads it from there. Run `npx vite --port 5199` first.
- GitHub Actions cannot run on this account: build locally and push `dist/` into `gh-pages:/next/` by hand (script does it without touching the root).

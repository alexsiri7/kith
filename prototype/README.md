# Kith prototype (v2.2)

The single-file prototype built in chat, kept as the reference implementation while the real architecture is built.

- `sim.js`: simulation core (weather, needs, habits, words, Tock, fauna, social, catch-up). Runs in Node or the browser.
- `ui.js`: canvas renderer, input, panels, Claude prompts (via the artifact runtime's `sample` capability).
- `shell.html`: page shell. `style.css`: its styles. `node build.js` inlines everything into `dist/kith.html`.
- `welcome.html`: the sign-in card the server shows signed-out visitors instead of the game, in the same styles; built to `dist/welcome.html`.
- `tests/`: headless balance scripts (`node tests/test8.js`). They print numbers rather than assert; the new repo should turn the key ones into real assertions.

Known debts are described in the architecture requirement: hard-coded per-object logic, string references (`item:`, `obj:`, `kin:`), a swapped "current creature" global for several Kith, non-deterministic randomness and clock, UI mutating sim state, and localStorage persistence.

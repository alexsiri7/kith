# @kith/legacy-sim

`prototype/sim.js` ported to TypeScript with its behaviour unchanged. It is the reference oracle for the new engine: do not refactor its logic, fix its bugs or tune its balance here.

- `src/sim.ts`: the port, in the prototype's order and with its names, so the two can be read side by side.
- `src/constants.ts`: the prototype's constants. `src/types.ts`: the shapes of its world, Kith, items, robot, fauna and events, as loose as the prototype is.
- `src/rng.ts`: the seeded random stream that replaces `Math.random`.

`tests/legacy-sim-parity.test.ts` (at the repository root) runs `prototype/sim.js` and this port side by side on the same random stream and requires them to build identical worlds: one, two and four Kith left alone, a whole lifetime with eggs and hatchlings, and live sessions with the player playing with a Kith and tending the garden. `src/scenarios.test.ts` turns the prototype's balance script `prototype/tests/test8.js` into assertions.

## Where it differs from the prototype

None of these changes a rule of the garden; the parity test pins everything else.

- **Randomness.** Each world carries its own random stream in `w.rng` (mulberry32, one int32, so worlds stay plain JSON), started from the world seed by `rngSeed(seed)`. Everything that took `Math.random()` draws from it, in the same order the prototype drew. Functions that have no world take the stream as an argument: `newGenome(rand)`, `crossGenome(a, b, rand)`, `babble(c, rand)` and `gateSpeech(c, text, rand)`; `rngOf(w)` makes one from a world.
- **Ids.** The prototype made ids from `Date.now()` and a module-wide counter. Here each world counts its own in `w.nextId` (`nid(w)`, base 36), so `newCreature` takes the world first: `newCreature(w, name, now, genome, x)`. Ids compare as the prototype's did once its clock prefix is set aside, and that comparison decides which of a pair of Kith lays the egg.
- **Time zone.** `localParts` read the host's time zone; it now treats time as UTC. That moves `allowanceDay` and `presenceDay`, and the weather only when `scale` is 1 (worlds run at `SCALE`, 6).
- **Wants.** `setWants` ignores a want named after an inherited object property such as `constructor`, which the prototype let through.
- Unused parameters are gone (`sitterOn()`, `newFauna()`), as is `robotCare`, which did nothing.

## Balance scenarios

`prototype/tests/test8.js` printed these per-world numbers over three runs (20 worlds each, started at different times); `src/scenarios.test.ts` asserts that the port, with seeds 600–619, lands in ranges around them:

| Scenario                  | Deaths | Tock spent | Chased  | Honey   | Stung   | Tock bought |
| ------------------------- | ------ | ---------- | ------- | ------- | ------- | ----------- |
| 1 Kith, 24h, 0 coins      | 0/20   | 3–4        | 27      | 2.6–3.5 | 1.5–1.8 | 0.3–0.4     |
| 1 Kith, 3 days, 0 coins   | 0/20   | 13–16      | 84–87   | 3.1–3.5 | 1.7–1.8 | 1.3–1.6     |
| 2 Kith, 3 days, 100 coins | 0/40   | 89–97      | 124     | 3–4     | 1.4–1.6 | 7.3–8.1     |
| 4 Kith, 3 days, 100 coins | 2–4/80 | 1241–1438  | 100–106 | 5.1–7.7 | 2.3–3.4 | 50–59       |

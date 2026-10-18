# @kith/legacy-sim

`prototype/sim.js` ported to TypeScript with its behaviour unchanged. It is the reference oracle for the new engine: do not refactor its logic, fix its bugs or tune its balance here.

- `src/sim.ts`: the port, in the prototype's order and with its names, so the two can be read side by side.
- `src/constants.ts`: the prototype's constants. `src/types.ts`: the shapes of its world, Kith, items, robot, fauna and events, as loose as the prototype is.
- `src/rng.ts`: the seeded random stream that replaces `Math.random`.

`tests/legacy-sim-parity.test.ts` (at the repository root) runs `prototype/sim.js` and this port side by side on the same random stream and requires them to build identical worlds: one, two and four Kith left alone, a whole lifetime with eggs and hatchlings, and live sessions with the player playing with a Kith and tending the garden. `src/scenarios.test.ts` checks the garden's balance (see below).

## Where it differs from the prototype

None of these changes a rule of the garden; the parity test pins everything else.

- **Randomness.** Each world carries its own random stream in `w.rng` (mulberry32, one int32, so worlds stay plain JSON), started from the world seed by `rngSeed(seed)`. Everything that took `Math.random()` draws from it, in the same order the prototype drew. Functions that have no world take the stream as an argument: `newGenome(rand)`, `crossGenome(a, b, rand)`, `babble(c, rand)` and `gateSpeech(c, text, rand)`; `rngOf(w)` makes one from a world.
- **Ids.** The prototype made ids from `Date.now()` and a module-wide counter. Here each world counts its own in `w.nextId` (`nid(w)`, base 36), so `newCreature` takes the world first: `newCreature(w, name, now, genome, x)`. Ids compare as the prototype's did once its clock prefix is set aside, and that comparison decides which of a pair of Kith lays the egg.
- **Time zone.** `localParts` read the host's time zone; it now treats time as UTC. That moves `allowanceDay` and `presenceDay`, and the weather only when `scale` is 1 (worlds run at `SCALE`, 6).
- **Wants.** `setWants` ignores a want named after an inherited object property such as `constructor`, which the prototype let through.
- Unused parameters are gone (`sitterOn()`, `newFauna()`), as is `robotCare`, which did nothing.
- `fearsRiver` is exported, for the balance scenarios.

## Balance scenarios

`src/scenarios/balance.ts` holds the thresholds the garden must meet, on this port now and on the new engine later: the prototype's printed checks (`prototype/tests/test2.js`, `test5.js`, `test8.js`) as assertions. `runScenario` in `src/scenarios/harness.ts` runs a scenario on seeds 600–619 through a `ScenarioSim`, the adapter a simulation implements; `src/scenarios/legacy.ts` is this port's. It counts every logged event, where the prototype's scripts read the log, which keeps only its last 800 entries and so undercounts a big family's days.

On this port, per world:

| Scenario                  | Deaths | Tock spent | Chased | Honey | Stung | Tock bought |
| ------------------------- | ------ | ---------- | ------ | ----- | ----- | ----------- |
| 1 Kith, 24h, 0 coins      | 0/20   | 2          | 26     | 3.7   | 1.9   | 0.2         |
| 1 Kith, 3 days, 0 coins   | 0/20   | 12         | 84     | 4.4   | 2.2   | 1.2         |
| 2 Kith, 3 days, 100 coins | 0/40   | 78         | 161    | 7.6   | 4.2   | 7.8         |
| 4 Kith, 3 days, 100 coins | 0/80   | 1328       | 331    | 19.5  | 10.1  | 133         |

After 2 days alone all 20 Kith keep away from the river. In 40 minutes with the player's hand near, a Kith rests half the time, plays or follows its wishes 27% of it and eats 1.6 times. Catching up 7 days with 4 Kith takes about half a second.

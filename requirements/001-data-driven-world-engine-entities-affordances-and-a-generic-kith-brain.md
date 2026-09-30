---
created: '2026-09-30'
github_issue: null
id: '001'
status: draft
title: 'Data-driven world engine: entities, affordances and a generic Kith brain'
updated: '2026-09-30'
---

## Why

Kith started as a single-file prototype (see prototype/, v2.2) that grew one feature at a time. Every object (ball, doll, top, beehive, cactus, food machine, music box, word board, mushrooms…) has special-case code in 6–10 places: choosing, executing, drawing, hit-testing, naming, icons, prompts, summaries and save migration. References are string conventions ("item:", "obj:", "kin:", "bush:2"), several Kith are handled by swapping a global "current creature", randomness and the clock are non-deterministic, and the UI mutates simulation state directly. Adding one new creature or object (a frog, a campfire, an apple tree) is expensive and risky, the simulation cannot be replayed or run identically on a server, and there are no real tests. The game is going to run on a server (Railway) across devices, so the core must be deterministic, data-driven and well tested first.

## What

The game's behaviour is the same as the prototype's, and the balance scenarios keep passing, but it runs on an engine where:

1. Everything in the world is an entity of a declared entity type. A type is defined in one place and declares: its state fields and defaults; its category and the word meaning players can teach for it; how it is perceived (salience, whether it moves); what can be done to it (its affordances) and what each affordance does; its sprite; whether it can be carried, dragged, placed or bought (with price); how it spawns, grows, regrows, rots or decays; and any terrain or zone it creates (for example the river's hazard zone and the bridge). Adding a new kind of thing (e.g. a frog that jumps when poked, a campfire that warms but burns, an apple tree that drops apples when shaken) means adding one definition and one sprite, with no engine changes for ordinary cases.

2. Kith (and Tock, and critters like the squirrel) interact with the world only through affordances: a named verb applied to a target entity (eat, poke, chase, play, hug, use, climb, rest-in, fetch, kick…). Each affordance declares when it is available, what it costs, how long it takes, and its outcomes: changes to needs and health, changes to the target's state, items spawned, events emitted, chances (seeded), and the learning signal it produces. The player acts through the same affordances where it makes sense (tapping the hive, spinning the top, pulling the lever).

3. A Kith decides in two steps, as in Creatures: attention picks a target entity (weighed by needs, its opinion of that kind of thing, curiosity, distance and reachability), then decision picks an affordance on it (weighed by learned values keyed by need × verb × category). Learning, opinions ("bees hurt", "the river is dangerous", "red mushrooms make me sick") and habits generalise across all entity types instead of being special-cased. Claude's wishes, the cortex's intentions and the player's commands enter as biases on attention and decision.

4. Language is data-driven: any nameable entity type contributes a meaning; words are taught by pointing, the word board, Tock, other Kith and plain talk through one teaching mechanism; speech stays limited to learned words.

5. Everything the player does is an explicit command (tickle, scold, say, point, kick, spin, drag, place, buy, use, select), and everything that happens is a typed event. The simulation advances as step(state, elapsed time, commands) → new state + events, with seeded randomness and no reads of the real clock, so the same inputs always produce the same world, on a phone or on a server, and any run can be replayed.

6. Saved worlds carry a schema version and migrate forward automatically, and prototype saves can be imported.

7. There is an automated test suite: unit tests for each system, the prototype's balance scenarios as assertions across fixed seeds, determinism/replay tests, and tests for each entity definition.

## Issues

_None yet._
---
created: '2026-09-30'
github_issue: 17
id: '002'
status: idea
title: Playable web client on the new engine, with prototype feature parity
updated: '2026-09-30'
---

## Why

Players experience Kith through the browser (desktop and phone). The prototype's UI is tangled with the simulation: it mutates state directly, hard-codes drawing and hit-testing per object, and builds Claude prompts inline. On the new engine, the client should only draw the world from entity definitions and send commands, so new content appears without client changes and the same client can later talk to a server.

## What

A player can open Kith in a browser on a phone or desktop and play everything the prototype (v2.2) offers, now running on the new engine:

- A side-scrolling garden with parallax sky, day/night, weather effects, a minimap, and a camera that follows the selected Kith and can be dragged or jumped via the minimap.
- Every entity drawn from its definition's sprite: Kith (with stage, colour from genes, eyes that follow attention, dancing, gazing, sleeping, shivering, in-water), Tock, critters, items, structures, gadgets, plants, the river and bridge, sky bodies.
- Speech bubbles, thought bubbles with picture-words, an attention marker, a live "why" line, learning notifications and a memory book.
- All player actions as commands: tap to tickle/select, scold, talk, point at anything (including the sky) to name it, kick and flick the ball, spin the top, drag items, move gadgets and shelters, use gadgets, buy from the shop, rename, name eggs.
- Panels: Care, Shop, Weather, Words, Mind, Brain, Memories, Time (test controls), and a roster of Kith.
- Away summaries, homecoming greetings, the death memorial, and the two-egg start.
- It works fully offline in the browser (local save) until the server exists, and later switches to the server without UI changes.
- It meets the prototype's page rules: responsive, safe-area aware, light/dark themes, and accessible controls.

## Issues

- #17 — Client renderer: world, camera, minimap and sprites from entity definitions
- #18 — Client input and commands: tapping, pointing, naming, dragging, kicking
- #19 — Client panels, roster, why-line, notifications and overlays
- #20 — Offline mode: local persistence, catch-up on open, Playwright end-to-end tests
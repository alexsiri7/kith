---
created: '2026-10-05'
github_issue: null
id: '004'
status: draft
title: Kith is live at kith.interstellarai.net, playable from phone and web, with
  the world saved in a database
updated: '2026-10-05'
---

## Why

Alex wants to see the game come to life and play it day to day. Today the only playable Kith is the v2.2 prototype, and its world lives in one browser's local storage: it can't be reached from his phone, and it's lost if browser data is cleared. The new engine (requirements 001 and 002) is a long way from playable. Getting the game live now, on a real address with real persistence, comes first; the new engine replaces the game behind the same address later.

## What

- Going to https://kith.interstellarai.net opens Kith (the v2.2 game) on a phone and on a desktop browser, over HTTPS, laid out for both screen sizes.
- The player signs in once per device. Signed in on the phone and on the laptop, they see the same world: the same Kith, coins, words, memories and dreams.
- The world is saved in a database on the server, not only in the browser. Clearing browser data, or switching devices, loses nothing.
- Leaving and coming back on either device shows the homecoming summary of what happened while the player was away, just as the prototype does.
- If the world is open on two devices and both change it, neither silently overwrites the other: the newer save wins, and the other device reloads to it.
- The creatures' Claude-driven mind (talk, wishes, dreams) works on the live site, paid for by the server's own key, with a per-player daily limit. When the limit is reached or Claude is unavailable, the game falls back to its simple mind instead of breaking.
- On the phone, Kith can be added to the home screen and opens full-screen like an app.
- A world the player already has in a browser (the prototype save) can be brought onto the server once.
- Merging to main deploys automatically; a broken deploy doesn't take the site down; the database is backed up daily.

## Issues

_None yet._
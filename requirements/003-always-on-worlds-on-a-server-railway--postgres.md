---
created: '2026-09-30'
github_issue: null
id: '003'
status: draft
title: Always-on worlds on a server (Railway + Postgres)
updated: '2026-09-30'
---

## Why

Today a Kith world lives in one browser: it only advances when that tab is opened, can't be shared across devices, and can be lost with browser data. The game is about creatures that live on while you're away, so their world should live on a server, advance on its own, and be reachable from any device.

## What

- Each player's world lives on the server (Railway), stored in Postgres, and is the single source of truth.
- The world keeps advancing while nobody is watching: weather, needs, Tock, eggs and deaths happen on schedule, not only when a page is opened.
- Opening Kith on any device shows the same world, up to date, with a homecoming summary of what happened since that player last looked.
- Actions taken in the browser reach the server and take effect immediately on screen (the browser predicts locally and reconciles with the server without visible jumps).
- If two devices are open at once, both see the same world.
- A player can move an existing browser (offline or prototype) world onto the server once.
- The service deploys automatically from main, reports errors, and can be restored from backups.

## Issues

_None yet._
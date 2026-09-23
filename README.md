# HackDigest

Hacker News, in your language — a reader built for people who don't read
English comfortably enough to enjoy HN raw.

**English** · [中文](README.zh-CN.md)

[![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE) [![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20mobile%20(Phase%203)-lightgrey)](#roadmap)

Hacker News is arguably the best tech front page on the internet — and for
hundreds of millions of developers, a wall of English. HackDigest tears that
wall down: every story, article TL;DR, and comment thread, translated and
digested on demand.

## The three digests

1. **Story digest** — the linked article (often 5,000 words of English)
   condensed to a few paragraphs in your language.
2. **Thread digest** — the real gold of HN is the comments. A thread with
   800 replies becomes the top arguments on each side, who said what, and
   where the community landed.
3. **Daily digest** — this morning's front page as a two-minute read in your
   language, before you decide what's worth opening.

## Free / Pro

The app is free to download on every platform. Translation and digests are
metered on the free tier and unlimited on Pro.

| | Free | Pro |
|---|---|---|
| Browse HN (Top / New / Best / Ask / Show / Jobs) | ✅ | ✅ |
| Reader-optimized comment threads, dark mode | ✅ | ✅ |
| Bookmarks & local history | ✅ | ✅ |
| Translate story + thread (per story) | daily quota | unlimited |
| Article TL;DR & thread digest | daily quota | unlimited |
| Daily digest of the front page | — | ✅ |
| Cross-device sync (desktop + mobile, one license) | — | ✅ |
| Bring your own LLM API key | ✅ unlimited | ✅ |

Bring your own key and everything is free, forever — that's the open-source
half of the deal. Pro is for people who just want it to work: hosted
translation with no setup, no keys, no quotas.

## Roadmap

- **Phase 1 — Desktop MVP** (Windows first, then macOS): HN feeds and
  threads with a reading experience worth opening daily; translation and
  digests via BYOK (bring your own key). Free & open source throughout.
- **Phase 2 — Hosted service + Pro**: managed translation behind a
  subscription or one-time lifetime license; daily digest; one account
  across devices.
- **Phase 3 — Mobile** (iOS / Android): the same TypeScript core, a phone
  app, Pro licenses carry over.

## Tech stack

**Tauri 2 + React + TypeScript**, one repo, `apps/<platform>` + `packages/core`
(the pattern Taskly settled on, with a web stack — HackDigest is a content
app: story pages, rich comment trees, typeset text, and for content the web
rendering engine is the best text engine available).

- `packages/core` — pure TypeScript, runs everywhere: HN API client (official
  Firebase API + Algolia search), translation pipeline, digest prompting, and
  BYOK presets for any OpenAI-compatible endpoint (GLM, DeepSeek, Qwen, Kimi,
  OpenAI, Claude …) so mainland users can plug in a domestically reachable API.
- Frontend — React + Vite + TanStack Query (feed caching & pagination) +
  virtualized comment trees (@tanstack/virtual), Tailwind for reading
  typography, light/dark.
- Storage — one SQLite file (`tauri-plugin-sql`): bookmarks, history, and a
  translation cache — a translated thread is never billed twice.
- Network — LLM calls go through the Rust side (no webview CORS); HN data
  comes straight from the official
  [Hacker News API](https://github.com/HackerNews/API) and Algolia search —
  no scraping, no backend required for the free app.
- Updates — Tauri updater against GitHub Releases; no app-store gatekeeper
  on desktop.

## Repo layout

```
hackdigest/
├── apps/desktop/     Tauri 2 desktop app (Windows / macOS / Linux)
├── apps/mobile/      Phase 3
├── packages/core/    shared TypeScript core: HN API, translation, digests
└── docs/
```

## License & business model

AGPL-3.0 — the client is open source, forever. Hosted translation, digest
compute, and cross-device sync are the Pro subscription that keeps the
lights on. Competitors are welcome to read the code; users are welcome to
self-host their own keys.

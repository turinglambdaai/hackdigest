# HackDigest

Hacker News, in your language — a reader built for people who don't read
English comfortably enough to enjoy HN raw.

[![CI](https://github.com/turinglambdaai/hackdigest/actions/workflows/ci.yml/badge.svg)](https://github.com/turinglambdaai/hackdigest/actions/workflows/ci.yml) [![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)

**English** · [中文](README.zh-CN.md)

Hacker News is arguably the best tech front page on the internet — and for
hundreds of millions of developers, a wall of English. HackDigest tears that
wall down: every story, article TL;DR, and comment thread, translated and
digested on demand.

## Download

Grab the latest build from
[GitHub Releases](https://github.com/turinglambdaai/hackdigest/releases/latest) —
every asset is built from source by GitHub CI and launch-smoke-tested on all
three platforms:

| Platform | Artifacts |
|---|---|
| macOS (Apple Silicon / Intel) | `hackdigest-<version>-macos-<arch>.dmg` + portable `.zip` |
| Linux (x64 / arm64) | `hackdigest-<version>-linux-<arch>.tar.gz` + `.deb` (x64 / arm64) + `.AppImage` (x64) |
| Windows 10/11 (x64) | `hackdigest-<version>-windows-x64.msi` + portable `.zip` |

> macOS builds are ad-hoc signed and not notarized: on first launch,
> right-click → Open. The Windows MSI is unsigned, so SmartScreen may show
> a warning on first install — choose More info → Run anyway.

Translation and digests need an LLM API key — set one in Settings (GLM,
DeepSeek, Qwen, Kimi, OpenAI, or a local Ollama; all OpenAI-compatible).

The app checks GitHub Releases on startup and, when a new version is out,
takes you to the release page to download it. In-place updates are not in
yet — they wait on the upstream Glaze updater
([glaze#47](https://github.com/turinglambdaai/glaze/issues/47)).

## Keyboard-first

HN veterans get their muscle memory back: **j/k** move the selection,
**Enter/o** open, **s** bookmark, **t** translate the selected title,
**r** refresh, **1–6** switch feeds, **/** search. On a story page:
**←/u** back, **t** translate, **Shift+T** translate all comments,
**d** AI digest. Press **?** anytime for the cheat sheet.

## The three digests

1. **Story digest** — the linked article (often 5,000 words of English)
   condensed to a few paragraphs in your language.
2. **Thread digest** — the real gold of HN is the comments. A thread with
   800 replies becomes the top arguments on each side, who said what, and
   where the community landed.
3. **Daily digest** — this morning's front page as a two-minute read in your
   language, before you decide what's worth opening.

## Free / Pro

The app is free to download on every platform. Everything can be unlocked
forever with your own LLM key (BYOK, truly free); the Pro hosted service is
for people who just want it to work — no keys, no setup.

| | Free (BYOK) | Pro (hosted) |
|---|---|---|
| Browse HN, reader-optimized threads, bookmarks, dark mode | ✅ | ✅ |
| Translate stories & comment threads | ✅ unlimited | ✅ no setup |
| Article TL;DR, thread digest, daily digest | ✅ unlimited | ✅ no setup |
| Bring your own LLM API key | ✅ GLM / DeepSeek / Qwen / Kimi / Ollama … | — not needed |
| Hosted service (no key, fair-use daily quota†) | 7-day free trial per device | ✅ fair-use unlimited† |
| Cross-device sync (one license, desktop + mobile) | — | Planned (Phase 3) |

† The Pro *hosted* service uses generous daily quotas plus globally shared
translation caches (HN traffic concentrates on a few hundred stories, so
cached threads cost nothing to serve). This keeps a flat subscription
sustainable without rate-limiting anyone who reads like a human. Bring your
own key and nothing here applies — that path is free and unlimited, forever.

## Roadmap

- **Phase 1 — Desktop MVP** ✅ (v0.1.x, Tauri line): HN feeds and threads with
  a reading experience worth opening daily; translation and digests via BYOK.
- **Phase 2 — Hosted Pro service** (v0.2.0): managed translation behind a
  license key — no setup, no keys. 7-day free trial per device, generous daily
  quotas, globally shared caches. Soft launch; sales start manual (lifetime /
  yearly keys), payment gateway lands next.
- **Phase 3 — Mobile** (iOS / Android): the same TypeScript core, a phone
  app, Pro licenses carry over.

## Tech stack

**Glaze + React + TypeScript** — a Racket host (via
[Glaze](https://github.com/turinglambdaai/glaze)) serves the React frontend
in the platform webview. One repo: `backend/` + `apps/desktop/` +
`packages/core`. HackDigest is a content app — story pages, rich comment
trees, typeset text — and for content, the web rendering engine is the best
text engine available; the app shell, storage, LLM proxy, and update checks
live in the Racket backend.

- `packages/core` — pure TypeScript, runs everywhere: the HN API client
  (official Firebase API + Algolia search), BYOK presets for any
  OpenAI-compatible endpoint (GLM, DeepSeek, Qwen, Kimi, OpenAI, Claude …)
  so mainland users can plug in a domestically reachable API, and the
  storage/settings layer the components talk to.
- Frontend — React + Vite + zustand + Tailwind 4; progressively-loaded
  feeds and comment trees, light/dark. In-app it talks to the backend over
  HTTP; plain-browser dev keeps an IndexedDB fallback.
- Backend — Racket: SQLite storage (kv store, translations, HN item cache —
  a translated thread is never translated twice) plus settings/library data
  files. The translation/digest pipeline (prompt building, 30-title batches,
  comment self-healing bisection) runs here, so LLM API keys stay in the
  backend and never enter the webview; LLM calls stream through the backend
  proxy with retries and a 60-second timeout.
- Network — HN data comes straight from the official
  [Hacker News API](https://github.com/HackerNews/API) and Algolia search —
  no scraping.
- Updates — the backend checks GitHub Releases on startup; the banner opens
  the release page in your browser. In-place updates wait on the upstream
  Glaze updater (glaze#47).

## Repo layout

```
hackdigest/
├── backend/          Racket host on Glaze: storage, LLM proxy, app shell
├── apps/desktop/     React frontend (built to dist/, served by the host)
├── apps/mobile/      Phase 3
├── packages/core/    shared TypeScript core: HN API, storage, BYOK presets
└── docs/
```

## License & business model

AGPL-3.0 — the client is open source, forever. Hosted translation, digest
compute, and cross-device sync are the Pro subscription that keeps the
lights on. Competitors are welcome to read the code; users are welcome to
self-host their own keys.

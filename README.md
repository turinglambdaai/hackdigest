# HackDigest

Hacker News, in your language — a reader built for people who don't read
English comfortably enough to enjoy HN raw.

**English** · [中文](README.zh-CN.md)

[![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE) [![CI](https://github.com/turinglambdaai/hackdigest/actions/workflows/ci.yml/badge.svg)](https://github.com/turinglambdaai/hackdigest/actions/workflows/ci.yml)

🏠 Product page: **https://hackdigest.jrtx.site**

Hacker News is arguably the best tech front page on the internet — and for
hundreds of millions of developers, a wall of English. HackDigest tears that
wall down: every story, article TL;DR, and comment thread, translated and
digested on demand.

## Download

Grab the latest release for your platform from
[GitHub Releases](https://github.com/turinglambdaai/hackdigest/releases):

| Platform | Artifact |
|---|---|
| Windows 10/11 | `.msi` installer (unsigned in early builds — see below) |
| macOS (Apple Silicon) | `.dmg` |
| Linux | `.deb` / `.AppImage` |

> Windows SmartScreen may warn on unsigned builds. The builds are produced by
> this repository's CI from tagged commits; a code-signing certificate is on
> the Phase 2 list.
>
> macOS: right-click → Open on first launch (unnotarized in early builds).

Translation and digests need an LLM API key — set one in Settings (GLM,
DeepSeek, Qwen, Kimi, OpenAI, or a local Ollama; all OpenAI-compatible).

**Auto-update is built in** (since v0.1.1): the app checks GitHub Releases on
startup and offers a one-click, signature-verified update — no re-downloading
installers by hand.

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

- **Phase 1 — Desktop MVP** ✅ (v0.1.x): HN feeds and threads with a reading
  experience worth opening daily; translation and digests via BYOK; auto-update.
- **Phase 2 — Hosted Pro service** (v0.2.0): managed translation behind a
  license key — no setup, no keys. 7-day free trial per device, generous daily
  quotas, globally shared caches. Soft launch; sales start manual (lifetime /
  yearly keys), payment gateway lands next.
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
- Frontend — React + Vite + zustand + Tailwind 4; progressively-loaded
  feeds and comment trees, light/dark.
- Storage — IndexedDB (built into the webview, zero plugins): bookmarks,
  history, and a translation cache — a translated thread is never billed twice.
- Network — LLM calls ride the Tauri plugin HTTP layer (no webview CORS); HN
  data comes straight from the official
  [Hacker News API](https://github.com/HackerNews/API) and Algolia search —
  no scraping, no backend required for BYOK.
- Updates — Tauri updater against GitHub Releases (minisign-signed); no
  app-store gatekeeper on desktop.

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

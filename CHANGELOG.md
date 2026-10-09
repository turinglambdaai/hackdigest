# Changelog

All notable changes to HackDigest are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is
semver. The Tauri line's history (v0.1.0–v0.5.1) lives in git history; its
releases and tags were withdrawn.

## [Unreleased]

## 1.0.0 - unreleased

First release of the Glaze line, on all three desktop platforms: macOS
(Apple Silicon) `.dmg`, Windows 10/11 (x64) `.msi`, and Linux (x64)
`.tar.gz`.

### Added

- Full backend rebuild on Glaze: the Tauri/Rust host is replaced by a Racket
  backend (`backend/`) serving the unchanged React frontend over HTTP —
  SQLite with the same schema (kv / translations / hn_items, WAL), settings
  and library JSON data files, window-state persistence, single-instance
  guard, external links in the default browser, and an HttpOnly-cookie
  WebView token.
- Translation and digest orchestration moved into the backend: prompt
  building, 30-title feed batches, comment-thread translation with
  self-healing bisection (20 per batch, two workers, failing batches split
  to single items), and the three digest prompts with daily-digest caching —
  streamed to the frontend over the same incremental protocol.
- LLM proxy: OpenAI-compatible streaming endpoint with the retry table
  (json-mode fallback on 400/422, one retry after 3 s on 429) and a 60-second
  per-round timeout. API keys configured in Settings are stored and used
  entirely backend-side — the webview never sees the key (BYOK fields render
  as a `__SAVED__` mask).
- One-time, idempotent migration of Tauri-era data (site.jrtx.hackdigest →
  sibling hackdigest directory, read-only copy).
- Windows installer: a WiX MSI built from the same packaged distribution,
  with a stable upgrade identity (`TuringLambda.HackDigest`) so in-place
  upgrades work from this first release on. Release CI validates the MSI
  (WiX validation + decompiled metadata) and smoke-tests the packaged
  binary (API health + frontend served) on all three platforms.
- Update check against GitHub Releases on startup with a go-to-download
  banner (the one-click updater returns in a later release).

### Changed

- Frontend components are unchanged; only the bridge layer was rewritten
  (fetch + streaming reader replacing Tauri `invoke`), with an IndexedDB
  fallback for plain-browser development.
- Feed-title translation now returns per request instead of per-30-item
  callback batches.

### Removed

- The Tauri 2 / Rust host (`src-tauri/`) and the in-place auto-update
  pipeline (minisign) that depended on it.

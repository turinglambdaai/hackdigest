# Changelog

All notable changes to HackDigest are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is
semver. The Tauri line's history (v0.1.0–v0.5.1) lives in git history; its
releases and tags were withdrawn.

## [Unreleased]

## 0.2.0 - 2026-10-10

Linux packaging parity: the Linux line gets first-class installer assets,
matching the family bar on macOS and Windows. Nothing about the update feed
or the in-app updater changes — these are installer assets published beside
the portable tar.gz.

### Added

- Linux `.deb` packages for x64 and arm64, hand-rolled with `dpkg-deb`:
  the app installs to `/opt/hackdigest` with a `hackdigest` launcher on
  `PATH`, a desktop menu entry, and hicolor icons. `Depends` names what
  the runtime actually FFI-loads (WebKitGTK, GTK 3, OpenSSL 3 for the
  updater's signature checks, xdg-utils) instead of a laundry list, and
  release CI installs the package into a clean `ubuntu:22.04` container
  to prove the dependency set is sufficient.
- Linux AppImage (x64), assembled with `appimagetool` from the same
  distribution directory — same system-WebKitGTK requirement as the
  tar.gz and deb, so it stays honest about what it bundles.
- Linux arm64 builds: the release pipeline now runs its Linux leg on a
  native arm64 runner, shipping `hackdigest-<version>-linux-arm64.tar.gz`
  and `.deb` beside the x64 ones. Arm64 is an installer asset only for
  now — the signed update feed still carries the x64 tar.gz.

### Changed

- Release assets follow the family naming on Linux too:
  `hackdigest-<version>-linux-<arch>.<ext>` now covers `.tar.gz`, `.deb`
  and `.AppImage`, all covered by `SHA256SUMS` and build-provenance
  attestations.

## 0.1.0 - 2026-10-10

The in-app updater (R3 of the Glaze migration) and the 0.x epoch reset:
HackDigest can now update itself end to end, closing the gap v1.0.1
documented as "open the release page". The 1.x line's releases and tags
are withdrawn as the whole family enters its 0.x stage.

### Added

- Full update flow on portable installs: the backend fetches the release's
  Ed25519-signed `update-manifest.json`, verifies it against the embedded
  key, downloads this platform's artifact with a progress indicator, checks
  size and SHA-256 against the signed feed, and swaps the install:
  - macOS portable `.app`: ditto-unpack, atomic bundle swap with a
    `.old` backup, automatic relaunch.
  - Windows portable zip: unpack beside the install dir, `cmd` handover
    (waits for the app to exit, `.old` swap, restart); failures leave a
    marker that the next launch reports.
  - Linux: the downloaded tar.gz is revealed in the file manager — extract
    it over the app folder by hand (family rule for archive installs).
- Settings → About now offers the same flow with live progress; the
  startup banner drives it too.
- Release pipeline: `scripts/make-update-manifest.sh` signs the update
  feed from the portable artifacts before publishing (key supplied via the
  `UPDATE_ED25519_PRIVATE_KEY` secret; releases without it fall back to
  release-page-only updates), and the release workflow gained a
  concurrency group.

### Changed

- Updating honestly, by install type: portable macOS/Windows installs
  update in place; DMG/MSI installs point at the release page (the app
  cannot rewrite itself there without elevation); Linux downloads and
  reveals the archive. The check falls back to the v1.0-style
  release-page behavior whenever no signed manifest is published.
- Settings → About shows the packaged version reported by the backend
  (it previously showed a stale build number).

## 1.0.1 - 2026-10-09

Packaging-hygiene release — no app-behavior changes beyond honest update
wording.

### Added

- macOS builds now cover both architectures: Apple Silicon (arm64) and
  Intel (x64), each shipped as an installer `.dmg` and a portable `.app`
  `.zip`.
- Windows ships a portable `.zip` (the same payload the MSI installs,
  runnable from anywhere) beside the MSI.
- Linux release builds now run a packaged-app launch smoke under xvfb
  (API health + frontend served), the same bar macOS and Windows already
  held.

### Changed

- Release assets renamed to the family convention — all-lowercase
  `hackdigest-<version>-<os>-<arch>.<ext>`, with the macOS DMG
  arch-suffixed (`-macos-arm64` / `-macos-x64`) instead of the previous
  `HackDigest-v<version>-*` scheme.
- Update wording now says what the current updater actually does: detect a
  new version on startup and open the GitHub release page in your browser.
  Site, README, and in-app copy no longer imply in-app install/auto-update;
  the in-place updater is tracked upstream as glaze#47.

Install caveats carried over from 1.0.0: macOS builds are ad-hoc signed and
not notarized (right-click → Open on first launch); the Windows MSI is
unsigned (SmartScreen may warn — More info → Run anyway); Linux needs
libwebkit2gtk-4.1 present.

## 1.0.0 - 2026-10-09

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

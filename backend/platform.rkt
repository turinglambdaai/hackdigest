#lang racket/base

;; Data directory resolution. The Glaze build keeps the same layout the
;; Tauri build used (db + settings.json + library.json), in a sibling dir:
;;   macOS    ~/Library/Application Support/hackdigest
;;   Windows  %APPDATA%/hackdigest
;;   Linux    ~/.config/hackdigest
;; The legacy Tauri dir (site.jrtx.hackdigest, same base) is only ever read
;; by migrate.rkt — never written.

(require racket/path
         racket/string)

(provide app-data-dir
         legacy-data-dir)

(define (base-dir)
  (case (system-type)
    [(macosx)
     (build-path (find-system-path 'home-dir) "Library" "Application Support")]
    [(windows)
     (find-system-path 'pref-dir)]
    [else
     (find-system-path 'config-dir)]))

(define (env-override)
  (define env (getenv "HACKDIGEST_DATA_DIR"))
  (and env (not (string=? env "")) (simple-form-path env)))

(define (app-data-dir)
  (or (env-override)
      (build-path (base-dir) "hackdigest")))

;; When the env override points the app dir at a sandbox, the legacy dir is
;; taken as its sibling so tests never touch real user data.
(define (legacy-data-dir)
  (or (let ([override (env-override)])
        (and override (build-path (path-only override) "site.jrtx.hackdigest")))
      (build-path (base-dir) "site.jrtx.hackdigest")))

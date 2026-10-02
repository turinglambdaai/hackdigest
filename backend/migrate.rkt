#lang racket/base

;; One-time adoption of the Tauri install's data (site.jrtx.hackdigest):
;; copies hackdigest.db (+ WAL sidecars) and the two JSON files into the
;; Glaze data dir. The legacy dir is never modified, so rolling back to the
;; Tauri build stays possible. Idempotent: skipped when a local db exists.

(require racket/file
         racket/path
         racket/string
         "platform.rkt")

(provide migrate-tauri-data!)

(define (copy-if-exists! src dst)
  (and (file-exists? src)
       (begin (copy-file src dst #t) #t)))

;; Returns a human-readable line for the startup log.
(define (migrate-tauri-data!)
  (define legacy (legacy-data-dir))
  (define target (app-data-dir))
  (define legacy-db (build-path legacy "hackdigest.db"))
  (define target-db (build-path target "hackdigest.db"))
  (cond
    [(file-exists? target-db)
     (format "[migrate] local db exists at ~a; nothing to do" target-db)]
    [(not (directory-exists? legacy))
     "[migrate] no legacy Tauri data found; starting fresh"]
    [else
     (make-directory* target)
     (define copied
       (for/list ([name (in-list '("hackdigest.db" "hackdigest.db-wal" "hackdigest.db-shm"
                                   "settings.json" "library.json"))]
                  #:when (copy-if-exists! (build-path legacy name) (build-path target name)))
         name))
     (format "[migrate] adopted Tauri data from ~a: ~a" legacy (string-join copied ", "))]))

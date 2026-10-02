#lang racket/base

;; Durable JSON data files in the app data dir — the source of truth for
;; settings and library (port of Tauri's read_data_file/write_data_file:
;; the webview's storage has proven unreliable in packaged builds).
;; Allowlist mirrors db.rs exactly: settings, library. Contents ride as
;; opaque strings so the page's JSON shape stays authoritative.

(require racket/contract
         racket/file
         racket/path)

(require "platform.rkt")

(provide
 (contract-out
  [data-file-path (-> string? path?)]
  [read-data-file (-> string? (or/c string? #f))]
  [write-data-file (-> string? string? void?)]))

(define allowed-files '("settings" "library"))

(define (data-file-path name)
  (unless (member name allowed-files)
    (raise-argument-error 'data-file-path (format "one of ~a" allowed-files) name))
  (build-path (app-data-dir) (string-append name ".json")))

(define (read-data-file name)
  (define path (data-file-path name))
  (and (file-exists? path) (file->string path)))

(define (write-data-file name json)
  (define path (data-file-path name))
  (make-directory* (path-only path))
  (display-to-file json path #:mode 'text #:exists 'replace))

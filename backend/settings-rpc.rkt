#lang racket/base

;; Settings access for the backend: the LLM config lives in settings.json
;; (managed by the page through the data-file endpoints). R2 security rule:
;; the real API key never needs to reach the page for LLM calls — endpoints
;; resolve the config server-side, reads are masked (BYOK only; the hosted
;; provider reuses the same field as a license key the page must display),
;; and masked writes restore the stored key.

(require json
         racket/contract
         racket/match
         racket/string
         "data-files.rkt"
         "llm.rkt")

(provide (contract-out [masked-key string?]
                       [settings-llm-config (-> llm-config?)]
                       [resolve-llm-config (-> llm-config? llm-config?)])
         mask-settings-jsexpr!
         unmask-settings-jsexpr!)

;; Sentinel the page sees instead of a stored BYOK key.
(define masked-key "__SAVED__")

(define (settings-jsexpr)
  (define raw (read-data-file "settings"))
  (if raw
      (with-handlers ([exn:fail? (lambda (_) (hasheq))])
        (read-json (open-input-string raw)))
      (hasheq)))

(define (stored-llm-hash)
  (define s (settings-jsexpr))
  (define llm (hash-ref s 'llm #f))
  (and (hash? llm) llm))

;; The Racket-side LLM config: stored settings win over whatever the page
;; relays; a page cfg with a real key (settings test button before first
;; save) still takes precedence per-field.
(define (resolve-llm-config page-cfg)
  (define stored (stored-llm-hash))
  (define (pick page-val stored-key)
    (if (and (string? page-val) (not (string=? page-val "")) (not (string=? page-val masked-key)))
        page-val
        (let ([v (and stored (hash-ref stored stored-key #f))])
          (if (string? v) v ""))))
  (llm-config
   (pick (llm-config-base-url page-cfg) 'baseUrl)
   (pick (llm-config-api-key page-cfg) 'apiKey)
   (pick (llm-config-model page-cfg) 'model)))

;; The config as stored (used when the page sends nothing at all).
(define (settings-llm-config)
  (define stored (stored-llm-hash))
  (llm-config
   (let ([v (and stored (hash-ref stored 'baseUrl #f))]) (if (string? v) v ""))
   (let ([v (and stored (hash-ref stored 'apiKey #f))]) (if (string? v) v ""))
   (let ([v (and stored (hash-ref stored 'model #f))]) (if (string? v) v ""))))

;; Mask: BYOK keys become the sentinel so reads never leak them. Hosted
;; (providerId "hosted") keeps its key visible — it is a license key.
;; read-json produces immutable hashes, so the returned value is
;; authoritative and may be a fresh copy.
(define (mask-settings-jsexpr! s)
  (define s2 (if (immutable? s) (hash-copy s) s))
  (define llm (hash-ref s2 'llm #f))
  (when (and (hash? llm)
             (not (equal? (hash-ref s2 'providerId "") "hosted")))
    (define llm2 (if (immutable? llm) (hash-copy llm) llm))
    (define k (hash-ref llm2 'apiKey #f))
    (when (and (string? k) (non-empty-string? (string-trim k)))
      (hash-set! llm2 'apiKey masked-key)
      (hash-set! s2 'llm llm2)))
  s2)

;; Restore: a sentinel on the write path means "keep the stored key" — the
;; page never authored it, it only echoed the masked read. Return value is
;; authoritative (input may be immutable).
(define (unmask-settings-jsexpr! s)
  (define s2 (if (immutable? s) (hash-copy s) s))
  (define llm (hash-ref s2 'llm #f))
  (when (and (hash? llm)
             (equal? (hash-ref llm 'apiKey #f) masked-key))
    (define stored-key (let ([stored (stored-llm-hash)])
                         (and stored (hash-ref stored 'apiKey #f))))
    (when (string? stored-key)
      (define llm2 (if (immutable? llm) (hash-copy llm) llm))
      (hash-set! llm2 'apiKey stored-key)
      (hash-set! s2 'llm llm2)))
  s2)

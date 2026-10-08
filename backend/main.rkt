#lang racket/base

;; HackDigest on Glaze — the Racket backend that replaces the Tauri/Rust
;; host (see docs/GLAZE-MIGRATION.md). Serves the built React frontend and
;; the /api surface: SQLite storage, durable JSON data files, LLM proxy
;; (keys stay in Racket), external links, update detection.
;;
;; Run:  pnpm --filter @hackdigest/desktop build:vite   (once)
;;       racket backend/main.rkt

(require glaze
         json
         racket/contract
         racket/file
         racket/format
         racket/list
         racket/match
         racket/path
         racket/runtime-path
         racket/string
         "data-files.rkt"
         "db.rkt"
         "llm.rkt"
         "migrate.rkt"
         "platform.rkt"
         "settings-rpc.rkt"
         "translate.rkt"
         "update-check.rkt")

;; Keep in sync with tauri.conf.json / package.json at release time
;; (scripts/check-release-version.sh guards the tagged build).
(define app-version "0.5.1")

(define-runtime-path frontend-dist "../apps/desktop/dist")

(define bus (make-event-bus))

;; The database is opened in module+ main (after data migration); routes
;; read it through this box so impl functions stay directly testable.
(define db-box (box #f))
(define (current-db) (unbox db-box))

;; ---- page-jsexpr → impl shims ----------------------------------------------

(define (nullable v) (if (string? v) v 'null))

(define (jsexpr->cfg h)
  (llm-config (hash-ref h 'baseUrl "")
              (hash-ref h 'apiKey "")
              (hash-ref h 'model "")))

;; [{role, content}] → ((role . content) ...)
(define (jsexpr->msgs arr)
  (for/list ([m (in-list arr)])
    (cons (string->symbol (hash-ref m 'role)) (hash-ref m 'content))))

(define (jsexpr->trans-rows rows)
  (for/list ([r (in-list rows)])
    (match r
      [(list id lang model title text)
       (list id lang model
             (if (string? title) title #f)
             (if (string? text) text #f))])))

(define (jsexpr->items items)
  (for/list ([it (in-list items)])
    (match it [(list id json) (list id json)])))

;; Stream a digest: OK line + raw markdown deltas (same wire protocol as
;; api/llm/chat/stream, prompts built server-side by backend/translate.rkt).
(define (digest-stream cfg prompts max-tokens)
  (streaming-response
   (lambda (out)
     (define wrote-status? #f)
     (define (status-ok!)
       (unless wrote-status?
         (set! wrote-status? #t)
         (display "OK\n" out)
         (flush-output out)))
     (with-handlers
         ([exn:llm?
           (lambda (e)
             (unless wrote-status?
               (fprintf out "ERR ~a ~a\n"
                        (or (llm-error-status e) 0)
                        (string-replace (exn-message e) "\n" " "))
               (flush-output out)))]
          [exn:fail?
           (lambda (e)
             (unless wrote-status?
               (fprintf out "ERR 0 ~a\n" (string-replace (exn-message e) "\n" " "))
               (flush-output out)))])
       (chat cfg
             (list (cons 'system (car prompts)) (cons 'user (cdr prompts)))
             #:max-tokens max-tokens
             #:on-delta (lambda (delta)
                          (status-ok!)
                          (display delta out)
                          (flush-output out)))
       (status-ok!)))
   #:mime #"text/plain; charset=utf-8"))

;; ---- routes ----------------------------------------------------------------

(define-api-routes api
  [(GET "api/health")
   (health)
   (hasheq 'ok #t 'version app-version)]

  [(POST "api/kv/get")
   (kv-get-r [key string?])
   (hasheq 'value (nullable (kv-get (current-db) key)))]

  [(POST "api/kv/set")
   (kv-set-r [key string?] [value string?])
   (kv-set! (current-db) key value)
   (hasheq 'ok #t)]

  [(POST "api/translations/get")
   (translations-get [itemId exact-integer?] [lang string?])
   (define-values (title text) (translation-get (current-db) itemId lang))
   (hasheq 'found (if (or title text) #t 'null)
           'title (nullable title)
           'text (nullable text))]

  [(POST "api/translations/get-batch")
   (translations-get-batch-r [itemIds (listof exact-integer?)] [lang string?])
   (hasheq 'rows
           (for/list ([row (in-list (translations-get-batch (current-db) itemIds lang))])
             (match-define (list id title text) row)
             (list id (nullable title) (nullable text))))]

  [(POST "api/translations/put")
   (translations-put-r [rows list?])
   (translations-put! (current-db) (jsexpr->trans-rows rows))
   (hasheq 'ok #t)]

  [(POST "api/items/get")
   (items-get [id exact-integer?])
   (hasheq 'json (nullable (item-get (current-db) id)))]

  [(POST "api/items/put")
   (items-put-r [items list?])
   (items-put! (current-db) (jsexpr->items items))
   (hasheq 'ok #t)]

  [(POST "api/data/read")
   (data-read [name string?])
   (define raw (read-data-file name))
   (define masked-json
     (if (and (string=? name "settings") raw)
         (jsexpr->string
          (mask-settings-jsexpr!
           (with-handlers ([exn:fail? (lambda (_) (hasheq))])
             (read-json (open-input-string raw)))))
         raw))
   (hasheq 'json (nullable masked-json))]

  [(POST "api/data/write")
   (data-write [name string?] [json string?])
   ;; A masked key on the write path echoes the masked read — swap the
   ;; stored key back so the page can never clear it by saving untouched.
   (write-data-file
    name
    (if (string=? name "settings")
        (jsexpr->string
         (unmask-settings-jsexpr!
          (with-handlers ([exn:fail? (lambda (_) (hasheq))])
            (read-json (open-input-string json)))))
        json))
   (hasheq 'ok #t)]

  [(POST "api/llm/test")
   (llm-test [cfg hash?])
   (test-llm (resolve-llm-config (jsexpr->cfg cfg)))
   (hasheq 'ok #t)]

  [(POST "api/llm/chat")
   (llm-chat-r [cfg hash?] [msgs list?] [opts hash?])
   (hasheq 'content
           (chat (resolve-llm-config (jsexpr->cfg cfg))
                 (jsexpr->msgs msgs)
                 #:json-mode (hash-ref opts 'jsonMode #f)
                 #:max-tokens (hash-ref opts 'maxTokens #f)
                 #:temperature (hash-ref opts 'temperature 0.3)))]

  ;; Wire protocol: first line "OK" or "ERR <status> <message>", then raw
  ;; text deltas. POST can't use EventSource, so the page reads the body
  ;; with a fetch reader (bridge.ts). The status line is emitted lazily so
  ;; it always precedes the first delta; a mid-stream failure just ends the
  ;; connection (streaming-response truncation semantics).
  [(POST "api/llm/chat/stream")
   (llm-chat-stream [cfg hash?] [msgs list?] [opts hash?])
   (define the-cfg (resolve-llm-config (jsexpr->cfg cfg)))
   (define the-msgs (jsexpr->msgs msgs))
   (streaming-response
    (lambda (out)
      (define wrote-status? #f)
      (define (status-ok!)
        (unless wrote-status?
          (set! wrote-status? #t)
          (display "OK\n" out)
          (flush-output out)))
      (with-handlers
          ([exn:llm?
            (lambda (e)
              (unless wrote-status?
                (fprintf out "ERR ~a ~a\n"
                         (or (llm-error-status e) 0)
                         (string-replace (exn-message e) "\n" " "))
                (flush-output out)))]
           ;; network-level failures (DNS, refused, TLS) are exn:fail, not
           ;; exn:llm — still lead with an ERR line, never a silent close
           [exn:fail?
            (lambda (e)
              (unless wrote-status?
                (fprintf out "ERR 0 ~a\n" (string-replace (exn-message e) "\n" " "))
                (flush-output out)))])
        (chat the-cfg the-msgs
              #:json-mode (hash-ref opts 'jsonMode #f)
              #:max-tokens (hash-ref opts 'maxTokens #f)
              #:temperature (hash-ref opts 'temperature 0.3)
              #:on-delta
              (lambda (delta)
                (status-ok!)
                (display delta out)
                (flush-output out)))
        (status-ok!)))
    #:mime #"text/plain; charset=utf-8")]

  ;; ---- R2: translation orchestration lives server-side ----

  [(POST "api/translate/story")
   (translate-story-r [cfg hash?] [story hash?] [lang string?])
   (define r (translate-story (current-db) (resolve-llm-config (jsexpr->cfg cfg)) story lang))
   (hasheq 'title (hash-ref r 'title "") 'text (hash-ref r 'text ""))]

  [(POST "api/translate/titles")
   (translate-titles-r [cfg hash?] [stories list?] [lang string?])
   (define map (translate-titles (current-db) (resolve-llm-config (jsexpr->cfg cfg)) stories lang))
   ;; integer-keyed hashes are not jsexpr — pairs on the wire
   (hasheq 'pairs (for/list ([(k v) (in-hash map)]) (list k v)))]

  ;; ndjson progress: OK line, then one {"batch":{id:text},"done":N,"total":M}
  ;; line per completed batch, finally {"failed":K}
  [(POST "api/translate/comments")
   (translate-comments-r [cfg hash?] [comments list?] [lang string?])
   (define the-cfg (resolve-llm-config (jsexpr->cfg cfg)))
   (define items
     (for/list ([c (in-list comments)])
       (cons (hash-ref c 'id) (hash-ref c 'text ""))))
   (streaming-response
    (lambda (out)
      (display "OK\n" out)
      (flush-output out)
      (define failed
        (translate-comments (current-db) the-cfg items lang
                            (lambda (batch done total)
                              (define line
                                (jsexpr->string
                                 (hasheq 'batch (for/hash ([(k v) (in-hash batch)]) (values (~a k) v))
                                         'done done
                                         'total total)))
                              (display line out) (display "\n" out) (flush-output out))))
      (display (jsexpr->string (hasheq 'failed failed)) out)
      (display "\n" out)
      (flush-output out))
    #:mime #"application/x-ndjson")]

  [(POST "api/digest/thread")
   (digest-thread-r [cfg hash?] [story hash?] [comments list?] [lang string?])
   (digest-stream (resolve-llm-config (jsexpr->cfg cfg))
                  (thread-prompts story comments lang) 2000)]

  [(POST "api/digest/tldr")
   (digest-tldr-r [cfg hash?] [story hash?] [lang string?])
   (digest-stream (resolve-llm-config (jsexpr->cfg cfg))
                  (tldr-prompts story lang) 800)]

  [(POST "api/digest/daily")
   (digest-daily-r [cfg hash?] [stories list?] [lang string?] [date string?])
   (define the-cfg (resolve-llm-config (jsexpr->cfg cfg)))
   (streaming-response
    (lambda (out)
      (define wrote-status? #f)
      (define (status-ok!)
        (unless wrote-status?
          (set! wrote-status? #t)
          (display "OK\n" out)
          (flush-output out)))
      (with-handlers
          ([exn:llm?
            (lambda (e)
              (unless wrote-status?
                (fprintf out "ERR ~a ~a\n"
                         (or (llm-error-status e) 0)
                         (string-replace (exn-message e) "\n" " "))
                (flush-output out)))]
           [exn:fail?
            (lambda (e)
              (unless wrote-status?
                (fprintf out "ERR 0 ~a\n" (string-replace (exn-message e) "\n" " "))
                (flush-output out)))])
        (define full
          (chat the-cfg
                (list (cons 'system (car (daily-prompts stories date lang)))
                      (cons 'user (cdr (daily-prompts stories date lang))))
                #:max-tokens 3000
                #:on-delta (lambda (delta)
                             (status-ok!)
                             (display delta out)
                             (flush-output out))))
        ;; cache the daily digest with the same kv key layout digest.ts used
        (kv-set! (current-db) (string-append "daily:" date ":" lang) full)
        (status-ok!)))
    #:mime #"text/plain; charset=utf-8")]

  [(POST "api/open")
   (open-external [url string?])
   (unless (or (string-prefix? url "https://") (string-prefix? url "http://"))
     (raise-user-error 'open "only http(s) urls: ~a" url))
   (open-browser url)
   (hasheq 'ok #t)]

  [(POST "api/update/check")
   (update-check-r)
   (hasheq 'update (or (check-latest-release app-version) 'null))])

(module+ main
  (unless (single-instance? "hackdigest")
    (displayln "[hackdigest] another instance is running; exiting")
    (exit 1))

  (displayln (migrate-tauri-data!))
  (set-box! db-box (open-database (app-data-dir)))

  (run-app
   #:public-dir frontend-dist
   #:api api
   #:events bus
   ;; GLAZE_API_TOKEN pins a fixed token for dev/test automation; default
   ;; generates a random one exchanged for an HttpOnly cookie at boot.
   #:api-token (or (getenv "GLAZE_API_TOKEN") #t)
   #:title "HackDigest"
   #:width 1160
   #:height 800
   #:app-id "hackdigest"
   #:window-state #t))

(provide api bus)

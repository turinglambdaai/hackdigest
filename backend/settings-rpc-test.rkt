#lang racket/base

;; Tests for the settings security layer: BYOK key masking on reads,
;; sentinel restore on writes, and server-side config resolution.

(require json
         racket/file
         racket/port
         racket/string
         rackunit
         "data-files.rkt"
         "llm.rkt"
         "settings-rpc.rkt")

(define (roundtrip->jsexpr s)
  (read-json (open-input-string s)))

(test-case "BYOK key masked on read, hosted license key stays visible"
  (define tmp (make-temporary-file "hd-set-~a" 'directory))
  (putenv "HACKDIGEST_DATA_DIR" (path->string tmp))
  (dynamic-wind
    void
    (lambda ()
      ;; BYOK: masked
      (write-data-file "settings"
                       (jsexpr->string
                        (hasheq 'providerId "glm"
                                'llm (hasheq 'baseUrl "https://api.deepseek.com/v1"
                                             'apiKey "sk-real-secret"
                                             'model "deepseek-chat"))))
      (define masked
        (mask-settings-jsexpr! (roundtrip->jsexpr (read-data-file "settings"))))
      (check-equal? (hash-ref (hash-ref masked 'llm) 'apiKey) masked-key)
      (check-equal? (hash-ref (hash-ref masked 'llm) 'baseUrl) "https://api.deepseek.com/v1")

      ;; Hosted: visible (it doubles as the license key)
      (write-data-file "settings"
                       (jsexpr->string
                        (hasheq 'providerId "hosted"
                                'llm (hasheq 'baseUrl "https://hd.jrtx.site/v1"
                                             'apiKey "lic-123"
                                             'model "hosted"))))
      (define hosted
        (mask-settings-jsexpr! (roundtrip->jsexpr (read-data-file "settings"))))
      (check-equal? (hash-ref (hash-ref hosted 'llm) 'apiKey) "lic-123")

      ;; Empty BYOK key: nothing to mask
      (write-data-file "settings"
                       (jsexpr->string
                        (hasheq 'providerId "glm"
                                'llm (hasheq 'baseUrl "" 'apiKey "" 'model ""))))
      (define empty
        (mask-settings-jsexpr! (roundtrip->jsexpr (read-data-file "settings"))))
      (check-equal? (hash-ref (hash-ref empty 'llm) 'apiKey) ""))
    (lambda () (putenv "HACKDIGEST_DATA_DIR" ""))))

(test-case "masked write restores the stored key"
  (define tmp (make-temporary-file "hd-set2-~a" 'directory))
  (putenv "HACKDIGEST_DATA_DIR" (path->string tmp))
  (dynamic-wind
    void
    (lambda ()
      (write-data-file "settings"
                       (jsexpr->string
                        (hasheq 'providerId "glm"
                                'llm (hasheq 'baseUrl "https://x/v1"
                                             'apiKey "sk-keep-me"
                                             'model "m"))))
      ;; Page echoes the masked read back with an untouched key field
      (define page-write
        (hasheq 'providerId "glm"
                'llm (hasheq 'baseUrl "https://x/v1"
                             'apiKey masked-key
                             'model "m")))
      (define restored
        (unmask-settings-jsexpr! page-write))
      (check-equal? (hash-ref (hash-ref restored 'llm) 'apiKey) "sk-keep-me")
      ;; A real new key passes through untouched
      (define new-key
        (unmask-settings-jsexpr!
         (hasheq 'providerId "glm"
                 'llm (hasheq 'baseUrl "https://x/v1" 'apiKey "sk-new" 'model "m"))))
      (check-equal? (hash-ref (hash-ref new-key 'llm) 'apiKey) "sk-new"))
    (lambda () (putenv "HACKDIGEST_DATA_DIR" ""))))

(test-case "resolve-llm-config fills blanks from stored settings"
  (define tmp (make-temporary-file "hd-set3-~a" 'directory))
  (putenv "HACKDIGEST_DATA_DIR" (path->string tmp))
  (dynamic-wind
    void
    (lambda ()
      (write-data-file "settings"
                       (jsexpr->string
                        (hasheq 'providerId "glm"
                                'llm (hasheq 'baseUrl "https://stored/v1"
                                             'apiKey "sk-stored"
                                             'model "stored-model"))))
      ;; Page relays the masked/empty config it holds → stored wins
      (define resolved
        (resolve-llm-config (llm-config "https://stored/v1" masked-key "stored-model")))
      (check-equal? (llm-config-api-key resolved) "sk-stored")
      (check-equal? (llm-config-base-url resolved) "https://stored/v1")
      (check-equal? (llm-config-model resolved) "stored-model")
      ;; A real key typed but not yet saved (settings test button) wins
      (define fresh
        (resolve-llm-config (llm-config "https://fresh/v1" "sk-fresh" "m1")))
      (check-equal? (llm-config-api-key fresh) "sk-fresh"))
    (lambda () (putenv "HACKDIGEST_DATA_DIR" ""))))

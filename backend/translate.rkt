#lang racket/base

;; Translation + digest orchestration (port of packages/core/src/translate.ts
;; and digest.ts). The webview used to loop the batches in JS; R2 moves the
;; loops behind the API so comment threads heal, cache, and stream progress
;; server-side. Pure helpers (prompt builders, response-map parsers) are
;; separated from the network flows (which reuse backend/llm.rkt chat and a
;; caller-provided db connection for the translation cache).

(require db
         json
         racket/contract
         racket/list
         racket/match
         racket/string
         "db.rkt"
         "llm.rkt")

(provide
 (contract-out
  [lang-name (-> string? string?)]
  [system-prompt (-> string? string?)]
  [story-prompts (-> string? (or/c string? #f) string? (cons/c string? string?))]
  [comments-prompts (-> string? (listof (cons/c exact-integer? string?)) (cons/c string? string?))]
  [titles-prompts (-> string? (listof (cons/c exact-integer? string?)) (cons/c string? string?))]
  [thread-prompts (-> (hash/c symbol? jsexpr?) (listof (hash/c symbol? jsexpr?)) string? (cons/c string? string?))]
  [tldr-prompts (-> (hash/c symbol? jsexpr?) string? (cons/c string? string?))]
  [daily-prompts (-> (listof (hash/c symbol? jsexpr?)) string? string? (cons/c string? string?))]
  [extract-id-map (-> jsexpr? (hash/c exact-integer? string?))]
  [translate-story (-> connection? llm-config? (hash/c symbol? jsexpr?) string? (hash/c symbol? jsexpr?))]
  [translate-titles (-> connection? llm-config? (listof (hash/c symbol? jsexpr?)) string?
                         (hash/c exact-integer? string?))]
  [translate-comments (-> connection? llm-config?
                          (listof (cons/c exact-integer? string?)) string?
                          (-> (hash/c exact-integer? string?) exact-integer? exact-integer? any/c)
                          exact-integer?)]))

;; ---- translate prompts --------------------------------------------------------

(define (lang-name lang)
  (match lang
    ["zh" "Simplified Chinese (简体中文)"]
    ["zh-TW" "Traditional Chinese (繁體中文)"]
    ["ja" "Japanese (日本語)"]
    ["ko" "Korean (한국어)"]
    ["en" "English"]
    [_ lang]))

(define (system-prompt lang)
  (string-join
   (list (format "You are a professional translator for Hacker News content into ~a." (lang-name lang))
         "You translate faithfully and idiomatically for developers: correct technical terminology, natural tone, never add opinions or notes."
         "Always answer with a single JSON object and nothing else.")
   " "))

(define (story-prompts title text lang)
  (define user
    (string-append
     "Translate this Hacker News story into " (lang-name lang)
     ". Keep HTML tags intact, translate only text nodes. Keep proper nouns, product names, and code as-is.\n"
     "Return JSON: {\"title\": \"...\", \"text\": \"...\"} — text is \"\" when the story has no self text.\n"
     "TITLE: " title "\n"
     (if (string? text) (format "TEXT (HTML): ~a" text) "TEXT: (none)")))
  (cons (system-prompt lang) user))

(define comments-max-chars 1500)

(define (comments-prompts lang items)
  (define user
    (string-join
     (list (format "Translate each Hacker News comment below into ~a." (lang-name lang))
           "Keep the [id] markers and HTML tags intact; translate only text nodes. Keep proper nouns and code as-is."
           "Return JSON: {\"t\": {\"<id>\": \"<translated HTML>\", ...}} with one entry per input id."
           (string-join
            (for/list ([item (in-list items)])
              (match-define (cons id text) item)
              (format "[~a] ~a" id (substring text 0 (min comments-max-chars (string-length text)))))
            "\n\n"))
     "\n"))
  (cons (system-prompt lang) user))

(define (titles-prompts lang items)
  (define user
    (string-join
     (list (format "Translate each Hacker News story title below into ~a." (lang-name lang))
           "Keep the [id] markers. Keep product/company names and technical terms recognizable."
           "Return JSON: {\"t\": {\"<id>\": \"<translated title>\"}}"
           (string-join
            (for/list ([item (in-list items)])
              (match-define (cons id title) item)
              (format "[~a] ~a" id title))
            "\n"))
     "\n"))
  (cons (system-prompt lang) user))

;; {"t": {"<id>": "text"}} → hash id→string; bracket-wrapped ids are cleaned,
;; entries without a parseable id or with empty text are dropped (llm.ts parity).
(define (extract-id-map j)
  (define t (and (hash? j) (hash-ref j 't #f)))
  (if (hash? t)
      (for/hash ([(k v) (in-hash t)]
                 #:do [(define id
                         (string->number
                          (string-trim
                           (string-replace (string-replace (format "~a" k) "[" "") "]" ""))))]
                 #:when (and id (string? v) (not (string=? v ""))))
        (values id v))
      (hasheq)))

;; One translation round trip with the shared two-attempt JSON retry
;; (model output often wraps JSON in fences/prose; retry once, then fail).
(define (translate-json! cfg prompts max-tokens)
  (let loop ([attempt 0])
    (define raw
      (chat cfg
            (list (cons 'system (car prompts)) (cons 'user (cdr prompts)))
            #:json-mode #t
            #:max-tokens max-tokens))
    (with-handlers ([exn:llm? (lambda (e) (if (< attempt 1) (loop 1) (raise e)))])
      (extract-id-map (extract-json raw)))))

;; ---- story ------------------------------------------------------------------

(define (translate-story conn cfg story lang)
  (define id (hash-ref story 'id))
  (define cached-title (hash-ref story 'title ""))
  (define cached-text (let ([t (hash-ref story 'text #f)]) (if (string? t) t #f)))
  (define-values (t0 x0) (translation-get conn id lang))
  (if (or t0 x0)
      (hasheq 'title (or t0 "") 'text (or x0 ""))
      (let* ([prompts (story-prompts cached-title cached-text lang)]
             [raw (translate-json! cfg prompts 3000)]
             [title (let ([v (hash-ref raw 'title #f)]) (if (string? v) v #f))]
             [text (let ([v (hash-ref raw 'text #f)]) (if (and (string? v) (not (string=? v ""))) v #f))])
        (translations-put! conn (list (list id lang (llm-config-model cfg) title text)))
        (hasheq 'title (or title "") 'text (or text "")))))

;; ---- titles -------------------------------------------------------------------

;; 30 titles per request (llm.ts parity); cached titles return immediately.
(define (translate-titles conn cfg stories lang)
  (define pending
    (for/list ([s (in-list stories)]
               #:unless (let-values ([(t x) (translation-get conn (hash-ref s 'id) lang)])
                          t))
      (cons (hash-ref s 'id) (hash-ref s 'title ""))))
  (define out
    (for/hash ([s (in-list stories)]
               #:when (let-values ([(t x) (translation-get conn (hash-ref s 'id) lang)]) t))
      (values (hash-ref s 'id)
              (let-values ([(t x) (translation-get conn (hash-ref s 'id) lang)]) t))))
  (let loop ([pending pending] [acc out])
    (if (null? pending)
        acc
        (let* ([slice (take pending (min 30 (length pending)))]
               [rest (drop pending (min 30 (length pending)))]
               [map (translate-json! cfg (titles-prompts lang slice) 4000)]
               [_ (translations-put! conn
                                     (for/list ([item (in-list slice)] #:when (hash-has-key? map (car item)))
                                       (list (car item) lang (llm-config-model cfg) (hash-ref map (car item)) #f)))]
               [acc2 (for/fold ([a acc]) ([(k v) (in-hash map)]) (hash-set a k v))])
          (loop rest acc2)))))

;; ---- comments (self-healing batches) ---------------------------------------------

(define comments-batch-size 20)

;; Pending comments flow through bisecting workers: a failing batch is split
;; and retried down to single comments; single-comment failures count toward
;; the returned failure count (partial success wins over aborting, llm.ts
;; parity). progress is called once per successful batch with the id→html map
;; and cumulative (done total) counters; cached hits were delivered before
;; this returns, so done starts from the cache count.
(define (translate-comments conn cfg items lang progress)
  (define ids (map car items))
  (define text-of (make-hash (for/list ([i (in-list items)]) (cons (car i) (cdr i)))))
  (define cached (translations-get-batch conn ids lang))
  (define text-of-cached (make-hash (for/list ([row (in-list cached)]) (cons (first row) (or (third row) "")))))
  (for ([row (in-list cached)])
    (progress (hasheq (first row) (or (third row) "")) 0 (length items)))
  (define pending
    (for/list ([id (in-list ids)] #:unless (hash-has-key? text-of-cached id))
      id))
  (define done-box (box (length cached)))
  (define failed-box (box 0))
  (define (run-slice! slice)
    (define prompts
      (comments-prompts lang (for/list ([id (in-list slice)]) (cons id (hash-ref text-of id "")))))
    (with-handlers
        ([exn:llm?
          (lambda (e)
            (cond
              [(= (length slice) 1)
               (set-box! done-box (add1 (unbox done-box)))
               (set-box! failed-box (add1 (unbox failed-box)))
               (progress (hasheq) (unbox done-box) (length items))]
              [else
               (define mid (ceiling (/ (length slice) 2)))
               (run-slice! (take slice mid))
               (run-slice! (drop slice mid))]))])
      (define map (translate-json! cfg prompts 8000))
      (translations-put! conn
                         (for/list ([id (in-list slice)] #:when (hash-has-key? map id))
                           (list id lang (llm-config-model cfg) #f (hash-ref map id))))
      (set-box! done-box (+ (unbox done-box) (length slice)))
      (progress
       (for/hash ([id (in-list slice)] #:when (hash-has-key? map id))
         (values id (hash-ref map id)))
       (unbox done-box)
       (length items))))
  ;; two workers pull slices from a shared cursor (llm.ts parity)
  (define cursor (box 0))
  (define (worker)
    (let loop ()
      (define start
        (let ([v (unbox cursor)])
          (when (< v (length pending)) (set-box! cursor (+ v comments-batch-size)))
          (and (< v (length pending)) v)))
      (when start
        (run-slice! (take (drop pending start) (min comments-batch-size (- (length pending) start))))
        (loop))))
  (define w1 (thread worker))
  (define w2 (thread worker))
  (thread-wait w1)
  (thread-wait w2)
  (unbox failed-box))

;; ---- digest prompts -------------------------------------------------------------

(define thread-max-comments 150)
(define thread-max-chars-per-comment 600)

(define (strip-tags s)
  (regexp-replace* #px"<[^>]+>" s " "))

(define (clip s n)
  (substring s 0 (min n (string-length s))))

(define (thread-prompts story comments lang)
  (define picked (take comments (min thread-max-comments (length comments))))
  (define rendered
    (string-join
     (for/list ([c (in-list picked)])
       (format "- (~a, score~a): ~a"
               (let ([b (hash-ref c 'by #f)]) (if (string? b) b "?"))
               (hash-ref c 'score "")
               (clip (strip-tags (let ([t (hash-ref c 'text #f)]) (if (string? t) t "")))
                     thread-max-chars-per-comment)))
     "\n"))
  (define sys
    (string-join
     (list (format "You are an analyst who reads Hacker News threads and writes a sharp, structured digest in ~a." (lang-name lang))
           "Markdown output. Be concrete and cite usernames for notable points. No filler, no summary-of-the-summary.")
     " "))
  (define story-line
    (format "STORY: ~a~a"
            (hash-ref story 'title "")
            (let ([u (hash-ref story 'url #f)]) (if (string? u) (format " (~a)" u) ""))))
  (define story-text-line
    (let ([t (hash-ref story 'text #f)])
      (if (string? t) (format "STORY TEXT: ~a" (clip (strip-tags t) 2000)) "")))
  (define user
    (string-join
     (list story-line
           story-text-line
           (format "COMMENTS (~a of ~a):" (length picked) (length comments))
           rendered
           ""
           "Write the digest with exactly these sections:"
           "## 背景"
           "1-2 sentences: what is being discussed and why it is on HN."
           "## 主要观点"
           "Bullet list of the strongest arguments, grouped as 支持方 / 反对方 / 中立 where applicable. Cite usernames."
           "## 值得一看"
           "2-4 standout comments with author and a one-line reason each."
           "## 一句话结论"
           "One sentence: where the community landed.")
     "\n"))
  (cons sys user))

(define (tldr-prompts story lang)
  (cons (format "You write tight TL;DRs of technical posts in ~a. Markdown, max 150 words, end with one line starting with \"要点：\" listing 3 key takeaways as short bullets on that line."
                (lang-name lang))
        (string-join
         (list (format "TITLE: ~a" (hash-ref story 'title ""))
               (let ([t (hash-ref story 'text #f)])
                 (if (string? t) (format "TEXT: ~a" (clip t 8000)) "(no self text)")))
         "\n")))

(define (daily-prompts stories date lang)
  (define sys
    (string-join
     (list (format "You are the editor of a daily Hacker News briefing in ~a." (lang-name lang))
           "Markdown. Group stories into 3-5 thematic sections with ## headings (in the target language). Under each, list stories as: `- **中文标题**（原文分数/评论数，域名）— 一句话为什么值得看`."
           "You may skip irrelevant stories; never invent ones. End with a section \"## 编者注\" of 2 sentences on the overall theme of the day.")
     " "))
  (define user
    (string-join
     (list (format "Today's top stories (~a):" date)
           (string-join
            (for/list ([s (in-list stories)])
              (format "- [~a] ~a (~a pts, ~a comments~a)"
                      (hash-ref s 'id 0)
                      (hash-ref s 'title "")
                      (hash-ref s 'score 0)
                      (hash-ref s 'comments 0)
                      (let ([d (hash-ref s 'domain #f)]) (if (string? d) (format ", ~a" d) ""))))
            "\n"))
     "\n"))
  (cons sys user))

#lang racket/base

;; Online update support (R3 of the Glaze migration) — the family pattern
;; (taskly/syncpilot): the backend verifies and downloads the Ed25519-signed
;; update artifact; the frontend drives the flow through /api/update/*.
;;
;; Two building blocks, chosen deliberately:
;;   - glaze/update provides the signed-manifest schema, JSON validation and
;;     platform/arch selection. The wrapper format is the family feed
;;     ({schema, payload, signature{ed25519, key_id, value}}), identical to
;;     what taskly's rivet/distribution clients verify. Adopting it here is
;;     exactly what the upstream resolution of glaze#47 asks for.
;;   - the `crypto` package (pinned to the libcrypto factory) provides
;;     Ed25519 and SHA-256 through the libcrypto library that ships inside
;;     the Racket distribution itself. glaze/signing shells out to the
;;     `openssl` CLI instead, which silently breaks on stock macOS (PATH
;;     resolves to LibreSSL, which has no `pkeyutl -rawin`) and on Windows
;;     (no CLI at all) — so the signature and digest primitives here do
;;     what rivet/distribution/crypto.rkt does: FFI, no subprocesses.
;;
;; Download and install run on a background thread with progress published
;; to a state box that the UI polls through /api/update/state. Installation
;; handover per platform: macOS swaps the .app bundle in place (atomic
;; renames, .old backup, relaunch); Windows unpacks beside the install dir
;; and hands off to update-install.cmd (wait-for-exit, .old swap, restart,
;; failure marker); Linux stops at the downloaded tar.gz and the frontend
;; offers to reveal the folder — the family rule for archive installs.
;; MSI/DMG installs (not writable without elevation) never enter the
;; download path: they get the honest "open the release page" mode.

(require crypto
         (only-in crypto/libcrypto libcrypto-factory)
         glaze/update
         net/base64
         net/url
         racket/file
         racket/list
         racket/match
         racket/path
         racket/port
         racket/string
         racket/system
         "platform.rkt"
         "update-check.rkt")

;; rivet/distribution pins the provider set to libcrypto at module load and
;; deliberately avoids crypto/all — factory FFIs load at import time and the
;; gmp factory kills packaged runtimes on hosts without libgmp. Same rule
;; here: this module runs inside the packaged app on every desktop target.
(crypto-factories (list libcrypto-factory))

(provide current-app-version
         current-update-base-url
         current-rollout-bucket
         app-identifier
         update-key-id
         updates-dir
         ensure-updates-dir!
         install-mode
         platform-symbol
         architecture-symbol
         installer-extension
         manifest-url
         update-state-snapshot
         reset-update-state!
         set-update-error!
         surface-install-failure!
         ed25519-verify-message
         verify-manifest-signature
         verify-artifact!
         bundle-from-exe-path
         resolve-self-path
         perform-check!
         check-response
         start-download!
         install-downloaded!)

;; ---------- release identity ----------

;; application_id inside the signed manifest (glaze build derives the same
;; io.glaze.<name> identifier; the MSI pins TuringLambda.HackDigest, which
;; is a packaging id, not the update identity).
(define app-identifier "io.glaze.HackDigest")

(define update-key-id "hackdigest-2026-10")

;; SubjectPublicKeyInfo DER, base64 — generated once by
;; scripts/update-keys.sh. The private half lives outside the repository
;; (and in the CI secret UPDATE_ED25519_PRIVATE_KEY) and never ships.
;; Rotate by shipping a build that trusts the next key before signing
;; releases exclusively with it.
(define update-public-key-b64
  "MCowBQYDK2VwAyEAcshR7nXbmU39dhzwvT9iqLxM4WJp4b88IzMLHGP+HRI=")

(define app-display-name "HackDigest")
(define release-page-base
  "https://github.com/turinglambdaai/hackdigest/releases")

(define maximum-download-bytes (* 800 1024 1024))

;; Set from backend/main.rkt (the release gate greps app-version there);
;; HACKDIGEST_FAKE_VERSION overrides it so the real update flow against a
;; published release can be exercised locally (test seam, cf. taskly's
;; current-update-base-url).
(define current-app-version (make-parameter "0.0.0"))

;; The release pipeline pins artifact URLs to the concrete tag; the
;; manifest itself is always fetched from the moving "latest" location.
;; Tests point this at an unreachable/local URL instead of the network.
(define current-update-base-url (make-parameter #f))

(define default-update-base-url
  (string-append release-page-base "/latest/download"))

;; Sticky staged-rollout bucket 0..99; main.rkt seeds it from the kv store
;; once per launch so an installation stays in the same bucket.
(define current-rollout-bucket (make-parameter 0))

;; ---------- crypto primitives (libcrypto FFI, no CLI) ----------

(define (bytes->base64-string value)
  (bytes->string/utf-8 (base64-encode value #"")))

(define (base64-string->bytes value)
  (base64-decode (string->bytes/utf-8 value)))

(define (embedded-public-key)
  (datum->pk-key (base64-string->bytes update-public-key-b64)
                 'SubjectPublicKeyInfo))

(define (sha256-file/hex path)
  (bytes->hex-string
   (call-with-input-file path (lambda (in) (digest 'sha256 in)) #:mode 'binary)))

;; Pure Ed25519 over the exact message bytes — the same signature rivet's
;; ed25519-sign produces, so the family feed verifies on both lines.
(define (ed25519-verify-message message signature-b64
                                #:public-key [public-key (embedded-public-key)])
  (define signature
    (with-handlers ([exn:fail? (lambda (_) #f)])
      (base64-string->bytes (string-trim signature-b64))))
  (and signature
       (= (bytes-length signature) 64)
       (pk-verify public-key message signature)))

;; Size + SHA-256 of a downloaded artifact against the signed manifest.
;; Deliberately not glaze's verify-update-artifact!: that function digests
;; through the system openssl CLI (LibreSSL on stock macOS, absent on
;; Windows), while this uses the bundled libcrypto.
(define (verify-artifact! candidate path)
  (define artifact (update-candidate-artifact candidate))
  (define expected-size (update-artifact-size artifact))
  (define actual-size (file-size path))
  (unless (= actual-size expected-size)
    (raise-arguments-error 'verify-artifact!
                           "download size does not match signed manifest"
                           "expected" expected-size
                           "actual" actual-size))
  (define expected-sha (string-downcase (update-artifact-sha256 artifact)))
  (define actual-sha (string-downcase (sha256-file/hex path)))
  (unless (string=? actual-sha expected-sha)
    (raise-arguments-error 'verify-artifact!
                           "download SHA-256 does not match signed manifest"
                           "expected" expected-sha
                           "actual" actual-sha))
  path)

;; Parse a signed wrapper (glaze/update JSON validation included), then
;; verify the payload signature against the embedded release key. Returns
;; the manifest or raises. #:public-key lets tests inject a fixture key.
(define (verify-manifest-signature input
                                   #:key-id [expected-key-id update-key-id]
                                   #:public-key [public-key (embedded-public-key)])
  (define-values (manifest payload key-id signature)
    (read-signed-update-manifest input))
  (when (and expected-key-id (not (string=? expected-key-id key-id)))
    (raise-arguments-error 'verify-manifest-signature
                           "manifest was signed by an unexpected key"
                           "expected" expected-key-id
                           "actual" key-id))
  (unless (ed25519-verify-message payload signature #:public-key public-key)
    (error 'verify-manifest-signature
           "Ed25519 manifest signature verification failed"))
  manifest)

;; ---------- platform identity ----------

;; glaze/rivet release tooling emits these exact symbols into manifests
(define (platform-symbol)
  (case (system-type 'os)
    [(macosx) 'macos]
    [(windows) 'windows]
    [else 'linux]))

(define (architecture-symbol)
  (case (system-type 'arch)
    [(aarch64 arm64) 'arm64]
    [else 'x64]))

(define (installer-extension)
  (case (system-type 'os)
    [(macosx) ".zip"]
    [(windows) ".zip"]
    [else ".tar.gz"]))

(define (manifest-url)
  (string-append
   (string-trim (or (current-update-base-url) default-update-base-url)
                "/" #:right? #t)
   "/update-manifest.json"))

;; ---------- paths ----------

(define (updates-dir)
  (build-path (app-data-dir) "updates"))

(define (ensure-updates-dir!)
  (define dir (updates-dir))
  (make-directory* dir)
  dir)

;; Pure self-path resolution: argv[0]-style paths can be relative while a
;; launcher has already changed the working directory by the time the
;; updater runs — resolve those against the launch-time CWD ('orig-dir),
;; never the current one. (Unit-tested; unit-testable on purpose.)
(define (resolve-self-path raw orig-dir)
  (simplify-path
   (if (relative-path? raw)
       (path->complete-path raw orig-dir)
       raw)))

;; The running executable, not resolving symlinks (a symlinked install
;; still lives where its real path says).
(define (current-executable)
  (resolve-self-path (find-system-path 'run-file)
                     (find-system-path 'orig-dir)))

;; Pure bundle detection: does this executable path live inside a macOS
;; .app bundle? (Unit-tested; the match-on-'Contents-symbol trap lives
;; here no longer.)
(define (bundle-from-exe-path exe)
  (define parts (explode-path exe))
  (define n (length parts))
  (and (>= n 4)
       (equal? (list-ref parts (- n 3)) (string->path "Contents"))
       (equal? (list-ref parts (- n 2)) (string->path "MacOS"))
       (let ([app (list-ref parts (- n 4))])
         (and (string-suffix? (path->string app) ".app") app))))

;; The .app bundle when running packaged on macOS, e.g.
;; /Applications/HackDigest.app; #f in dev (run-file is the racket binary).
(define (current-app-bundle)
  (bundle-from-exe-path (current-executable)))

(define (current-exe-dir)
  (path-only (current-executable)))

(define (dir-writable? dir)
  (and dir
       (with-handlers ([exn:fail? (lambda (_) #f)])
         (define probe (build-path dir ".hackdigest-write-test"))
         (call-with-output-file probe #:exists 'truncate void)
         (delete-file probe)
         #t)))

;; How this installation can update:
;;   in-place — portable mac/win install we can swap ourselves
;;   manual   — Linux archive install: download, then hand-extract
;;   page     — installer-based (DMG/MSI) or dev checkout: not writable
;;              without elevation, so point at the release page instead
(define (install-mode)
  (case (system-type 'os)
    [(macosx)
     (if (and (current-app-bundle)
              (dir-writable? (path-only (current-app-bundle))))
         'in-place
         'page)]
    [(windows)
     (if (dir-writable? (current-exe-dir)) 'in-place 'page)]
    [else 'manual]))

;; ---------- shared update state (polled by the frontend) ----------

;; phase: idle | checking | downloading | downloaded | error
(define update-state
  (box (hasheq 'phase "idle"
               'percent 0
               'message #f
               'downloadedPath #f
               'availableVersion #f)))

(define candidate-box (box #f))
(define worker-thread-box (box #f))

(define (state-set! key value)
  (set-box! update-state (hash-set (unbox update-state) key value)))

(define (update-state-snapshot)
  (unbox update-state))

(define (reset-update-state!)
  (set-box! candidate-box #f)
  (set-box! update-state
            (hasheq 'phase "idle"
                    'percent 0
                    'message #f
                    'downloadedPath #f
                    'availableVersion #f)))

(define (set-update-error! message)
  (state-set! 'phase "error")
  (state-set! 'message message))

;; Windows handover failures write <updates>/install-failed.marker; the
;; next launch reports them here instead of silently swallowing a broken
;; swap. Cleared by the next successful check.
(define (surface-install-failure!)
  (define marker (build-path (ensure-updates-dir!) "install-failed.marker"))
  (when (file-exists? marker)
    (define detail
      (string-trim (file->string marker)))
    (state-set! 'phase "error")
    (state-set! 'message
                (if (string=? detail "")
                    "the previous update install failed"
                    (format "the previous update install failed: ~a" detail)))))

;; ---------- check ----------

;; Shape the /api/update/check response. Falls back to the R1 GitHub-API
;; check when the signed feed is unavailable (a release published without
;; the signing secret, for instance) — those updates degrade honestly to
;; release-page mode rather than to a dead end.
(define (check-response)
  (define result (perform-check!))
  (define status (hash-ref result 'status))
  (cond
    [(string=? status "available")
     (hasheq 'update
             (hasheq 'version (hash-ref result 'availableVersion)
                     'url (hash-ref result 'url)
                     'mode (hash-ref result 'mode)
                     'sizeBytes (hash-ref result 'sizeBytes))
             'currentVersion (current-app-version))]
    [(string=? status "up-to-date")
     (hasheq 'update 'null 'currentVersion (current-app-version))]
    [else
     (define legacy (check-latest-release (current-app-version)))
     (hasheq 'update
             (if legacy
                 (hasheq 'version (hash-ref legacy 'version)
                         'url (hash-ref legacy 'url)
                         'mode "page")
                 'null)
             'currentVersion (current-app-version))]))

;; Fetches and verifies the signed manifest, selects this platform's
;; artifact, and stores the candidate for start-download!. Returns a plain
;; hasheq; the route layer maps it onto the JSON response. Never raises.
(define (perform-check!)
  (reset-update-state!)
  (state-set! 'phase "checking")
  (with-handlers
      ([exn:fail?
        (lambda (e)
          (state-set! 'phase "idle")
          (hasheq 'status "error" 'message (exn-message e)))])
    (define in (get-pure-port (string->url (manifest-url))
                              '("User-Agent: HackDigest-Updater/1")
                              #:redirections 10))
    (define manifest
      (dynamic-wind
        void
        (lambda ()
          ;; The manifest is small; bound it well above any realistic feed.
          (define payload (port->bytes in))
          (when (> (bytes-length payload) (* 4 1024 1024))
            (error 'perform-check! "update manifest exceeds 4 MiB"))
          (verify-manifest-signature (open-input-bytes payload)))
        (lambda () (close-input-port in))))
    (define config
      (updater-config app-identifier
                      (current-app-version)
                      'stable
                      (platform-symbol)
                      (architecture-symbol)
                      (embedded-public-key)
                      update-key-id
                      (current-rollout-bucket)
                      maximum-download-bytes))
    (define candidate (select-update config manifest))
    (cond
      [candidate
       (set-box! candidate-box candidate)
       (define artifact (update-candidate-artifact candidate))
       (define version
         (update-manifest-version (update-candidate-manifest candidate)))
       (state-set! 'phase "idle")
       (state-set! 'availableVersion version)
       (hasheq 'status "available"
               'currentVersion (current-app-version)
               'availableVersion version
               'build (update-manifest-build (update-candidate-manifest candidate))
               'publishedAt (update-manifest-published-at (update-candidate-manifest candidate))
               'installer (symbol->string (update-artifact-installer artifact))
               'sizeBytes (update-artifact-size artifact)
               'mode (symbol->string (install-mode))
               'url (string-append release-page-base "/tag/v" version))]
      [else
       (state-set! 'phase "idle")
       (state-set! 'availableVersion #f)
       (hasheq 'status "up-to-date" 'currentVersion (current-app-version))])))

;; ---------- download ----------

(define (destination-path candidate)
  (define version
    (update-manifest-version (update-candidate-manifest candidate)))
  (build-path (ensure-updates-dir!)
              (string-append app-display-name "-" version
                             (installer-extension))))

;; Streams with integer-percent progress; same limits as glaze's
;; download-update. GitHub release asset URLs redirect to the CDN, so
;; follow redirections (the 302-into-an-empty-body trap).
(define (download-with-progress! candidate destination)
  (define artifact (update-candidate-artifact candidate))
  (define total (update-artifact-size artifact))
  (when (> total maximum-download-bytes)
    (error 'download-update "signed artifact size exceeds the download limit"))
  (unless (string-prefix? (update-artifact-url artifact) "https://")
    (error 'download-update "signed artifact URL must use HTTPS"))
  (make-parent-directory* destination)
  (define temporary (path-add-extension destination #".partial"))
  (when (file-exists? temporary) (delete-file temporary))
  (with-handlers ([exn:fail?
                   (lambda (e)
                     (when (file-exists? temporary) (delete-file temporary))
                     (raise e))])
    (define in (get-pure-port (string->url (update-artifact-url artifact))
                              '("User-Agent: HackDigest-Updater/1")
                              #:redirections 10))
    (dynamic-wind
      void
      (lambda ()
        (call-with-output-file temporary
          #:exists 'truncate/replace
          #:mode 'binary
          (lambda (out)
            (define buffer (make-bytes 65536))
            (let loop ([done 0] [last-percent -1])
              (define count (read-bytes-avail! buffer in))
              (unless (eof-object? count)
                (write-bytes buffer out 0 count)
                (define next (+ done count))
                (when (> next maximum-download-bytes)
                  (error 'download-update "update exceeds configured download limit"))
                (define percent
                  (if (> total 0) (min 100 (quotient (* next 100) total)) 0))
                (when (> percent last-percent) (state-set! 'percent percent))
                (loop next percent))))))
      (lambda () (close-input-port in)))
    ;; size + SHA-256 against the signed manifest before the file is trusted
    (verify-artifact! candidate temporary)
    (rename-file-or-directory temporary destination #t)
    destination))

;; Runs on a backend worker thread; the frontend follows progress via
;; /api/update/state. Never raises: failures surface through the phase.
(define (start-download!)  (define worker (unbox worker-thread-box))
  (when (and worker (thread-running? worker))
    (error 'start-download! "an update download is already running"))
  (define candidate (unbox candidate-box))
  (unless candidate
    (error 'start-download! "no update is available; run a check first"))
  (state-set! 'phase "downloading")
  (state-set! 'percent 0)
  (state-set! 'message #f)
  (define destination (destination-path candidate))
  (set-box! worker-thread-box
            (thread
             (lambda ()
               (with-handlers
                   ([exn:fail?
                     (lambda (e)
                       (state-set! 'phase "error")
                       (state-set! 'message (exn-message e)))])
                 (define path (download-with-progress! candidate destination))
                 (state-set! 'phase "downloaded")
                 (state-set! 'percent 100)
                 (state-set! 'downloadedPath (path->string path)))))))

;; ---------- install handover ----------
;;
;; The frontend calls /api/update/install once the phase reaches
;; "downloaded". macOS and Windows swap the portable install themselves and
;; restart; Linux stops at "reveal the downloaded archive" — the family
;; rule for tar.gz installs. Everything here runs on the API thread and
;; must answer before the process goes away, so exits are scheduled on a
;; delay thread.

;; Respond first, die second: the route returns the hasheq and this thread
;; tears the process down once the response is on the wire.
(define (schedule-exit! [delay-secs 1])
  (thread (lambda () (sleep delay-secs) (exit 0))))

;; ---- macOS: ditto unpack, atomic .app swap, relaunch ----

(define (staged-app-in dir)
  (for/first ([entry (in-list (directory-list dir #:build? #t))]
              #:when (and (directory-exists? entry)
                          (string-suffix? (path->string entry) ".app")))
    entry))

(define (install-macos! zip-path)
  (define bundle (current-app-bundle))
  (unless bundle (error 'install "not running from a packaged .app bundle"))
  (define parent (path-only bundle))
  (unless (dir-writable? parent)
    (error 'install "the install location is not writable"))
  (define backup
    (build-path parent
                (string-append (path->string (last (explode-path bundle)))
                               ".old")))
  (define stamp (number->string (current-seconds)))
  ;; Same parent as the bundle → the two renames below stay on one volume.
  (define staging (build-path parent (string-append ".hackdigest-update-" stamp)))
  (when (directory-exists? staging) (delete-directory/files staging))
  (make-directory* staging)
  (define unpacked?
    (zero? (system*/exit-code "/usr/bin/ditto" "-x" "-k"
                              (path->string zip-path) (path->string staging))))
  (unless (and unpacked? (staged-app-in staging))
    (delete-directory/files staging)
    (error 'install "the downloaded update does not contain a .app bundle"))
  (when (directory-exists? backup) (delete-directory/files backup))
  (rename-file-or-directory bundle backup)
  (with-handlers
      ([exn:fail?
        (lambda (e)
          ;; Put the running bundle back; keep the broken update in .old
          ;; (and the staging tree) for inspection.
          (with-handlers ([exn:fail? void])
            (rename-file-or-directory backup bundle))
          (with-handlers ([exn:fail? void])
            (delete-directory/files staging))
          (raise e))])
    (rename-file-or-directory (staged-app-in staging) bundle))
  (delete-directory/files staging)
  ;; A detached shell waits for this process to disappear ($PPID) and then
  ;; reopens the replaced bundle — the new app's single-instance guard
  ;; needs the old process gone first.
  (subprocess #f (current-output-port) (current-error-port)
              "/bin/sh" "-c"
              "while kill -0 $PPID 2>/dev/null; do sleep 0.3; done\nexec /usr/bin/open \"$1\"\n"
              "sh" (path->string bundle))
  (schedule-exit!)
  (hasheq 'ok #t 'restarting #t))

;; ---- Windows: unpack beside the install dir, cmd handover ----

(define (powershell-quote text)
  (string-replace text "'" "''"))

;; Expand-Archive via PowerShell; the release zip carries one top-level
;; directory (hackdigest-<version>-windows-x64/), so the staged root is the
;; directory holding the extracted HackDigest.exe.
(define (windows-unpack! zip-path staging)
  (define ok
    (zero? (system*/exit-code
            "powershell" "-NoProfile" "-NonInteractive" "-Command"
            (format "Expand-Archive -LiteralPath '~a' -DestinationPath '~a' -Force"
                    (powershell-quote (path->string zip-path))
                    (powershell-quote (path->string staging))))))
  (unless ok (error 'install "could not unpack the downloaded update"))
  (define exe
    (for/first ([p (in-list (find-files (lambda (_) #t) staging))]
                #:when (equal? (path->string (last (explode-path p)))
                               "HackDigest.exe"))
      p))
  (unless exe
    (error 'install "the downloaded update contains no HackDigest.exe"))
  (path-only exe))

;; The handover waits for the running app to die without needing a pid: a
;; directory holding a running .exe cannot be moved, so the swap move acts
;; as its own completion signal (60 tries ≈ 60s, then fail + marker).
(define (windows-handover-script install-dir staged-root updates-dir)
  (define install (path->string install-dir))
  (define log (path->string (build-path updates-dir "install.log")))
  (define marker (path->string (build-path updates-dir "install-failed.marker")))
  (string-append
   "@echo off\r\n"
   "setlocal EnableExtensions\r\n"
   "set \"LOG=" log "\"\r\n"
   "set \"MARKER=" marker "\"\r\n"
   "set \"INSTALL=" install "\"\r\n"
   "set \"OLD=" install ".old\"\r\n"
   "set \"STAGED=" (path->string staged-root) "\"\r\n"
   "set \"EXE=" install "\\HackDigest.exe\"\r\n"
   "set /a TRIES=0\r\n"
   "echo %date% %time% update handover>\"%LOG%\"\r\n"
   "if exist \"%OLD%\" rmdir /s /q \"%OLD%\"\r\n"
   ":wait\r\n"
   "move /y \"%INSTALL%\" \"%OLD%\" >nul 2>&1\r\n"
   "if not errorlevel 1 goto swapped\r\n"
   "set /a TRIES=TRIES+1\r\n"
   "if %TRIES% GTR 60 goto rollback\r\n"
   "ping -n 2 127.0.0.1 >nul\r\n"
   "goto wait\r\n"
   ":swapped\r\n"
   "move /y \"%STAGED%\" \"%INSTALL%\" >>\"%LOG%\" 2>&1\r\n"
   "if errorlevel 1 goto rollback\r\n"
   "echo %date% %time% installed>>\"%LOG%\"\r\n"
   "start \"\" \"%EXE%\"\r\n"
   "del \"%~f0\"\r\n"
   "exit /b 0\r\n"
   ":rollback\r\n"
   "echo %date% %time% staged tree move failed; rolling back>>\"%LOG%\"\r\n"
   "move /y \"%OLD%\" \"%INSTALL%\" >nul 2>&1\r\n"
   "echo the staged update tree could not be moved into place; the previous install was restored>\"%MARKER%\"\r\n"
   "exit /b 1\r\n"))

(define (install-windows! zip-path)
  (define install-dir (current-exe-dir))
  (unless (dir-writable? install-dir)
    (error 'install "the install location is not writable"))
  (define parent (path-only install-dir))
  (define stamp (number->string (current-seconds)))
  ;; Same parent as the install dir → same volume for the cmd's moves.
  (define staging (build-path parent (string-append ".hackdigest-update-" stamp)))
  (when (directory-exists? staging) (delete-directory/files staging))
  (make-directory* staging)
  (define staged-root (windows-unpack! zip-path staging))
  (define updates (ensure-updates-dir!))
  (define script-path (build-path updates "update-install.cmd"))
  (call-with-output-file script-path
    (lambda (out) (display (windows-handover-script install-dir staged-root updates) out))
    #:exists 'truncate/replace)
  ;; Detached: the handover outlives this process on purpose.
  (subprocess #f (current-output-port) (current-error-port)
              "cmd" "/c" (path->string script-path))
  (schedule-exit!)
  (hasheq 'ok #t 'restarting #t))

;; ---- Linux: reveal the downloaded archive (family rule) ----

(define (install-linux!)
  (define downloaded (hash-ref (unbox update-state) 'downloadedPath #f))
  (unless downloaded (error 'install "no downloaded update to reveal"))
  (define dir (path->string (path-only (simple-form-path downloaded))))
  (define opener (find-executable-path "xdg-open"))
  (unless (and opener (zero? (system*/exit-code opener dir)))
    (error 'install "could not open the download folder"))
  (hasheq 'ok #t 'revealed dir))

;; ---- dispatcher ----

;; Called by /api/update/install once the phase is "downloaded". macOS and
;; Windows answer and then exit so the handover can complete; Linux keeps
;; the app running and reveals the archive.
(define (install-downloaded!)
  (define state (unbox update-state))
  (unless (equal? (hash-ref state 'phase) "downloaded")
    (error 'install-downloaded! "no downloaded update is ready to install"))
  (define zip-path (string->path (hash-ref state 'downloadedPath)))
  (case (system-type 'os)
    [(macosx) (install-macos! zip-path)]
    [(windows) (install-windows! zip-path)]
    [else (install-linux!)]))


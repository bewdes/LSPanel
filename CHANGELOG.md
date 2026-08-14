# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
(pre-1.0, so minor versions may still contain breaking changes).

## [Unreleased]

### Fixed

- The Terminal tab rejected a Cron service session with "Service cron is not enabled" even when Cron was configured — its availability check checked every other addable service but never special-cased Cron the way service start/stop/exec already did.
- The default PHP welcome page's service pills never showed Elasticsearch, MinIO, or RabbitMQ, even when one of them was added to the environment, unlike Redis, Node.js, Mailpit, Adminer, and phpMyAdmin.
- The project wizard's "Additional services" step never offered Elasticsearch, MinIO, or RabbitMQ — only Redis, Mailpit, Adminer, and phpMyAdmin — even though every other part of the app (environment editor, validation, Compose generation, gateway routes, logs, terminal) has fully supported all three for several releases. Adding them required creating the project first, then editing the environment afterward.
- The environment editor's Redis eviction policy dropdown only offered 5 of the 8 policies the backend actually accepts, missing `allkeys-random`, `volatile-lfu`, and `volatile-random`.
- LiveLink's tunnel-process lock could panic (crashing every subsequent LiveLink action for the rest of the session) instead of recovering, if it was ever poisoned by a panic elsewhere — every other lock in the app already recovers from poisoning, this one was missed.

## [0.6.0-beta] - 2026-08-13

### Added

- Settings: an "About" section showing the app version, description, and author contact links (GitHub profile, repository, email).
- One-click buttons to open MinIO's and RabbitMQ's web admin consoles from a project's Developer Tools card, matching the button Mailpit already had — the reverse-proxy routes for both already existed, just without a way to reach them.
- A "Fallback command" field for Node.js projects (project wizard and environment editor) — it was already sent to the backend and used when the dev/start commands are both left empty, but had no UI to see or change it.
- A terminal button next to the project wizard's progress bar during creation, showing — live, as they run — the exact `composer create-project`/wp-cli commands and their real output for WordPress, Laravel, and Symfony projects, plus a summary of which `.env` keys get set to connect to the provisioned database. Same idea as the dependency-installer's live command log, applied to project creation. Also covers cloning a Git repository (previously silent for up to an hour with no feedback at all), the `docker`/`podman compose pull`/`up` output for downloading images and building/starting containers (covers every container-mode project type, not just the ones above), and, for native (containerless) Node.js/React projects, the `npm`/`pnpm install` and dev/start command.

### Fixed

- Editing an environment from the separate Containers window no longer leaves the main window's environment list stale.
- Deleting an environment now names the projects it will remove and lets you keep their files on disk instead of always deleting them unconditionally, matching the option already available when deleting a single project.
- Start/Stop/Restart, exec, log-clearing, and "open in browser" now work for Elasticsearch, MinIO, and RabbitMQ services — they were previously rejected with "Unsupported service" even though they could be added to an environment.
- The Containers window now notices when its environment is deleted from elsewhere (the main window or another Containers window) instead of continuing to show it as editable.
- Start/stop/restart no longer leave the status badge showing the pre-operation state after a failure — the real state (which may have partially changed before the failure) is now refreshed immediately instead of only on manual refresh.
- The environment status badge said "Running" even when only some of its services were actually up (e.g. one crashed while the rest kept going) — it now shows "Running (2/3)"-style counts when the environment is only partially running.
- Idle auto-stop reliably triggered a false "problem with services" notification a couple minutes after stopping an environment: it stopped the containers directly without clearing the sites' enabled flag the way a manual stop does, so auto-heal saw an "enabled but stopped" environment and reported it as crashed.
- Pinning or archiving a project from its own details page no longer navigates you back to the sites list — only editing its settings or duplicating it does that now.
- Duplicating or importing a project now shows real progress (stage and percentage) instead of a static "Duplicating…"/"Importing…" label for what can be a multi-minute operation.
- Removing an extra service (Redis, MinIO, etc.) from a running environment and saving no longer leaves its container running with no way to stop it — saving now reconciles the running stack with the updated configuration.
- The Terminal tab rejected Cron, Elasticsearch, MinIO, and RabbitMQ with "Unsupported terminal service" even though they're selectable in its service list — the same class of dead button already fixed elsewhere for these services, but missed for the Terminal feature specifically.
- Restoring a project snapshot no longer leaves an unbounded pile of automatic pre-restore safety snapshots on disk — each one is now pruned down to the same 20-snapshot retention already applied to every other automatic snapshot.
- Scheduled database backups now go through the same Operation Center/notification pipeline as manual backups — a failed scheduled backup (e.g. because the environment isn't running) used to fail completely silently, with no entry anywhere and no way to know it didn't happen.
- The Database page's backup list no longer goes stale after "Quick Backup," "Clear Database," or an SQL/table import — each of these can create a backup on the backend, but the visible list only refreshed after navigating away and back.
- Reissuing, deleting, or resetting the local HTTPS certificate now takes the same lock that already serializes certificate generation — previously only `ensure()` took it, so one of these actions running while an environment started (or another window refreshed the gateway) could delete `local.crt`/`local.key` out from under an in-progress write.
- A failed LiveLink start for one site no longer restarts (and briefly disrupts) every other site's already-running tunnel — rolling back a failed attempt now only touches the site that was actually being changed.
- LiveLink's "Stop" button in the Running Projects table now stops just that project's tunnel instead of every active tunnel at once; the page-level "Stop" button remains as a stop-everything option.
- Deleting a native (containerless) project's files always failed with "Failed to launch temporary project file permission repair: No such file or directory" — the ownership-repair step it ran before deletion assumed a container stack existed, which native projects never have. Native projects' files are already owned by the host user, so the repair step is now skipped for them entirely.
- Native (containerless) sites now open at their real `https://<name>.localhost` domain through the local HTTPS gateway, the same as containerized sites, instead of always showing a raw `127.0.0.1:<port>` address. When Docker/Podman is available, the native process additionally binds to Docker's host-gateway bridge address (never `0.0.0.0`, so the port stays unreachable from the local network) so the gateway can reach it; when it isn't, the site still falls back to `127.0.0.1:<port>` exactly as before — native mode continues to need no container runtime at all.
- The project wizard could show a "domain already in use" error on its final step right after successfully creating the project — the newly created site reappearing in the live sites list (refreshed in the background) made the wizard's own domain-conflict check match against itself.
- The Sites list's Git branch badge never showed for any project — it checked for a repository at the project's root directory instead of its `app/` subdirectory, where it actually lives.
- Three Settings validation errors (unsupported theme, empty sites directory, failed to create sites directory) were hardcoded in Russian instead of the app's supported English/Ukrainian, so they showed up untranslated regardless of the configured language.
- Native (containerless) environments no longer show a per-service breakdown or a "Reset Runtime Logs" button on the Logs page — neither applied, since native mode runs as a single process with no per-service containers; selecting a service there previously either failed with a raw "No such file or directory" (reset) or silently showed the same unfiltered output as "all" (service selection).
- The Environment file editor always showed "file does not exist" for Laravel/Symfony projects (and silently missed a project's real `.env` in snapshots and export/duplicate) — it read from the project's root directory instead of its `app/` subdirectory, where the actual `.env` LS Panel and these frameworks create and use actually lives.
- Attaching a WordPress, Laravel, or Symfony project to an existing native (containerless) environment now fails immediately with a clear explanation instead of a raw compose error deep inside the install step — these templates need a container to install into, and native mode only ever offered this combination through the "existing environment" attach flow, not the wizard's own environment-creation step.
- Native (containerless) environments no longer appear on the Database page (they have no database container to manage there), and every database action (query console, backups, import/export, clone/rename) now rejects them with a clear message instead of a raw Docker/compose error. Automatic pre-restore/pre-clear/pre-query safety snapshots also no longer attempt a database export for a running native environment, which previously failed the entire snapshot if the (unused, for native) `database` field happened to be set to a server database.
- Comparing a project snapshot against the current project almost always flagged a "configuration change" that wasn't real — it included `lastStartedAt`, which updates on every environment start, burying genuine config drift in noise.
- The database query console silently cut off large results at 1,000,000 characters with no indication — a large `SELECT` looked complete when it wasn't. It now appends a clear marker when this happens.
- Starting or restarting an environment could drop a placeholder `index.html`/`index.php` right into the project's root folder instead of its `app/` subdirectory, next to (not inside) the real project — it checked for and wrote starter files at the wrong location, unlike project creation which already got this right.
- Deleting an environment always failed to remove its projects' `.env` files ("Site not found"), leaving them behind on disk — the cleanup step looked the site back up in storage after its record had already been cascade-deleted along with the environment. It now uses the project directory captured before deletion instead of re-querying storage.
- A missing environment during Start/Stop/Restart/Destroy showed the raw error "Окружение не найдено" (Russian) instead of an English/Ukrainian message.
- Six more validation and status messages (environment name, port range, image version, missing Docker/Podman, and "complete initial setup first") were hardcoded in Russian instead of the app's supported English/Ukrainian.
- Starting a native (containerless) site served files (or ran `npm`/`pnpm`) from the project's root folder instead of its `app/` subdirectory, so a freshly created static/Node.js project always 404'd — its `index.html`/`package.json` live in `app/`, not the root.
- Importing an exported project bundle always failed with a "MinIO root password must be at least 8 characters" error, regardless of whether the original environment used MinIO or RabbitMQ at all — export blanks those passwords like every other secret, but import never regenerated them the way it already did for the database password.
- The Dashboard's "Recent sites" card and the Sites list (subtitle, "Open," and "Copy URL") showed a native (containerless) site's `127.0.0.1:<port>` instead of its real `https://<name>.localhost` domain, inconsistent with the site's own details page.
- Stopping or starting a site from the Ctrl+K quick-actions palette acted on its entire environment instead of just that site — for two sites sharing one environment, stopping one from the palette silently took the other one down too.
- The quick-actions palette (Ctrl+K) and the in-app project file manager were entirely hardcoded in English, ignoring the app's language setting.
- The Backups page showed a "Database backups" tab (and tried to fetch backups for it) on native (containerless) projects, which have no database to back up, instead of hiding it the way the project's own details page already does.
- Following an Elasticsearch, MinIO, RabbitMQ, or cron service's live log tail always failed with "Unsupported log service," even though starting/stopping, exec, log-clearing, and the terminal already worked fine for these services — the live-log allowlist was missing four entries every other per-service check already had.
- Deleting an environment never removed its database, Redis, Elasticsearch, MinIO, or RabbitMQ data directories — only the generated Compose stack was cleaned up, leaving every deleted environment's engine data (database files, cache snapshots, search indices, object storage, message store) permanently orphaned on disk with no way to reclaim it through the UI.
- Auto-heal and idle auto-stop could act on an environment (restart it, or stop it) at the same moment a user-triggered action — or each other — was already running against it, since neither went through the same operation lock every other start/stop/restart path already used. Both now skip acting (and skip the notification) when something else is already active for that environment.
- Saving an environment settings while it was running could resurrect it seconds after a concurrent stop, because the "is it running" check happened once at the very start of the save, before the slower file-generation work that follows — a stop completing in that window would still be undone by the save's own reconciliation step.
- Generating an environment's Docker/Podman configuration files (on save, start/stop/restart, site changes, and even just opening the read-only "topology" view) had no protection against two of those happening at once — a second concurrent generation could interleave its writes with the first, leaving `compose.yaml` and its Dockerfile out of sync with each other.
- Clicking Pin then Archive (or the reverse) in quick succession on a project's details page could silently lose whichever change was sent first — both requests sent the project's full state read at click time, so an in-flight request wasn't disabled and a second click before the first resolved could revert it once both responses landed.
- Picking a different Git branch from the dropdown, or pressing Enter to create one, while a checkout was already running could start a second concurrent `git checkout` against the same working directory instead of waiting for the first to finish.
- Opening a second file in the project file manager before the first one finished loading could apply the responses out of order, leaving the editor showing (and Save writing to) a different file than the one actually selected.
- Start/Stop/Restart/Rebuild actions (Sites list, Containers list, and the Ctrl+K quick-actions palette) had no protection against a fast double-click, letting the same operation fire twice concurrently — most risky for the destructive/expensive ones (Rebuild without cache, Force stop).
- Removed the unused "open in a separate Containers window" backend command: nothing in the UI called it anymore, and the app no longer reads the URL parameter it relied on to show the right page — it was already dead code with no way to trigger it.

### Security

- The webhook URL's SSRF guard extracted a bracketed IPv6 host (`[fd12:3456:789a::1]`) by splitting on `:`, which truncated it at its first internal colon into a string that failed IP parsing and was then treated as an ordinary public hostname — bypassing the loopback/private/link-local check entirely for almost every IPv6 literal. Also fixed the range check itself, which only covered IPv4-style private/link-local ranges: IPv6 unique-local (`fd00::/8`), link-local (`fe80::/10`), and IPv4-mapped addresses (`::ffff:127.0.0.1`) are now rejected too.
- A failed WordPress/Laravel/Symfony installation on the "attach to existing environment" wizard path could show the environment's generated secrets (database/admin passwords) in plaintext in the error banner — that path never redacted its error the way the "new environment" creation path already does.
- Files holding real secrets — `compose.yaml` (database/MinIO/RabbitMQ credentials), a project's `.env`, SQL backup/snapshot dumps, and exported project bundles — were written with the default filesystem permissions (typically world-readable) instead of owner-only, unlike the app's own database and TLS keys, which were already correctly locked down. All of these now use the same 0600, symlink-safe write path.
- Database backup/restore/query/clone commands passed the database password as a literal `-e PGPASSWORD=...`/`-e MYSQL_PWD=...` argument to `docker`/`podman compose exec`, making it visible in plaintext to any other local user via `ps` for the command's runtime. The password is now passed through the command's own environment instead, with only the variable name appearing on the command line.
- The webhook SSRF guard validated a hostname's literal text but never resolved its DNS, so a webhook URL that resolves to a loopback/private/link-local address at request time (including via short-TTL "DNS rebinding") could still reach internal infrastructure — `curl` would resolve and connect to it independently of the check. The webhook sender now resolves the host itself, rejects any private/loopback answer, and pins the request to the validated address.

## [0.5.1-beta] - 2026-08-10

### Changed

- Restyled the Databases list to match the Sites page: a card-wrapped table with a database icon per row, denser stacked columns (usage, status, admin client), and clickable rows that open the database instead of requiring the separate "Edit" button.
- Lowered the default stats refresh interval from 10s to 3s (the fastest the setting allows) so the dashboard and sites list feel closer to live. Existing installs keep whatever value is already saved in their settings — change it in Settings → Performance to pick up the new default.
- The container terminal is now available in Ukrainian, and its Hide/Show password and Copy/Copied tooltips are too — both were the last hardcoded-English holdouts among LS Panel's feature pages.

### Fixed

- The dashboard's "Resource usage" card showed 0% CPU / 0 B for everything the instant the page opened, until the first stats fetch resolved — indistinguishable from genuinely idle services. It now shows "Checking…" until real numbers are in.
- Restoring a project snapshot trusted the environment id embedded in the snapshot bundle instead of the project's actual environment — a bundle with a foreign or hand-edited id could overwrite and rebuild an unrelated environment on the same machine.
- The "branch is behind origin" notification never fired for any project: the background check looked for a Git repository at the project's root directory instead of its `app/` subdirectory, where it actually lives.
- Starting two LiveLink tunnels back-to-back could lose track of the first one — both stayed running, but the second `start`/`stop` call could silently overwrite the other's config entry, leaving a tunnel publicly reachable with no way to stop it short of restarting LS Panel.
- Deleting an environment left its sites' `.env` files and project directories behind on disk with no way to reach or remove them through the UI, since the site record itself is already gone by that point.
- On Apache-based projects, the idle auto-stop feature could stop the environment mid-Xdebug-session: the debugger-activity check always looked for a "php" service, which only exists on Nginx-based stacks (Apache runs PHP inside the "web" service), so the check silently failed and reported "no active session."
- The project details page's Terminal tab could be opened even when the project's environment was stopped, leading to a raw connection error instead of an explained disabled state.
- The LiveLink page let you attempt to start a tunnel for a site whose environment wasn't running instead of proactively explaining why it's blocked, matching the pattern already used on the Database page.
- The project wizard never checked whether Docker/Podman was ready, so filling out the entire multi-step form only to have it fail deep in provisioning was possible if the runtime wasn't running. It now shows an early warning for container-based projects (native execution mode is unaffected, since it doesn't need Docker/Podman).

### Security

- Error messages, logs, and (if configured) webhook notifications could leak the MinIO/RabbitMQ passwords of a failing environment — they were missing from the internal secret-redaction and project-export secret-stripping lists that already covered every other generated password.
- Opening a link like `https://tailscale.com:x@evil.example/` from inside LS Panel could silently send you to `evil.example` instead — the allowed-domains check for links opened in your browser mis-parsed URLs that embed a username before `@`.
- The local SQLite database, which stores every environment's database/Redis/MinIO/RabbitMQ/WordPress passwords in plain text, is now created with owner-only file permissions (0600) instead of the OS default — existing installs get this fixed automatically on next launch.
- The webhook URL setting (used for Slack/Discord-style notifications) only required `https://`, so it could be pointed at a loopback or private-network address (or the cloud metadata endpoint) and used to redirect a secret-bearing notification off-machine. It's now restricted to public hosts.
- The generated MySQL/MariaDB healthcheck command embedded the root password using manual string formatting instead of JSON encoding, unlike everywhere else in the same file — currently harmless because the password is already restricted to safe characters, but a fragile pattern that could reopen compose-file injection if that validation ever changed.
- Passwords shorter than 4 characters were never redacted from error messages and logs.
- MySQL/MariaDB database queries, backups, and restores passed the root password as a command-line argument, visible to other local users via `ps`/`/proc` while the operation ran. It's now passed as an environment variable, matching how PostgreSQL already does it.
- Local HTTPS certificate generation is now serialized, so two environments starting at the same time can no longer interleave their certificate generation and end up with a mismatched certificate/key pair.

## [0.5.0-beta] - 2026-08-08

### Added

- Visiting a known site whose environment is stopped now shows a "Project stopped" page naming the project, instead of the same generic "domain not found" page shown for an unrecognized/mistyped domain.
- Database import can now target specific tables instead of always importing the whole dump: "Import tables…" reads the tables present in the selected `.sql` file (via the standard `mysqldump`/`pg_dump` per-table comment markers) and lets you choose which ones to apply.
- The Operations and Notifications panels now have a search box to filter a long history down to what you're looking for.
- Mail now refreshes its inbox list automatically in the background, and no longer re-runs the SpamAssassin/HTML compatibility checks every time you reopen a message you've already checked in this session.
- Switching Git branches with uncommitted changes that would be overwritten no longer just fails: LS Panel now offers to stash those changes before switching, or discard them and switch anyway.
- The Environment tab now shows a read-only preview of the nginx/Apache, PHP, and Docker configuration LS Panel generated for that environment (compose.yaml, Dockerfile.php, php-overrides.ini, and related files).
- Settings: default terminal and default browser preferences (used everywhere LS Panel opens a terminal or a local site/tool link), a Docker BuildKit toggle, and a configurable stats refresh interval for the dashboard and sites list.

### Changed

- Rewrote the Settings page: instead of four tabs, settings are now grouped into General, Workspace, Docker, Projects, Monitoring, Interface, and Performance behind a sidebar nav, so related settings (like the six different background monitors) aren't all crammed into one "System" tab.

### Fixed

- Saving Settings with PHP 8.5 selected as the default project PHP version was rejected ("Unsupported default project stack") even though 8.5 is a valid, selectable option in the same form — the server-side validation list hadn't been updated when 8.5 support was added.
- The local HTTPS gateway had no default site for port 443, so any request with a Host/SNI that didn't match a configured project (including System Health's own "Local HTTPS" probe) was silently proxied to whichever real site happened to be listed first instead of getting a clean 404 — which also made that health check report unhealthy even when the gateway was working correctly.
- Auto-heal could misread an environment that was simply still starting up as crashed, firing an alarming "service issue" notification and restarting it for nothing — both the instant LS Panel launched (no warm-up delay before the first check) and any time later that a periodic check happened to land while an environment the user had just started was still mid-startup (containers created but not yet healthy). Auto-heal now waits 90 seconds before its first check, and confirms a problem is still there after a 30-second delay before acting on it.
- The "Export tables…" and "Import tables…" dialogs on the Database page closed themselves the instant they hit an error (for example, opening "Export tables…" for a stopped environment), showing the actual error only in a page-level alert behind the now-closed dialog — easy to miss entirely. Both dialogs now stay open and show the error inline.
- Database actions stayed clickable when the environment's database wasn't reachable, so using one (import, export, quick backup, clear, create/rename/clone/delete database, running a SQL console query, creating or restoring a database backup) would always end in a failure notification. These now disable themselves with an explanatory note until the database is reachable again.
- The Containers page's "Resume" action had no disabled state at all, unlike Pause/Restart/Force stop, so it stayed clickable on an environment that was already running or fully stopped (not paused).

## [0.4.0-beta] - 2026-08-06

### Added

- Backup retention control: keep the newest N database backups and clean up older local dumps with one click, matching the existing project-snapshot retention UI.
- The "SQL dump" field on project creation now actually imports the file into the new database instead of being silently ignored.
- The SQL console now asks for confirmation before running a query that isn't read-only, instead of running it immediately on click.
- Database export can now target specific tables instead of always exporting the whole database: "Export tables…" lists the database's tables with checkboxes and dumps only the selected ones.
- Database backup and project snapshot retention can now also cap total size, alongside the existing count limit: cleanup keeps the newest items within both budgets, deleting whichever no longer fits.

### Fixed

- `LS_PANEL_AUTO_CREATE_DATABASE` set to "false" was ignored — the database was always created on environment start regardless of the toggle. The selected database charset is now also applied when the database is created.
- Node environments with run mode "start" never ran their configured build command before starting, in both the containerized and native runtimes.
- The SQL console's automatic pre-query backup could be skipped for a destructive query: it only checked that the query _started_ with a read-only keyword, so `SELECT 1; DROP TABLE users;` was piped to the database client with no safety-net backup taken first.
- Restoring a snapshot on a stopped environment skipped the automatic pre-restore database backup entirely (it only backed up the database if the environment happened to already be running), so a restore that failed partway through had no database to roll back to even though the rollback message claimed the previous state was restored.
- The local HTTPS certificate and its private key are written by two separate file renames; an interruption between them (or any other cause of the pair going out of sync) could leave a mismatched certificate/key pair that was silently trusted and reused, breaking every local HTTPS site with no obvious cause. The certificate is now verified against its key before being reused.
- A genuine UI double-click (or any two near-simultaneous requests) starting an operation on the same environment could lose the race between the "is one already running" check and the insert, surfacing a raw SQLite constraint error instead of the same friendly "already has an active operation" message.
- Auto-heal never actually fixed a service that was running but reporting unhealthy: it only acted when the restart policy was "no", and its action was `start`, which is a no-op on a container that's still running. A running-but-unhealthy service is now restarted regardless of restart policy, since Docker/Podman's restart policy only governs behavior after a container exits.
- Auto-stop's idle detection was CPU-only, so a PHP request paused at an Xdebug breakpoint (~0% CPU for as long as the developer is stepping through code, but with a live connection back to the IDE) looked identical to a genuinely idle stack and could be silently stopped mid-debugging-session. An established connection to the configured Xdebug port now counts as activity.
- The background Git status monitor's unattended `fetch --prune` and a user-initiated Git action (pull, push, commit, checkout) could run concurrently on the same repository with no coordination, occasionally surfacing a raw Git lock-file error with no clear explanation. Mutating Git operations on the same project now serialize against each other.
- The branch name shown right after "Initialize Git" on a brand-new project was the literal text "No commits yet on main" instead of "main" — a repository with no commits yet reports its branch in `git status` differently than one with history, and only the normal case was parsed.
- Project name uniqueness was checked case-sensitively, so creating "MyProject" when "myproject" already existed passed validation but silently aliased the same directory on case-insensitive filesystems (macOS, Windows, exFAT, some Linux setups). Project names also had no length limit, even though they become a DNS label (`{name}.localhost`) capped at 63 characters.
- System Health's "Local HTTPS" check could report "healthy" without ever verifying HTTPS actually worked: it combined an unrelated plain-HTTP probe on port 80 with "port 443 isn't free to bind," so an unrelated process (or a stale container) squatting on 443 instead of the real gateway still showed as healthy. It now probes port 443 over an actual TLS connection.
- Two environments starting at nearly the same time could both see the shared `lspanel` Docker/Podman network as missing before either finished creating it, so the loser surfaced a raw "network already exists" error even though the network was now present and usable either way.
- Every `docker`/`podman` invocation unconditionally stripped `DOCKER_HOST` and `CONTAINER_HOST`, silently ignoring a user's configured Docker context (Colima, custom sockets) — and breaking rootless Podman setups that specifically rely on `CONTAINER_HOST` for GUI-launched apps that never source a login shell profile.
- `podman-compose` detection only checked `/usr/bin` and `/usr/local/bin`, missing Homebrew on Apple Silicon and Linux and a `pip install --user`/`pipx install` (both default to `~/.local/bin`, and that's how podman-compose is commonly installed since it isn't part of Podman itself). Separately, even when detected, the actual `PODMAN_COMPOSE_PROVIDER` path passed to Podman only ever checked `/usr/bin`, so a podman-compose install anywhere else was detected as "available" but never actually used.
- After a project template installs into a bind-mounted directory (composer/npm/WordPress), restoring file ownership on Podman always chowned to UID/GID 0 inside the container, assuming rootless Podman's default "container UID 0 = host user" mapping. That assumption breaks under a custom subuid/subgid mapping, and is simply wrong for rootful Podman, leaving project files owned by root and inaccessible to the user. Rootless Podman now uses `podman unshare`, which translates correctly regardless of the mapping in use; rootful Podman now chowns to the host directory's actual owner, same as Docker.
- Stopping an environment from the Containers page never cleared its sites' "enabled" flag (unlike stopping from the Sites page). Auto-heal treats any environment with an enabled site as one that should be running, so a project stopped from the Containers page could silently start itself again the next time auto-heal ran — including immediately on the next app launch, with no indication of why.

### Changed

- Rewrote the i18n system: translations now live in one file per language (`src/i18n/locales/en.ts`, `uk.ts`, ...) instead of scattered across ~25 per-feature files. Adding a language is now just adding one new locale file with the same keys as `en.ts` (TypeScript enforces the keys match at compile time). The LiveLink page's translations, previously inline `uk ? "..." : "..."` ternaries that bypassed the shared system entirely, are now part of it too. The two-language `uk`/`en` toggle threaded through the whole component tree as a boolean is now a plain locale-code string, since a boolean can't represent a third language.

### Removed

- Unused, unwired systemd service wrapper (`service.rs`) and demo data table component that were never reachable from the app.

## [0.3.1-beta] - 2026-08-06

### Fixed

- The local HTTPS gateway container could fail to recreate with "container name already in use" — the same restart race the port-conflict retry already handled, just under a different Docker error message.
- The local CA was never actually imported into Chrome's certificate trust store on a machine where Chrome hadn't been launched yet (`~/.pki/nssdb` didn't exist), so "Install/trust CA" silently reported success while sites still showed as insecure.
- The first-run setup wizard's Cloudflare Tunnel authentication step had the same silent-wait problem LiveLink's did: no indication a browser tab should open, and no fallback link if it didn't.

## [0.3.0-beta] - 2026-08-05

### Added

- LiveLink: per-provider status/setup card that shows only the selected tunnel provider's install and auth state, with explanatory notes for each (Tailscale operator access, ngrok free-plan domain limits, Cloudflare zone delegation).
- LiveLink: ngrok and Cloudflare Tunnel installs now use the same confirm-then-progress dependency install dialog as onboarding, instead of installing silently.
- LiveLink: optional reserved custom domain for ngrok tunnels (paid ngrok plans).
- LiveLink: Cloudflare Tunnel base-domain field that auto-derives each site's hostname from its name; a one-click "reset authorization" to switch Cloudflare zones without leaving the app.
- LiveLink: Cloudflare Tunnel login now streams the auth URL into the app as soon as it's available, instead of only showing success/failure once the whole flow completes.

### Fixed

- LiveLink: ngrok tunnels were killed and reported as failed even when they started successfully, because the public-URL match required a `127.0.0.1:<port>` address while ngrok reports `localhost:<port>`.
- LiveLink: Cloudflare Tunnel creation failed with a deserialization error on accounts with zero existing tunnels (`cloudflared tunnel list --output json` prints `null`, not `[]`).

## [0.2.0] - 2026-08-04

### Added

- Persistent in-app notification center, with per-notification delete, mark-as-read, and clear-all, covering site/container/database/file-manager/certificate/LiveLink/settings operations.
- Optional Slack/Discord-compatible webhook forwarding for notifications.
- Background monitors (all opt-in, configured in Settings): auto-heal for crashed/unhealthy containers, auto-stop for idle environments, Git-behind-origin checks, TLS/CA expiry reminders, and low-disk-space alerts.
- Scheduled, automatic database backups (interval + retention count per environment), alongside the existing on-demand backups.
- Project export/import: package a site (source, database, environment config) into a portable bundle and restore it as a new site.
- Extra per-environment services: Elasticsearch, MinIO, and RabbitMQ, alongside the existing Redis support.
- Symfony project provisioning, and dedicated single-process handling for Node/React projects.
- LiveLink tunnel provider choice: ngrok and Cloudflare Tunnel, alongside the default Tailscale Serve/Funnel.
- One-container-per-project enforcement in the project creation wizard (occupied environments are marked and rejected).
- Cross-distribution dependency installation during onboarding for Docker, Podman, Git/GitHub CLI/npm/NVM, OpenSSL, NSS tools, and Cloudflare Tunnel.
- Live installation progress with an explicit confirmation dialog showing every command before administrator authorization.
- Managed Cloudflare Tunnel setup: account authentication, named tunnel creation, local configuration, DNS routing, and hostname validation.

### Fixed

- Docker detection and socket-access recovery after installation.
- Onboarding disk-space detection for project directories that do not exist yet.
- Blurred modal, menu, select, sheet, drawer, and tooltip rendering in WebKitGTK.
- Nginx container health checks on images that do not include `wget`.

## [0.1.0] - 2026-07-28

Initial public beta.

### Added

- Site, container (Docker/Podman + Compose), and database management for local PHP/web projects.
- Database backups and project snapshots (database + `.env` + environment config), with retention pruning and export/import.
- Local certificate authority and per-domain HTTPS certificates.
- Mail capture via a local Mailpit integration.
- LiveLink: securely expose a local site through Tailscale Serve/Funnel.
- File manager, live log streaming, and an integrated PTY-backed terminal with saved quick commands.
- System health, disk usage, and per-project diagnostics.
- A guided first-run setup wizard (appearance, workspace directory, environment check, remote access) and a first-run home screen for creating or importing the first project.
- Bilingual UI and documentation (English / Ukrainian).
- Apache-2.0 license.

[Unreleased]: https://github.com/bewdes/LSPanel/compare/v0.6.0-beta...HEAD
[0.6.0-beta]: https://github.com/bewdes/LSPanel/releases/tag/v0.6.0-beta
[0.5.1-beta]: https://github.com/bewdes/LSPanel/releases/tag/v0.5.1-beta
[0.5.0-beta]: https://github.com/bewdes/LSPanel/releases/tag/v0.5.0-beta
[0.4.0-beta]: https://github.com/bewdes/LSPanel/releases/tag/v0.4.0-beta
[0.3.1-beta]: https://github.com/bewdes/LSPanel/releases/tag/v0.3.1-beta
[0.3.0-beta]: https://github.com/bewdes/LSPanel/releases/tag/v0.3.0-beta
[0.2.0]: https://github.com/bewdes/LSPanel/releases/tag/v0.2.0
[0.1.0]: https://github.com/bewdes/LSPanel/releases/tag/v0.1.0

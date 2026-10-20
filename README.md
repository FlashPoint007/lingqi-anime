# 零柒番剧 · Lingqi Anime

A browser adaptation of [Predidit/Kazumi](https://github.com/Predidit/Kazumi), based on upstream commit `dc18be2af7636ae852cb49d0c4460e49b04b467c`. Independent Web client with a browser interface and player.

## Features

- Bangumi search, filters, calendar, episode metadata and clearly marked offline fallback.
- Account-owned D1 watchlists and resume history with cross-device sync, automatic migration of browser records, offline retry and JSON backup. Anonymous viewing remains available; themes and custom source rules stay browser-local.
- Default subscription to [Predidit/KazumiRules](https://github.com/Predidit/KazumiRules): only rules named in the upstream active `index.json` are bundled and enabled (16 at this revision). Deprecated, removed and malformed managed rules are pruned after a complete successful synchronization. Custom rules and explicit user switches survive updates; temporary upstream failures retain cached data. The server caches the complete repository archive for one hour and the browser checks for updates every 24 hours during visits.
- XPath and API search/episodes; clicking a metadata episode finds a matching line and opens the local player. Declared video/config/iframe URLs are parsed without executing remote scripts. Playable direct media uses a signed same-origin streaming proxy with recursive HLS playlist/key/segment rewriting and HTTP range support. Only the site-owned HTML5/HLS player renders playback. When no media URL can be resolved, alternate episode lines are tried and the page offers retry/source selection; source pages are never embedded. Sources that require browser script execution or human verification may remain unavailable.
- HTML5 MP4/WebM/HLS; actual Anime4K CNN 2× super resolution via WebGPU, balanced/high quality; Google Cast, AirPlay/Remote Playback; speed, fullscreen, picture in picture and local WebVTT subtitles.

## Browser limits

Super resolution needs WebGPU, CORS permission, decoded video and input up to 1080p. It processes local canvas frames and does not modify Cast, AirPlay or picture-in-picture output. Changing this mode may reload the source while preserving position. Receivers must access the media URL themselves. Cast requires a compatible browser/device and Google SDK; AirPlay/Remote Playback availability depends on the browser. Direct DLNA, native mpv shader parity, custom media headers, captcha automation, DRM, offline media downloads, danmaku and Syncplay are not implemented. An imported rule does not guarantee that its source works from a Worker or browser.

Rule updates run during visits, not as a background cron when nobody opens the site. Signed-in watchlists and viewing history are stored privately in D1; anonymous changes and offline queues are retained in the browser. The source proxy limits response size and redirects and accepts public HTTPS domain destinations. API requests use only the rule's configured destination and a limited header set. Remote scripts are never evaluated in the app context. Set the secret runtime environment variable `LINGQI_MEDIA_SECRET` to a random value of at least 32 bytes for signed media tickets; keep it out of source control. Tickets expire after eight hours. Cached viewing history saves source page URLs so it resolves fresh tickets on resume.

Enabling Anime4K preserves an intentionally paused video across the CORS reload; active playback still resumes. VTT imports report validation/read failures, allow the same file to be selected again, ignore stale reads after another selection or player exit, and revoke replaced subtitle URLs.

## Development

Node >=22.13 and pnpm:

```sh
pnpm install
pnpm dev
pnpm build
node scripts/check-web.mjs
node scripts/check-player.cjs
node scripts/check-player-settings.cjs
node scripts/check-covers.cjs
node scripts/check-security-cache.cjs
node scripts/check-library.cjs
node scripts/check-library-hook.cjs
node scripts/check-review.mjs
node scripts/check-availability-hook.cjs
pnpm exec tsc --noEmit
```

The Sites Vinext starter and `sites()` integration are retained. Public source deliberately omits deployment URL, Site identity, credentials and generated bundles. Set a new project identity through the hosting workflow when deploying your own copy. No account login is required by the application.

## Shared cache and request protection

The hosting manifest enables the logical D1 binding `DB`. Publish the checked-in Drizzle migration before serving the Worker; do not create tables in request handlers. D1 stores public metadata/directories, short-lived request counters and separately authorized personal records. Personal records are never included in the shared cache. Video files, media proxy bytes, playback tickets and custom API credentials are not stored in this cache. Rules containing authorization/API-key/password/token fields bypass the shared directory cache.

| Cached data | Fresh lifetime | Additional fallback lifetime |
| --- | --- | --- |
| Catalog/search/calendar | 5 minutes | 24 hours |
| Subject details | 6 hours | 24 hours |
| Episode metadata | 10 minutes | 24 hours |
| Source searches | 2 minutes | 1 hour |
| Source chapter directories | 10 minutes | 1 hour |

Identical misses are coalesced per Worker isolate. Failed upstream responses are not saved; a successful older entry may be returned with `cacheStale: true` and `Cache-Control: no-store` during its fallback lifetime. Recheck resources bypasses fresh entries (`refresh: true` on source queries); metadata endpoints accept `refresh=1`. Cached source directories do not guarantee that every video is playable. Entries are limited to 192 KiB, the process cache to 128 entries/8 MiB of text, and D1 to 1,000 entries with opportunistic cleanup. `X-Lingqi-Cache` reports hit/miss/stale; `X-Lingqi-Storage: d1` confirms a D1-backed response. Database failures fall back to live upstream requests and local rate limits.

The Worker rejects unknown API routes, unsupported methods, cross-site source POSTs, oversized URLs and non-JSON/over-64-KiB source bodies (8-second body-read deadline). It adds browser security headers and retains signed media/origin/redirect/response-size validation. Per-client fixed-minute quotas are 180 metadata queries, 180 source queries, 30 playback resolutions, 1,200 media requests, 40 rule requests and 300 page requests. Resolution consumes source quota too. Responses use HTTP 429 and `Retry-After` when a quota or concurrency cap is reached. D1 atomically reserves small quota blocks across isolates; unused reserved slots conservatively consume that minute's allowance. Concurrent work is capped per client and per isolate, and streaming slots are released on completion or cancellation.

Client identity uses Cloudflare's connecting-IP header at the Worker entrypoint; signed-in library requests instead use the platform-authenticated account ID so changing networks does not reset their quota. Both are stored as an HMAC using the runtime binding `LINGQI_MEDIA_SECRET`; raw IP addresses and account IDs are not persisted in rate counters. The Worker explicitly marks the edge request as trusted because dispatch can reconstruct it without `cf` metadata. Outside that trusted entrypoint, account headers are ignored and forwarding headers require native `cf` metadata. Without a trusted identity, requests share an eight-times-larger fallback quota. Old counters are deleted opportunistically. Application quotas are not network-layer DDoS protection: distributed attacks, edge WAF/bot rules and billing protections require the hosting provider's edge controls. The application does not configure or claim a custom WAF rule set.

Hostname validation canonicalizes a trailing DNS dot and rejects IP literals and local/internal suffixes. This validation does not pin DNS resolutions and is not a complete DNS-rebinding defense. Source body reads have independent time and size limits; private playback resolution also follows client cancellation and a 20-second operation deadline. HLS lists allow at most 4,096 references, 20,000 lines and 4 MiB of rewritten output, with at most 16 concurrent signatures. Proxy single-range requests support bounded, open-ended and suffix ranges; invalid ranges are rejected before upstream access, and upstream 416 responses retain their meaning. HTML responses disable object embedding and restrict the base URL.

Seasonal calendar lookups share a 35-second deadline across current, seasonal and paginated fallback services. Missing or invalid fallback totals are rejected rather than labelled complete. Global keyword searches clear previous filters, including year. Late detail responses cannot reopen a closed dialog or overwrite a different selection. Source switching derives episode identity for older viewing records and preserves episode zero; completed playback reports take precedence over background directory checks even when timestamps coincide.

## Personal library persistence

Public browsing/playback does not require login. The native Sites sign-in flow links watchlists and viewing history to the platform's stable site-specific account ID; email is display-only. Each `/api/library` read/write scopes its SQL to the authenticated account. Private responses use `private, no-store`. Writes require a matching same-origin JSON request and an explicit matching account ID, preventing an old offline queue from being uploaded after account switching. Anonymous clients cannot read or write another visitor's records.

The first signed-in visit merges legacy/anonymous browser records into the database. Deleted rows retain versioned tombstones, so stale devices and repeat imports cannot silently revive them. Mutations use atomic version checks and stable operation IDs: retries are idempotent, unrelated changes merge, and conflicting older writes keep the database version. Watchlists allow up to 1,000 active entries; history retains the most recent 100 titles. A source page and playback position are saved, with fresh media tickets resolved on resume. No video files or proxy tickets are stored.

The client batches changes, saves progress during playback and flushes on pause/exit. Small writes use fetch keepalive; pending operations remain in an account-scoped local retry queue if the connection fails. Recovery validates every stored operation and compacts duplicate record keys, preferring a newer base version and then the last same-version edit. It does not silently truncate valid operations after 2,000 items; local storage capacity still applies and failed writes are reported. Refresh/focus/online events and a 30-second in-page poll synchronize other devices; no Codex automation is created. The UI distinguishes pending, saving, saved, anonymous and failure states. Custom rules and appearance remain local because imported rules can contain credentials. Optional JSON export/import remains available. The library endpoint has a separate 120-per-minute client quota and a 256-KiB write-body limit.

Snapshots and mutation acknowledgements are validated before replacing local data or removing queued writes. At watchlist capacity, rejected favourites remain visible and exportable in the account's retry queue; remove another favourite and retry to upload them. Malformed cached snapshots fall back to anonymous mode instead of leaving the interface loading indefinitely.

Security dependency pins live in `pnpm-workspace.yaml`, which is authoritative for this pnpm project. Keep its lockfile synchronized and run `pnpm audit` after changes. The remaining unpatched `braces` advisory concerns developer glob-pattern processing through ESLint/build plugins; public requests never supply those patterns. Do not run builds or lint against untrusted source inputs.

## Attribution

GPL-3.0; see LICENSE. Kazumi by Predidit and contributors. KazumiRules snapshots retain the upstream MIT license in LICENSE-KazumiRules. Anime4K-WebGPU is MIT; hls.js is Apache-2.0. Bangumi provides metadata; artwork belongs to its respective owners. Restricted upstream logos/fonts are not used. The original Flutter application remains in the linked upstream repository.

Automated checks validate subscription merging, snapshot coverage, API request/JSONPath behavior, media extraction and proxy bounds. UI playback, GPU quality and real receiver checks require a browser and compatible hardware.

Search pages respect the 1,000-result upstream window, including the partial last page. Missing or failed covers display a named placeholder in catalog cards, details and watch history; a changed cover URL is retried. Starting playback cancels obsolete source-directory requests, and direct media keeps its episode number and catalog source for episode navigation.

Playback recovery recognizes episode numbers in legacy history titles (including episode zero) and preserves same-episode progress. Among sources with the same availability status, automatic playback respects the manually selected source, then the last successfully played source; a failed preferred source still yields to a healthy source.


## Email accounts and shared rules

The default sign-in is a site email/password account. Passwords must be 12–128 characters and are stored as salted PBKDF2-HMAC-SHA256 (100,000 iterations) over a server-peppered input. Configure and preserve the secret runtime value `LINGQI_AUTH_SECRET` (at least 32 random bytes); changing it invalidates password verification. Session cookies are Secure, HttpOnly, SameSite=Lax, expire after seven days, and only token hashes are stored in D1. Login rotates the previous session; logout revokes it. Auth requests have client and per-email attempt limits. Email addresses currently serve as usernames: mailbox verification and password recovery are not enabled without a mail delivery service. No automatic linking by matching email is allowed. Existing ChatGPT identities remain compatible solely to retain access to older personal records; new email accounts have separate libraries.

Server-owned Kazumi subscription rules are saved in `site_rule_sets`, independent of login, and rechecked on visits after one hour (manual refresh has a one-minute cooldown). Failed upstream fetches retain the previous complete set. Browser settings only affect local source preferences and custom rules, which may contain private credentials and are not public writes. There is no Codex scheduled task.

Calendar requests race the current-week and seasonal services, cancel the unused request, and bound each service request to six seconds within the existing total deadline. Fallback pages use at most three concurrent requests. Calendar responses stay fresh in D1 for one hour with a seven-day fallback; the browser retains at most four validated quarter snapshots for seven days and shows a saved quarter while revalidating. Card/history covers normalize Bangumi HTTP URLs to HTTPS and request the 400-pixel variant, decode asynchronously and use native lazy loading on cards; hero/detail covers retain large artwork.

Additional regression checks: `node scripts/check-email-rules.cjs` and `node scripts/check-calendar-cache.cjs`.

## Danmaku

The watch player can fetch and overlay episode danmaku from BiliBili, match by Bangumi ID, select another provider/episode, and import XML/JSON comments. Origin filters, opacity, font size, display area, speed, timing offset and keyword blocking are available. Public comments use the existing bounded D1 cache. Gamer availability depends on its public endpoint; Dandanplay aggregation requires this site's own server-only `LINGQI_DANDAN_APP_ID` and `LINGQI_DANDAN_APP_SECRET`. Without credentials the UI states the requirement; it does not borrow another application's keys. See [setup, attribution and provider limits](docs/danmaku.md).

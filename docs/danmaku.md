# Danmaku

The watch player retrieves real episode comments asynchronously, without delaying video playback. BiliBili's public media/season metadata and XML comment endpoints are supported directly. Gamer's public episode/danmu endpoints are supported, but may reject requests or impose regional restrictions; failures are shown, not bypassed. No video files, comment author IDs, cookies or provider credentials are cached. Only normalized public comment text, timing, display mode, colour and origin are stored in the existing bounded D1 shared cache.

Automatic matching uses the exact Bangumi subject ID in small monthly files from [bangumi-data](https://github.com/bangumi-data/bangumi-data), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution is also present in the player. The index is reduced to provider IDs and display titles. The broadcast month and adjacent months are checked; titles and season positions are never guessed. Episode numbers must match a unique numbered provider episode. Specials or unknown video episode numbers require explicit selection.

Kazumi's BiliBili/Gamer/弹弹play switches filter comment origins in Dandanplay's aggregated response; they are not three independent crawlers. To enable the same aggregation legally, obtain this site's own approved credentials from [Dandanplay's developer service](https://dev.dandanplay.com/), then set server-only secret environment values `LINGQI_DANDAN_APP_ID` and `LINGQI_DANDAN_APP_SECRET`. Do not reuse Kazumi credentials. The request signature follows the [official protocol](https://doc.dandanplay.com/open/): Base64(SHA256(AppId + timestamp + URL pathname + AppSecret)). Credentials never enter client bundles, database values, query strings or logs. Without both values, the UI explains the configuration requirement and BiliBili/local imports remain usable. These credentials are optional; do not change existing authentication/media secrets.

Users can also paste an official BiliBili bangumi URL (`md`, `ss`, `ep`) or a Gamer anime-video URL and select the correct episode. Explicit BiliBili XML/CID links and Gamer per-video links can load the selected comment file without guessing a season directory. XML (BiliBili) and JSON (Dandanplay compact `p`/`m`) imports up to 5 MB remain in browser memory and are cleared on episode changes. External entities, unsupported modes and invalid times are rejected/omitted. Text is painted as plain canvas text; remote HTML/scripts are never evaluated.

Settings include visibility, origin filters, opacity, font size, screen coverage, scrolling speed, time offset and literal keyword blocking. A positive offset delays comments. Layout uses the media clock, clears on seek/resize and follows pause and playback speed. A canvas overlays both ordinary and Anime4K video inside fullscreen; native picture-in-picture and remote casting show the original video only. High-density episodes are uniformly sampled across the complete episode into a response under 192 KB; source counts/sampling status are visible. Lane scheduling further limits overlap.

The `/api/danmaku` endpoint is rate/concurrency limited by the existing metadata guard. It accepts fixed provider IDs and validated operations, never arbitrary fetch destinations or redirect targets. Provider requests and bodies have time/size ceilings. Successful episodes/comments use D1 with stale fallback. A failed partial index lookup is not stored as a successful empty match. Refresh bypasses freshness checks but retains rate limits.

Production acceptance on 2026-10-20: the hosted BiliBili season-directory request returned HTTP 412, and Gamer did not supply an episode catalogue. These are reported to users; automatic retrieval is provider-dependent. A direct comment link or local real XML/JSON import can be used independently. Dandanplay remains unavailable until this site has its own approved credentials.

## Source failures and setup

The player now tries each provider from the **same exact subject match** once when automatic retrieval fails, returns a valid empty result, or lacks the exact episode. It never guesses the next provider's first episode. Explicit provider URLs/episode choices remain manual and do not fall through. Each failure stays visible; an unavailable service is not described as a show without resources.

Gamer requests include the public comment-catalogue `geo=TW,HK` parameter used by the reference implementation; this does not send a false client-country header or grant region/authentication privileges. Payloads with the documented nested `data` wrapper and a single nonstandard episode group are recognized. Error objects, maintenance HTML and invalid payloads are not stored as empty comments. Region/authentication denials are reported.

Source errors have structured codes (`UPSTREAM_BLOCKED`, `UPSTREAM_MAINTENANCE`, `UPSTREAM_REGION`, `UPSTREAM_AUTH`, `UPSTREAM_RATE_LIMIT`, `UPSTREAM_FORMAT`, `UPSTREAM_TIMEOUT`). Brief per-origin, per-isolate cooldowns reduce repeated calls after a rejection/maintenance/rate limit. A `Retry-After` response is honoured (including an HTTP-date). No cookie harvesting, borrowed app credentials, client-location spoofing, proxy rotation or security-challenge bypass is used. Changing the UI or adding a database cannot itself remove a provider's refusal of the hosted server.

Dandanplay setup requires an external approval step:

1. Open <https://dev.dandanplay.com/> and register a developer account, verify email and complete developer details.
2. Create an application for **零柒番剧**, supplying the site's URL and this GitHub repository, explain that users retrieve comments when playing a selected episode, with caching and request limits. Submit it for review. The service assigns the tier/quota; approval and availability are not guaranteed by this implementation.
3. After approval, configure the site's production **secret** environment values `LINGQI_DANDAN_APP_ID` and `LINGQI_DANDAN_APP_SECRET`. Use this site's assigned credentials, not Kazumi's. Never paste secrets into the public repository, a screenshot, or a browser-visible setting.
4. Redeploy to apply the environment revision. Open a real episode and confirm subject match, episode selection and a nonzero remote comment response. Merely filling the variables or passing a local file-import test does not count as verifying the service.

Suggested application description (adjust it to actual use before submitting): “零柒番剧是免费的网页番剧索引与播放器。计划在用户选择番剧分集并播放时，按需获取并显示该集弹幕；不批量抓取弹幕库，不提供弹幕付费下载。服务端保管应用凭证，缓存公开弹幕并限制请求频率。”

Reference: [official Dandanplay access and signature documentation](https://doc.dandanplay.com/open/). Application approval/terms and assigned quotas are managed by that service. Ordinary site visitors do not need their own developer account. No account was registered or application submitted on the owner's behalf.

## Gamer identifier correction

The `gamer` ID in bangumi-data identifies `acg.gamer.com.tw/acgDetail.php?s=...`, not an episode. These namespaces must never be interchanged. The matcher now searches the official Gamer catalogue using the indexed Traditional Chinese/original title, joins **exactly** on `acg_sn`, and takes the returned `video_sn` to request the episode directory. An explicit indexed `video_sn` can be used directly. A same-title search result with another ACG ID is rejected. If the join fails, the UI explains the conversion/source error; it never sends the ACG ID as `videoSn`. The shared match cache namespace was changed to invalidate old incorrect matches.

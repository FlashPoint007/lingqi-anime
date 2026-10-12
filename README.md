# 零柒番剧 · Lingqi Anime

A browser adaptation of [Predidit/Kazumi](https://github.com/Predidit/Kazumi), based on upstream commit `dc18be2af7636ae852cb49d0c4460e49b04b467c`. Independent Web client with a browser interface and player.

## Features

- Bangumi search, filters, calendar, episode metadata and clearly marked offline fallback.
- Browser-local watchlists, resume history, themes and JSON backup.
- Default subscription to [Predidit/KazumiRules](https://github.com/Predidit/KazumiRules): only rules named in the upstream active `index.json` are bundled and enabled (16 at this revision). Deprecated, removed and malformed managed rules are pruned after a complete successful synchronization. Custom rules and explicit user switches survive updates; temporary upstream failures retain cached data. The server caches the complete repository archive for one hour and the browser checks for updates every 24 hours during visits.
- XPath and API search/episodes; clicking a metadata episode finds a matching line and opens the local player. Declared video/config/iframe URLs are parsed without executing remote scripts. Playable direct media uses a signed same-origin streaming proxy with recursive HLS playlist/key/segment rewriting and HTTP range support. Script-only lines stay in a sandboxed in-page frame; playback never automatically opens an external tab.
- HTML5 MP4/WebM/HLS; actual Anime4K CNN 2× super resolution via WebGPU, balanced/high quality; Google Cast, AirPlay/Remote Playback; speed, fullscreen, picture in picture and local WebVTT subtitles.

## Browser limits

Super resolution needs WebGPU, CORS permission, decoded video and input up to 1080p. It processes local canvas frames and does not modify Cast, AirPlay or picture-in-picture output. Changing this mode may reload the source while preserving position. Receivers must access the media URL themselves. Cast requires a compatible browser/device and Google SDK; AirPlay/Remote Playback availability depends on the browser. Direct DLNA, native mpv shader parity, custom media headers, captcha automation, DRM, offline media downloads, danmaku, Syncplay and automatic cross-device sync are not implemented. An imported rule does not guarantee that its source works from a Worker or browser.

Rule updates run during visits, not as a background cron when nobody opens the site. Personal data stays in the current browser. The source proxy limits response size and redirects and accepts public HTTPS domain destinations. API requests use only the rule's configured destination and a limited header set. Remote scripts are never evaluated in the app context. Set the secret runtime environment variable `LINGQI_MEDIA_SECRET` to a random value of at least 32 bytes for signed media tickets; keep it out of source control. Tickets expire after eight hours. Cached viewing history saves source page URLs so it resolves fresh tickets on resume.

## Development

Node >=22.13 and pnpm:

```sh
pnpm install
pnpm dev
pnpm build
node scripts/check-web.mjs
pnpm exec tsc --noEmit
```

The Sites Vinext starter and `sites()` integration are retained. Public source deliberately omits deployment URL, Site identity, credentials and generated bundles. Set a new project identity through the hosting workflow when deploying your own copy. No account login is required by the application.

## Attribution

GPL-3.0; see LICENSE. Kazumi by Predidit and contributors. KazumiRules snapshots retain the upstream MIT license in LICENSE-KazumiRules. Anime4K-WebGPU is MIT; hls.js is Apache-2.0. Bangumi provides metadata; artwork belongs to its respective owners. Restricted upstream logos/fonts are not used. The original Flutter application remains in the linked upstream repository.

Automated checks validate subscription merging, snapshot coverage, API request/JSONPath behavior, media extraction and proxy bounds. UI playback, GPU quality and real receiver checks require a browser and compatible hardware.

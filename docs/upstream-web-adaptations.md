# Kazumi updates adapted for the website

Reviewed on 2026-10-20 against `Predidit/Kazumi` main `184f8db535f9b4098ada763fcefea8e602126dc7` and release 2.3.9 (2026-10-14). Browser implementations follow the upstream behavior; native Flutter/media-kit code is not included.

| Upstream change | Website implementation |
| --- | --- |
| [Hover/drag progress time preview, 2026-10-20](https://github.com/Predidit/Kazumi/commit/dfcf9629a5240efa362d02377dfb5b5403afef1a) | Shared progress control for ordinary and Anime4K playback, buffered position, stable time labels, keyboard access, release-only seek. |
| [Serialized seeks, 2026-10-20](https://github.com/Predidit/Kazumi/commit/184f8db535f9b4098ada763fcefea8e602126dc7) | Serialize media seeks, coalesce pending targets to the latest request, accumulate repeated keyboard steps, clear pending operations on source change. |
| [Cancel seek gestures at player edges, 2026-09-28](https://github.com/Predidit/Kazumi/commit/0dfe1dc0d3766ef186e57dc066952d2ac8a4c53f) | Escape, pointer cancellation and releasing outside the timeline discard the drag preview. |
| [Cover saving/title copying, 2026-09-28](https://github.com/Predidit/Kazumi/commit/b484025b9c36cd7fbd8d20ddcd9046d39b04b917) | Detail-page menu copies the display title or original name and downloads the cover through a bounded Bangumi-ID endpoint. Clipboard denial offers a selectable title. |
| [API search detail URL templates, 2026-10-14](https://github.com/Predidit/Kazumi/commit/ff8594727d9d157d23f9c2b26759f943ebb35936) | Already adapted in version 50: independent search/chapter modes, `@source` templates, all 17 valid upstream rules. |

The recent native application updater, Android download-directory and iOS container-path fixes do not apply to this hosted browser app. Screenshot selection and danmaku editing are reviewed upstream features, not implemented in this update. Danmaku retrieval and display were subsequently added; see [danmaku.md](danmaku.md).

Validation: `check-upstream-features.cjs`, existing playback/settings/source-rule regressions, TypeScript and production build; cloud-browser acceptance covers real playback, timeline keyboard/drag controls, title copy and cover download.

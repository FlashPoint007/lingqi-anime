# Seasonal home recommendations

The catalogue's **热门** order remains Bangumi `heat` (collection count), and **高分** remains Bangumi `rank`. The homepage previously showed a fixed editorial Frieren visual independently of those filters.

The new home carousel defaults to the current Beijing-time quarter. It asks Bangumi for that quarter's premieres, ordered by `heat`, and displays at most six already released animation subjects. It never sorts those candidates by score. Quarters here follow premiere months (January–March, April–June, July–September, October–December); the Kazumi weekly timetable continues to include continuing shows and uses its existing archive rules.

The year/quarter controls affect only the recommendation carousel. Users can go backwards through seasons, return to the current season, select any of the six cards or move to the previous/next card. The normal catalogue search, sorting and pagination stay independent.

Automatic rotation runs every eight seconds. Hover, keyboard focus within the carousel, a hidden browser tab and reduced-motion preferences suspend it. A pause button persists the pause for the mounted carousel; explicit opt-in permits rotation with a reduced-motion preference. Details and collection buttons always act on the visible subject.

Each quarter has an isolated bounded browser cache, and public recommendations use the existing shared D1 metadata cache (one-hour freshness with a one-day stale window). Cache keys include the Beijing date to keep newly released shows eligible. Only the current and next cover are loaded eagerly. A failed update retains the same quarter's cached result and reports staleness; switching quarters clears the old cards immediately and cancels obsolete requests. A missing quarter never falls back to a different season or the former fixed banner.

Validation: all 50 existing CJS regression scripts, the new `check-home-features.cjs`, TypeScript and the foundational integration check. New coverage executes the production endpoint and component to check date/type/NSFW boundaries, heat-order preservation, six-item limits, quarter cache isolation, stale request cancellation, timed/manual rotation, focus/hover/visibility/motion pauses and visible-subject navigation. The managed preview service started, but the cloud browser could not reach its route; production visual acceptance follows deployment.

Production acceptance: the current autumn carousel renders six real subjects with loaded covers. Previous/next changes the visible subject; spring and summer selections replace the subject and premiere date with the selected season, and rapidly switching quarters clears obsolete content. Compact controls wrap safely on narrow screens.

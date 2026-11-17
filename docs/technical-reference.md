# Technical reference

[Back to the README](../README.md) · [Diary guide](diary-guide.md)

## Static hosting and releases

Publish `index.html`, `styles.css`, `sw.js`, `manifest.webmanifest`, `icon.svg`, and the entire `src/` directory as a consistent set of assets. All runtime URLs are project-relative and support repository subpaths. No build step or third-party runtime dependency is required.

Use HTTPS. Service workers also work on trusted local development addresses such as `localhost` and `127.0.0.1`. Serve the manifest as `application/manifest+json`, the icon as `image/svg+xml`, and the service worker as JavaScript.

For each application release, increment `VERSION` in `sw.js` and keep its static asset allowlist in sync with the published files. Publish `sw.js` last where deployment is not atomic, and avoid long-lived HTTP caching of the worker script. An update becomes ready only if every listed asset downloads successfully.

Older static caches are retained while other windows remain open and cleaned on a later sole-window load. Future storage-schema changes must remain compatible with older open windows or define a separate migration/update policy before shipping.

## Local data and privacy

Diary records are held in IndexedDB. All application JavaScript, HTML, CSS, and other runtime assets are hosted with the app. There are no remote fonts, CDN imports, telemetry, or cloud sync. Development dependencies are not shipped as application dependencies.

The static shell has a restrictive Content Security Policy. The service worker caches only an explicit list of static application files, never diary records, imports, or exports. Static hosting still receives ordinary website-request metadata, and apps sharing an origin can access its storage. See the [privacy commitment and outstanding origin-isolation work](../README.md#your-data).

Exports read a consistent snapshot from browser storage. Restores validate the whole backup before preview and commit atomically. Restore and deletion check whether the stored diary has changed since preview and require a fresh preview if it has.

Complete deletion clears saved user data and in-memory diary/editor state without retaining an application recovery copy. Only application schema metadata and a new opaque reset token remain. Restore and deletion notify other open tabs to reload. A transactional reset-token check prevents old edits or Undo from restoring removed records even without cross-tab notifications.

## JSON backup format

**Save a backup** produces `phase-backup.json` with `format: "phase-backup"`, `version: 1`, and three arrays. The backup version is separate from the internal IndexedDB schema version.

| Array | Fields |
|---|---|
| `records` | `date`, `bleeding`, Boolean `periodStart` |
| `reviews` | `id`, inclusive `start`/`end` dates, `answer` (`complete`, `missing`, or `unsure`), recorded `starts`, Boolean `needsReview`, Boolean `missingUnresolved` |
| `dismissals` | `id`, inclusive `start`/`end` dates, `anchor` (the latest start for open spans, otherwise `null`), recorded `starts` |

Backups include stale review answers and unresolved missing-start warnings. They exclude derived forecasts, session Undo, and application schema metadata.

Review IDs are `start/end`. Dismissal IDs are `span:start/end` or `open:anchor`. All review and dismissal start contexts must match the backup's actual starts within their fixed spans, even when a review needs attention. Reviews may share a boundary date.

Restore rejects unsupported formats or versions, unknown or missing fields, invalid values or dates, duplicate dates or IDs, future observations or reviewed dates, overlapping reviews, and inconsistent recorded-start contexts. It does not silently repair or skip invalid data.

## CSV export format

**Export observations CSV** produces `phase-observations.csv`, an unencrypted UTF-8 file with CRLF line endings and this header:

```csv
date,bleeding,periodStart
```

Rows appear in ascending date order, with one recorded day per row. Dates use `YYYY-MM-DD`. Bleeding is `none`, `spotting`, `light`, `medium`, or `heavy`, and period-start markers are `true` or `false`. For example, the synthetic row `2026-01-03,none,false` records an explicit observation of no bleeding.

Unrecorded dates are omitted. CSV excludes reviews and dismissals and cannot be restored into Phase.

## Testing

Use Node.js 20 or newer and npm. Install the locked development dependencies with `npm ci` and the matching Chromium browser with `npx playwright install chromium`. Chromium's operating-system libraries are separate prerequisites. If Playwright reports missing libraries, follow its platform-specific setup guidance.

| Command | Checks |
|---|---|
| `npm test` | Node unit tests, then Playwright browser tests |
| `npm run test:unit` | Node unit tests only |
| `npm run test:browser` | Playwright browser tests only |
| `npm run check` | JavaScript syntax |

Browser tests start their own local server on port 4173 by default. Stop `npm start` before running them, or set `PORT` to an unused port for the test command.

Coverage uses desktop Chromium and mobile Chromium emulation. Accessibility regression tests cover core keyboard journeys, focus return and visibility around fixed controls, touch-target sizes, supporting-text contrast, and 200% text at a 320px viewport. Interactive Playwright screenshot inspection supplements those assertions.

Other browser engines, real devices, and screen-reader usability remain best-effort follow-up work. These checks do not establish formal accessibility conformance. Use synthetic health data in tests and examples.

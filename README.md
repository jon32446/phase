# Phase

A straightforward, user-controlled menstrual cycle diary.

Record and correct your history without accounts, data harvesting or cloud sync. Phase is free and open source. It is not a diagnostic tool or a method of contraception.

## Current status

The diary supports a mobile-first monthly calendar, historical single-day and cross-month bulk editing, explicit period starts, browser-local storage, and one-step, memory-only Undo for the last changed edit, batch, or history-review answer. Undo remains available until the next successful changed edit or reload; navigation, elapsed time, cancelled edits, failed saves, and unchanged saves do not replace it.

History lists editable starts, derived start-to-start intervals, descriptive length ranges, and start-history completeness reviews. Non-blocking check-ins ask about potentially missing history without inventing dates or assuming that a period occurred. Reviews distinguish all starts recorded, known missing starts with forgotten dates, and uncertainty without changing daily observations. Start corrections mark affected answers as needing review; Undo restores the correction and its review effects together. A stale answer can make even short intervals unresolved: use the affected span's Review or Change review button, choose an answer from Start-history completeness, and explicitly approve replacing the earlier answer before saving.

The Calendar shows a cautious next-period range when at least three eligible intervals exist among the latest six. It uses their shortest and longest lengths, padded by two days on each side, with the earliest date at least one day after the latest start. The sample count and provisional-history caveat are shown. Relevant unresolved history withholds an estimate; known-missing completed intervals are excluded, and confirmed long intervals remain included. A passed window is labelled as passed rather than moved forward. These are engineering heuristics, not calibrated confidence bounds, medical advice, or contraception guidance.

Settings supports complete JSON backup/replace-only restore, daily-observation CSV export, and explicitly confirmed complete deletion. Restores are validated before preview and commit atomically; invalid files or failed writes leave existing data intact. Restore and deletion clear session Undo only after success.

Offline/PWA support is not implemented yet. **Do not rely on browser storage as your only record:** it can be lost. Keep your own unencrypted JSON backups somewhere secure.

Daily bleeding observations are separate from whether all period starts are recorded. Daily logging is not required: an unrecorded day is not an observation of "none", and a long interval is not automatically invalid. The usable-interval summary includes confirmed complete intervals and provisional intervals without reported missing starts or unresolved reviews; it labels those counts separately. Missing and unresolved intervals are excluded, and confirmed complete long intervals retain their actual length. These are descriptive summaries, not forecasts or medical assessments.

Reviews cover fixed dates and do not extend automatically. Re-reviewing overlapping answers explicitly replaces their whole covered span. Adding a remembered start does not by itself resolve a missing-start report; an unsure answer preserves that warning until explicitly resolved or removed. Gap checks use a personal median only when at least three other usable intervals exist; otherwise they explain limited history without applying a population-based duration cutoff. Dismissal is not confirmation and does not unlock a forecast. Dismissed and unsure spans are not prompted again unless their recorded starts change; a confirmed open span has a seven-day minimum before another automatic check-in.

[PLAN.md](PLAN.md) defines first-release behaviour, remaining decisions, and acceptance criteria. [TODO.md](TODO.md) lists optional later ideas, not release requirements.

## Privacy promise

The application's data-handling commitment is:

> Phase has no analytics, advertising, tracking, or third-party runtime resources. Your cycle records are stored in your browser on your device. The app does not send those records to anyone. You control your records: edit them, export them, or delete all saved data at any time.
>
> GitHub Pages serves the application and receives ordinary website-request metadata. Exports are unencrypted, and you are responsible for securing your device and any exported files.

There are no accounts, remote fonts, CDN imports, telemetry, or cloud sync. All application JavaScript, HTML, CSS, and other runtime assets live in this project. Development tools are not shipped as application dependencies. The static shell has a restrictive Content Security Policy; there is no service worker or application asset cache yet.

All user data is only stored locally and can be lost.

Other apps hosted under my GitHub Pages address could technically read Phase's stored data. As the owner of that address, I promise that no other app I publish there will read or share your Phase records. If you would rather not rely on that promise, you can host Phase yourself on a separate domain or subdomain.

Do not include real health records in public issues, screenshots, or test fixtures.

## Backups, exports, and deletion

In Settings, **Export JSON backup** downloads `phase-backup.json`, including daily observations, explicit period starts, history-review answers (including stale answers and unresolved missing-start warnings), and check-in dismissals. It does not include derived forecasts, session Undo, or application schema metadata. Export reads a consistent snapshot from browser storage, without uploading it.

**Preview restore** reads a selected JSON file locally, validates the whole backup, and shows existing and incoming observation/start, review, and dismissal counts. Restore is replace-only: explicit confirmation replaces the entire diary, not just conflicting dates. Export the current diary first if you want to keep it. An empty backup intentionally replaces the diary with no records. Successful restore clears Undo and cannot itself be undone.

The JSON envelope has `format: "phase-backup"`, `version: 1`, and three arrays: `records`, `reviews`, and `dismissals`. Records contain `date`, `bleeding`, and Boolean `periodStart`. Reviews contain `id`, inclusive `start`/`end` dates, `answer` (`complete`, `missing`, or `unsure`), recorded `starts`, Boolean `needsReview`, and Boolean `missingUnresolved`. Dismissals contain `id`, inclusive `start`/`end`, `anchor` (the latest start for open spans, otherwise `null`), and recorded `starts`. The backup version is separate from the internal IndexedDB schema version.

Unsupported formats/versions, unknown or missing fields, invalid values/dates, duplicate dates/IDs, future observations or reviewed dates, overlapping reviews, and inconsistent recorded-start contexts are rejected rather than silently repaired or skipped. Review IDs are `start/end`; dismissal IDs are `span:start/end` or `open:anchor`. Reviews may share a boundary date. All review and dismissal start contexts must match the backup's actual starts within their fixed spans, even when a review needs attention. If the stored diary changes while a restore or deletion preview is open, confirmation fails and requires a fresh preview. Failed operations preserve saved data and the previous Undo.

**Export observations CSV** downloads `phase-observations.csv`, an unencrypted UTF-8 file with header `date,bleeding,periodStart`, CRLF line endings, and one recorded day per row in ascending date order. Dates use `YYYY-MM-DD`; bleeding is `none`, `spotting`, `light`, `medium`, or `heavy`; period-start markers are `true` or `false`. For example, the synthetic row `2026-01-03,none,false` means an explicit observation of no bleeding. Unrecorded dates are omitted, not converted to `none`. CSV excludes reviews and dismissals and is not a restore format; use JSON for complete backups.

**Delete all data** requires a separate unchecked confirmation. It atomically clears Phase's saved user data, clears Undo and in-memory diary/editor state, and survives reload without leaving an application recovery copy. Only application schema metadata and a new opaque reset token remain; the token invalidates old edits without retaining health records. Restore and deletion notify other open Phase tabs to reload and discard old drafts/Undo. If a browser lacks cross-tab notifications, close those tabs to clear their old displays; a transactional reset-token check still prevents their old Undo from restoring removed records. It works without a network once the page is loaded; offline page loading is still pending. It does not clear unrelated apps' origin storage, downloaded exports, or records on other devices/browsers. Exports are unencrypted; secure your device and exported files.

## Run locally

From the repository directory, with Node.js 20 or newer and npm:

```bash
npm start
```

Open <http://127.0.0.1:4173/>. No dependency installation or build step is needed to run the application locally; the server uses Node's built-in modules.

## Self-hosting

Publish `index.html`, `styles.css`, and the entire `src/` directory to a static host such as GitHub Pages. Runtime assets use project-relative URLs and support repository subpaths. There are no third-party runtime dependencies or build steps.

## Development and testing

Install the locked development dependencies and the Playwright-compatible Chromium browser used by the tests:

```bash
npm ci
npx playwright install chromium
```

These commands install npm packages and browser binaries, respectively. Chromium's operating-system libraries are separate prerequisites; if Playwright reports missing libraries, follow its platform-specific setup guidance.

```bash
npm test
npm run check
```

`npm test` runs Node unit tests and Playwright browser tests; `npm run check` checks JavaScript syntax. Use `npm run test:unit` or `npm run test:browser` to run a suite separately. Browser tests start their own local server on port 4173 by default, so stop `npm start` before running them or set the `PORT` environment variable to an unused port for the test command.

Browser coverage uses desktop Chromium and mobile Chromium emulation, not real mobile devices or other browser engines. Use synthetic health data in all tests and examples.

## License

[MIT](LICENSE). Copyright (c) 2026 Jon.

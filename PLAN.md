# Phase: first-release plan

## Goal

Build a useful, mobile-first menstrual cycle diary that puts data control in the user's hands. Keep the application free, local-only, and understandable.

The first release is a diary with cautious estimates, not a fertility engine. Users must be able to edit historical dates and use the app without daily logging.

## Scope

- Handwritten JavaScript ES modules, HTML, and CSS; no frontend framework or third-party runtime resources.
- Static GitHub Pages deployment, including support for a repository subpath.
- IndexedDB storage of mutable records.
- Daily bleeding observations and explicitly recorded period starts.
- Single-day editing and calendar-based bulk editing.
- History, basic cycle summaries, and next-period estimated ranges.
- Unencrypted JSON backup/restore, CSV export, and complete data deletion.
- An installable offline application shell that caches static assets only.
- Focused unit tests and Playwright browser tests.
- MIT license with Jon as the copyright holder.

Symptoms, ovulation/fertility inference, clinical alerts, accounts, sync, encryption, and reminders are outside the first release.

## Invariants

- An unlogged day is unknown, not an observation of no bleeding.
- Logging a date does not populate adjacent dates.
- Bleeding intensity does not automatically establish a period start.
- Every historical observation and period-start marker can be corrected or removed.
- No append-only health history or retained superseded observations.
- Estimates are distinct from observations and never become recorded facts.
- Health records never appear in network requests, URLs, application caches, telemetry, or public test fixtures.
- No "safe", "infertile", or contraception guidance.
- No encryption claims; device and exported-file security belong to the user.
- Successful edits are acknowledged only after the storage transaction commits.

## User interface

### Calendar

Use a monthly calendar as the main screen, with month navigation and a Today control. A compact next-period estimate may appear above it when supported by the history. Insufficient history should produce an explanation, not an invented default date.

Tapping a date opens a small day editor with:

- The selected date and current observation.
- Bleeding: none, spotting, light, medium, or heavy.
- A separate "Period started this day" control.
- Save and a clearly described way to clear the day's record.

Not recorded must remain distinct from none. A period-start marker requires a non-spotting bleeding observation; inconsistent edits must prompt the user to resolve the marker rather than silently changing their history.

Historical dates are editable without an arbitrary age limit. Future dates are for viewing estimates, not recording observations.

### Bulk selection

Provide an explicit "Select days" mode rather than requiring hidden gestures. Users can tap dates across multiple months and retain their selection while navigating.

A sticky selection bar shows the selection count, bleeding-value actions, a clear-observations action, and Cancel. Bulk actions affect bleeding observations, not period-start markers. If a change conflicts with an existing start marker, the user must resolve it explicitly before the batch commits.

Show existing values during selection, including mixed observations and unknown days. Use selection outlines or checkmarks separately from the symbols/colours representing bleeding. Apply conflict-free actions directly, including clear observations, and commit each batch atomically.

Agreed bulk-interaction rules: the calendar is the review surface for conflict-free edits; do not open an unconditional preview modal. Only period-start conflicts open a prompt, showing affected dates with before/after values sorted by date. Require a separate unchecked-by-default approval for every conflicting start removal before enabling Save batch for the entire selection. Back to selection or Escape closes the prompt without saving and retains the selection; reopening resets removal approvals. Successful saves, including unchanged batches, exit selection mode and clear selection. Cancel selection or leaving Calendar also clears it. Failed saves retain the selection and any open conflict prompt. Check every selected record against its displayed snapshot inside the write transaction; stale-record failures offer an explicit calendar refresh, retaining selection without automatically retrying the action.

Offer a short-lived, in-memory Undo for ordinary edits. Undo is not a persistent audit history and is not available after complete deletion.

Agreed first-release interaction rules: weeks start on Monday. A conflicting edit offers explicit marker removal inside its preview rather than requiring a separate correction workflow; observation changes and separately authorised marker removals commit together. Clearing a day with a recorded start requires confirmation to remove both its observation and marker. Undo restores the latest changed ordinary edit atomically, including its marker, and expires after 30 seconds, the next successful changed edit, or reload. Undo retains only actually changed dates, not unchanged selections. Cancelled, failed, and unchanged edits do not replace Undo. There is no redo or persistent undo history; backup restore is outside ordinary-edit Undo.

### History and settings

Use three main destinations: Calendar, History, and Settings.

History shows period starts, completed intervals, and basic summaries. Make corrections reachable without asking users to reconstruct their history.

Settings provides import/export, the privacy explanation, and a prominent red "Delete all data" action. Require explicit confirmation explaining that deletion cannot be undone. Delete all saved user data, clear in-memory state, and leave no health-record recovery copy.

### Accessibility

All interactions must work with touch, mouse, and keyboard. Dates and values need accessible names, visible focus, and non-colour indicators. Manage focus when opening/closing editors, announce selection counts and save outcomes, and provide clear storage/import error messages.

## Data and calculations

### Mutable storage

Use date-keyed daily records and explicit period-start markers, stored with transactional consistency. Keep metadata and schema versions separate from health observations. Do not introduce a general event-sourcing framework.

Use date-only values such as `YYYY-MM-DD` for observations. Recording timestamps, if needed, are separate metadata. Calculate calendar-day differences without dividing local-midnight elapsed milliseconds by 24 hours.

Derive cycles and estimates from the current records rather than persisting derived cycle objects. Schema migrations must preserve records and be tested.

### Usable history

Cycle length is the interval between consecutive recorded menstrual starts. Missing starts can make that interval misleading; daily logging must not be required to establish a usable start history.

Provide a way to mark an interval as incomplete or excluded from estimates. Do not silently treat a long interval as multiple cycles or infer missed starts. Bleeding duration summaries must disclose incomplete daily observations.

### Prediction baseline

Keep cycle derivation and prediction in pure, versioned modules.

Use a median-based baseline over recent usable completed intervals. Show an estimated range, not a confidence percentage or a single guaranteed date. Do not estimate with fewer than two usable completed intervals. Explain limited history and withheld estimates in plain language.

Exact recency weighting, history length, range width, and widening rules remain to be agreed and tested. MAD-based formulas are engineering heuristics, not validated individual confidence guarantees.

Start with descriptive summaries of usable cycle lengths and their range. Historical prediction-error reporting is deferred until it has a defined, honest measurement method.

## Import, export, and recovery

JSON is the versioned, readable backup/restore format. CSV is a readable export, not the initial restore format. Neither format is encrypted.

Validate imports before committing anything, show a preview, reject unsupported schemas with an explanation, and preserve existing data on failure. Treat imported content as data, never HTML or executable code.

The merge-versus-replace policy and conflict-resolution interface are open decisions. Do not implement silent overwrites as a default.

Explain that browser storage is not a backup and recommend user-owned exports. Handle unavailable storage, failed transactions, and quota errors visibly.

## Static hosting and offline behaviour

Keep all runtime assets in this repository. Use project-relative URLs and test both root hosting and a GitHub Pages repository subpath.

Cache only static application assets in the service worker, never health records. Make updates predictable and avoid reloading an editor with unsaved changes. Offline operation is available after the application assets have been successfully cached.

Use a restrictive Content Security Policy compatible with the static/offline design, and test that it does not break required functionality. No analytics, remote fonts, CDN resources, push services, or background health-data uploads.

## Implementation sequence

1. Settle diary interaction/data rules; add the static shell, date helpers, and local test setup.
2. Implement transactional storage, single-day editing, and historical records.
3. Add cross-month bulk editing, conflict handling, and in-memory Undo.
4. Add history, interval exclusions, and the tested prediction baseline.
5. Add validated backup/restore, CSV export, and complete deletion.
6. Add offline assets, update behaviour, accessibility checks, and Pages-path validation; review README claims against actual behaviour.

Steps 1-3 are implemented. Step 4 is next: the start list exists, but cycle summaries, interval exclusions, and predictions remain pending. Steps 5-6 remain pending, with root/subpath hosting and CSP checks already in place. The acceptance checklist below tracks release-wide completion.

## Validation and tooling

Use project-local Playwright for browser tests and Node's built-in test runner for pure calculations. Dependency versions belong in the package manifest and lockfile; portable setup and test commands are documented in README.md.

Run browser tests against a local static server at both the root and a repository subpath, using synthetic data only. Initial browser targets are desktop Chromium and mobile Chromium emulation; these do not establish real-device or cross-browser coverage.

### Acceptance checklist

- [x] Unknown, none, spotting, and menstrual bleeding remain distinguishable.
- [x] Historical single-day edits persist after reload.
- [x] Cross-month bulk edits preserve selection and commit atomically.
- [x] Bulk edits cannot silently create, remove, or invalidate period starts.
- [ ] Corrections, interval exclusions, and date arithmetic produce tested cycles.
- [ ] Estimates handle insufficient, incomplete, and variable history honestly.
- [ ] JSON export/restore round-trips the supported user data.
- [ ] Invalid imports and failed saves leave existing data intact.
- [ ] CSV export preserves dates and values in a documented format.
- [ ] Delete all data survives reload, clears Undo, and works offline.
- [ ] Core workflows work with keyboard and touch-sized controls.
- [ ] Browser tests detect unexpected external requests or health data in URLs.
- [ ] Offline operation and asset updates never cache health records.
- [x] Root and repository-subpath hosting both work.
- [ ] README privacy and capability statements match the shipped application.

## Decisions to resolve before dependent implementation

- Import merge/replace behaviour and how users resolve conflicting dates.
- Presentation and storage of incomplete/excluded intervals.
- Prediction history length, weighting, estimated-window rules, and wording.

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
- History, start-history completeness check-ins, basic cycle summaries, and next-period estimated ranges.
- Unencrypted JSON backup/restore, CSV export, and complete data deletion.
- An installable offline application shell that caches static assets only.
- Focused unit tests and Playwright browser tests.
- MIT license with Jon as the copyright holder.

Symptoms, ovulation/fertility inference, clinical alerts, accounts, sync, encryption, and scheduled reminders are outside the first release. In-app history check-ins clarify potentially missing records; they are not medical alerts or scheduled reminders.

## Invariants

- An unlogged day means "Not recorded", not an observation of no bleeding. No separate daily state is required to distinguish not yet entered from forgotten.
- Logging a date does not populate adjacent dates.
- Bleeding intensity does not automatically establish a period start.
- Daily observation completeness and period-start history completeness are separate; sparse daily logging does not itself make start history unusable.
- A long interval is not automatically invalid and never establishes that a period start was missed.
- Every historical observation, period-start marker, and start-history completeness statement can be corrected or removed.
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

Offer one-step, session-only, in-memory Undo for ordinary edits, including history-review answers. Undo is not a persistent audit history and is not available after complete deletion.

Agreed first-release interaction rules: weeks start on Monday. A conflicting edit offers explicit marker removal inside its preview rather than requiring a separate correction workflow; observation changes and separately authorised marker removals commit together. Clearing a day with a recorded start requires confirmation to remove both its observation and marker. Undo restores the latest changed ordinary edit atomically, including its marker and affected history reviews. It has no timeout and is replaced by the next successful changed edit; successful Undo, reload, successful backup restore, and complete deletion clear it. Undo retains only actually changed dates and affected review state, not unchanged selections or a recovery copy of the diary. Navigation, selection, cancelled edits, failed saves, and unchanged saves do not replace Undo. Undo checks affected records, reviews, and reviewed-start context before restoring anything, rejecting intervening changes without partial restoration. There is no redo or persistent undo history; backup restore is outside ordinary-edit Undo.

### History and settings

Use three main destinations: Calendar, History, and Settings.

History shows period starts, completed intervals, and basic summaries. Make corrections reachable without asking users to reconstruct their history.

Provide neutral, dismissible check-ins where a gap in recorded starts may conceal missing history, both between historical starts and since the latest start. Do not require daily logging or filling intervening days with "none" to establish usable start history. Check-ins must not block ordinary logging or label a long interval abnormal.

A check-in identifies the span being reviewed and lets the user confirm that all starts in that span are recorded, add remembered missing starts, report that one or more starts are missing but their dates are forgotten, or leave completeness unresolved because they are unsure. For a span since the latest start, confirming completeness means no further period has occurred through the reviewed date. Preserve daily observations unchanged unless the user explicitly edits them.

Remember answers so the same answered span does not repeatedly prompt. A confirmation ends at the reviewed date; it does not establish completeness indefinitely. An unsure answer does not establish completeness, and dismissal is not confirmation.

Agreed review interaction: manual review actions live in History, between consecutive recorded starts and from the latest start through today when that span has elapsed days. Saved answers remain directly reachable for correction or removal even if later start corrections change the interval boundaries. Reviews are non-blocking; closing without saving makes no change, and unsure answers remain visibly unresolved without repeatedly opening a dialog. Remembered missing dates open the ordinary day editor for an explicit start and bleeding observation; the unsaved review answer is not saved.

Automatic check-ins appear as non-modal History cards, not interrupting dialogs. A compact Calendar notice links to History when an estimate is withheld or history is insufficient. Dismissal records no completeness answer and does not change calculation eligibility or replace ordinary Undo. Persist dismissals against the reviewed span and its recorded-start context; an open span is identified by its latest-start anchor, not by a new identity each day. Dismissed or unsure spans do not prompt again unless their recorded starts change. Existing review answers and current interval statuses remain manually accessible even when cards are suppressed.

After confirming an open span, wait at least seven calendar days beyond the reviewed end date before another automatic check-in, and require the personal duration trigger to remain applicable; if personal history is insufficient, use the neutral limited-history explanation instead. Confirmation never extends beyond the dates actually reviewed. Merge overlapping check-in spans so one affected review is not separately prompted as both historical and open history. Saving or removing a review supersedes overlapping dismissal preferences. Start corrections remove obsolete dismissal contexts in the same transaction, and ordinary Undo restores applicable dismissal effects alongside days and review answers.

Every answer covers fixed dates. Adjacent spans may share a boundary date without replacing one another. When a requested review overlaps an existing answer beyond a shared boundary, expand the review to include the full span of every overlapping answer, including transitive overlaps. Show the final dates and all affected answers, and require unchecked-by-default approval before replacing or removing them. Do not silently drop warnings outside a newly requested subspan.

Settings provides import/export, the privacy explanation, and a prominent red "Delete all data" action. Require explicit confirmation explaining that deletion cannot be undone. Delete all saved user data, clear in-memory state, and leave no health-record recovery copy.

### Accessibility

All interactions must work with touch, mouse, and keyboard. Dates and values need accessible names, visible focus, and non-colour indicators. Manage focus when opening/closing editors, announce selection counts and save outcomes, and provide clear storage/import error messages.

## Data and calculations

### Mutable storage

Use date-keyed daily records and explicit period-start markers, stored with transactional consistency. Store user statements about start-history completeness separately from daily bleeding observations; these statements are user health data, not merely application metadata. Check-in dismissals also contain health-related spans and start context: keep them in a separate mutable user-data store, not schema metadata. Keep application metadata and schema versions separate from health observations. Do not introduce a general event-sourcing framework.

Use date-only values such as `YYYY-MM-DD` for observations. Recording timestamps, if needed, are separate metadata. Calculate calendar-day differences without dividing local-midnight elapsed milliseconds by 24 hours.

Derive cycles and estimates from the current records rather than persisting derived cycle objects. Schema migrations must preserve records and be tested.

### Usable history

An observed start-to-start interval is the calendar-day difference between consecutive recorded menstrual starts. It represents a cycle length only insofar as the recorded starts are complete for that span. Missing starts can make that interval misleading; daily logging must not be required to establish a usable start history.

Keep daily observation coverage distinct from start-history completeness. "Not recorded" means the app has no daily observation, whether the user remembers that day or not. Neither gaps nor complete daily bleeding observations prove that every period start was recorded. Do not require users to paint forgotten days as unknown or known intervening days as "none" to unlock cycle information.

Record meaningful user statements about reviewed spans rather than a generic "exclude from calculations" flag: all starts are recorded through the reviewed date, or one or more starts are known to be missing within the span but cannot be dated. If dates are remembered, add the actual starts instead. Uncertainty leaves completeness unresolved.

Recalculate intervals and summaries from current records whenever starts are added, corrected, or removed. For example, adding a remembered start between two existing starts replaces the old interval with the two newly derived intervals; no inferred start or saved cycle object is needed. Do not silently transfer an old statement to different history.

Agreed reviewed-span semantics: store each mutable answer separately with fixed inclusive start/end dates, recorded-start context, an explicit needs-review state, and whether reported missing starts remain unresolved. Adding, removing, or moving any start within the span, including either boundary, marks it as needing review in the same transaction as the day edit. Bleeding-only edits and start changes outside the span leave the answer intact. Keep the prior answer visibly marked as needing review, but update its stored start context to the current starts rather than retaining deleted or superseded starts; the old state exists only in ordinary in-memory Undo. Undo restores both the day changes and their review effects atomically. Merely returning starts to an earlier arrangement through another edit does not reconfirm an answer.

A reported missing-start span continues excluding all overlapping intervals until explicitly resolved or removed. Adding a remembered start does not establish that no others are missing. Re-answering Unsure preserves any unresolved missing-start report in the replaced span; explicitly confirming that all starts are now recorded clears it. Removal is an explicit, undoable deletion of the listed statements and their warnings, not a confirmation.

Distinguish provisionally usable intervals with no evidence of missing starts, potentially incomplete spans awaiting review, confirmed missing-start spans, and confirmed complete spans. Do not use an interval known to contain missing starts as a single cycle in usable-cycle summaries or estimates. Retain the actual length of a confirmed complete interval even when unusually long; confirmation is not permission to silently discard it.

For the descriptive summary, include confirmed complete intervals and provisional intervals separately counted, and show their actual minimum and maximum lengths. An interval is confirmed complete only when a current complete answer covers its full span. Any overlapping unresolved missing-start report excludes it; otherwise an overlapping unsure or needs-review answer, or an unanswered personal duration trigger, makes it unresolved and excludes it. With no such evidence, it is provisional, not proof of a complete cycle. Suppressing a check-in never changes that status.

Detect possible missing history to ask a question, not to establish that a period must have occurred. Consider both historical intervals and the open span since the latest start. The approved engineering trigger is a span strictly longer than 1.5 times the median of at least three other usable completed intervals, taking at most the six most recent other intervals. Exclude the historical interval being assessed from its own comparison; use all available eligible completed intervals, up to six, for the open span. For an even sample, the median averages the two central lengths. Baselines use current confirmed-complete and provisional intervals before applying this detection pass; calculate flags independently rather than feeding one new flag into another candidate's baseline. Historical detection is retrospective review of current records, not a prediction-error backtest.

A current complete answer covering a historical interval takes precedence over its duration trigger. An open confirmation covers only its reviewed dates and follows the seven-day resurfacing rule above. With fewer than three comparison intervals, offer a neutral History check-in explaining insufficient personal history, without labelling the span potentially missing solely for that reason or applying a population-based duration cutoff. The multiplier, sample sizes, and cooldown are engineering choices, not validated medical cutoffs. Do not infer the number or dates of missed starts.

Bleeding duration summaries must disclose incomplete daily observations independently of start-history completeness.

### Prediction baseline

Keep cycle derivation and prediction in pure, versioned modules.

Show an estimated range, not a confidence percentage or a single guaranteed date. Explain limited history, potentially missing starts, and withheld estimates in plain language.

Approved forecast policy: inspect the six most recent completed recorded intervals, then exclude known-missing intervals. Require at least three eligible confirmed-complete or provisional intervals within that set; weight them equally and show the sample and provisional counts. Do not reach further back to bypass exclusions or unresolved recent history. Any unresolved interval among those six withholds a forecast, including unanswered personal duration triggers, unsure answers, and stale completeness reviews. Relevant missing or unresolved history since the latest start also withholds it. Unrelated old unresolved spans outside the selected history do not block every forecast.

Anchor the estimated window to the latest explicitly recorded start. The lower offset is the shortest eligible length minus two days, clamped to at least one day; the upper offset is the longest eligible length plus two days. Keep confirmed long intervals in the sample and widen naturally with observed variation; apply no extra outlier rejection or hidden weighting. If dates exceed the supported calendar, explain why an estimate is unavailable. If today is after the upper date, label the window as passed without sliding it forward or inferring another period. Recompute from current records and date; do not persist a forecast as a fact.

The window and padding are transparent, uncalibrated engineering heuristics, not validated individual confidence guarantees. Do not display confidence percentages, claim coverage, or imply medical or contraception guidance.

Start with descriptive summaries of usable cycle lengths and their range. Historical prediction-error reporting is deferred until it has a defined, honest measurement method.

## Import, export, and recovery

JSON is the versioned, readable backup/restore format. CSV is a readable export, not the initial restore format. Neither format is encrypted.

JSON backup/restore must preserve user statements about start-history completeness and check-in dismissals as well as daily records and start markers. Complete deletion must remove those statements and dismissals too.

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
4. Design history check-ins and reviewed-span semantics; add derived cycle history and start-history completeness handling, then agree and implement tested missing-history detection and prediction rules.
5. Add validated backup/restore, CSV export, and complete deletion.
6. Add offline assets, update behaviour, accessibility checks, and Pages-path validation; review README claims against actual behaviour.

Steps 1-4 are implemented: the diary, derived interval history, descriptive usable-length summaries, fixed-span reviews, automatic history check-ins, and cautious next-period ranges follow the agreed policies above. Reviewed history and dismissal preferences use versioned mutable storage with transactional correction effects and one-step session-only Undo. Step 5 is next: validated backup/restore, CSV export, and complete deletion. Step 6 remains pending, with root/subpath hosting and CSP checks already in place. The acceptance checklist below tracks release-wide completion.

## Validation and tooling

Use project-local Playwright for browser tests and Node's built-in test runner for pure calculations. Dependency versions belong in the package manifest and lockfile; portable setup and test commands are documented in README.md.

Run browser tests against a local static server at both the root and a repository subpath, using synthetic data only. Initial browser targets are desktop Chromium and mobile Chromium emulation; these do not establish real-device or cross-browser coverage.

### Acceptance checklist

- [x] Unknown, none, spotting, and menstrual bleeding remain distinguishable.
- [x] Historical single-day edits persist after reload.
- [x] Cross-month bulk edits preserve selection and commit atomically.
- [x] Bulk edits cannot silently create, remove, or invalidate period starts.
- [x] Corrections and date arithmetic recalculate tested intervals without inventing starts or retaining obsolete derived cycles.
- [x] Sparse daily observations do not by themselves disqualify period-start history.
- [x] Manual history reviews distinguish confirmed complete, known missing, and unresolved start history without changing daily observations or repeatedly questioning an answered span.
- [x] Automatic history check-ins use agreed detection and resurfacing rules without blocking ordinary logging.
- [x] Known missing-start intervals are not treated as single usable cycles; confirmed long intervals retain their actual length.
- [x] Reviewed-span corrections and persistence follow agreed, tested rules.
- [x] Estimates handle insufficient, incomplete, and variable history honestly.
- [ ] JSON export/restore round-trips the supported user data.
- [ ] Invalid imports and failed saves leave existing data intact.
- [ ] CSV export preserves dates and values in a documented format.
- [ ] Delete all data survives reload, clears Undo, and works offline.
- [ ] Core workflows work with keyboard and touch-sized controls.
- [x] Browser tests detect unexpected external requests or health data in URLs.
- [ ] Offline operation and asset updates never cache health records.
- [x] Root and repository-subpath hosting both work.
- [ ] README privacy and capability statements match the shipped application.

## Decisions to resolve before dependent implementation

- Import merge/replace behaviour and how users resolve conflicting dates.

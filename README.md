# Phase

A straightforward, user-controlled menstrual cycle diary.

Phase is a free, open-source application designed for GitHub Pages. The diary lets users record and correct individual days or selected days across months without requiring daily logging. Cautious next-period estimates are planned but not implemented. It is not a diagnostic tool or a method of contraception.

## Project status

The diary is implemented: a mobile-first, Monday-first monthly calendar, historical single-day and bulk editing, IndexedDB persistence, explicit period-start markers, and one-step in-memory Undo. Changing a start day to none or spotting requires explicit marker removal; clearing a start day requires confirmation to remove its observation and marker together. Saves and Undo are acknowledged only after their transactions commit. Undo restores an entire edit or batch, expires after 30 seconds, the next successful changed edit, or reload, and has no redo or persistent history.

Choose Select days to retain selected dates while navigating months, then choose a bleeding value or Clear observations. Conflict-free actions save directly without a preview modal; the calendar shows the selected observations. Bulk actions never create period starts and preserve compatible starts. If an action conflicts with period starts, a modal shows only the affected dates' before/after values and requires a separate unchecked-by-default approval for each marker removal before saving the whole batch. The whole batch commits atomically, or no day changes. A successful save exits selection mode; Back to selection or Escape cancels the conflict prompt but retains the selection. Cancel selection or leaving Calendar clears it. Failed, cancelled, and unchanged edits do not replace or extend Undo.

Bulk saves check against the records shown in the calendar, not silently refreshed values. If a selected record changed elsewhere, the save stops without changing any day and offers Refresh calendar records. Refresh preserves selection but never retries the action automatically: review the updated observations before choosing an action again. Storage failures are explained without losing the selection.

History lists recorded starts with links to correct them. Settings explains privacy and current limitations. Cycle summaries, exclusions, estimates, import/export, in-app complete deletion, and offline installation are not implemented yet. Do not rely on this development version as your only record: browser storage can be lost, and backup export is not available yet.

- [PLAN.md](PLAN.md) defines the first release and its acceptance criteria.
- [TODO.md](TODO.md) records possible later additions, not release requirements.

## Privacy promise

The following is the first-release commitment. Local-only storage and no third-party runtime resources are implemented; export and in-app complete deletion are still pending:

> Phase has no analytics, advertising, tracking, or third-party runtime resources. Your cycle records are stored in your browser on your device. The app does not send those records to anyone. You control your records: edit them, export them, or delete all saved data at any time.
>
> GitHub Pages serves the application and receives ordinary website-request metadata. Exports are unencrypted, and you are responsible for securing your device and any exported files.

There are no accounts, remote fonts, CDN imports, telemetry, or cloud sync. All application JavaScript, HTML, CSS, and other runtime assets live in this project. Development tools are not shipped as application dependencies. The static shell has a restrictive Content Security Policy; there is no service worker or application asset cache yet.

All user data is only stored locally and can be lost.

Other apps hosted under my GitHub Pages address could technically read Phase's stored data. As the owner of that address, I promise that no other app I publish there will read or share your Phase records. If you would rather not rely on that promise, you can host Phase yourself on a separate domain or subdomain.

Do not include real health records in public issues, screenshots, or test fixtures.

## Development

Node.js 20 or newer is required by the pinned Playwright development dependency. There are no application dependencies.

The manifest pins `@playwright/test` to `1.64.1`, matching the Playwright installation and Chromium revision `1248` found during the initial environment assessment. Browser caches are machine-specific and are not part of this repository.

Install project dependencies only when ready to approve that installation:

```bash
npm install
```

This is separate from installing browser binaries or operating-system packages. Do not automatically run `playwright install --with-deps`. Check the existing browser cache first and agree on any additional installation.

Run the local static server with `npm start`, then open `http://127.0.0.1:4173/`. The same server supports `/phase/` for repository-subpath checks. Deployment requires only `index.html`, `styles.css`, and `src/`; no build step or runtime packages are needed.

`npm test` runs Node's built-in unit tests followed by Playwright tests in desktop and mobile Chromium. `npm run test:unit` and `npm run test:browser` run them separately; `npm run check` checks JavaScript syntax. Tests cover date arithmetic, marker validation, historical persistence, cross-month selection, per-date conflict approval, atomic batch saves and Undo, stale-record and storage failures, keyboard/touch interactions, static-only requests, CSP, and root/subpath hosting. All test records are synthetic; screenshots, videos, and traces are disabled.

No formatter or linter dependency is configured. Browser tests reuse the existing Chromium installation; additional browser or system installations still require approval.

## License

[MIT](LICENSE). Copyright (c) 2026 Jon.

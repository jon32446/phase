# Phase

A straightforward, user-controlled menstrual cycle diary.

Record and correct your history without accounts, data harvesting or cloud sync. Phase is free and open source. It is not a diagnostic tool or a method of contraception.

## Current status

The diary supports a mobile-first monthly calendar, historical single-day and cross-month bulk editing, explicit period starts, browser-local storage, and a short-lived Undo for the last edit or batch. History lists recorded starts for correction.

Cycle summaries, start-history completeness check-ins, next-period estimates, import/export, in-app complete deletion, and offline/PWA support are not implemented yet. **Do not rely on this development version as your only record:** browser storage can be lost, and backup export is not available.

The planned history model separates daily bleeding observations from whether all period starts are recorded. It does not require daily logging: an unrecorded day is not an observation of "none", and a long interval is not automatically invalid. Planned check-ins will let users clarify potentially missing starts without inventing dates or reconstructing every day's bleeding. Prompting and prediction rules are still being designed.

[PLAN.md](PLAN.md) defines first-release behaviour, remaining decisions, and acceptance criteria. [TODO.md](TODO.md) lists optional later ideas, not release requirements.

## Privacy promise

The following is the first-release commitment:

**TODO:** Export and in-app complete deletion are not yet implemented; both are required to fulfil the first-release promise below.

> Phase has no analytics, advertising, tracking, or third-party runtime resources. Your cycle records are stored in your browser on your device. The app does not send those records to anyone. You control your records: edit them, export them, or delete all saved data at any time.
>
> GitHub Pages serves the application and receives ordinary website-request metadata. Exports are unencrypted, and you are responsible for securing your device and any exported files.

There are no accounts, remote fonts, CDN imports, telemetry, or cloud sync. All application JavaScript, HTML, CSS, and other runtime assets live in this project. Development tools are not shipped as application dependencies. The static shell has a restrictive Content Security Policy; there is no service worker or application asset cache yet.

All user data is only stored locally and can be lost.

Other apps hosted under my GitHub Pages address could technically read Phase's stored data. As the owner of that address, I promise that no other app I publish there will read or share your Phase records. If you would rather not rely on that promise, you can host Phase yourself on a separate domain or subdomain.

Do not include real health records in public issues, screenshots, or test fixtures.

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

`npm test` runs Node unit tests and Playwright browser tests; `npm run check` checks JavaScript syntax. Use `npm run test:unit` or `npm run test:browser` to run a suite separately. Browser tests start their own local server on port 4173, so stop `npm start` before running them.

Browser coverage uses desktop Chromium and mobile Chromium emulation, not real mobile devices or other browser engines. Use synthetic health data in all tests and examples.

## License

[MIT](LICENSE). Copyright (c) 2026 Jon.

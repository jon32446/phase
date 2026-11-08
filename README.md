# Phase

A straightforward, user-controlled menstrual cycle diary.

Phase is planned as a free, open-source application hosted on GitHub Pages. It will let users record and correct their history without requiring daily logging, and provide cautious next-period estimates when the available history supports them. It is not a diagnostic tool or a method of contraception.

## Project status

This repository currently contains the initial plan and development manifest. The application and tests have not been implemented yet.

- [PLAN.md](PLAN.md) defines the first release and its acceptance criteria.
- [TODO.md](TODO.md) records possible later additions, not release requirements.

## Privacy promise

The following is the commitment the implementation must satisfy:

> Phase has no analytics, advertising, tracking, or third-party runtime resources. Your cycle records are stored in your browser on your device. The app does not send those records to anyone. You control your records: edit them, export them, or delete all saved data at any time.
>
> GitHub Pages serves the application and receives ordinary website-request metadata. Exports are unencrypted, and you are responsible for securing your device and any exported files.

There will be no accounts, remote fonts, CDN imports, telemetry, or cloud sync. All application JavaScript, HTML, CSS, and other runtime assets will live in this project. Development tools are not shipped as application dependencies.

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

`npm test` is reserved for the Playwright suite. It will become usable once the test configuration and tests are implemented. No tests are present yet.

## License

[MIT](LICENSE). Copyright (c) 2026 Jon.

# Phase

A free and open-source menstrual cycle diary. Record what you remember, correct past entries, and keep your history on your own device.

**[Open Phase](https://jon32446.github.io/phase/)**

## What it does

- Record bleeding and period starts on a monthly calendar, including past dates and batches of days.
- Review your cycle history and clarify gaps without needing to log every day.
- See a next-period date range when there is enough usable history.
- Save and restore complete JSON backups, export observations as CSV, or delete your saved data.
- Use it offline after setup, and install it on your home screen.

Phase cannot diagnose health conditions. Do not rely on its estimates for contraception.

## Use and install

Open Phase in your browser and choose **Log today**, or tap a past date. Check **Settings > Here, even offline** to confirm offline setup has finished.

The [diary guide](docs/diary-guide.md) explains editing, history, estimates, backups, and updates.

Installation adds Phase to your home screen, Dock, or applications so you can open it like an app. It is optional. You can keep using Phase in your browser. Menu names and locations vary by browser version.

### iPhone or iPad (Safari)

1. Open [Phase](https://jon32446.github.io/phase/) in Safari.
2. Tap **Share** (the square with an upward arrow). On iPhone, you may need to open **More** first. On iPad, tap **View More** if shown.
3. Choose **Add to Home Screen**. On iPhone, if it is missing, scroll to **Edit Actions** and add it.
4. Leave **Open as Web App** turned on, or turn it on if needed. Older versions may not show this option.
5. Tap **Add**, then open Phase using its home-screen icon.

### Android (Chrome)

1. Open [Phase](https://jon32446.github.io/phase/) in Chrome.
2. Open the three-dot menu beside the address bar.
3. Choose **Install and create shortcut > Install**. Other versions may show **Install app** or **Add to Home screen**.
4. Follow the prompts to confirm, then open Phase from your home screen or app drawer.

### Windows, macOS, or Linux (Chrome or Edge)

1. Open [Phase](https://jon32446.github.io/phase/) in Chrome or Edge.
2. Click the install icon in the address bar if shown. In Chrome, you can also use the three-dot menu and choose **Cast, save, and share > Install page as app...**. In Edge, use **Settings and more > More tools > Apps > Install this site as an app**. Some Edge versions place **Apps** directly in the main menu.
3. Confirm installation. Phase opens in its own window and is available from your applications or app launcher.

### Mac (Safari)

Requires macOS Sonoma 14 or later.

1. Open [Phase](https://jon32446.github.io/phase/) in Safari.
2. Choose **File > Add to Dock**, or **Share > Add to Dock**.
3. Click **Add**, then open Phase from the Dock or your Applications folder.

### Changing device

If you already have diary entries, save a JSON backup before switching browsers or opening an installed app for the first time. If your diary is empty there, restore your backup using **Settings > Preview restore**.

## Privacy

Your cycle records stay in your browser on your device. Phase does not send them to anyone. There are no accounts, analytics, advertising, tracking, cloud sync, or third-party runtime resources. You can edit, export, or delete your records at any time.

**Browser storage can be lost.** Keep your own JSON backups through **Settings > Save a backup**. Backups and CSV exports are unencrypted, so keep them somewhere secure. Installing Phase does not back up your diary or transfer it between devices.

GitHub Pages hosts the app and receives ordinary website-request metadata. Other apps on the same GitHub Pages origin could technically read Phase's stored data. As the owner of that address, I promise that no other app I publish there will read or share your Phase records. A dedicated hosting origin remains future work. You can also host Phase yourself on a separate domain or subdomain.

## Run locally

With Node.js 20 or newer and npm, run this from the repository directory:

```bash
npm start
```

Open <http://127.0.0.1:4173/>. Running the app needs no dependency installation or build step.

## Host your own

Publish `index.html`, `styles.css`, `sw.js`, `manifest.webmanifest`, `icon.svg`, and the entire `src/` directory to an HTTPS static host. Repository subpaths are supported.

For GitHub Pages, open the repository's **Settings > Pages**, choose **Deploy from a branch**, select your publishing branch and **/ (root)**, and save. This repository uses `master`. No build configuration is needed.

See the [technical reference](docs/technical-reference.md) for content types and releasing updates. Moving to a different origin requires exporting your diary from the old address and restoring it at the new one.

## Develop and test

The app uses vanilla JavaScript, HTML, and CSS with no third-party runtime dependencies. To set up the development tests:

```bash
npm ci
npx playwright install chromium
npm test
npm run check
```

These setup commands install development packages and a browser. See the [test notes](docs/technical-reference.md#testing) for prerequisites, individual suites, and coverage limits. Real-device and screen-reader testing remain best-effort follow-up work. Use synthetic health data in tests, screenshots, and public issues.

[Optional future ideas](TODO.md) · [Archived first-release specification](docs/first-release-plan.md)

## License

[MIT license](LICENSE). Copyright (c) 2026 Jon.

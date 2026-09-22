# Accessibility and keyboard tests

These tests use Playwright and axe-core against the deployed portal by default.

## Commands

```bash
npm run test:a11y
npm run test:keyboard
npm run test:e2e
npm run test:devices
```

Override the target with `PLAYWRIGHT_BASE_URL` when testing a local server.

Authenticated tests read these variables from the process environment or the
local `.env` file without printing them:

- `VISTABALAYAN_OFFICER_EMAIL`
- `VISTABALAYAN_HOTEL_EMAIL`
- `VISTABALAYAN_RESORT_EMAIL`
- `VISTABALAYAN_TEST_PASSWORD`

The tests are read-only. They do not submit reports, save room configuration,
or change notification records. Each test creates a fresh Playwright context.

The browser binary is not committed. Install it once in the development or CI
environment with:

```bash
npx playwright install chromium
```

The device projects are:

- `desktop-chromium`: desktop Chromium at 1280×900.
- `android-chrome`: Chromium using Playwright's Pixel 5 profile.
- `ios-safari-home-screen`: WebKit using Playwright's iPhone 13 profile.

These are browser/device-profile emulation tests, not proof from physical
hardware. The iOS project verifies the WebKit/mobile layout and interaction
path; it cannot reproduce every iOS Safari or Home Screen OS behavior.

## Required physical-device pass

Before release, record a separate manual or device-cloud run on:

- Android Chrome on a real Android phone: login, navigation drawer, report form,
  notification center, keyboard/input behavior, rotation, and offline/reconnect.
- Desktop Chromium: keyboard-only navigation, axe scan, dialogs, tables, forms,
  notifications, download behavior, and 1280px/1440px layouts.
- iOS Safari and an iOS Home Screen launch: login, safe-area handling, fixed
  notification panel, date/number inputs, keyboard avoidance, rotation, reload,
  and launch while offline.

Do not mark the physical-device column passed from Playwright emulation alone.

- WCAG 2A/2AA serious and critical axe violations on officer pages, the staff
  accommodation form, and the open notification center.
- Mobile navigation open/close behavior.
- Account-menu keyboard activation and Escape dismissal.
- Notification-center keyboard activation, Escape dismissal, and focus return.
- Report-table focusable controls.
- Room-configuration dialog keyboard dismissal and focus return.
- Visitor-form input accessible names.

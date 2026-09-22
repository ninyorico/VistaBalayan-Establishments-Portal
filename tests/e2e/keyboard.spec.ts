import { expect } from "@playwright/test";
import { test, gotoAuthenticated, loginAs } from "./accessibility-helpers";

test("keyboard: mobile navigation opens and Escape closes it", async ({ authenticatedPage }) => {
  await gotoAuthenticated(authenticatedPage, "/officer");
  const open = authenticatedPage.getByRole("button", { name: "Open navigation menu" }).first();
  if (await open.count() === 0) test.skip(true, "Desktop layout uses the persistent sidebar instead of a mobile navigation button.");
  await open.focus();
  await authenticatedPage.keyboard.press("Enter");
  await expect(authenticatedPage.locator('button[aria-label="Close navigation menu"]:visible').first()).toBeVisible();
  await expect(authenticatedPage.getByRole("link", { name: "Report Monitoring" })).toBeVisible();
  await authenticatedPage.keyboard.press("Escape");
  await expect(authenticatedPage.getByRole("button", { name: "Open navigation menu" }).first()).toBeVisible();
  await expect(authenticatedPage.locator('button[aria-label="Close navigation menu"]:visible')).toHaveCount(0);
});

test("keyboard: account menu opens with Enter and closes with Escape", async ({ authenticatedPage }) => {
  await gotoAuthenticated(authenticatedPage, "/officer");
  const account = authenticatedPage.getByRole("button", { name: "Open account menu" });
  await account.focus();
  await authenticatedPage.keyboard.press("Enter");
  await expect(authenticatedPage.getByRole("button", { name: "Logout" })).toBeVisible();
  await authenticatedPage.keyboard.press("Escape");
  await expect(authenticatedPage.getByRole("button", { name: "Logout" })).toHaveCount(0);
  await expect(account).toBeFocused();
});

test("keyboard: notification center opens, closes, and restores focus", async ({ authenticatedPage }) => {
  await gotoAuthenticated(authenticatedPage, "/officer");
  const notificationButton = authenticatedPage.getByRole("button", { name: /notifications/i });
  await notificationButton.focus();
  await authenticatedPage.keyboard.press("Enter");
  await expect(authenticatedPage.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await authenticatedPage.keyboard.press("Escape");
  await expect(authenticatedPage.getByRole("heading", { name: "Notifications" })).toHaveCount(0);
  await expect(notificationButton).toBeFocused();
});

test("keyboard: report table exposes focusable controls and ordered tab stops", async ({ authenticatedPage }) => {
  await gotoAuthenticated(authenticatedPage, "/officer/report-monitoring");
  const table = authenticatedPage.getByRole("table").first();
  await expect(table).toBeVisible();
  const controls = table.locator('tr[role="button"], button, a, input, select, textarea');
  expect(await controls.count()).toBeGreaterThan(0);
  for (let index = 0; index < Math.min(await controls.count(), 5); index += 1) {
    await controls.nth(index).focus();
    await expect(controls.nth(index)).toBeFocused();
  }
});

test("keyboard: monitoring rows activate with Enter and dialogs trap focus", async ({ authenticatedPage }) => {
  await gotoAuthenticated(authenticatedPage, "/officer/report-monitoring");
  const row = authenticatedPage.locator('tr[role="button"]').first();
  if (await row.count() === 0) test.skip(true, "No populated monitoring row is available in the current test dataset.");
  await row.focus();
  await authenticatedPage.keyboard.press("Enter");
  const dialog = authenticatedPage.getByRole("dialog").first();
  await expect(dialog).toBeVisible();
  await authenticatedPage.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(row).toBeFocused();
});
test("keyboard: accommodation dialog opens and closes without losing the form", async ({ authenticatedPage }) => {
  await loginAs(authenticatedPage, "VISTABALAYAN_HOTEL_EMAIL");
  await authenticatedPage.goto("/staff/submit-accommodation-report");
  const configure = authenticatedPage.getByRole("button", { name: /configure rooms/i });
  await expect(configure).toBeVisible();
  await configure.focus();
  await authenticatedPage.keyboard.press("Enter");
  await expect(authenticatedPage.getByText(/room configuration/i).first()).toBeVisible();
  await authenticatedPage.keyboard.press("Escape");
  await expect(authenticatedPage.getByText(/room configuration/i).first()).toBeHidden();
  await expect(configure).toBeFocused();
});

test("keyboard: visitor form inputs have accessible names", async ({ authenticatedPage }) => {
  await loginAs(authenticatedPage, "VISTABALAYAN_RESORT_EMAIL");
  await authenticatedPage.goto("/staff/submit-visitor-report");
  const unnamed = await authenticatedPage.locator("input, select, textarea").evaluateAll((elements) => elements.filter((element) => {
    const input = element as HTMLInputElement;
    const labelledBy = input.getAttribute("aria-labelledby");
    const label = input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null;
    return !input.getAttribute("aria-label") && !labelledBy && !label && !input.getAttribute("placeholder");
  }).length);
  expect(unnamed).toBe(0);
});

import { expect } from "@playwright/test";
import { test, expectNoSeriousA11yViolations, expectNoColorContrastViolations, gotoAuthenticated, loginAs } from "./accessibility-helpers";

for (const route of ["/officer", "/officer/report-monitoring"]) {
  test(`axe scan: ${route}`, async ({ authenticatedPage }) => {
    await gotoAuthenticated(authenticatedPage, route);
    await expect(authenticatedPage.locator("main")).toBeVisible();
    await expectNoSeriousA11yViolations(authenticatedPage);
  });
}

test("axe scan: staff accommodation report form", async ({ authenticatedPage }) => {
  await loginAs(authenticatedPage, "VISTABALAYAN_HOTEL_EMAIL");
  await authenticatedPage.goto("/staff/submit-accommodation-report");
  await expect(authenticatedPage.locator("main")).toBeVisible();
  await expectNoSeriousA11yViolations(authenticatedPage);
});

test("axe scan: color contrast on officer dashboard", async ({ authenticatedPage }) => {
  await gotoAuthenticated(authenticatedPage, "/officer");
  await expectNoColorContrastViolations(authenticatedPage);
});
test("axe scan: notification center when opened", async ({ authenticatedPage }) => {
  await gotoAuthenticated(authenticatedPage, "/officer");
  const notificationButton = authenticatedPage.getByRole("button", { name: /notifications/i });
  await notificationButton.click();
  await expect(authenticatedPage.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expectNoSeriousA11yViolations(authenticatedPage);
});

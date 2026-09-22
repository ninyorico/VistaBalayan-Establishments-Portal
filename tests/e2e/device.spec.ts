import { expect } from "@playwright/test";
import { test, expectNoSeriousA11yViolations, gotoAuthenticated, loginAs } from "./accessibility-helpers";

const deviceProjects = new Set(["desktop-chromium", "android-chrome", "ios-safari-home-screen"]);

function requireDeviceProject(projectName: string) {
  test.skip(!deviceProjects.has(projectName), "This suite runs only in the named device projects.");
}

test("device smoke: authenticated officer dashboard remains usable", async ({ authenticatedPage }, testInfo) => {
  requireDeviceProject(testInfo.project.name);
  await gotoAuthenticated(authenticatedPage, "/officer");
  await expect(authenticatedPage.locator("main")).toBeVisible();
  const dimensions = await authenticatedPage.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    hasTouch: "ontouchstart" in window || navigator.maxTouchPoints > 0,
    standaloneMedia: window.matchMedia("(display-mode: standalone)").matches,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  expect(dimensions.width).toBeGreaterThan(0);
  expect(dimensions.height).toBeGreaterThan(0);
  if (testInfo.project.name === "android-chrome" || testInfo.project.name === "ios-safari-home-screen") {
    expect(dimensions.hasTouch).toBe(true);
  }
  await expectNoSeriousA11yViolations(authenticatedPage);
});

test("device smoke: navigation and notifications work without pointer-only interaction", async ({ authenticatedPage }, testInfo) => {
  requireDeviceProject(testInfo.project.name);
  await gotoAuthenticated(authenticatedPage, "/officer");
  const menu = authenticatedPage.getByRole("button", { name: /navigation menu/i });
  if (await menu.isVisible()) {
    await menu.tap().catch(async () => menu.click());
    await expect(authenticatedPage.getByRole("link", { name: "Report Monitoring" })).toBeVisible();
  }
  const notifications = authenticatedPage.getByRole("button", { name: /notifications/i });
  await notifications.tap().catch(async () => notifications.click());
  await expect(authenticatedPage.getByRole("heading", { name: "Notifications" })).toBeVisible();
});

test("device smoke: resort visitor form has usable touch targets and labels", async ({ authenticatedPage }, testInfo) => {
  requireDeviceProject(testInfo.project.name);
  await loginAs(authenticatedPage, "VISTABALAYAN_RESORT_EMAIL");
  await authenticatedPage.goto("/staff/submit-visitor-report");
  const smallTargets = await authenticatedPage.locator("button, a, input, select, textarea").evaluateAll((elements) => elements.filter((element) => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && (box.width < 40 || box.height < 40);
  }).length);
  expect(smallTargets).toBe(0);
  const unnamed = await authenticatedPage.locator("input, select, textarea").evaluateAll((elements) => elements.filter((element) => {
    const input = element as HTMLInputElement;
    const label = input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null;
    return !input.getAttribute("aria-label") && !input.getAttribute("aria-labelledby") && !label;
  }).length);
  expect(unnamed).toBe(0);
});

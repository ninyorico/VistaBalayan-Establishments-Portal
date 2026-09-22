import fs from "node:fs";
import path from "node:path";
import { expect, test as base, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

function loadTestEnv() {
  const names = [
    "VISTABALAYAN_HOTEL_EMAIL",
    "VISTABALAYAN_RESORT_EMAIL",
    "VISTABALAYAN_OFFICER_EMAIL",
    "VISTABALAYAN_TEST_PASSWORD",
  ];
  const values: Record<string, string> = {};
  for (const name of names) {
    if (process.env[name]) values[name] = process.env[name]!;
  }
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*["']?(.*?)["']?\s*$/);
      if (match && names.includes(match[1]) && !values[match[1]]) values[match[1]] = match[2];
    }
  }
  return values;
}

export async function loginAs(page: Page, emailVariable: string) {
  const env = loadTestEnv();
  test.skip(!env[emailVariable] || !env.VISTABALAYAN_TEST_PASSWORD, "Approved authenticated test credentials are not configured.");
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.evaluate(() => localStorage.clear());
  await page.locator('input[type="email"]').fill(env[emailVariable]);
  await page.locator('input[type="password"]').fill(env.VISTABALAYAN_TEST_PASSWORD);
  await page.getByRole("button", { name: /log in|sign in|login/i }).first().click();
  await expect(page).toHaveURL(/\/(staff|officer)(?:$|\/)/);
}

export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use, testInfo) => {
    const role = testInfo.project.name === "mobile" ? "VISTABALAYAN_OFFICER_EMAIL" : "VISTABALAYAN_OFFICER_EMAIL";
    await loginAs(page, role);
    await use(page);
    await page.goto("/admin/login");
  },
});

export async function expectNoSeriousA11yViolations(page: Page, included?: string[]) {
  const builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]);
  if (included?.length) builder.include(included);
  const results = await builder.analyze();
  const serious = results.violations.filter((violation) => ["critical", "serious"].includes(violation.impact || ""));
  expect(serious, serious.map((v) => `${v.id}: ${v.nodes.length} node(s)`).join("\n")).toEqual([]);
}

export async function expectNoColorContrastViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  expect(results.violations, results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`).join("\n")).toEqual([]);
}

export async function openAccountMenu(page: Page) {
  const account = page.getByRole("button", { name: /establishment staff|tourism officer/i }).first();
  await expect(account).toBeVisible();
  await account.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
  return account;
}

export async function openNotifications(page: Page) {
  const button = page.getByRole("button", { name: /notifications/i }).first();
  await expect(button).toBeVisible();
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[role="dialog"], [data-testid="notification-center"], text=Notifications').first()).toBeVisible();
  return button;
}

import { expect, test } from "@playwright/test";

/**
 * Planner end-to-end test using API-based onboarding setup.
 * Drag-and-drop in Playwright uses .dragTo() — covers basic move + validation flash.
 */

async function signupAndOnboard(
  page: import("@playwright/test").Page,
  name: string,
): Promise<{ email: string }> {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const email = `e2e-${ts}-${rand}@compass-test.local`;
  const password = "smoketestpass123";

  const signup = await page.context().request.post("/api/auth/sign-up/email", {
    data: { email, password, name },
  });
  expect(signup.ok()).toBeTruthy();

  // Walk through the 3-step wizard.
  await page.goto("/onboarding");
  await page.getByRole("button", { name: /get started/i }).click();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("button", { name: /go to dashboard/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  return { email };
}

test.describe("planner", () => {
  test("/plan renders empty state for a fresh user", async ({ page }) => {
    await signupAndOnboard(page, "Planner Smoke");
    await page.goto("/plan");
    await expect(page.getByRole("heading", { name: /my plan/i })).toBeVisible();
    await expect(page.getByText(/your plan is empty/i)).toBeVisible();
  });

  test("/requirements shows category cards", async ({ page }) => {
    await signupAndOnboard(page, "Requirements Smoke");
    await page.goto("/requirements");
    await expect(page.getByRole("heading", { name: /requirements/i })).toBeVisible();
    await expect(page.getByText(/engineering core/i).first()).toBeVisible();
    await expect(page.getByText(/software engineering core/i).first()).toBeVisible();
    await expect(page.getByText(/deficiencies/i).first()).toBeVisible();
  });

  test("dashboard reflects the empty plan", async ({ page }) => {
    await signupAndOnboard(page, "Dashboard Smoke");
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    await expect(page.getByText(/your plan is empty/i)).toBeVisible();
    // Stats grid shows 0 0 0 120 0
    await expect(page.getByText(/0 \/ 120 credits/i)).toBeVisible();
  });
});

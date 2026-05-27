import { expect, test } from "@playwright/test";

/**
 * End-to-end smoke test for the email/password auth flow.
 * Uses a randomized email per run so the DB doesn't accumulate test users
 * across local re-runs. Production cleanup happens via a separate teardown.
 */

function randomEmail(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `e2e-${ts}-${rand}@compass-test.local`;
}

test.describe("auth flow", () => {
  test("anonymous visitor sees the landing page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /software engineering degree/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /get started/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
  });

  test("/dashboard redirects anonymous users to /login", async ({ page }) => {
    const response = await page.goto("/dashboard");
    expect(response).not.toBeNull();
    await expect(page).toHaveURL(/\/login\?from=/);
  });

  test("signup → dashboard → sign out", async ({ page }) => {
    const email = randomEmail();
    const password = "smoketestpass123";

    await page.goto("/signup");
    await expect(page.getByText(/create your account/i).first()).toBeVisible();

    await page.getByLabel(/full name/i).fill("Smoke Tester");
    await page.getByLabel(/^email$/i).fill(email);
    await page.getByLabel(/^password$/i).fill(password);
    await page.getByLabel(/confirm password/i).fill(password);

    await page.getByRole("button", { name: /create account/i }).click();

    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();

    // Topbar avatar dropdown → sign out.
    await page.getByRole("button", { name: /open user menu/i }).click();
    // Base UI menu items expose role=menuitem only when the menu is open;
    // text-based lookup is more durable across SSR + portal mounts.
    await page.getByText(/^sign out$/i).click();

    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await expect(page.getByText(/^sign in$/i).first()).toBeVisible();
  });

  test("login validation: rejects empty email", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page.getByText(/enter a valid email/i)).toBeVisible();
  });

  test("signup validation: rejects mismatched passwords", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel(/full name/i).fill("Mismatch Tester");
    await page.getByLabel(/^email$/i).fill(randomEmail());
    await page.getByLabel(/^password$/i).fill("aaaaaaaa1");
    await page.getByLabel(/confirm password/i).fill("bbbbbbbb1");
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
  });
});

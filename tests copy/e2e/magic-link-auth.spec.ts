import { test, expect, chromium } from "@playwright/test";

const WEBHOOK_SITE_EMAIL = process.env.WEBHOOK_SITE_EMAIL ?? "";
const SKIP_REASON = "Requires WEBHOOK_SITE_EMAIL env var";

test.describe("magic link auth flow", () => {
  test.skip(!WEBHOOK_SITE_EMAIL, SKIP_REASON);

  test("email form submits and shows success state", async ({ page }) => {
    await page.goto("/auth/email");

    // Verify no password fields exist
    const passwordInputs = page.locator('input[type="password"]');
    await expect(passwordInputs).toHaveCount(0);

    // Verify Google button still exists
    const googleButton = page.locator('a:has-text("Continue with Google")');
    await expect(googleButton).toBeVisible();

    // Fill email and submit
    await page.getByPlaceholder("you@example.com").fill(WEBHOOK_SITE_EMAIL);
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();

    // Should show success state
    await expect(page.locator("text=Check your email")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Sent to")).toBeVisible();
    await expect(page.locator("text=Open the link we sent to continue.")).toBeVisible();
  });

  test("shows error when email is missing", async ({ page }) => {
    await page.goto("/auth/email");

    // Clear any prefill, submit empty
    await page.getByPlaceholder("you@example.com").fill("");
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();

    // Should redirect back with error
    await expect(page).toHaveURL(/error=missing-email/);
  });
});
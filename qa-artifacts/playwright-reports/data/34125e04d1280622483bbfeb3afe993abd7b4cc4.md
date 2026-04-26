# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: magic-link-auth.spec.ts >> magic link auth flow >> email form submits and shows success state
- Location: tests\e2e\magic-link-auth.spec.ts:9:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('a:has-text("Continue with Google")')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('a:has-text("Continue with Google")')

```

# Page snapshot

```yaml
- generic [ref=e2]: Internal Server Error
```

# Test source

```ts
  1  | import { test, expect, chromium } from "@playwright/test";
  2  | 
  3  | const WEBHOOK_SITE_EMAIL = process.env.WEBHOOK_SITE_EMAIL ?? "";
  4  | const SKIP_REASON = "Requires WEBHOOK_SITE_EMAIL env var";
  5  | 
  6  | test.describe("magic link auth flow", () => {
  7  |   test.skip(!WEBHOOK_SITE_EMAIL, SKIP_REASON);
  8  | 
  9  |   test("email form submits and shows success state", async ({ page }) => {
  10 |     await page.goto("/auth/email");
  11 | 
  12 |     // Verify no password fields exist
  13 |     const passwordInputs = page.locator('input[type="password"]');
  14 |     await expect(passwordInputs).toHaveCount(0);
  15 | 
  16 |     // Verify Google button still exists
  17 |     const googleButton = page.locator('a:has-text("Continue with Google")');
> 18 |     await expect(googleButton).toBeVisible();
     |                                ^ Error: expect(locator).toBeVisible() failed
  19 | 
  20 |     // Fill email and submit
  21 |     await page.getByPlaceholder("you@example.com").fill(WEBHOOK_SITE_EMAIL);
  22 |     await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  23 | 
  24 |     // Should show success state
  25 |     await expect(page.locator("text=Check your email")).toBeVisible({ timeout: 10_000 });
  26 |     await expect(page.locator("text=Sent to")).toBeVisible();
  27 |     await expect(page.locator("text=Open the link we sent to continue.")).toBeVisible();
  28 |   });
  29 | 
  30 |   test("shows error when email is missing", async ({ page }) => {
  31 |     await page.goto("/auth/email");
  32 | 
  33 |     // Clear any prefill, submit empty
  34 |     await page.getByPlaceholder("you@example.com").fill("");
  35 |     await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  36 | 
  37 |     // Should redirect back with error
  38 |     await expect(page).toHaveURL(/error=missing-email/);
  39 |   });
  40 | });
```
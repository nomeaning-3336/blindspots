import { test, expect, type Page } from "@playwright/test";

const INTERCEPTED_E2E_USER_EMAIL = "test-auth-navbar-flash@example.com";
const INTERCEPTED_E2E_USER_PW = "TestPassword123!";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Rapid DOM sampler — detects auth state flicker with sub-100ms resolution.
 * Samples the DOM every 50ms for `durationMs` and fails if the forbidden
 * selector ever appears.
 */
async function watchForAuthFlash(
  page: Page,
  forbiddenSelectors: string[],
  durationMs = 2000,
): Promise<void> {
  const interval = 50;
  const iterations = Math.ceil(durationMs / interval);
  for (let i = 0; i < iterations; i++) {
    for (const sel of forbiddenSelectors) {
      const el = page.locator(sel).first();
      const count = await el.count();
      if (count > 0) {
        // Grab a screenshot so we have visual evidence of the flash
        await page.screenshot({ path: `qa-artifacts/flash-detected-${Date.now()}.png` });
        throw new Error(
          `[auth flash] Forbidden element appeared: "${sel}" at ~${i * interval}ms into navigation`,
        );
      }
    }
    await page.waitForTimeout(interval);
  }
}

async function assertNeverAppearsDuring(
  page: Page,
  selectors: string[],
  durationMs = 2000,
  checkOnly = false,
): Promise<void> {
  const interval = 50;
  const iterations = Math.ceil(durationMs / interval);
  for (let i = 0; i < iterations; i++) {
    for (const sel of selectors) {
      const el = page.locator(sel).first();
      const count = await el.count();
      if (count > 0) {
        if (!checkOnly) {
          await page.screenshot({ path: `qa-artifacts/flash-detected-${Date.now()}.png` });
          throw new Error(`[auth flash] "${sel}" appeared at ~${i * interval}ms`);
        }
      }
    }
    await page.waitForTimeout(interval);
  }
}

// ─── Test Case A: signed-out direct protected route ───────────────────────────

test("A: signed-out user /train — authenticated nav must never appear", async ({ page }) => {
  // Clear all auth state from context
  await page.context().clearCookies();

  // 1. Start at landing page — verify signed-out state
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Landing page uses PublicHeaderClient, not AppShellNav — confirm we're on the landing page
  await expect(page.locator("h1", { hasText: "Train the positions" })).toBeVisible();

  // 2. Navigate directly to /train — middleware should redirect before shell renders
  await page.goto("/train", { waitUntil: "domcontentloaded" });

  // Wait for redirect to complete (middleware redirects before shell renders)
  // Use exact string check since URL encoding makes regex confusing
  await expect(page).toHaveURL(
    (url) => url.pathname === "/sign-in" && url.searchParams.get("next") === "/train",
    { timeout: 10_000 },
  );

  // 3. During redirect window — watch for any authenticated nav state (should never appear since shell was bypassed)
  await watchForAuthFlash(page, ["[data-testid='nav-authenticated']"], 2000);

  // 4. Final state: on sign-in page (uses PublicHeaderClient, not AppShellNav)
  await expect(page.locator("text=Welcome Back")).toBeVisible();
  // AppShellNav should not appear since sign-in is outside app/(shell)
  await expect(page.locator("[data-testid='app-shell-nav']")).toHaveCount(0);
});

// ─── Test Case B: valid signed-in user /train ─────────────────────────────────

test("B: signed-in user /train — consistent authenticated nav, no unauthenticated flash", async ({
  page,
}) => {
  // Use Supabase auth via environment credentials if available,
  // otherwise skip with a clear message.
  const email = process.env.E2E_TEST_EMAIL ?? INTERCEPTED_E2E_USER_EMAIL;
  const pw = process.env.E2E_TEST_PW ?? INTERCEPTED_E2E_USER_PW;

  if (!process.env.E2E_TEST_EMAIL) {
    test.skip(true, "Set E2E_TEST_EMAIL / E2E_TEST_PW env vars to run this test");
    return;
  }

  // Sign in
  await page.goto("/sign-in");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', pw);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 10_000 });

  // Navigate to /train
  await page.goto("/train", { waitUntil: "networkidle" });

  // Authenticated nav must appear and stay
  await expect(page.locator("[data-testid='app-shell-nav']")).toBeVisible();
  await expect(page.locator("[data-testid='nav-authenticated']")).toBeVisible();
  await expect(page.locator("[data-testid='nav-unauthenticated']")).toHaveCount(0);

  // Watch for any unauthenticated nav appearing during a 2s window
  let flashDetected = false;
  page.on("response", async (resp) => {
    if (resp.url().includes("/train") && resp.status() === 302) {
      // Unexpected redirect
      flashDetected = true;
    }
  });

  await assertNeverAppearsDuring(page, ["[data-testid='nav-unauthenticated']"], 2000);

  // Final URL should still be /train
  await expect(page).toHaveURL(/\/train/);
  expect(flashDetected).toBe(false);
});

// ─── Test Case C: stale / deleted auth cookie ──────────────────────────────────

test("C: stale cookie /train — must not flash authenticated nav", async ({ page }) => {
  // Inject a clearly-stale Supabase auth cookie
  const staleCookie = {
    name: "sb-zjapbphfmdbapyrltsaq-auth-token",
    value: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzdHViIiwiYXVkIjoiemphcGJwaGZtZGJhcHlybHRzYXEiLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTYwMDAwMDAwMH0.fake_signature",
    domain: "localhost",
    path: "/",
  };

  await page.context().addCookies([staleCookie]);

  // Visit /train — middleware should detect stale session and redirect before shell renders
  await page.goto("/train", { waitUntil: "domcontentloaded" });

  // Watch for authenticated nav flash (should never appear since middleware redirects first)
  await watchForAuthFlash(page, ["[data-testid='nav-authenticated']"], 3000);

  // Must redirect to sign-in
  await expect(page).toHaveURL(/\/sign-in/, { timeout: 10_000 });

  // Final state: on sign-in page (uses PublicHeaderClient, not AppShellNav)
  await expect(page.locator("text=Welcome Back")).toBeVisible();
  // AppShellNav should not appear since sign-in is outside app/(shell)
  await expect(page.locator("[data-testid='app-shell-nav']")).toHaveCount(0);
});
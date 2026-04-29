# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: train-replay-forward-sound-only.spec.ts >> ArrowRight at max position does not crash and plays no sound
- Location: tests\e2e\train-replay-forward-sound-only.spec.ts:297:5

# Error details

```
Test timeout of 300000ms exceeded.
```

```
Error: locator.fill: Test timeout of 300000ms exceeded.
Call log:
  - waiting for locator('input[name="password"]')
    - waiting for" http://localhost:3000/auth/email?next=%2Fanalysis" navigation to finish...
    - navigated to "http://localhost:3000/auth/email?next=%2Fanalysis"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e4]:
    - banner [ref=e5]:
      - heading "Blindspots.gg" [level=1] [ref=e7]:
        - link "Blindspots.gg" [ref=e8] [cursor=pointer]:
          - /url: /
          - generic [ref=e9]:
            - img [ref=e10]
            - generic [ref=e14]: Blindspots.gg
    - main [ref=e17]:
      - generic [ref=e19]:
        - generic [ref=e20]:
          - heading "Continue with email" [level=1] [ref=e21]
          - paragraph [ref=e22]: Sign in or create an account with just your email address.
        - generic [ref=e23]:
          - link "Continue with Google" [ref=e24] [cursor=pointer]:
            - /url: /auth/google?next=%2Fanalysis
            - img [ref=e25]
            - text: Continue with Google
          - generic [ref=e32]: Or use email
          - generic [ref=e34]:
            - generic [ref=e35]:
              - generic [ref=e36]: Email
              - textbox "Email" [ref=e37]:
                - /placeholder: you@example.com
            - button "Email me a sign-in link" [ref=e38]
        - link "Back to Home" [ref=e40] [cursor=pointer]:
          - /url: /
  - alert [ref=e41]
```

# Test source

```ts
  1   | import { test, expect, type Page } from "@playwright/test";
  2   | 
  3   | const E2E_USER_EMAIL = "test-user@example.com";
  4   | const E2E_USER_PW = "Password123!";
  5   | 
  6   | const INIT_SKIPPED: Record<string, unknown> = {
  7   |   profile: {
  8   |     initialization_status: "skipped",
  9   |     profile_initialized: false,
  10  |     weakness_vector: {},
  11  |     mastery_vector: {},
  12  |     exploit_queue: [],
  13  |     explore_queue: [],
  14  |     revisit_queue: [],
  15  |     mastered_queue: [],
  16  |   },
  17  |   preferences: { sequence_length: 4 },
  18  |   linkedProfiles: [],
  19  |   shouldShowOnboarding: false,
  20  | };
  21  | 
  22  | // A fixture position with previousFen + playedMove so the setup replay mode activates
  23  | const FIXTURE_WITH_SETUP = {
  24  |   fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  25  |   previousFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  26  |   playedMove: "e2e4",
  27  |   sequenceLength: 4,
  28  | };
  29  | 
  30  | // A completed-sequence fixture with 4 visible positions
  31  | const FIXTURE_COMPLETED_4POS = {
  32  |   fen: "8/2k3pp/p2r4/2K1p3/1R2Pp2/P4P2/6PP/8 w - - 0 57",
  33  |   previousFen: "8/2k3pp/p2r4/2K1p3/1R2Pp2/P4P2/6PP/8 w - - 0 57",
  34  |   playedMove: undefined,
  35  |   sequenceLength: 4,
  36  | };
  37  | 
  38  | async function waitForSetupSettle(page: Page) {
  39  |   await page.waitForTimeout(1200);
  40  | }
  41  | 
  42  | async function ensureSignedIn(page: Page) {
  43  |   await page.context().clearCookies();
  44  |   await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  45  |   await page.waitForTimeout(800);
  46  | 
  47  |   await page.locator('input[name="email"]').fill(E2E_USER_EMAIL);
> 48  |   await page.locator('input[name="password"]').fill(E2E_USER_PW);
      |                                                ^ Error: locator.fill: Test timeout of 300000ms exceeded.
  49  |   await page.locator('button[type="submit"]').click();
  50  | 
  51  |   const result = await Promise.race([
  52  |     page.waitForURL(url => !url.pathname.startsWith("/sign-in"), { timeout: 15000 }),
  53  |     page.waitForURL(url => url.href.includes("error=invalid-credentials"), { timeout: 15000 }),
  54  |   ]);
  55  |   void result;
  56  | 
  57  |   const finalUrl = page.url();
  58  |   if (finalUrl.includes("error")) {
  59  |     throw new Error(`Sign-in failed: ${finalUrl}`);
  60  |   }
  61  | }
  62  | 
  63  | async function setupQAFlag(page: Page) {
  64  |   await page.addInitScript(() => {
  65  |     (window as unknown as { __BLINDSPOTS_QA__?: boolean }).__BLINDSPOTS_QA__ = true;
  66  |     (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents = [];
  67  |   });
  68  | }
  69  | 
  70  | function getTimeline(page: Page) {
  71  |   return page.evaluate(() => {
  72  |     const tl = (window as unknown as { __blindspotsTrainTimeline?: unknown }).__blindspotsTrainTimeline;
  73  |     return tl as {
  74  |       activeExploreIndex?: number;
  75  |       isActiveSetupReplay?: boolean;
  76  |       activeSetupReplayIndex?: number;
  77  |       visibleSequencePositions?: unknown[];
  78  |       state?: string;
  79  |       resultMode?: string;
  80  |     } | undefined;
  81  |   });
  82  | }
  83  | 
  84  | function getSoundEvents(page: Page) {
  85  |   return page.evaluate(() => {
  86  |     return (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents ?? [];
  87  |   });
  88  | }
  89  | 
  90  | function clearSoundEvents(page: Page) {
  91  |   return page.evaluate(() => {
  92  |     ((window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents as unknown[]) = [];
  93  |   });
  94  | }
  95  | 
  96  | // ── Test A: active setup replay — backward is silent, forward plays sound ──────
  97  | 
  98  | test("active setup replay: ArrowLeft backward is silent, ArrowRight forward plays sound", async ({ page }) => {
  99  |   await setupQAFlag(page);
  100 |   await ensureSignedIn(page);
  101 | 
  102 |   await page.route("**/api/train/initialize", (route) => route.fulfill({ json: INIT_SKIPPED }));
  103 |   await page.route("**/api/train/next-position", (route) => route.fulfill({ json: FIXTURE_WITH_SETUP }));
  104 | 
  105 |   await page.goto("/train", { waitUntil: "networkidle" });
  106 |   await waitForSetupSettle(page);
  107 | 
  108 |   // Wait until setup replay is active and index is 1 (position B)
  109 |   await page.waitForFunction(
  110 |     () => {
  111 |       const tl = (window as unknown as { __blindspotsTrainTimeline?: unknown }).__blindspotsTrainTimeline as Record<string, unknown> | undefined;
  112 |       return tl && tl.isActiveSetupReplay === true && tl.activeSetupReplayIndex === 1;
  113 |     },
  114 |     { timeout: 10000 },
  115 |   );
  116 | 
  117 |   // Clear sound events
  118 |   await clearSoundEvents(page);
  119 |   const eventsBeforeLeft = await getSoundEvents(page);
  120 |   expect(eventsBeforeLeft.length).toBe(0);
  121 | 
  122 |   // ArrowLeft: index 1 -> 0 (backward)
  123 |   await page.keyboard.press("ArrowLeft");
  124 |   await page.waitForTimeout(400);
  125 | 
  126 |   const afterLeft = await getTimeline(page);
  127 |   expect(afterLeft?.activeSetupReplayIndex).toBe(0);
  128 | 
  129 |   const eventsAfterLeft = await getSoundEvents(page);
  130 |   // Backward navigation must NOT append any sound event
  131 |   expect(eventsAfterLeft.length).toBe(0);
  132 | 
  133 |   // ArrowRight: index 0 -> 1 (forward)
  134 |   await page.keyboard.press("ArrowRight");
  135 |   await page.waitForTimeout(400);
  136 | 
  137 |   const afterRight = await getTimeline(page);
  138 |   expect(afterRight?.activeSetupReplayIndex).toBe(1);
  139 | 
  140 |   const eventsAfterRight = await getSoundEvents(page);
  141 |   expect(eventsAfterRight.length).toBeGreaterThan(0);
  142 | 
  143 |   const lastEvent = eventsAfterRight[eventsAfterRight.length - 1] as Record<string, unknown>;
  144 |   expect(lastEvent.pitchIndex).toBe(0);
  145 |   expect(lastEvent.source).toBe("replay");
  146 | });
  147 | 
  148 | // ── Test B: completed replay — forward plays sound, backward is silent ─────────
```
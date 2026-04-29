# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: drag-ghost-center.spec.ts >> drag ghost is centered under cursor with full-square wrapper
- Location: tests\e2e\drag-ghost-center.spec.ts:11:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-testid=\'train-board\']')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('[data-testid=\'train-board\']')

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
            - /url: /auth/google?next=%2Ftrain
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
  1  | import { test, expect } from "@playwright/test";
  2  | import { readFileSync } from "node:fs";
  3  | 
  4  | test.use({ storageState: ".auth/user.json" });
  5  | 
  6  | async function addAuthCookies(page) {
  7  |   const cookies = JSON.parse(readFileSync(".auth/user.json", "utf8")).cookies;
  8  |   await page.context().addCookies(cookies);
  9  | }
  10 | 
  11 | test("drag ghost is centered under cursor with full-square wrapper", async ({ page }) => {
  12 |   await addAuthCookies(page);
  13 | 
  14 |   const INIT_SKIPPED = {
  15 |     profile: { initialization_status: "skipped", profile_initialized: false, weakness_vector: {}, mastery_vector: {}, exploit_queue: [], explore_queue: [], revisit_queue: [], mastered_queue: [] },
  16 |     preferences: { sequence_length: 4 },
  17 |     linkedProfiles: [],
  18 |     shouldShowOnboarding: false,
  19 |   };
  20 | 
  21 |   await page.route("**/api/train/initialize", (route) => {
  22 |     route.fulfill({ json: INIT_SKIPPED });
  23 |   });
  24 |   await page.route("**/api/train/next-position", (route) => {
  25 |     route.fulfill({
  26 |       json: {
  27 |         fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  28 |         previousFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  29 |         playedMove: "e2e4",
  30 |         sequenceLength: 4,
  31 |         source: "elite",
  32 |       },
  33 |     });
  34 |   });
  35 | 
  36 |   await page.goto("http://localhost:3000/train");
  37 | 
  38 |   // Wait for board
  39 |   const board = page.locator("[data-testid='train-board']");
> 40 |   await expect(board).toBeVisible({ timeout: 10000 });
     |                       ^ Error: expect(locator).toBeVisible() failed
  41 | 
  42 |   // Dismiss audio overlay
  43 |   const overlay = page.locator("[data-testid='audio-unlock-overlay']");
  44 |   if (await overlay.isVisible({ timeout: 2000 })) {
  45 |     await overlay.click();
  46 |     await page.waitForTimeout(1500);
  47 |   }
  48 | 
  49 |   // Get board bounding box
  50 |   const boardBox = await board.boundingBox();
  51 |   const squareSize = boardBox.width / 8;
  52 | 
  53 |   // Click center of e4 square (col=4, row=3 in 0-indexed)
  54 |   const e4X = boardBox.x + (4 + 0.5) * squareSize;
  55 |   const e4Y = boardBox.y + (3 + 0.5) * squareSize;
  56 | 
  57 |   await page.mouse.move(e4X, e4Y);
  58 |   await page.mouse.down();
  59 |   await page.waitForTimeout(400);
  60 | 
  61 |   // Find the drag wrapper div (fixed, z-9999)
  62 |   const wrapperInfo = await page.evaluate(() => {
  63 |     const allEls = document.querySelectorAll("*");
  64 |     for (const el of allEls) {
  65 |       const s = window.getComputedStyle(el);
  66 |       if (s.position === "fixed" && s.zIndex === "9999" && s.display.includes("flex")) {
  67 |         const r = el.getBoundingClientRect();
  68 |         return { left: r.left, top: r.top, width: r.width, height: r.height };
  69 |       }
  70 |     }
  71 |     return null;
  72 |   });
  73 | 
  74 |   await page.mouse.up();
  75 | 
  76 |   expect(wrapperInfo).not.toBeNull("Drag wrapper should exist");
  77 | 
  78 |   // Check wrapper is centered on cursor
  79 |   const wrapperCenterX = wrapperInfo.left + wrapperInfo.width / 2;
  80 |   const wrapperCenterY = wrapperInfo.top + wrapperInfo.height / 2;
  81 | 
  82 |   const offsetX = Math.abs(wrapperCenterX - e4X);
  83 |   const offsetY = Math.abs(wrapperCenterY - e4Y);
  84 | 
  85 |   console.log(`Wrapper center: (${wrapperCenterX.toFixed(1)}, ${wrapperCenterY.toFixed(1)})`);
  86 |   console.log(`Expected (cursor): (${e4X.toFixed(1)}, ${e4Y.toFixed(1)})`);
  87 |   console.log(`Offset: (${offsetX.toFixed(1)}px, ${offsetY.toFixed(1)}px)`);
  88 |   console.log(`Wrapper size: ${wrapperInfo.width.toFixed(1)} x ${wrapperInfo.height.toFixed(1)}`);
  89 | 
  90 |   // Full square size check (not 0.86x)
  91 |   const squareSizeRatio = wrapperInfo.width / squareSize;
  92 |   console.log(`Wrapper/SquareSize ratio: ${squareSizeRatio.toFixed(3)}`);
  93 |   expect(squareSizeRatio).toBeCloseTo(1.0, 2);
  94 | 
  95 |   // Centered check - within 3% of square size
  96 |   const tolerance = squareSize * 0.03;
  97 |   expect(offsetX).toBeLessThan(tolerance, `X offset ${offsetX.toFixed(1)}px exceeds tolerance ${tolerance.toFixed(1)}px`);
  98 |   expect(offsetY).toBeLessThan(tolerance, `Y offset ${offsetY.toFixed(1)}px exceeds tolerance ${tolerance.toFixed(1)}px`);
  99 | });
```
# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: train-audio-unlock.spec.ts >> D: ArrowLeft after setup plays no sound; ArrowRight plays sound
- Location: tests\e2e\train-audio-unlock.spec.ts:193:5

# Error details

```
Test timeout of 300000ms exceeded.
```

```
Error: locator.click: Test timeout of 300000ms exceeded.
Call log:
  - waiting for locator('[data-testid=\'audio-unlock-overlay\']')

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
  112 |   });
  113 | 
  114 |   await ensureSignedIn(page);
  115 | 
  116 |   await page.goto("/train", { waitUntil: "networkidle" });
  117 | 
  118 |   // Board shows previousFen first (startpos, not the e4 position)
  119 |   const board = page.locator("[data-testid='train-board']");
  120 |   await expect(board).toBeVisible();
  121 | 
  122 |   // Overlay is visible
  123 |   const overlay = page.locator("[data-testid='audio-unlock-overlay']");
  124 |   await expect(overlay).toBeVisible();
  125 |   await expect(overlay).toContainText(/press any key|click to start/i);
  126 | 
  127 |   // Move table is empty (engine move not yet in table)
  128 |   const moveRows = page.locator("[data-testid='train-move-row']");
  129 |   await expect(moveRows).toHaveCount(0);
  130 | 
  131 |   // Press Space to unlock
  132 |   await overlay.click();
  133 |   // Wait for setup animation to complete
  134 |   await page.waitForTimeout(1500);
  135 | 
  136 |   // Overlay is gone
  137 |   await expect(overlay).not.toBeVisible();
  138 | 
  139 |   // Board has reached the final fen (e4 position)
  140 |   // lastMove highlight should exist — check via the board data attribute
  141 |   // The last move highlight is set after the engine move plays
  142 |   const lastMoveHighlight = await page.evaluate(() => {
  143 |     // The board renders highlighted squares via the AnalysisBoard component
  144 |     // We verify indirectly: after setup, there should be a move row
  145 |     const rows = document.querySelectorAll("[data-testid='train-move-row']");
  146 |     return rows.length;
  147 |   });
  148 |   expect(lastMoveHighlight).toBeGreaterThanOrEqual(1);
  149 | 
  150 |   // Move row should show the engine's move (e4)
  151 |   const engineMoveCell = page.locator("[data-testid='train-move-row'] [data-testid='train-move-white']").first();
  152 |   const moveText = await engineMoveCell.textContent();
  153 |   expect(moveText?.trim()).toMatch(/e4/i);
  154 | });
  155 | 
  156 | // ─── Test C: Sound event logged only after gesture ───────────────────────────────
  157 | 
  158 | test("C: initial-engine sound event logged only after gesture, not before", async ({ page }) => {
  159 |   await page.route("**/api/train/initialize", (route) => {
  160 |     route.fulfill({ json: INIT_SKIPPED });
  161 |   });
  162 | 
  163 |   await page.route("**/api/train/next-position", (route) => {
  164 |     route.fulfill({ json: ENGINE_SETUP_PAYLOAD });
  165 |   });
  166 | 
  167 |   await page.addInitScript(() => {
  168 |     (window as unknown as { __BLINDSPOTS_QA__?: boolean }).__BLINDSPOTS_QA__ = true;
  169 |     (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents = [];
  170 |   });
  171 | 
  172 |   await clearSoundEvents(page);
  173 | 
  174 |   await page.goto("/train", { waitUntil: "networkidle" });
  175 | 
  176 |   // No initial-engine sound before gesture
  177 |   const eventsBefore = await getSoundEvents(page);
  178 |   const beforeCount = eventsBefore.filter((e) => e.source === "initial-engine").length;
  179 |   expect(beforeCount).toBe(0);
  180 | 
  181 |   // Press Space
  182 |   await page.locator("[data-testid='audio-unlock-overlay']").click();
  183 |   await page.waitForTimeout(1500);
  184 | 
  185 |   // Exactly one initial-engine sound after gesture
  186 |   const eventsAfter = await getSoundEvents(page);
  187 |   const afterCount = eventsAfter.filter((e) => e.source === "initial-engine").length;
  188 |   expect(afterCount).toBe(1);
  189 | });
  190 | 
  191 | // ─── Test D: ArrowLeft stays silent, ArrowRight plays sound ────────────────────
  192 | 
  193 | test("D: ArrowLeft after setup plays no sound; ArrowRight plays sound", async ({ page }) => {
  194 |   await page.route("**/api/train/initialize", (route) => {
  195 |     route.fulfill({ json: INIT_SKIPPED });
  196 |   });
  197 | 
  198 |   await page.route("**/api/train/next-position", (route) => {
  199 |     route.fulfill({ json: ENGINE_SETUP_PAYLOAD });
  200 |   });
  201 | 
  202 |   await page.addInitScript(() => {
  203 |     (window as unknown as { __BLINDSPOTS_QA__?: boolean }).__BLINDSPOTS_QA__ = true;
  204 |     (window as unknown as { __blindspotsTrainSoundEvents?: unknown[] }).__blindspotsTrainSoundEvents = [];
  205 |   });
  206 | 
  207 |   await clearSoundEvents(page);
  208 | 
  209 |   await page.goto("/train", { waitUntil: "networkidle" });
  210 | 
  211 |   // Unlock the setup
> 212 |   await page.locator("[data-testid='audio-unlock-overlay']").click();
      |                                                              ^ Error: locator.click: Test timeout of 300000ms exceeded.
  213 |   await page.waitForTimeout(1500);
  214 | 
  215 |   const countAfterSetup = (await getSoundEvents(page)).length;
  216 | 
  217 |   // Press ArrowLeft — should NOT play sound
  218 |   await page.keyboard.press("ArrowLeft");
  219 |   await page.waitForTimeout(300);
  220 |   const countAfterLeft = (await getSoundEvents(page)).length;
  221 |   expect(countAfterLeft).toBe(countAfterSetup); // no new sound
  222 | 
  223 |   // Press ArrowRight — should play sound
  224 |   await page.keyboard.press("ArrowRight");
  225 |   await page.waitForTimeout(300);
  226 |   const countAfterRight = (await getSoundEvents(page)).length;
  227 |   expect(countAfterRight).toBeGreaterThan(countAfterLeft);
  228 | });
```
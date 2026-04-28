# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: train-initial-load.spec.ts >> B: board reaches previousFen immediately, then fen after gesture unlock
- Location: tests\e2e\train-initial-load.spec.ts:110:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-testid=\'train-board\']')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('[data-testid=\'train-board\']')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e4]:
    - banner [ref=e5]:
      - generic [ref=e6]:
        - heading "Blindspots.gg" [level=1] [ref=e7]:
          - link "Blindspots.gg" [ref=e8] [cursor=pointer]:
            - /url: /
            - img [ref=e9]
            - generic [ref=e13]: Blindspots.gg
        - generic [ref=e14]:
          - navigation [ref=e15]:
            - link "Analysis" [ref=e16] [cursor=pointer]:
              - /url: /analysis
            - link "Train" [ref=e17] [cursor=pointer]:
              - /url: /train
            - link "Performance" [ref=e18] [cursor=pointer]:
              - /url: /performance
            - link "Account" [ref=e19] [cursor=pointer]:
              - /url: /account
          - button "Sign Out" [ref=e21]
    - main [ref=e22]:
      - generic [ref=e24]:
        - generic [ref=e26]:
          - generic [ref=e27]:
            - generic [ref=e30]: White
            - generic [ref=e32]:
              - button "h1" [ref=e33]:
                - generic: "1"
              - button "g1" [ref=e34]
              - button "f1" [ref=e35]
              - button "e1" [ref=e36]
              - button "d1" [ref=e37]
              - button "c1" [ref=e38]
              - button "b1" [ref=e39]
              - button "a1" [ref=e40]
              - button "h2" [ref=e41]:
                - generic: "2"
              - button "g2" [ref=e42]
              - button "f2" [ref=e43]
              - button "e2" [ref=e44]
              - button "d2" [ref=e45]
              - button "c2" [ref=e46]
              - button "b2" [ref=e47]
              - button "a2" [ref=e48]
              - button "h3" [ref=e49]:
                - generic: "3"
              - button "g3" [ref=e50]
              - button "f3" [ref=e51]
              - button "e3" [ref=e52]
              - button "d3" [ref=e53]
              - button "c3" [ref=e54]
              - button "b3" [ref=e55]
              - button "a3" [ref=e56]
              - button "h4" [ref=e57]:
                - generic: "4"
              - button "g4" [ref=e58]
              - button "f4" [ref=e59]
              - button "e4" [ref=e60]
              - button "d4" [ref=e61]
              - button "c4" [ref=e62]
              - button "b4" [ref=e63]
              - button "a4" [ref=e64]
              - button "h5" [ref=e65]:
                - generic: "5"
              - button "g5" [ref=e66]
              - button "f5" [ref=e67]
              - button "e5" [ref=e68]
              - button "d5" [ref=e69]
              - button "c5" [ref=e70]
              - button "b5" [ref=e71]
              - button "a5" [ref=e72]
              - button "h6" [ref=e73]:
                - generic: "6"
              - button "g6" [ref=e74]
              - button "f6" [ref=e75]
              - button "e6" [ref=e76]
              - button "d6" [ref=e77]
              - button "c6" [ref=e78]
              - button "b6" [ref=e79]
              - button "a6" [ref=e80]
              - button "h7" [ref=e81]:
                - generic: "7"
              - button "g7" [ref=e82]
              - button "f7" [ref=e83]
              - button "e7" [ref=e84]
              - button "d7" [ref=e85]
              - button "c7" [ref=e86]
              - button "b7" [ref=e87]
              - button "a7" [ref=e88]
              - button "h8" [ref=e89]:
                - generic: "8"
                - generic: h
              - button "g8" [ref=e90]:
                - generic: g
              - button "f8" [ref=e91]:
                - generic: f
              - button "e8" [ref=e92]:
                - generic: e
              - button "d8" [ref=e93]:
                - generic: d
              - button "c8" [ref=e94]:
                - generic: c
              - button "b8" [ref=e95]:
                - generic: b
              - button "a8" [ref=e96]:
                - generic: a
            - generic [ref=e99]: Black
          - paragraph [ref=e101]: Press any key or click the board to start
        - complementary [ref=e102]:
          - generic [ref=e103]:
            - generic "Blindspots Elo" [ref=e105]:
              - generic [ref=e106]: "1200"
            - paragraph [ref=e108]: Move 1 of 4
          - paragraph [ref=e110]: Black to move. Try not to improvise.
          - paragraph [ref=e112]: No moves yet. That is on you.
  - alert [ref=e113]
```

# Test source

```ts
  31  |   shouldShowOnboarding: false,
  32  | };
  33  | 
  34  | const MOCK_PAYLOAD: NextPositionResponse = {
  35  |   fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  36  |   previousFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  37  |   playedMove: "e2e4",
  38  |   sequenceLength: 4,
  39  |   source: "elite",
  40  | };
  41  | 
  42  | const MOCK_BOARD_FEN = "8/2k3pp/p2r4/2K1p3/1R2Pp2/P4P2/6PP/8 w - - 0 57";
  43  | 
  44  | async function readTrainBoardFen(page: Page): Promise<string | null> {
  45  |   return page.evaluate(() => {
  46  |     const win = window as unknown as {
  47  |       __blindspotsTrainState?: { fen?: string };
  48  |     };
  49  |     return (win.__blindspotsTrainState?.fen as string) ?? null;
  50  |   });
  51  | }
  52  | 
  53  | async function waitForTrainBoardFen(page: Page, timeoutMs = 5000): Promise<string> {
  54  |   const pollStart = Date.now();
  55  |   while (Date.now() - pollStart < timeoutMs) {
  56  |     const fen = await readTrainBoardFen(page);
  57  |     if (fen !== null) return fen;
  58  |     await page.waitForTimeout(150);
  59  |   }
  60  |   const lastAttempt = await readTrainBoardFen(page);
  61  |   if (lastAttempt === null) throw new Error("Train board FEN remained null after polling");
  62  |   return lastAttempt;
  63  | }
  64  | 
  65  | // ─── Test A: No mockRep.fen flash during delayed load ────────────────────────
  66  | 
  67  | test(
  68  |   "A: no mockRep.fen flash while loading a delayed real position",
  69  |   async ({ page: p }) => {
  70  |     const cookies = JSON.parse(readFileSync(".auth/user.json", "utf8")).cookies;
  71  |     await p.context().addCookies(cookies);
  72  | 
  73  |     let resolveNextPosition: ((value: NextPositionResponse) => void) | null = null;
  74  |     const nextPositionPromise = new Promise<NextPositionResponse>((resolve) => {
  75  |       resolveNextPosition = resolve;
  76  |     });
  77  | 
  78  |     await p.route("**/api/train/initialize", (route) => {
  79  |       route.fulfill({ json: INIT_SKIPPED });
  80  |     });
  81  | 
  82  |     await p.route("**/api/train/next-position", async (route) => {
  83  |       const payload = await nextPositionPromise;
  84  |       route.fulfill({ json: payload });
  85  |     });
  86  | 
  87  |     await p.goto("/train");
  88  | 
  89  |     // During the delay: board must NOT show mockRep.fen
  90  |     const liveFen = await readTrainBoardFen(p);
  91  |     if (liveFen !== null) {
  92  |       expect(liveFen).not.toEqual(MOCK_BOARD_FEN);
  93  |     }
  94  | 
  95  |     // Loading card must be visible
  96  |     const loadingCard = p.locator("text=Finding something you mishandle...");
  97  |     await expect(loadingCard).toBeVisible({ timeout: 5000 });
  98  | 
  99  |     // Resolve with a real position
  100 |     resolveNextPosition!(MOCK_PAYLOAD);
  101 | 
  102 |     // After resolution the overlay appears (engine-setup position)
  103 |     const overlay = p.locator("[data-testid='audio-unlock-overlay']");
  104 |     await expect(overlay).toBeVisible({ timeout: 5000 });
  105 |   },
  106 | );
  107 | 
  108 | // ─── Test B: Board shows previousFen first, then final fen after gesture ─────
  109 | 
  110 | test(
  111 |   "B: board reaches previousFen immediately, then fen after gesture unlock",
  112 |   async ({ page: p }) => {
  113 |     const cookies = JSON.parse(readFileSync(".auth/user.json", "utf8")).cookies;
  114 |     await p.context().addCookies(cookies);
  115 | 
  116 |     await p.route("**/api/train/initialize", (route) => {
  117 |       route.fulfill({ json: INIT_SKIPPED });
  118 |     });
  119 | 
  120 |     await p.route("**/api/train/next-position", (route) => {
  121 |       route.fulfill({ json: MOCK_PAYLOAD });
  122 |     });
  123 | 
  124 |     await p.goto("/train");
  125 | 
  126 |     // Poll for the train state to be populated
  127 |     const boardFenBefore = await waitForTrainBoardFen(p, 12000);
  128 | 
  129 |     // Board should be visible (it renders after hasLoadedPosition=true)
  130 |     const board = p.locator("[data-testid='train-board']");
> 131 |     await expect(board).toBeVisible({ timeout: 5000 });
      |                         ^ Error: expect(locator).toBeVisible() failed
  132 | 
  133 |     // Board should be showing previousFen (state was already polled above)
  134 |     expect(boardFenBefore).toEqual(MOCK_PAYLOAD.previousFen);
  135 | 
  136 |     // Overlay is present
  137 |     const overlay = p.locator("[data-testid='audio-unlock-overlay']");
  138 |     await expect(overlay).toBeVisible();
  139 | 
  140 |     // Click overlay to unlock and play initial engine move
  141 |     await overlay.click();
  142 |     await p.waitForTimeout(1500);
  143 | 
  144 |     // Overlay is gone
  145 |     await expect(overlay).not.toBeVisible();
  146 | 
  147 |     // Board should now show the final fen
  148 |     const boardFenAfter = await readTrainBoardFen(p);
  149 |     expect(boardFenAfter).toEqual(MOCK_PAYLOAD.fen);
  150 | 
  151 |     // Move table should have one row (the engine move)
  152 |     const moveRows = p.locator("[data-testid='train-move-row']");
  153 |     await expect(moveRows).toHaveCount(1);
  154 | 
  155 |     // Engine move cell should show the played move notation
  156 |     const engineMoveCell = p
  157 |       .locator("[data-testid='train-move-row'] [data-testid='train-move-white']")
  158 |       .first();
  159 |     const moveText = await engineMoveCell.textContent();
  160 |     expect(moveText?.trim()).toMatch(/e4/i);
  161 |   },
  162 | );
  163 | 
  164 | // ─── Test C: Board never renders mockRep.fen in normal non-delayed flow ───────
  165 | 
  166 | test(
  167 |   "C: board never renders mockRep.fen during a normal (non-delayed) load",
  168 |   async ({ page: p }) => {
  169 |     const cookies = JSON.parse(readFileSync(".auth/user.json", "utf8")).cookies;
  170 |     await p.context().addCookies(cookies);
  171 | 
  172 |     await p.route("**/api/train/initialize", (route) => {
  173 |       route.fulfill({ json: INIT_SKIPPED });
  174 |     });
  175 | 
  176 |     await p.route("**/api/train/next-position", (route) => {
  177 |       route.fulfill({ json: MOCK_PAYLOAD });
  178 |     });
  179 | 
  180 |     await p.goto("/train");
  181 | 
  182 |     // Poll for the train state to be populated
  183 |     await waitForTrainBoardFen(p, 12000);
  184 | 
  185 |     // Board must be visible (after hasLoadedPosition=true and API response)
  186 |     const board = p.locator("[data-testid='train-board']");
  187 |     await expect(board).toBeVisible({ timeout: 5000 });
  188 | 
  189 |     // Board must never have shown mockRep.fen
  190 |     const liveFen = await readTrainBoardFen(p);
  191 |     if (liveFen !== null) {
  192 |       expect(liveFen).not.toEqual(MOCK_BOARD_FEN);
  193 |     }
  194 | 
  195 |     // Unlock and wait for final state
  196 |     const overlay = p.locator("[data-testid='audio-unlock-overlay']");
  197 |     await overlay.click();
  198 |     await p.waitForTimeout(1500);
  199 | 
  200 |     // Final board FEN should equal payload fen
  201 |     const finalLiveFen = await readTrainBoardFen(p);
  202 |     expect(finalLiveFen).toEqual(MOCK_PAYLOAD.fen);
  203 |   },
  204 | );
```
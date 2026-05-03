# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: train-initial-load.spec.ts >> B2: train board keeps a playable desktop size
- Location: tests\e2e\train-initial-load.spec.ts:174:5

# Error details

```
Test timeout of 300000ms exceeded.
```

```
Error: page.fill: Test timeout of 300000ms exceeded.
Call log:
  - waiting for locator('input[name="password"]')
    - waiting for" http://localhost:3000/auth/email?next=%2F" navigation to finish...
    - navigated to "http://localhost:3000/auth/email?next=%2F"

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
            - /url: /auth/google?next=%2F
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
  2   | import { readFileSync } from "node:fs";
  3   | 
  4   | test.use({
  5   |   storageState: ".auth/user.json",
  6   | });
  7   | 
  8   | type NextPositionResponse = {
  9   |   fen?: string;
  10  |   previousFen?: string;
  11  |   playedMove?: string;
  12  |   sequenceLength?: number;
  13  |   source?: string;
  14  |   error?: string;
  15  |   debug?: Record<string, unknown>;
  16  | };
  17  | 
  18  | const INIT_SKIPPED: Record<string, unknown> = {
  19  |   profile: {
  20  |     initialization_status: "skipped",
  21  |     profile_initialized: false,
  22  |     weakness_vector: {},
  23  |     mastery_vector: {},
  24  |     exploit_queue: [],
  25  |     explore_queue: [],
  26  |     revisit_queue: [],
  27  |     mastered_queue: [],
  28  |   },
  29  |   preferences: { sequence_length: 4 },
  30  |   linkedProfiles: [],
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
> 49  |     return (win.__blindspotsTrainState?.fen as string) ?? null;
      |              ^ Error: page.fill: Test timeout of 300000ms exceeded.
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
  131 |     await expect(board).toBeVisible({ timeout: 5000 });
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
```
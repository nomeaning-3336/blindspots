import { test, expect, type Page, type Request } from "@playwright/test";
import { readFileSync } from "node:fs";

test.use({
  storageState: ".auth/user.json",
});

const INIT_ONBOARDING = {
  profile: null,
  preferences: { sequence_length: 4, skill_level: "beginner" },
  linkedProfiles: [],
};

const MOCK_POSITION = {
  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  previousFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  playedMove: "e2e4",
  sequenceLength: 4,
  source: "elite",
};

async function addAuthCookies(page: Page) {
  const cookies = JSON.parse(readFileSync(".auth/user.json", "utf8")).cookies;
  await page.context().addCookies(cookies);
}

async function readPostBody(request: Request) {
  return JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
}

test("onboarding starts with source choice, then skips account after skill selection", async ({ page }) => {
  await addAuthCookies(page);

  const initializePosts: Array<Record<string, unknown>> = [];

  await page.route("**/api/train/initialize", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({ json: INIT_ONBOARDING });
      return;
    }

    initializePosts.push(await readPostBody(request));
    await route.fulfill({ json: { ok: true, status: "skipped" } });
  });
  await page.route("**/api/train/next-position", (route) => {
    route.fulfill({ json: MOCK_POSITION });
  });

  await page.goto("/train");

  await expect(page.getByRole("heading", { name: "Where do you play?" })).toBeVisible();
  await expect(page.getByRole("button", { name: /New to chess/i })).not.toBeVisible();

  await page.getByRole("button", { name: /Start without an account/i }).click();
  await page.getByRole("button", { name: /^Continue$/ }).click();

  await expect(page.getByRole("heading", { name: "Set your starting point." })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Expert$/ })).toBeVisible();
  await expect(page.getByText(/Start at/)).not.toBeVisible();
  await page.getByRole("button", { name: /Advanced/i }).click();
  await page.getByRole("button", { name: "Start training" }).click();

  await expect(page.locator("[data-testid='audio-unlock-overlay']")).toBeVisible({ timeout: 10000 });

  expect(initializePosts[0]).toMatchObject({
    action: "skip",
    skillLevel: "advanced",
  });
  expect(initializePosts[1]).toMatchObject({
    action: "save_settings",
    sequenceLength: 4,
    timePressureMode: "none",
    openingFilter: [],
    skillLevel: "advanced",
  });
});

test("onboarding links selected provider before analyze and keeps skillLevel", async ({ page }) => {
  await addAuthCookies(page);

  const initializePosts: Array<Record<string, unknown>> = [];
  const linkedProfiles: Array<Record<string, string>> = [];

  await page.route("**/api/train/initialize", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({ json: INIT_ONBOARDING });
      return;
    }

    const body = await readPostBody(request);
    initializePosts.push(body);
    if (body.action === "analyze") {
      await route.fulfill({
        json: {
          ok: true,
          status: "complete",
          summary: {
            mistakesFound: 7,
            gamesAnalyzed: 12,
            averageCpLossPerMove: 31,
          },
        },
      });
      return;
    }
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/auth/profile/link", async (route, request) => {
    const form = await request.postDataBuffer();
    const params = new URLSearchParams(form?.toString() ?? "");
    linkedProfiles.push({
      provider: params.get("provider") ?? "",
      username: params.get("username") ?? "",
    });
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/train/next-position", (route) => {
    route.fulfill({ json: MOCK_POSITION });
  });

  await page.goto("/train");

  await page.getByRole("button", { name: /Lichess/i }).click();
  await page.getByRole("button", { name: /^Continue$/ }).click();
  await expect(page.getByLabel("Lichess username")).toBeVisible();
  await page.getByLabel("Lichess username").fill("capablanca");
  await page.getByRole("button", { name: /^Continue$/ }).click();

  await page.getByRole("button", { name: /Intermediate/i }).click();
  await page.getByRole("button", { name: "Pull games" }).click();

  await expect(page.getByRole("heading", { name: "We found enough." })).toBeVisible({
    timeout: 10000,
  });

  expect(linkedProfiles[0]).toEqual({
    provider: "lichess",
    username: "capablanca",
  });
  expect(initializePosts[0]).toMatchObject({
    action: "analyze",
    skillLevel: "intermediate",
  });
});

test("analysis status rows and elapsed text share the same left edge", async ({ page }) => {
  await addAuthCookies(page);

  await page.route("**/api/train/initialize", async (route, request) => {
    if (request.method() === "GET") {
      await route.fulfill({ json: INIT_ONBOARDING });
      return;
    }

    const body = await readPostBody(request);
    if (body.action === "analyze") {
      await new Promise((resolve) => setTimeout(resolve, 7000));
      await route.fulfill({
        json: {
          ok: true,
          status: "complete",
          summary: {
            mistakesFound: 7,
            gamesAnalyzed: 12,
            averageCpLossPerMove: 31,
          },
        },
      });
      return;
    }
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/auth/profile/link", (route) => {
    route.fulfill({ json: { ok: true } });
  });

  await page.goto("/train");
  await page.getByRole("button", { name: /Lichess/i }).click();
  await page.getByRole("button", { name: /^Continue$/ }).click();
  await page.getByLabel("Lichess username").fill("capablanca");
  await page.getByRole("button", { name: /^Continue$/ }).click();
  await page.getByRole("button", { name: /Beginner/i }).click();
  await page.getByRole("button", { name: "Pull games" }).click();

  const statusRow = page.getByText("Pulling your recent games");
  const elapsed = page.getByText("Running through the bad moves now.");
  await expect(elapsed).toBeVisible({ timeout: 10000 });

  const [rowBox, elapsedBox] = await Promise.all([
    statusRow.boundingBox(),
    elapsed.boundingBox(),
  ]);
  expect(rowBox).not.toBeNull();
  expect(elapsedBox).not.toBeNull();
  expect(Math.abs((elapsedBox?.x ?? 0) - (rowBox?.x ?? 0))).toBeLessThanOrEqual(2);
});

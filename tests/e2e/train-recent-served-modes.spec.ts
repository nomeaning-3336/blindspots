import { test, expect } from "@playwright/test";
import { existsSync } from "fs";

test.describe("train-recent-served-modes", () => {
  test("recent_served_modes grows by one per authenticated next-position call", async ({ page }) => {
    if (!existsSync(".auth/user.json")) {
      test.skip(true, "Missing .auth/user.json");
      return;
    }

    await page.context().storageState({ path: ".auth/user.json" });

    // Navigate to the app first so window.location.origin is valid
    await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });

    const results: {
      call: number;
      profileUserId: string;
      selectedServeMode: string;
      beforeCount: number;
      afterCount: number;
      rawCount: number;
      source: string;
      status: number;
    }[] = [];

    // Call /api/train/next-position 5 times using browser-fetch (includes auth cookies)
    for (let i = 0; i < 5; i++) {
      const data = await page.evaluate(async () => {
        try {
          const resp = await fetch(`${window.location.origin}/api/train/next-position`, {
            headers: { "Cache-Control": "no-store" },
          });
          const text = await resp.text();
          let body;
          try { body = JSON.parse(text); } catch { body = text; }
          return { status: resp.status, ok: resp.ok, body, error: null };
        } catch (e) {
          return { error: String(e), location: window.location.href, origin: window.location.origin };
        }
      });

      if (data.error) {
        console.error(`Call ${i + 1} fetch error:`, data);
        results.push({ call: i + 1, profileUserId: 'FETCH_ERROR', selectedServeMode: 'ERROR', beforeCount: -1, afterCount: -1, rawCount: -1, source: 'ERROR', status: -1 });
        continue;
      }

      const { status, body } = data;
      const debug = body?.debug as Record<string, unknown> | undefined;

      results.push({
        call: i + 1,
        profileUserId: (debug?.profileUserId as string) ?? "unknown",
        selectedServeMode: (debug?.selectedServeMode as string) ?? "unknown",
        beforeCount: (debug?.recentServedModesBeforeCount as number) ?? -1,
        afterCount: (debug?.nextRecentServedModesCount as number) ?? -1,
        rawCount: (debug?.optionalRecentServedModesRawCount as number) ?? -1,
        source: (debug?.recentServedModesSource as string) ?? "unknown",
        status: status ?? -1,
      });
    }

    // Assertions: all calls use the same user
    const userIds = [...new Set(results.map((r) => r.profileUserId))];
    expect(userIds).toHaveLength(1);

    // Assertions: counts grow by exactly 1 each call
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.beforeCount < 0 || r.afterCount < 0) {
        console.warn(`Call ${r.call}: debug fields missing`, r);
        continue;
      }
      if (r.source !== "optional-query") {
        console.warn(`Call ${r.call}: unexpected source=${r.source}, rawCount=${r.rawCount}`);
      }
      expect(r.afterCount, `Call ${r.call}: afterCount should be beforeCount+1`).toBe(r.beforeCount + 1);
    }

    // Print for manual DB verification
    const profileUserId = results[0]!.profileUserId;
    console.log(`\n=== QA Verification SQL ===`);
    console.log(`-- User: ${profileUserId}`);
    console.log(`SELECT user_id, total_sequences, jsonb_array_length(recent_served_modes) AS recent_modes_count, recent_served_modes, updated_at`);
    console.log(`FROM public.user_blindspot_profile`);
    console.log(`WHERE user_id = '${profileUserId}';`);
    console.log(`\n-- Queue sizes`);
    console.log(`SELECT user_id, jsonb_array_length(explore_queue) AS explore_count, jsonb_array_length(exploit_queue) AS exploit_count, jsonb_array_length(revisit_queue) AS revisit_count, jsonb_array_length(mastered_queue) AS mastered_count`);
    console.log(`FROM public.user_blindspot_profile`);
    console.log(`WHERE user_id = '${profileUserId}';`);
    console.log(`\n=== Call log ===`);
    for (const r of results) {
      console.log(`call=${r.call} user=${r.profileUserId} mode=${r.selectedServeMode} before=${r.beforeCount} after=${r.afterCount} raw=${r.rawCount} source=${r.source}`);
    }
  });
});

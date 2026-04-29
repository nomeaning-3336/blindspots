import { chromium } from "playwright";

const baseURL = process.env.OAUTH_DEBUG_BASE_URL ?? "http://localhost:3000";
const nextPath = process.env.OAUTH_DEBUG_NEXT ?? "/train";

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ baseURL });
const page = await context.newPage();

const events = [];

page.on("framenavigated", (frame) => {
  if (frame === page.mainFrame()) {
    events.push({ type: "navigate", url: frame.url() });
    console.log("[navigate]", frame.url());
  }
});

page.on("response", async (response) => {
  const url = response.url();
  if (
    url.startsWith(baseURL) ||
    url.includes(".supabase.co/auth/") ||
    url.includes("accounts.google.com")
  ) {
    const location = response.headers().location;
    events.push({
      type: "response",
      status: response.status(),
      url,
      location: location ?? null,
    });
    console.log("[response]", response.status(), url, location ? `-> ${location}` : "");
  }
});

await page.goto(`/auth/email?next=${encodeURIComponent(nextPath)}`);
await page.getByRole("link", { name: /continue with google/i }).click();

console.log("");
console.log("Complete Google sign-in in the opened browser window.");
console.log("This script will print the callback URL or timeout after 2 minutes.");
console.log("");

try {
  await page.waitForURL(
    (url) =>
      url.href.startsWith(`${baseURL}/auth/callback`) ||
      url.href.startsWith(`${baseURL}/sign-in`) ||
      url.href.startsWith(`${baseURL}/auth/email`) ||
      url.href.startsWith(`${baseURL}${nextPath}`),
    { timeout: 120_000 },
  );
} catch {
  console.log("[timeout] No local callback/sign-in/train URL reached within 2 minutes.");
}

const cookies = await context.cookies(`${baseURL}/auth/callback`);
console.log("");
console.log("[final-url]", page.url());
console.log(
  "[local-cookies]",
  cookies
    .filter((cookie) => cookie.name.startsWith("sb-"))
    .map((cookie) => ({ name: cookie.name, path: cookie.path, expires: cookie.expires })),
);
console.log("[events-json]");
console.log(JSON.stringify(events, null, 2));

await browser.close();

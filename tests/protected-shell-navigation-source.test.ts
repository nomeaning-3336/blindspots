import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("protected shell brand opens landing without route prefetching the dashboard", () => {
  const source = readFileSync("components/protected-app-shell.tsx", "utf8");
  const brandSource = source.slice(
    source.indexOf("<Link"),
    source.indexOf("<AppShellNav"),
  );

  assert.match(brandSource, /href="\/landing"/);
  assert.match(brandSource, /prefetch=\{false\}/);
  assert.doesNotMatch(brandSource, /href="\/"/);
});

test("app shell navigation does not prefetch authenticated routes", () => {
  const source = readFileSync("components/app-shell-nav.tsx", "utf8");
  const linkSource = source.slice(
    source.indexOf("function AppShellLink"),
    source.indexOf("function AppShellSignOutButton"),
  );

  assert.match(linkSource, /prefetch=\{false\}/);
  assert.doesNotMatch(linkSource, /\sprefetch\s*\n/);
});

test("landing page uses cookie auth hint instead of verified Supabase user fetch", () => {
  const source = readFileSync("app/landing/page.tsx", "utf8");

  assert.match(source, /import \{ getShellAuthHint \} from "@\/lib\/app-auth"/);
  assert.match(source, /const isSignedIn = await getShellAuthHint\(\)/);
  assert.doesNotMatch(source, /getOptionalAppUserId/);
});

test("public landing skips middleware session refresh", () => {
  const source = readFileSync("proxy.ts", "utf8");

  assert.match(source, /PUBLIC_ROUTES_WITHOUT_SESSION_REFRESH/);
  assert.match(source, /"\/landing"/);
  assert.match(source, /isPublicRouteWithoutSessionRefresh\(pathname\)/);
  assert.match(source, /return NextResponse\.next\(\{ request \}\)/);
});

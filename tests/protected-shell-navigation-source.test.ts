import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("protected shell is a navbar-free single-page frame", () => {
  const source = readFileSync("components/protected-app-shell.tsx", "utf8");

  assert.doesNotMatch(source, /AppShellNav/);
  assert.doesNotMatch(source, /<header/);
  assert.match(source, /Blindspots home/);
  assert.match(source, /fixed left-3 top-3/);
  assert.match(source, /<main className=/);
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

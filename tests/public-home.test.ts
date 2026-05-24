import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf-8");
}

test("app/page.tsx renders BlindspotsSpaPrototype only under if (userId)", () => {
  const source = readSource("app/page.tsx");
  const spaRenderMatch = source.match(/if\s*\(\s*userId\s*\)[^{]*\{[\s\S]*?<BlindspotsSpaPrototype\s*\/?>/s);
  assert.ok(spaRenderMatch, "BlindspotsSpaPrototype should only be rendered inside an if (userId) block");
  assert.ok(
    !/if\s*\(\s*userId\s*\|\|.*isDebugRequest/.test(source),
    "app/page.tsx should not have isDebugRequest in the SPA rendering condition"
  );
});

test("app/page.tsx does not reference debugFEN, debugFen, or getHomeCallToAction", () => {
  const source = readSource("app/page.tsx");
  assert.ok(!source.includes("debugFEN"), "app/page.tsx should not reference debugFEN");
  assert.ok(!source.includes("debugFen"), "app/page.tsx should not reference debugFen");
  assert.ok(!source.includes("getHomeCallToAction"), "app/page.tsx should not reference getHomeCallToAction");
});

test("app/page.tsx contains HeroVisual and AnalysisBoard", () => {
  const source = readSource("app/page.tsx");
  assert.ok(source.includes("<HeroVisual />"), "app/page.tsx should contain <HeroVisual />");
  assert.ok(source.includes("AnalysisBoard"), "app/page.tsx should contain AnalysisBoard");
});

test("app/page.tsx footer contains nested wordmark pattern", () => {
  const source = readSource("app/page.tsx");
  assert.ok(
    source.includes('Blindspots<span className="text-[var(--app-accent)]">.gg</span>'),
    "app/page.tsx footer should contain the nested wordmark pattern"
  );
});

test("components/public-header.tsx contains Log in and no Sign up", () => {
  const source = readSource("components/public-header.tsx");
  assert.ok(source.includes("Log in"), "public-header should contain Log in");
  assert.ok(!source.includes("Sign up"), "public-header should not contain Sign up");
});

test("components/public-header.tsx does not contain Blog, Find your blindspots, or Open app", () => {
  const source = readSource("components/public-header.tsx");
  assert.ok(!source.includes("Blog"), "public-header should not contain Blog");
  assert.ok(!source.includes("Find your blindspots"), "public-header should not contain Find your blindspots");
  assert.ok(!source.includes("Open app"), "public-header should not contain Open app");
});

test("components/public-header.tsx supports hideAuthAction prop", () => {
  const source = readSource("components/public-header.tsx");
  assert.ok(
    source.includes("hideAuthAction"),
    "public-header.tsx should support hideAuthAction prop"
  );
});

test("app/auth/email/page.tsx uses PublicHeaderClient with hideAuthAction", () => {
  const source = readSource("app/auth/email/page.tsx");
  assert.ok(
    source.includes("<PublicHeaderClient hideAuthAction />"),
    "auth/email page should use <PublicHeaderClient hideAuthAction />"
  );
});

test("components/blindspots-spa-prototype.tsx uses AuthSignOutButton and not Link for sign-out", () => {
  const source = readSource("components/blindspots-spa-prototype.tsx");
  assert.ok(
    source.includes("AuthSignOutButton"),
    "blindspots-spa-prototype.tsx should use AuthSignOutButton for sign-out"
  );
  assert.ok(
    !source.includes('<Link href="/auth/sign-out"'),
    "blindspots-spa-prototype.tsx should not use <Link> for sign-out"
  );
  assert.ok(
    !/import Link from ["']next\/link["']/.test(source) || !source.includes('href="/auth/sign-out"'),
    "blindspots-spa-prototype.tsx should not import Link from next/link for sign-out purposes"
  );
});

test("components/auth-sign-out-button.tsx calls window.location.assign with sign-out path", () => {
  const source = readSource("components/auth-sign-out-button.tsx");
  assert.ok(
    source.includes('window.location.assign("/auth/sign-out")'),
    "auth-sign-out-button.tsx should call window.location.assign('/auth/sign-out')"
  );
});

test("app-auth-routing: authenticated default route is root SPA", () => {
  const routes: typeof import("../lib/app-routes") = require("../lib/app-routes.ts");
  assert.equal(routes.DEFAULT_APP_ROUTE, "/");
  assert.equal(routes.normalizeNextPath(), "/");
  assert.equal(routes.normalizeNextPath("/dashboard"), "/");
  assert.equal(routes.normalizeNextPath("/dashboard/anything"), "/");
  assert.equal(routes.normalizeNextPath("/train"), "/");
  assert.equal(routes.normalizeNextPath("/analysis"), "/");
  assert.equal(routes.normalizeNextPath("/account"), "/");
  assert.equal(routes.normalizeNextPath("/analyze"), "/");
});
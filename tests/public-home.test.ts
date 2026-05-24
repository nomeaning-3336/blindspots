import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const publicHome: typeof import("../lib/public-home") = require("../lib/public-home.ts");

test("home call to action sends signed-out visitors to sign in", () => {
  assert.deepEqual(publicHome.getHomeCallToAction(false), {
    href: "/sign-in",
    label: "I don't mind.",
  });
});

test("home call to action replaces sign in with brand copy for signed-in users", () => {
  assert.deepEqual(publicHome.getHomeCallToAction(true), {
    href: "/",
    label: "Go find the bad parts",
  });
});

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const routes: typeof import("../lib/app-routes") = require("../lib/app-routes.ts");

test("authenticated app default route is the root dashboard", () => {
  assert.equal(routes.DEFAULT_APP_ROUTE, "/");
  assert.equal(routes.normalizeNextPath(), "/");
  assert.equal(routes.normalizeNextPath("/dashboard"), "/");
  assert.equal(routes.normalizeNextPath("/dashboard/anything"), "/");
  assert.equal(routes.normalizeNextPath("/train"), "/");
  assert.equal(routes.normalizeNextPath("/analysis"), "/");
  assert.equal(routes.normalizeNextPath("/account"), "/");
  assert.equal(routes.normalizeNextPath("/analyze"), "/");
});

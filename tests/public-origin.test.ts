import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const publicOrigin: typeof import("../lib/public-origin") = require("../lib/public-origin.ts");

test("uses forwarded host and proto before internal request origin", () => {
  const request = new Request("http://localhost:3000/auth/google?next=%2F", {
    headers: {
      "x-forwarded-host": "blindspots.gg",
      "x-forwarded-proto": "https",
      host: "localhost:3000",
    },
  });

  assert.equal(publicOrigin.getPublicOrigin(request), "https://blindspots.gg");
});

test("builds public URLs without leaking localhost", () => {
  const request = new Request("http://localhost:3000/auth/google?next=%2F", {
    headers: {
      "x-forwarded-host": "blindspots.gg",
      "x-forwarded-proto": "https",
    },
  });

  assert.equal(
    publicOrigin.publicUrl(request, "/auth/callback?next=%2F").toString(),
    "https://blindspots.gg/auth/callback?next=%2F",
  );
});

test("builds sign-out redirect URL without leaking localhost", () => {
  const request = new Request("http://localhost:3000/auth/sign-out", {
    headers: {
      "x-forwarded-host": "blindspots.gg",
      "x-forwarded-proto": "https",
      host: "localhost:3000",
    },
  });

  assert.equal(publicOrigin.publicUrl(request, "/").toString(), "https://blindspots.gg/");
});

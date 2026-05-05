import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const magicLink: typeof import("../lib/auth-magic-link") = require("../lib/auth-magic-link.ts");

test("magic link callback URL uses forwarded production origin", () => {
  const request = new Request("http://localhost:3000/auth/send-magic-link", {
    headers: {
      "x-forwarded-host": "blindspots.gg",
      "x-forwarded-proto": "https",
      host: "localhost:3000",
    },
  });

  assert.equal(
    magicLink.buildMagicLinkCallbackUrl(request, "/"),
    "https://blindspots.gg/auth/callback?next=%2F",
  );
});

test("magic link sent redirect uses forwarded production origin", () => {
  const request = new Request("http://localhost:3000/auth/send-magic-link", {
    headers: {
      "x-forwarded-host": "blindspots.gg",
      "x-forwarded-proto": "https",
      host: "localhost:3000",
    },
  });

  assert.equal(
    magicLink.buildMagicLinkSentUrl(request, "/", "test-user@example.com").toString(),
    "https://blindspots.gg/auth/email?next=%2F&sent=true&email=joejen47u%40gmail.com",
  );
});

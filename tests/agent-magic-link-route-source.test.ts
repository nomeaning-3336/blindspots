import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("agent magic link route verifies token hash server-side and applies auth cookies", () => {
  const source = readFileSync("app/auth/agent-link/route.ts", "utf8");

  assert.match(source, /createSupabaseRouteHandlerClient/);
  assert.match(source, /url\.searchParams\.get\("token_hash"\)/);
  assert.match(source, /supabase\.auth\.verifyOtp\(\{/);
  assert.match(source, /token_hash: tokenHash/);
  assert.match(source, /type: "magiclink"/);
  assert.match(source, /applyCookies\(/);
  assert.match(source, /NextResponse\.redirect\(publicUrl\(request, redirectPath\), 303\)/);
});

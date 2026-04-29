export const SUPABASE_AUTH_COOKIE_DELETE_PATHS = [
  "/",
  "/auth",
  "/auth/google",
  "/auth/callback",
];

export function isSupabaseSessionCookie(name: string) {
  return /^sb-.*-auth-token(?:\.\d+)?$/.test(name);
}

export function isSupabaseCodeVerifierCookie(name: string) {
  return /^sb-.*-auth-token-code-verifier$/.test(name);
}

export function isSupabaseAuthFlowCookie(name: string) {
  return isSupabaseSessionCookie(name) || isSupabaseCodeVerifierCookie(name);
}

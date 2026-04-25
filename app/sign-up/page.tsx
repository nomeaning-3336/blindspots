import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicHeaderClient } from "@/components/public-header";
import { getOptionalAppUserId, normalizeNextPath } from "@/lib/app-auth";

function resolveErrorMessage(error?: string | null) {
  switch (error) {
    case "missing-fields":
      return "Enter your email and password to create the account.";
    case "password-mismatch":
      return "The password confirmation did not match yet.";
    case "weak-password":
      return "Use a password with at least 8 characters.";
    case "email-in-use":
      return "That email already belongs to an account. Try signing in instead.";
    case "oauth-failed":
      return "Google sign-in could not be started right now. Try again in a moment.";
    case "sign-up-failed":
      return "Account creation could not be completed right now. Try again in a moment.";
    default:
      return null;
  }
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{
    email?: string | string[];
    error?: string | string[];
    next?: string | string[];
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const nextParam = Array.isArray(resolvedSearchParams.next)
    ? resolvedSearchParams.next[0]
    : resolvedSearchParams.next;
  const nextPath = normalizeNextPath(nextParam);
  const userId = await getOptionalAppUserId();

  if (userId) {
    redirect(nextPath);
  }

  const error = Array.isArray(resolvedSearchParams.error)
    ? resolvedSearchParams.error[0]
    : resolvedSearchParams.error;
  const email = Array.isArray(resolvedSearchParams.email)
    ? resolvedSearchParams.email[0]
    : resolvedSearchParams.email;
  const errorMessage = resolveErrorMessage(error);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-transparent">
      <PublicHeaderClient isSignedIn={false} />
      <main className="flex min-h-0 w-full flex-1 overflow-auto px-4 pb-4 pt-3 md:px-6">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-center">
          <section className="grid w-full max-w-[720px] gap-8">
            <div className="space-y-5 text-center">
              <h1 className="text-5xl font-bold tracking-[-0.04em] text-white md:text-6xl">
                Create Account
              </h1>
              <p className="mx-auto max-w-xl text-sm leading-8 text-[var(--app-muted)]">
                Join Blindspots to save your preferences and analysis across sessions.
              </p>
            </div>

            <div className="app-brutal-card-auth grid gap-6 border border-white/10 p-6 md:p-8">
              {errorMessage ? (
                <div className="border border-rose-400/35 bg-rose-400/10 px-4 py-3 text-sm leading-6 text-rose-100">
                  {errorMessage}
                </div>
              ) : null}

              <a
                href={`/auth/google?next=${encodeURIComponent(nextPath)}`}
                className="inline-flex h-12 items-center justify-center gap-3 border border-[var(--app-border)] bg-[var(--app-surface-input)] px-4 text-sm font-bold tracking-[0.08em] text-[var(--app-text)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>
                  <path fill="#34A853" d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.615 24 12.255 24z"/>
                  <path fill="#FBBC05" d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 0 0 0 10.76l3.98-3.09z"/>
                  <path fill="#EA4335" d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.64 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/>
                </svg>
                Continue with Google
              </a>

              <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--app-muted)]">
                <span className="h-px flex-1 bg-[var(--app-border)]" />
                <span>Or create an account with email</span>
                <span className="h-px flex-1 bg-[var(--app-border)]" />
              </div>

              <form action="/auth/sign-up" method="post" className="grid gap-5">
                <input type="hidden" name="next" value={nextPath} />

                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--app-text)]">
                    Email
                  </span>
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    defaultValue={email ?? ""}
                    placeholder="you@example.com"
                    className="app-brutal-input h-12 px-4 text-[15px] outline-none transition placeholder:text-[var(--app-muted-soft)] focus:border-[var(--app-accent)]"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--app-text)]">
                    Password
                  </span>
                  <input
                    name="password"
                    type="password"
                    required
                    autoComplete="new-password"
                    minLength={8}
                    placeholder="Use at least 8 characters"
                    className="app-brutal-input h-12 px-4 text-[15px] outline-none transition placeholder:text-[var(--app-muted-soft)] focus:border-[var(--app-accent)]"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--app-text)]">
                    Confirm Password
                  </span>
                  <input
                    name="confirmPassword"
                    type="password"
                    required
                    autoComplete="new-password"
                    minLength={8}
                    placeholder="Repeat the password"
                    className="app-brutal-input h-12 px-4 text-[15px] outline-none transition placeholder:text-[var(--app-muted-soft)] focus:border-[var(--app-accent)]"
                  />
                </label>

                <button
                  type="submit"
                  className="mt-2 h-12 border-2 border-[var(--app-accent)] bg-[var(--app-accent)] text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--app-accent-contrast)] transition hover:border-[var(--app-text)] hover:bg-[var(--app-text)] hover:text-[var(--app-bg)]"
                >
                  Create Account
                </button>
              </form>

              <div className="flex flex-col items-center gap-3 border-t border-[var(--app-border)] pt-5 text-center">
                <p className="text-sm leading-6 text-[var(--app-muted)]">
                  Already have an account?
                </p>
                <Link
                  href={`/sign-in?next=${encodeURIComponent(nextPath)}`}
                  className="inline-flex items-center justify-center border border-[var(--app-border)] px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--app-text)] transition hover:border-[var(--app-nav-hover-bg)] hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)]"
                >
                  Sign In
                </Link>
              </div>
            </div>

            <div className="flex justify-center">
              <Link
                href="/"
                className="text-sm text-[var(--app-muted)] transition hover:text-[var(--app-text)]"
              >
                Back to Home
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

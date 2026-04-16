import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicHeaderClient } from "@/components/public-header";
import { getOptionalAppUserId, normalizeNextPath } from "@/lib/app-auth";

function resolveErrorMessage(error?: string | null) {
  switch (error) {
    case "missing-fields":
      return "Enter both your email and password to continue.";
    case "invalid-credentials":
      return "That email and password did not match an account.";
    case "auth-callback":
      return "The confirmation link could not be completed. Try signing in again.";
    case "sign-in-failed":
      return "Sign in could not be completed right now. Try again in a moment.";
    default:
      return null;
  }
}

function resolveStatusMessage(status?: string | null) {
  switch (status) {
    case "check-email":
      return "Check your inbox to confirm the account, then sign in here.";
    case "signed-out":
      return "Your session has been cleared.";
    default:
      return null;
  }
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    email?: string | string[];
    error?: string | string[];
    next?: string | string[];
    status?: string | string[];
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
  const status = Array.isArray(resolvedSearchParams.status)
    ? resolvedSearchParams.status[0]
    : resolvedSearchParams.status;
  const email = Array.isArray(resolvedSearchParams.email)
    ? resolvedSearchParams.email[0]
    : resolvedSearchParams.email;
  const errorMessage = resolveErrorMessage(error);
  const statusMessage = resolveStatusMessage(status);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-transparent">
      <PublicHeaderClient isSignedIn={false} />
      <main className="flex min-h-0 w-full flex-1 overflow-auto px-4 pb-4 pt-3 md:px-6">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-center">
          <section className="grid w-full max-w-[720px] gap-8">
            <div className="space-y-5 text-center">
              <p className="text-[10px] uppercase tracking-[0.34em] text-[var(--app-accent)]">
                Sign In
              </p>
              <h1 className="text-5xl font-bold tracking-[-0.04em] text-white md:text-6xl">
                Welcome Back
              </h1>
              <p className="mx-auto max-w-xl text-base leading-8 text-[var(--app-muted)]">
                Sign in with your Chessview email account to open the analysis shell,
                resume Arcade runs, and keep your saved preferences in sync.
              </p>
            </div>

            <div className="app-brutal-card-auth grid gap-6 border border-white/10 p-6 md:p-8">
              {statusMessage ? (
                <div className="border border-emerald-400/35 bg-emerald-400/10 px-4 py-3 text-sm leading-6 text-emerald-100">
                  {statusMessage}
                </div>
              ) : null}

              {errorMessage ? (
                <div className="border border-rose-400/35 bg-rose-400/10 px-4 py-3 text-sm leading-6 text-rose-100">
                  {errorMessage}
                </div>
              ) : null}

              <form action="/auth/sign-in" method="post" className="grid gap-5">
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
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className="app-brutal-input h-12 px-4 text-[15px] outline-none transition placeholder:text-[var(--app-muted-soft)] focus:border-[var(--app-accent)]"
                  />
                </label>

                <button
                  type="submit"
                  className="mt-2 h-12 border-2 border-[var(--app-accent)] bg-[var(--app-accent)] text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--app-accent-contrast)] transition hover:border-[var(--app-text)] hover:bg-[var(--app-text)] hover:text-[var(--app-bg)]"
                >
                  Open Chessview
                </button>
              </form>

              <div className="grid gap-4 border-t border-[var(--app-border)] pt-5 md:grid-cols-[1fr_auto] md:items-center">
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--app-muted)]">
                    Redirect After Sign-In
                  </p>
                  <p className="text-sm font-bold uppercase tracking-[0.12em] text-[var(--app-text)]">
                    {nextPath}
                  </p>
                </div>
                <Link
                  href={`/sign-up?next=${encodeURIComponent(nextPath)}`}
                  className="inline-flex items-center justify-center border border-[var(--app-border)] px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--app-text)] transition hover:border-[var(--app-nav-hover-bg)] hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)]"
                >
                  Create Account
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

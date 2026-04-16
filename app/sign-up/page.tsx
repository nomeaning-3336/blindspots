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
    <div className="min-h-screen bg-transparent">
      <PublicHeaderClient isSignedIn={false} />
      <main className="mx-auto flex min-h-[calc(100vh-84px)] w-full max-w-[1220px] items-center px-6 py-10 md:px-10">
        <section className="grid w-full gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="app-brutal-card-auth relative overflow-hidden p-8 md:p-10">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,color-mix(in_srgb,var(--app-accent)_18%,transparent),transparent_68%)]" />
            <div className="relative z-10 grid gap-8">
              <div className="space-y-4">
                <p className="text-xs uppercase tracking-[0.32em] text-[var(--app-muted)]">
                  Create Account
                </p>
                <h1 className="max-w-[14ch] text-4xl font-bold uppercase tracking-[0.18em] text-white md:text-5xl">
                  Join Chessview
                </h1>
                <p className="max-w-2xl text-sm leading-8 text-[var(--app-muted)] md:text-[15px]">
                  Create an account to save your app theme, sync analysis defaults,
                  link a public chess profile, and jump back into your board shell
                  without losing momentum.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="app-brutal-auth-tile p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--app-muted)]">
                    One Identity
                  </p>
                  <p className="mt-3 text-sm leading-7 text-white">
                    Your Chessview account is keyed directly to the Supabase auth user id.
                  </p>
                </div>
                <div className="app-brutal-auth-tile p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--app-muted)]">
                    Faster Return
                  </p>
                  <p className="mt-3 text-sm leading-7 text-white">
                    Sign back in with email and password and land exactly where you left off.
                  </p>
                </div>
                <div className="app-brutal-auth-tile p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--app-muted)]">
                    Theme Fidelity
                  </p>
                  <p className="mt-3 text-sm leading-7 text-white">
                    Your selected shell theme stays aligned with the rest of Chessview.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 border-t border-white/10 pt-6 md:grid-cols-2">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--app-muted)]">
                    Redirect After Sign-Up
                  </p>
                  <p className="mt-3 text-sm font-bold uppercase tracking-[0.14em] text-white">
                    {nextPath}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--app-muted)]">
                    Auth Flow
                  </p>
                  <p className="mt-3 text-sm leading-7 text-white">
                    Email confirmation is supported if it is enabled in your Supabase auth settings.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="app-brutal-card-auth relative overflow-hidden p-3 md:p-4">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--app-accent)_8%,transparent),transparent_28%,transparent_72%,rgba(255,255,255,0.03))]" />
            <div className="relative z-10 h-full border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-5 md:p-7">
              <div className="mb-6 flex items-end justify-between gap-4 border-b border-white/10 pb-5">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--app-muted)]">
                    chessview.ai
                  </p>
                  <p className="mt-3 text-2xl font-bold uppercase tracking-[0.16em] text-white">
                    Create Your Account
                  </p>
                </div>
                <div className="hidden border border-[var(--app-accent)] bg-[var(--app-accent-soft)] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white md:block">
                  Email Auth
                </div>
              </div>

              {errorMessage ? (
                <div className="mb-5 border border-rose-400/35 bg-rose-400/10 px-4 py-3 text-sm leading-6 text-rose-100">
                  {errorMessage}
                </div>
              ) : null}

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
                  className="h-12 border-2 border-[var(--app-accent)] bg-[var(--app-accent)] text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--app-accent-contrast)] transition hover:border-[var(--app-text)] hover:bg-[var(--app-text)] hover:text-[var(--app-bg)]"
                >
                  Create Account
                </button>
              </form>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] pt-5">
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
          </div>
        </section>
      </main>
    </div>
  );
}

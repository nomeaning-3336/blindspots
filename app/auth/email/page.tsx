import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicHeaderClient } from "@/components/public-header";
import { getOptionalAppUserId, normalizeNextPath } from "@/lib/app-auth";
import { EmailAuthHashHandler } from "./hash-handler";
import { GoogleSignInLink } from "./google-sign-in-link";

function resolveErrorMessage(error?: string | null) {
  switch (error) {
    case "missing-email":
      return "Enter an email address. We will take it from there.";
    case "otp-failed":
      return "Failed to send a link. Try again in a moment.";
    case "link-expired":
      return "That link expired. No worries — request a fresh one.";
    case "auth-callback":
      return "The link fell over on the way back. Try again.";
    case "oauth-failed":
      return "Google sign-in failed to start. Try again.";
    default:
      return null;
  }
}

export default async function EmailAuthPage({
  searchParams,
}: {
  searchParams: Promise<{
    email?: string | string[];
    error?: string | string[];
    next?: string | string[];
    sent?: string | string[];
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
  const sent = Array.isArray(resolvedSearchParams.sent)
    ? resolvedSearchParams.sent[0]
    : resolvedSearchParams.sent;
  const errorMessage = resolveErrorMessage(error);
  const showSuccess = sent === "true";

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-transparent">
      <EmailAuthHashHandler />
      <PublicHeaderClient hideAuthAction />
      <main className="flex min-h-0 w-full flex-1 overflow-auto px-4 pb-4 pt-3 md:px-6">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-center">
          <section className="grid w-full max-w-[720px] gap-8">
            <div className="space-y-5 text-center">
              <h1 className="text-5xl font-bold tracking-[-0.04em] text-white md:text-6xl">
                {showSuccess ? "Check your email" : "Continue with email"}
              </h1>
              <p className="mx-auto max-w-xl text-sm leading-8 text-[var(--app-muted)]">
                {showSuccess
                  ? "We sent a sign-in link. Open it on this device to continue."
                  : "Sign in or create an account with just your email address."}
              </p>
            </div>

            <div className="app-brutal-card-auth grid gap-6 border border-white/10 p-6 md:p-8">
              {showSuccess ? (
                <div className="space-y-4">
                  <div className="border border-emerald-400/35 bg-emerald-400/10 px-5 py-5 text-center text-emerald-100">
                    <p className="text-sm font-bold leading-6">
                      Check your inbox. The link is on its way.
                    </p>
                    {email ? (
                      <p className="mt-4 text-sm leading-6">
                        Sent to <span className="font-mono font-bold text-[var(--app-text)]">{email}</span>
                      </p>
                    ) : null}
                    <p className="mt-3 text-xs leading-6 text-emerald-100/75">
                      The link expires in about an hour. If you do not see it, check your spam folder.
                    </p>
                  </div>
                  <form action="/auth/send-magic-link" method="post" className="grid gap-4">
                    <input type="hidden" name="next" value={nextPath} />
                    <input type="hidden" name="email" value={email ?? ""} />
                    <button
                      type="submit"
                      className="mt-2 h-12 w-full border-2 border-[var(--app-border)] bg-[var(--app-surface-input)] text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--app-text)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
                    >
                      Send another link
                    </button>
                  </form>
                </div>
              ) : (
                <>
                  {errorMessage ? (
                    <div className="border border-rose-400/35 bg-rose-400/10 px-4 py-3 text-center text-sm leading-6 text-rose-100">
                      {errorMessage}
                    </div>
                  ) : null}

                  <GoogleSignInLink nextPath={nextPath} />

                  <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--app-muted)]">
                    <span className="h-px flex-1 bg-[var(--app-border)]" />
                    <span>Or use email</span>
                    <span className="h-px flex-1 bg-[var(--app-border)]" />
                  </div>

                  <form action="/auth/send-magic-link" method="post" className="grid gap-5">
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

                    <button
                      type="submit"
                      className="mt-2 h-12 border-2 border-[var(--app-accent)] bg-[var(--app-accent)] text-[13px] font-bold uppercase tracking-[0.18em] !text-black transition hover:border-[var(--app-text)] hover:bg-[var(--app-text)] hover:text-[var(--app-bg)]"
                    >
                      Email me a sign-in link
                    </button>
                  </form>
                </>
              )}
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
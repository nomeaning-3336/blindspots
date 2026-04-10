import { auth } from "@clerk/nextjs/server";
import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { PublicHeaderClient } from "@/components/public-header";
import { normalizeNextPath } from "@/lib/app-auth";
import { clerkAuthAppearance } from "@/lib/clerk-auth-appearance";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const nextParam = Array.isArray(resolvedSearchParams.next)
    ? resolvedSearchParams.next[0]
    : resolvedSearchParams.next;
  const nextPath = normalizeNextPath(nextParam);
  const { userId } = await auth();

  if (userId) {
    redirect(nextPath);
  }

  return (
    <div className="min-h-screen bg-transparent">
      <PublicHeaderClient isSignedIn={false} />
      <main className="mx-auto flex min-h-[calc(100vh-84px)] w-full max-w-[1220px] items-center px-6 py-10 md:px-10">
        <section className="grid w-full gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="app-brutal-card-auth relative overflow-hidden p-8 md:p-10">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,rgba(192,132,252,0.18),transparent_68%)]" />
            <div className="relative z-10 grid gap-8">
              <div className="space-y-4">
                <p className="text-xs uppercase tracking-[0.32em] text-[var(--app-muted)]">
                  Create Account
                </p>
                <h1 className="max-w-[14ch] text-4xl font-bold uppercase tracking-[0.18em] text-white md:text-5xl">
                  Join Chessview
                </h1>
                <p className="max-w-2xl text-sm leading-8 text-[var(--app-muted)] md:text-[15px]">
                  Create an account to link your public chess profile, open the full
                  performance dashboard, and keep recent-game imports one click away.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="app-brutal-auth-tile p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--app-muted)]">
                    One Profile
                  </p>
                  <p className="mt-3 text-sm leading-7 text-white">
                    Connect a public Lichess or Chess.com account in a few seconds.
                  </p>
                </div>
                <div className="app-brutal-auth-tile p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--app-muted)]">
                    Faster Imports
                  </p>
                  <p className="mt-3 text-sm leading-7 text-white">
                    Pull recent games directly into analysis without copying PGNs around.
                  </p>
                </div>
                <div className="app-brutal-auth-tile p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--app-muted)]">
                    Arcade Modes
                  </p>
                  <p className="mt-3 text-sm leading-7 text-white">
                    Jump into experimental variants without leaving the main board shell.
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
                    Best Start
                  </p>
                  <p className="mt-3 text-sm leading-7 text-white">
                    Email plus Google gives you the quickest login flow with the least friction.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="app-brutal-card-auth relative overflow-hidden p-3 md:p-4">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(192,132,252,0.08),transparent_28%,transparent_72%,rgba(255,255,255,0.03))]" />
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
                  Quick Setup
                </div>
              </div>

              <SignUp
                routing="hash"
                forceRedirectUrl={nextPath}
                fallbackRedirectUrl={nextPath}
                signInUrl="/sign-in"
                appearance={clerkAuthAppearance}
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

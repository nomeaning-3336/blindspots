import { auth } from "@clerk/nextjs/server";
import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicHeaderClient } from "@/components/public-header";
import { normalizeNextPath } from "@/lib/app-auth";
import { clerkAuthAppearance } from "@/lib/clerk-auth-appearance";

export default async function SignInPage({
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
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-transparent">
      <PublicHeaderClient isSignedIn={false} />
      <main className="flex min-h-0 w-full flex-1 overflow-hidden px-4 pb-4 pt-3 md:px-6">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-center">
          <section className="grid w-full max-w-[620px] gap-10">
            <div className="space-y-5 text-center">
              <p className="text-[10px] uppercase tracking-[0.34em] text-[var(--app-accent)]">
                Sign In
              </p>
              <h1 className="text-5xl font-bold tracking-[-0.04em] text-white md:text-6xl">
                Welcome Back
              </h1>
              <p className="mx-auto max-w-xl text-base leading-8 text-[var(--app-muted)]">
                Sign in to access your dashboard and save your progress.
              </p>
            </div>

            <div className="app-brutal-card-auth flex justify-center border border-white/10 bg-[var(--app-panel-strong)] p-6 md:p-10">
              <SignIn
                routing="hash"
                forceRedirectUrl={nextPath}
                fallbackRedirectUrl={nextPath}
                signUpUrl="/sign-up"
                withSignUp
                appearance={clerkAuthAppearance}
              />
            </div>

            <div className="flex justify-center">
              <Link
                href="/"
                className="text-sm text-[var(--app-muted)] transition hover:text-white"
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

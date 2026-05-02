import Link from "next/link";
import { PublicHeaderClient } from "@/components/public-header";
import { getOptionalAppUserId } from "@/lib/app-auth";
import { AnalysisBoard } from "@/components/chess/analysis-board";
import { getHomeCallToAction } from "@/lib/public-home";

function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-3">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect
          x="2"
          y="2"
          width="20"
          height="20"
          rx="3"
          stroke="var(--app-text)"
          strokeWidth="1.6"
        />
        <circle cx="12" cy="12" r="3.2" fill="var(--app-accent)" />
        <path
          d="M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3"
          stroke="var(--app-text)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-sm font-bold uppercase text-[var(--app-text)]">
        Blindspots<span className="text-[var(--app-accent)]">.gg</span>
      </span>
    </span>
  );
}

function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="app-brutal-button inline-flex min-h-12 items-center justify-center px-5 py-3 text-sm"
    >
      {children}
    </Link>
  );
}

function TrainingBoard() {
  return (
    <AnalysisBoard
      fen="r1bq1rk1/pp3ppp/2n1pn2/2bp4/3P4/P1N1PN2/1P2BPPP/R1BQ1RK1 b - - 0 1"
      mode="training"
      coordinates={true}
      disabled={true}
      className="!rounded-[10px]"
    />
  );
}

function HeroVisual() {
  return (
    <div className="relative max-w-full overflow-x-clip">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-50 md:-inset-8"
        style={{
          backgroundImage:
            "linear-gradient(color-mix(in srgb, var(--app-border-strong) 12%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--app-border-strong) 12%, transparent) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(ellipse at center, black 20%, transparent 76%)",
        }}
      />

      <div className="relative flex min-h-[320px] items-center justify-center overflow-hidden md:min-h-[460px]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-1/2 h-[95%] w-[95%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-3xl"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, var(--app-accent-soft), transparent 68%)",
          }}
        />

        <div className="relative z-10 aspect-square w-full max-w-[min(92vw,38rem,68vh)]">
          <TrainingBoard />
        </div>
      </div>
    </div>
  );
}

export default async function DisclaimerPage() {
  const userId = await getOptionalAppUserId();
  const isSignedIn = Boolean(userId);
  const callToAction = getHomeCallToAction(isSignedIn);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-transparent">
      <PublicHeaderClient isSignedIn={isSignedIn} />
      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-clip">
        <section className="mx-auto grid min-h-[calc(100dvh-64px)] w-full min-w-0 max-w-full overflow-x-clip gap-10 px-6 py-10 md:max-w-6xl md:grid-cols-[minmax(0,1fr)_minmax(22rem,1.1fr)] md:items-center md:gap-14 md:px-10 md:py-16">
          <div className="flex min-w-0 flex-col items-center justify-center px-2 text-center md:px-0">
            <h1 className="max-w-[11ch] text-[clamp(2.5rem,4.4vw,4.05rem)] font-black leading-[0.98] tracking-[-0.035em] text-[var(--app-text)]">
              This website is{" "}
              <span className="italic text-[var(--app-accent)]">still under development</span>.
            </h1>

            <p className="mt-6 max-w-md text-base leading-8 text-[var(--app-muted)]">
              You can use it while we build. Some things will break. We are not sorry.
            </p>

            <div className="mt-9">
              <PrimaryLink href={callToAction.href}>{callToAction.label}</PrimaryLink>
            </div>
          </div>

          <HeroVisual />
        </section>

        <footer className="mx-auto flex w-full min-w-0 max-w-full flex-col gap-4 overflow-x-clip border-t border-[var(--app-border)] px-6 py-6 md:max-w-7xl md:flex-row md:items-center md:justify-between md:px-10">
          <BrandMark size={20} />
          <p className="max-w-full break-words text-[10px] uppercase text-[var(--app-muted)]">
            (c) 2026 / No rooks were sacrificed
          </p>
        </footer>
      </main>
    </div>
  );
}

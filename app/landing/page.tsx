import Link from "next/link";
import { PublicHeaderClient } from "@/components/public-header";
import { PublicFaq } from "@/components/public-faq";
import { getShellAuthHint } from "@/lib/app-auth";
import { AnalysisBoard } from "@/components/chess/analysis-board";

const loopSteps = [
  {
    number: "01",
    title: "You get a position",
    copy: "Usually from your own games. Sometimes from the fallback pool. Either way it is there because your chess invited it.",
  },
  {
    number: "02",
    title: "You play it out",
    copy: "A few moves against the engine. No eval bar. No hints. This is not tracing paper.",
  },
  {
    number: "03",
    title: "We measure the damage",
    copy: "The system tracks how much evaluation you managed not to throw away. A low bar, but still useful.",
  },
  {
    number: "04",
    title: "The next one gets meaner",
    copy: "Future positions lean toward the stuff you keep mishandling. The database remembers. How touching.",
  },
];

const faqItems = [
  {
    question: "How is this different from Lichess puzzles?",
    answer:
      "Lichess shows you random puzzles. Chess.com shows you random puzzles with more banners. Blindspots shows the positions you actually keep mishandling and makes you play them out.",
  },
  {
    question: "Do I need a lot of games first?",
    answer:
      "No. Linked games help, but the fallback pools can get started before the profile knows all your habits. The profile just gets more specific once it has receipts.",
  },
  {
    question: "Can I train openings I actually play?",
    answer:
      "Yes. Opening preferences live in account settings, so the positions can stay closer to the lines you actually inflict on yourself.",
  },
  {
    question: "Is this cheating detection?",
    answer:
      "No. Linked games are used to build a private training profile, not to accuse or classify players.",
  },
];

function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-3">
      <img src="/blindspots-logo.svg" width={size} height={size} alt="" className="shrink-0" />
      <span className="text-sm font-semibold text-[var(--app-text)]">
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

function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-12 items-center justify-center rounded border border-[var(--app-border)] bg-transparent px-5 py-3 text-xs font-semibold text-[var(--app-text)] transition hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)]"
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
        <img
          src="/hero-image.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-1/2 h-[130%] w-[130%] -translate-x-1/2 -translate-y-1/2 object-cover opacity-45 blur-sm"
          style={{
            maskImage: "radial-gradient(ellipse at center, black 18%, transparent 72%)",
          }}
        />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-1/2 h-[95%] w-[95%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-3xl"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, var(--app-accent-soft), transparent 68%)",
          }}
        />

        <div className="relative z-10 aspect-square w-full">
          <TrainingBoard />
        </div>
      </div>
    </div>
  );
}

function DifferenceCard({
  title,
  items,
  accent = false,
}: {
  title: string;
  items: string[];
  accent?: boolean;
}) {
  return (
    <article
      className="rounded-lg border p-6 transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-105 hover:shadow-lg"
      style={{
        borderColor: accent ? "var(--app-accent)" : "var(--app-border)",
        background: accent
          ? "linear-gradient(180deg, var(--app-accent-soft), transparent), var(--app-panel-solid)"
          : "var(--app-panel-solid)",
      }}
    >
      <div className="mb-6 flex items-center gap-3">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full border"
          style={{ borderColor: accent ? "var(--app-accent)" : "var(--app-muted)" }}
        >
          <span
            className="h-3 w-3 rounded-full"
            style={{ background: accent ? "var(--app-accent)" : "var(--app-muted)" }}
          />
        </span>
        <h2 className="text-lg font-bold text-[var(--app-text)]">{title}</h2>
      </div>
      <ul className="grid gap-4">
        {items.map((item) => (
          <li
            key={item}
            className="flex gap-3 text-sm leading-6 text-[var(--app-muted)]"
          >
            <span
              className="mt-2 h-2 w-2 shrink-0 rounded"
              style={{ background: accent ? "var(--app-accent)" : "var(--app-muted-soft)" }}
            />
            <span className={accent ? "text-[var(--app-text)]" : ""}>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export default async function LandingPage() {
  const isSignedIn = await getShellAuthHint();

  const startHref = isSignedIn ? "/" : "/sign-up?next=%2F";

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-transparent">
      <PublicHeaderClient isSignedIn={isSignedIn} />
      <main className="min-h-0 flex-1 overflow-hidden">
        <section className="mx-auto grid w-full min-w-0 max-w-full overflow-x-clip gap-12 px-5 py-14 md:max-w-[96rem] md:grid-cols-[1fr_1.3fr] md:items-center md:px-10 md:py-20">
          <div>
            <h1 className="max-w-3xl text-[clamp(2.75rem,4.8vw,4.25rem)] font-black leading-[0.98] tracking-[-0.06em] text-[var(--app-text)]">
              Chess training for the positions you{" "}
              <span className="italic text-[var(--app-accent)]">keep getting wrong</span>.
            </h1>

            <p className="mt-6 max-w-xl text-base leading-8 text-[var(--app-muted)]">
              <span className="font-semibold leading-none text-[var(--app-text)]">Blindspots</span><span className="font-semibold leading-none text-[var(--app-accent)]">.gg</span> finds the positions you blundered in your own games and serves them back to you until you stop failing them. We have plenty of time. Hopefully...
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <PrimaryLink href={startHref}>Start training</PrimaryLink>
            </div>
          </div>

          <HeroVisual />
        </section>

        <section className="mx-auto grid w-full max-w-7xl gap-4 px-6 py-10 md:grid-cols-2 md:px-10">
          <DifferenceCard
            title="Random puzzles"
            items={[
              "One best move, usually a tactic, occasionally a cheap shot",
              "Roughly your rating, give or take whatever the puzzle system had for breakfast",
              "No memory of what you personally keep doing wrong",
            ]}
          />
          <DifferenceCard
            title="Blindspots.gg"
            accent
            items={[
              "Positions from your own games or a pool built to make you uncomfortable",
              "Play the position out for several moves instead of spotting one move and feeling heroic",
              "The system tracks what you mishandle and keeps bringing it back. Very considerate",
            ]}
          />
        </section>

        <section className="mx-auto w-full max-w-7xl px-6 py-14 md:px-10">
          <div className="mb-10 text-center">
            <h2 className="text-4xl font-bold text-[var(--app-text)] md:text-5xl">
              Same loop. Better target.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {loopSteps.map((step) => (
              <article
                key={step.number}
                className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-solid)] p-6"
              >
                <div className="mb-5 text-xs font-bold text-[var(--app-accent)]">
                  {step.number}
                </div>
                <h3 className="text-lg font-bold text-[var(--app-text)]">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
                  {step.copy}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-4xl px-6 py-14 md:px-10">
          <div className="mb-8 text-center">
            <h2 className="text-4xl font-bold text-[var(--app-text)]">
              Questions people keep asking
            </h2>
          </div>
          <PublicFaq items={faqItems} />
        </section>

        <section className="mx-auto w-full max-w-7xl px-6 py-14 md:px-10">
          <div
            className="relative overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-6 py-14 text-center md:px-12"
            style={{
              background:
                "radial-gradient(640px 220px at 50% 0%, var(--app-accent-soft), transparent 64%), var(--app-panel-strong)",
            }}
          >
            <h2 className="mx-auto max-w-5xl text-4xl font-bold text-[var(--app-text)] md:text-5xl">
              Connect your games. We will find the bad parts.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[var(--app-muted)]">
              Link a Lichess or Chess.com account. We pull recent games, run the moves through Stockfish, and write down where you panic.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <PrimaryLink href={startHref}>Start training</PrimaryLink>
            </div>
          </div>
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

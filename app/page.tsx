import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { PublicHeaderClient } from "@/components/public-header";

const analysisFeatures = [
  {
    title: "Engine Integration",
    copy: "Powered by lc0 neural network engine. Visualize eval bars, top-N lines, and CPUvis in real-time.",
    stat: "∞ depth",
    label: "Neural Analysis",
  },
  {
    title: "Cloud同步",
    copy: "Stream your PGN or Lichess studies directly. Import games with one click, no upload required.",
    stat: "PGN + Lichess",
    label: "Import Sources",
  },
  {
    title: "Board Exploration",
    copy: "Navigate any position with arrows, highlighting, and custom annotation. Study variations without losing context.",
    stat: "FEN + UCI",
    label: "Position Format",
  },
  {
    title: "Performance面板",
    copy: "Track your accuracy, mistake frequency, and improvement trends over time with per-game analytics.",
    stat: "30+ metrics",
    label: "Analytics",
  },
];

const heroMoves = [
  { move: "1. e4", eval: "+0.25" },
  { move: "1... e5", eval: "+0.20" },
  { move: "2. Nf3", eval: "+0.22" },
  { move: "2... Nc6", eval: "+0.18" },
  { move: "3. Bb5", eval: "+0.15" },
];

export default async function HomePage() {
  const { userId } = await auth();
  const isSignedIn = Boolean(userId);

  return (
    <div className="min-h-screen bg-transparent">
      <PublicHeaderClient isSignedIn={isSignedIn} />
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 pb-16 pt-8 md:px-10 md:pt-12">

        {/* Hero */}
        <section className="grid gap-8 md:grid-cols-[1fr_340px] md:items-start">
          <div className="space-y-8">
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-[0.32em] text-[var(--app-accent)]">
                Chess Analysis Redefined
              </p>
              <h1 className="text-5xl font-bold uppercase tracking-[0.1em] text-white md:text-7xl">
                See the game<br />
                <span className="text-[var(--app-accent)]">clearly.</span>
              </h1>
              <p className="max-w-xl text-base leading-8 text-[var(--app-muted)]">
                Chessview brings neural-network analysis to every position.
                Visualize engine thinking, trace variations, and understand your
                games — not just the evals.
              </p>
            </div>

            <div className="flex flex-wrap gap-4">
              <Link
                href="/analysis"
                className="inline-flex items-center justify-center border-2 border-[var(--app-accent)] bg-[var(--app-accent)] px-7 py-4 text-xs font-bold uppercase tracking-[0.2em] !text-black transition-all hover:border-white hover:bg-white hover:!text-black hover:shadow-[4px_4px_0_rgba(255,255,255,0.15)]"
              >
                Start Exploring
              </Link>
              <Link
                href="/performance"
                className="inline-flex items-center justify-center border-2 border-white/20 px-7 py-4 text-xs font-bold uppercase tracking-[0.2em] text-white transition-all hover:border-white hover:bg-white hover:text-black hover:shadow-[4px_4px_0_rgba(255,255,255,0.15)]"
              >
                View your performance
              </Link>
            </div>
          </div>

          {/* Mini board + eval preview */}
          <div className="hidden md:block">
            <div className="app-brutal-card-strong rounded-xl p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--app-muted)]">
                  Live Eval
                </span>
                <span className="font-mono text-2xl font-bold text-[var(--app-accent)]">
                  +0.32
                </span>
              </div>
              {/* ASCII-style mini board */}
              <div className="grid grid-cols-8 gap-px rounded border-2 border-white/60 bg-white/10 overflow-hidden">
                {Array.from({ length: 64 }).map((_, i) => {
                  const row = Math.floor(i / 8);
                  const col = i % 8;
                  const isLight = (row + col) % 2 === 0;
                  return (
                    <div
                      key={i}
                      className={`aspect-square ${
                        isLight ? "bg-[#b8c4b0]" : "bg-[#7d8a67]"
                      }`}
                    />
                  );
                })}
              </div>
              <div className="mt-4 space-y-1">
                {heroMoves.map((m) => (
                  <div key={m.move} className="flex items-center justify-between border-b border-white/5 py-1.5">
                    <span className="font-mono text-xs text-white">{m.move}</span>
                    <span className="font-mono text-xs text-[var(--app-muted)]">{m.eval}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Feature grid */}
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {analysisFeatures.map((f) => (
            <article
              key={f.title}
              className="group app-brutal-card rounded-xl p-6 transition-all hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_rgba(192,132,252,0.2)]"
            >
              <div className="mb-5 flex items-center justify-between">
                <span className="text-[9px] uppercase tracking-[0.3em] text-[var(--app-accent)]">
                  {f.label}
                </span>
                <span className="font-mono text-xs font-bold text-white/40">
                  {f.stat}
                </span>
              </div>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-white">
                {f.title}
              </h2>
              <p className="text-xs leading-6 text-[var(--app-muted)]">
                {f.copy}
              </p>
            </article>
          ))}
        </section>

        {/* CTA strip */}
        <section className="app-brutal-inset rounded-2xl border-2 border-white/8 bg-black/40 p-8 text-center md:p-12">
          <h2 className="text-2xl font-bold uppercase tracking-[0.2em] text-white md:text-4xl">
            Ready to see your games differently?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-sm text-[var(--app-muted)]">
            Import a PGN, paste a FEN, or connect your Lichess account.
            Your first analysis is one click away.
          </p>
          <Link
            href="/analysis"
            className="app-brutal-card-strong mt-8 inline-flex items-center justify-center bg-[var(--app-accent)] px-10 py-4 text-xs font-bold uppercase tracking-[0.2em] text-black transition-all hover:bg-white hover:text-black hover:shadow-[6px_6px_0_rgba(255,255,255,0.2)]"
          >
            Open Analysis Board
          </Link>
        </section>

      </main>
    </div>
  );
}

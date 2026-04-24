import Link from "next/link";
import { PublicHeaderClient } from "@/components/public-header";
import { getOptionalAppUserId } from "@/lib/app-auth";

const loopSteps = [
  {
    number: "01",
    title: "Position served",
    copy: "A real position from your games, an import, or a pool matching positions you have struggled with.",
  },
  {
    number: "02",
    title: "You play it out",
    copy: "Three, five, or seven moves against a configured opponent. No hints while you play.",
  },
  {
    number: "03",
    title: "Sequence scored",
    copy: "The system measures how much evaluation you preserved across the whole sequence.",
  },
  {
    number: "04",
    title: "Next position, adjusted",
    copy: "Future positions reflect what you have mishandled, while your profile updates in the background.",
  },
];

const faqItems = [
  {
    question: "How is this different from Lichess puzzles?",
    answer:
      "Puzzle trainers mostly serve one-move or short tactical problems. Blindspots gives you positions to play out for several moves, then learns which types of positions you mishandle.",
  },
  {
    question: "Do I need a lot of games first?",
    answer:
      "Linked games help, but cold-start pools and opening-constrained pools can start training before the profile is fully personalized.",
  },
  {
    question: "Can I train openings I actually play?",
    answer:
      "Yes. Opening preferences live in profile or account settings, so every session can factor in the openings you expect to face.",
  },
  {
    question: "Is this cheating detection?",
    answer:
      "No. Linked games are used to build a private training profile, not to accuse or classify players.",
  },
];

const pieces: Record<string, string> = {
  r: "/analyze/pieces/cburnett/bR.svg",
  n: "/analyze/pieces/cburnett/bN.svg",
  b: "/analyze/pieces/cburnett/bB.svg",
  q: "/analyze/pieces/cburnett/bQ.svg",
  k: "/analyze/pieces/cburnett/bK.svg",
  p: "/analyze/pieces/cburnett/bP.svg",
  R: "/analyze/pieces/cburnett/wR.svg",
  N: "/analyze/pieces/cburnett/wN.svg",
  B: "/analyze/pieces/cburnett/wB.svg",
  Q: "/analyze/pieces/cburnett/wQ.svg",
  K: "/analyze/pieces/cburnett/wK.svg",
  P: "/analyze/pieces/cburnett/wP.svg",
};

function parseFen(fen: string) {
  return fen.split("/").flatMap((rank) => {
    const squares: Array<string | null> = [];
    for (const char of rank) {
      const emptyCount = Number(char);
      if (Number.isInteger(emptyCount) && emptyCount > 0) {
        squares.push(...Array.from({ length: emptyCount }, () => null));
      } else {
        squares.push(char);
      }
    }
    return squares;
  });
}

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
      className="inline-flex min-h-12 items-center justify-center rounded border border-[var(--app-accent)] bg-[var(--app-accent)] px-5 py-3 text-xs font-bold uppercase !text-black transition hover:border-[var(--app-nav-hover-bg)] hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)]"
    >
      {children}
    </Link>
  );
}

function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-12 items-center justify-center rounded border border-[var(--app-border)] bg-transparent px-5 py-3 text-xs font-bold uppercase text-[var(--app-text)] transition hover:border-[var(--app-nav-hover-bg)] hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)]"
    >
      {children}
    </Link>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase text-[var(--app-accent)]">
      {children}
    </p>
  );
}

function Dot({ pulse = false }: { pulse?: boolean }) {
  return (
    <span
      className={["h-2 w-2 rounded-full bg-[var(--app-accent)]", pulse ? "animate-pulse" : ""]
        .filter(Boolean)
        .join(" ")}
      style={{ boxShadow: "0 0 14px var(--app-accent)" }}
    />
  );
}

function Chip({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded px-3 py-1 text-[10px] font-bold uppercase",
        accent
          ? "bg-[var(--app-accent-soft)] text-[var(--app-accent)]"
          : "border border-[var(--app-border)] text-[var(--app-muted)]",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function TrainingBoard() {
  const board = parseFen("r1bq1rk1/pp3ppp/2n1pn2/2bp4/3P4/P1N1PN2/1P2BPPP/R1BQ1RK1");
  const markedSquares = new Set(["d5", "c3", "e2", "a3"]);

  return (
    <div
      className="relative aspect-square w-full overflow-hidden rounded border border-[var(--app-border)]"
      style={{
        background: "var(--app-panel-deep)",
        boxShadow:
          "0 28px 70px color-mix(in srgb, var(--app-bg) 78%, transparent)",
      }}
    >
      <div className="grid h-full w-full grid-cols-8">
        {board.map((piece, index) => {
          const row = Math.floor(index / 8);
          const col = index % 8;
          const square = `${"abcdefgh"[col]}${8 - row}`;
          const isLight = (row + col) % 2 === 0;
          const isMarked = markedSquares.has(square);

          return (
            <div
              key={square}
              className="relative flex items-center justify-center"
              style={{
                background: isLight
                  ? "color-mix(in srgb, var(--app-panel-solid) 74%, var(--app-text) 12%)"
                  : "color-mix(in srgb, var(--app-panel-deep) 88%, var(--app-bg) 12%)",
                boxShadow: isMarked
                  ? "inset 0 0 0 2px var(--app-accent)"
                  : "none",
              }}
            >
              {col === 0 ? (
                <span className="absolute left-1 top-0.5 text-[9px] font-bold text-[var(--app-muted)]">
                  {8 - row}
                </span>
              ) : null}
              {row === 7 ? (
                <span className="absolute bottom-0.5 right-1 text-[9px] font-bold text-[var(--app-muted)]">
                  {"abcdefgh"[col]}
                </span>
              ) : null}
              {piece ? (
                <img
                  src={pieces[piece]}
                  alt=""
                  className="h-[86%] w-[86%] object-contain"
                  draggable={false}
                />
              ) : isMarked ? (
                <span className="h-3 w-3 rounded-full bg-[var(--app-accent-soft)]" />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HeroVisual() {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="absolute -inset-8 opacity-50"
        style={{
          backgroundImage:
            "linear-gradient(color-mix(in srgb, var(--app-border-strong) 12%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--app-border-strong) 12%, transparent) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(ellipse at center, black 20%, transparent 76%)",
        }}
      />
      <div className="relative rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-strong)] p-4 shadow-[var(--app-shadow)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Chip>Move 3 / 5</Chip>
          </div>
          <div className="inline-flex items-center gap-2 rounded border border-[var(--app-border)] px-3 py-1">
            <Dot />
            <span className="text-xs font-bold text-[var(--app-text)]">02:14</span>
          </div>
        </div>

        <TrainingBoard />

        <div className="mt-2 h-2 overflow-hidden rounded border border-[var(--app-border)] bg-[var(--app-panel-deep)]">
          <div
            className="h-full w-full"
            style={{
              background:
                "repeating-linear-gradient(45deg, color-mix(in srgb, var(--app-text) 8%, transparent) 0 6px, transparent 6px 12px)",
            }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[9px] uppercase text-[var(--app-muted)]">
          <span>-4</span>
          <span>eval hidden</span>
          <span>+4</span>
        </div>

        <div className="mt-4 flex justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase text-[var(--app-muted)]">
              Opponent
            </p>
            <p className="mt-1 text-sm font-bold text-[var(--app-text)]">
              Human-like / 1920
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase text-[var(--app-muted)]">
              Preservation
            </p>
            <p className="mt-1 text-sm font-bold text-[var(--app-accent)]">
              &gt;= 95%
            </p>
          </div>
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
      className="rounded-lg border p-6"
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

export default async function HomePage() {
  const userId = await getOptionalAppUserId();
  const isSignedIn = Boolean(userId);
  const startHref = isSignedIn ? "/train" : "/sign-up?next=%2Ftrain";

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-transparent">
      <PublicHeaderClient isSignedIn={isSignedIn} />
      <main className="min-h-0 flex-1 overflow-auto">
        <section className="mx-auto grid w-full max-w-7xl gap-12 px-6 py-14 md:grid-cols-[1.02fr_0.98fr] md:items-center md:px-10 md:py-20">
          <div>
            <h1 className="max-w-3xl text-5xl font-bold leading-tight text-[var(--app-text)] md:text-6xl lg:text-7xl">
              Train the positions{" "}
              <span className="text-[var(--app-muted)]">you actually</span>{" "}
              <span className="italic text-[var(--app-accent)]">mishandle</span>.
            </h1>

            <p className="mt-6 max-w-xl text-base leading-8 text-[var(--app-muted)]">
              Random puzzles can waste your time. Blindspots gives you positions
              from real games, lets you play them out, and learns which positions
              you mishandle.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <PrimaryLink href={startHref}>Start training</PrimaryLink>
              <SecondaryLink href="/analysis">Open analysis board</SecondaryLink>
            </div>
          </div>

          <HeroVisual />
        </section>

        <section className="mx-auto grid w-full max-w-7xl gap-4 px-6 py-10 md:grid-cols-2 md:px-10">
          <DifferenceCard
            title="Random tactics"
            items={[
              "Lichess and Chess.com serve random puzzles matched to your rating",
              "One best move per puzzle, usually a tactic",
              "No memory of what you personally struggle with",
            ]}
          />
          <DifferenceCard
            title="Blindspots.gg"
            accent
            items={[
              "Positions from any phase of the game, not just tactics",
              "Play the position out for several moves against a human-like opponent",
              "The system learns what you mishandle and serves more of those",
            ]}
          />
        </section>

        <section className="mx-auto w-full max-w-7xl px-6 py-14 md:px-10">
          <div className="mb-10 text-center">
            <Eyebrow>How training works</Eyebrow>
            <h2 className="mt-4 text-4xl font-bold text-[var(--app-text)] md:text-5xl">
              Four steps, repeated across sessions.
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
            <Eyebrow>FAQ</Eyebrow>
            <h2 className="mt-3 text-4xl font-bold text-[var(--app-text)]">
              Questions we get
            </h2>
          </div>
          <div className="border-t border-[var(--app-border)]">
            {faqItems.map((item, index) => (
              <details
                key={item.question}
                open={index === 0}
                className="group border-b border-[var(--app-border)] py-5"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-left text-base font-bold text-[var(--app-text)]">
                  {item.question}
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--app-border)] text-[var(--app-accent)] group-open:hidden">
                    +
                  </span>
                  <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--app-border)] text-[var(--app-accent)] group-open:flex">
                    -
                  </span>
                </summary>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--app-muted)]">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-6 py-14 md:px-10">
          <div
            className="relative overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-6 py-14 text-center md:px-12"
            style={{
              background:
                "radial-gradient(640px 220px at 50% 0%, var(--app-accent-soft), transparent 64%), var(--app-panel-strong)",
            }}
          >
            <Eyebrow>Closed beta</Eyebrow>
            <h2 className="mx-auto mt-4 max-w-5xl text-4xl font-bold text-[var(--app-text)] md:text-5xl">
              Start with positions from games you actually play.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[var(--app-muted)]">
              Link a Lichess or Chess.com account, import PGNs, or use curated
              pools while the system learns what you mishandle.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <PrimaryLink href={startHref}>Start training</PrimaryLink>
              <SecondaryLink href="/sign-in?next=%2Ftrain">Sign in</SecondaryLink>
            </div>
          </div>
        </section>

        <footer className="mx-auto flex w-full max-w-7xl flex-col gap-4 border-t border-[var(--app-border)] px-6 py-6 md:flex-row md:items-center md:justify-between md:px-10">
          <BrandMark size={20} />
          <p className="text-[10px] uppercase text-[var(--app-muted)]">
            (c) 2026 / Built for chess training
          </p>
        </footer>
      </main>
    </div>
  );
}

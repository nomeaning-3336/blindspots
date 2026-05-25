"use client";

import { AuthSignOutButton } from "@/components/auth-sign-out-button";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import { AnalysisBoard, type BoardMove } from "@/components/chess/analysis-board";
import type { AppTheme } from "@/lib/app-theme";

type Verdict = "best" | "inaccuracy" | "blunder" | "brilliant" | null;
type BoardHistoryEntry = {
  fen: string;
  lastMove: { from: string; to: string } | null;
};

const QUEUE = [
  {
    fen: "r1bq1rk1/pp1bpppp/2npn3/8/3PP3/2NB1N2/PPP2PPP/R1BQK2R w KQ - 0 1",
    solution: { from: "g3", to: "f5", san: "Nf5" },
    distractor: { from: "f3", to: "h4", san: "Nh4" },
    history: [
      { quality: "brilliant", san: "Nf5", cpl: 0, eloDelta: +12 },
      { quality: "best", san: "exf5", cpl: 0, eloDelta: +3 },
      { quality: "best", san: "Rxe7", cpl: 4, eloDelta: +2 },
      { quality: "excellent", san: "Qxe7", cpl: 8, eloDelta: +1 },
    ],
    engineLines: [
      { eval: "+2.4", line: "Nf5 exf5 Rxe7 Qxe7 Qxf5" },
      { eval: "+2.1", line: "Bxc6 Nxc6 Re1 Bf6 d4" },
      { eval: "+1.8", line: "d4 exd4 Nxd4 Nxd4 Qxd4" },
      { eval: "+1.2", line: "Nxe5 Nxe5 d4 Bg6 dxe5" },
      { eval: "+0.9", line: "Re1 Nf6 Bxc6 dxc6 d4" },
    ],
    eloBefore: 1842,
    eloAfter: 1860,
    eloChange: +18,
  },
  {
    fen: "8/7k/5p2/1P6/2K5/8/2R5/6r1 w - - 0 1",
    solution: { from: "c4", to: "c5", san: "Kc5" },
    distractor: { from: "b5", to: "b6", san: "b6" },
    history: [
      { quality: "best", san: "Kc5", cpl: 0, eloDelta: +10 },
      { quality: "best", san: "Rxb5", cpl: 0, eloDelta: +4 },
      { quality: "okay", san: "Kd6", cpl: 12, eloDelta: +1 },
    ],
    engineLines: [
      { eval: "+5.2", line: "Kc5 Rxb5 Kd6 Rb6+ Kc7" },
      { eval: "+4.6", line: "b6 Rxb6 Kc5 Rb1 Kc6" },
      { eval: "+3.9", line: "Kb4 Rxb5+ Kxb5 Kg5 a4" },
    ],
    eloBefore: 1860,
    eloAfter: 1871,
    eloChange: +11,
  },
  {
    fen: "r2qkb1r/p2p1ppp/1pn2n2/4p1b1/4P3/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 0 1",
    solution: { from: "f3", to: "e5", san: "Nxe5" },
    distractor: { from: "c3", to: "d5", san: "Nd5" },
    history: [
      { quality: "brilliant", san: "Nxe5", cpl: 0, eloDelta: +14 },
      { quality: "best", san: "d4", cpl: 0, eloDelta: +2 },
    ],
    engineLines: [
      { eval: "+1.9", line: "Nxe5 Nxe5 d4 Bg6 dxe5" },
      { eval: "+1.3", line: "Nd5 exd5 exd5 Nxd5 Re1+" },
      { eval: "+0.8", line: "d4 exd4 Nxd4 Nxd4 Qxd4" },
    ],
    eloBefore: 1871,
    eloAfter: 1888,
    eloChange: +17,
  },
];

const TODAY = {
  due: 3,
  done: 2,
  target: 10,
  reviewDue: 2,
  newFromGames: 1,
  rating: 1842,
  ratingHistory: [1801, 1798, 1812, 1820, 1818, 1824, 1831, 1835, 1842],
};

export function BlindspotsSpaPrototype({
  initialTheme,
}: {
  initialTheme: AppTheme;
}) {
  const [theme, setTheme] = useState<AppTheme>(initialTheme);
  const [queueIdx, setQueueIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [committed, setCommitted] = useState<{ from: string; to: string } | null>(null);
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [flipped, setFlipped] = useState(false);
  const [addFenOpen, setAddFenOpen] = useState(false);
  const [inSession, setInSession] = useState(false);
  const [boardFen, setBoardFen] = useState(QUEUE[0]!.fen);
  const [boardHistory, setBoardHistory] = useState<BoardHistoryEntry[]>([
    { fen: QUEUE[0]!.fen, lastMove: null },
  ]);
  const [boardHistoryIndex, setBoardHistoryIndex] = useState(0);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const current = QUEUE[queueIdx]!;
  const stage = verdict ? "review" : inSession || committed ? "playing" : "loaded";
  const lastMove = committed ? [committed.from, committed.to] : [];
  const correct = committed && (verdict === "best" || verdict === "brilliant") ? [committed.to] : [];
  const incorrect = committed && verdict === "blunder" ? [committed.to] : [];
  const moveLabel = committed ? sanFromMove(committed, current) : "";

  async function handleToggleTheme() {
    const nextTheme: AppTheme = theme === "paper" ? "dark" : "paper";

    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;

    const formData = new FormData();
    formData.set("next", "/");
    formData.set("theme", nextTheme);

    const response = await fetch("/auth/theme/save", {
      method: "POST",
      headers: {
        "x-chessview-fetch": "1",
      },
      body: formData,
    });

    if (!response.ok) {
      const previousTheme: AppTheme = nextTheme === "paper" ? "dark" : "paper";
      setTheme(previousTheme);
      document.documentElement.dataset.theme = previousTheme;
    }
  }

  function handleBoardMove(move: BoardMove) {
    try {
      const chess = new Chess(boardFen);
      const played = chess.move({ from: move.from, to: move.to, promotion: move.uci?.[4] ?? "q" });
      if (played) {
        const nextFen = chess.fen();
        setBoardFen(nextFen);
        setBoardHistory((history) => [
          ...history.slice(0, boardHistoryIndex + 1),
          { fen: nextFen, lastMove: { from: move.from, to: move.to } },
        ]);
        setBoardHistoryIndex((index) => index + 1);
      }
    } catch {
      return;
    }
    setCommitted({ from: move.from, to: move.to });
    setSelected(null);
    setInSession(true);
  }

  function resetBoardHistory(fen: string) {
    setBoardFen(fen);
    setBoardHistory([{ fen, lastMove: null }]);
    setBoardHistoryIndex(0);
  }

  function stepBoard(delta: -1 | 1) {
    const nextIndex = boardHistoryIndex + delta;
    const entry = boardHistory[nextIndex];
    if (!entry) return;
    setBoardHistoryIndex(nextIndex);
    setBoardFen(entry.fen);
    setCommitted(entry.lastMove);
    setSelected(null);
    if (boardHistory.length > 1) setInSession(true);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();
      const isEditing =
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target?.getAttribute("contenteditable") === "true";

      if (isEditing) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepBoard(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        stepBoard(1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [boardHistory, boardHistoryIndex]);

  function finishSequence() {
    if (!committed) return;
    if (committed.from === current.solution.from && committed.to === current.solution.to) {
      setVerdict(queueIdx === 2 ? "brilliant" : "best");
    } else if (committed.from === current.distractor.from && committed.to === current.distractor.to) {
      setVerdict("inaccuracy");
    } else {
      setVerdict("blunder");
    }
  }

  function nextPosition() {
    setQueueIdx((index) => {
      const nextIndex = (index + 1) % QUEUE.length;
      resetBoardHistory(QUEUE[nextIndex]!.fen);
      return nextIndex;
    });
    setSelected(null);
    setCommitted(null);
    setVerdict(null);
  }

  function goHome() {
    setQueueIdx(0);
    resetBoardHistory(QUEUE[0]!.fen);
    setSelected(null);
    setCommitted(null);
    setVerdict(null);
    setInSession(false);
  }

  return (
    <div className="bs-kit-app">
      <ShellActions
        theme={theme}
        onToggleTheme={() => {
          void handleToggleTheme();
        }}
        onAddFen={() => setAddFenOpen(true)}
      />
      <AddFenSheet open={addFenOpen} onClose={() => setAddFenOpen(false)} onAdd={() => setAddFenOpen(false)} />

      <div className="bs-kit-workspace">
        <div className="bs-kit-board-pane">
          <div className="bs-kit-board-stack">
            <PlayerStrip side={flipped ? "white" : "black"} name="Opponent" />
            <div className="bs-kit-board-wrap">
              <AnalysisBoard
                fen={boardFen}
                mode="training"
                orientation={flipped ? "black" : "white"}
                coordinates
                boardTheme="paper"
                pieceTheme="blindspots"
                pieceAnimation
                showLegalTargets
                selectedSquare={selected}
                lastMove={committed}
                highlightedSquares={[
                  ...correct.map((square) => ({ square, color: "rgba(111, 178, 74, 0.45)" })),
                  ...incorrect.map((square) => ({ square, color: "rgba(196, 59, 48, 0.42)" })),
                ]}
                disabled={stage === "review"}
                onMove={handleBoardMove}
                onSquareClick={(square) => {
                  try {
                    const chess = new Chess(boardFen);
                    const piece = chess.get(square as Square);
                    if (selected === square) {
                      setSelected(null);
                      return;
                    }
                    if (!piece) {
                      setSelected(null);
                      return;
                    }
                    if (piece.color !== chess.turn()) {
                      setSelected(null);
                      return;
                    }
                    setSelected(square);
                  } catch {
                    setSelected(null);
                  }
                }}
                className="bs-kit-analysis-board"
              />
            </div>
            <PlayerStrip side={flipped ? "black" : "white"} name="You" turn={!verdict} />
            <div className="bs-kit-board-actions">
              <div className="l">
                <button className="bs-kit-btn ghost sm" onClick={() => setFlipped((value) => !value)}>
                  <FlipIcon /> Flip
                </button>
                <button
                  className="bs-kit-btn ghost sm"
                  onClick={() => stepBoard(-1)}
                  disabled={boardHistoryIndex <= 0}
                  aria-label="Step back"
                >
                  <StepBackIcon /> Back
                </button>
                <button
                  className="bs-kit-btn ghost sm"
                  onClick={() => stepBoard(1)}
                  disabled={boardHistoryIndex >= boardHistory.length - 1}
                  aria-label="Step forward"
                >
                  <StepForwardIcon /> Forward
                </button>
              </div>
              <div className="r">
                {stage === "loaded" ? (
                  <button className="bs-kit-btn ghost sm" onClick={nextPosition}>
                    <SkipIcon /> Skip position
                  </button>
                ) : null}
                {stage === "playing" ? (
                  <button className="bs-kit-btn ghost sm" onClick={finishSequence} disabled={!committed}>
                    <CheckIcon /> Finish sequence
                  </button>
                ) : null}
                {stage === "review" ? (
                  <button className="bs-kit-btn ghost sm" onClick={nextPosition}>
                    <SkipIcon /> Next sequence
                  </button>
                ) : null}
                {inSession ? (
                  <button className="bs-kit-btn ghost sm" onClick={goHome}>
                    <HomeIcon /> Home
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <aside className="bs-kit-sidebar">
          <TodayPanel
            hideStats={inSession}
            hideRating={stage === "playing"}
            eloBefore={stage === "review" ? current.eloBefore : null}
            eloAfter={stage === "review" ? current.eloAfter : null}
            eloChange={stage === "review" ? current.eloChange : null}
          />
          {stage === "review" ? <SequencePanel history={current.history} /> : null}
          {stage === "review" ? <EngineLinesPanel lines={current.engineLines} /> : null}
          {verdict ? <FeedbackCard verdict={verdict} move={moveLabel} onNext={nextPosition} /> : null}
        </aside>
      </div>
    </div>
  );
}

function ShellActions({
  theme,
  onToggleTheme,
  onAddFen,
}: {
  theme: AppTheme;
  onToggleTheme: () => void;
  onAddFen: () => void;
}) {
  return (
    <div className="bs-kit-shell-actions">
      <button className="bs-kit-btn-quiet" onClick={onAddFen}>
        <PlusIcon /> Add FEN
      </button>
      <button className="bs-kit-btn-quiet" onClick={onToggleTheme} title="Toggle theme">
        {theme === "paper" ? <MoonIcon /> : <SunIcon />}
      </button>
      <button
        type="button"
        className="bs-kit-btn-quiet"
        data-testid="spa-settings-placeholder"
      >
        <SettingsIcon />
        <span>Settings</span>
      </button>
      <AuthSignOutButton className="bs-kit-btn-quiet" />
    </div>
  );
}

function PlayerStrip({ side, name, turn = false }: { side: "white" | "black"; name: string; turn?: boolean }) {
  return (
    <div className="bs-kit-player-strip">
      <div className="who">
        <span className={`side ${side}`} />
        <span className="name">{name}</span>
      </div>
      {turn ? <span className="turn-cue">your turn</span> : null}
    </div>
  );
}

function TodayPanel({
  hideRating,
  hideStats,
  eloBefore,
  eloAfter,
  eloChange,
}: {
  hideRating: boolean;
  hideStats: boolean;
  eloBefore: number | null;
  eloAfter: number | null;
  eloChange: number | null;
}) {
  const showEloChange = eloBefore != null && eloAfter != null;
  return (
    <div className="bs-kit-panel">
      {!hideStats ? (
        <div>
          <div className="bs-kit-panel-title">Today</div>
          <div className="bs-kit-due-row">
            <span>{TODAY.due}</span>
            <span>positions due</span>
          </div>
          <div className="bs-kit-muted-line"><b>{TODAY.done}</b> / {TODAY.target} complete</div>
        </div>
      ) : null}
      {!hideStats ? (
        <div className="bs-kit-stat-list">
          <div><span>Review due</span><b>{TODAY.reviewDue}</b></div>
          <div><span>New from your games</span><b>{TODAY.newFromGames}</b></div>
        </div>
      ) : null}
      <div className="bs-kit-rating" data-compact={hideStats ? "true" : "false"}>
        <div className="bs-kit-panel-title">Rating</div>
        {hideRating ? (
          <span className="masked">????</span>
        ) : showEloChange ? (
          <div className="elo-change">
            <span className="old">{eloBefore}</span>
            <span className="arrow">→</span>
            <span className="new">{eloAfter}</span>
            <b>{eloChange! >= 0 ? "+" : ""}{eloChange}</b>
          </div>
        ) : (
          <>
            <span className="rating-number">{TODAY.rating}</span>
            <RatingSparkline points={TODAY.ratingHistory} />
          </>
        )}
      </div>
    </div>
  );
}

function RatingSparkline({ points }: { points: number[] }) {
  const width = 252;
  const height = 36;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(max - min, 1);
  const stepX = width / (points.length - 1);
  const d = points.map((value, index) => {
    const x = index * stepX;
    const y = height - ((value - min) / range) * (height - 4) - 2;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      <path d={`${d} L${width},${height} L0,${height} Z`} fill="var(--bs-accent)" opacity="0.12" />
      <path d={d} fill="none" stroke="var(--bs-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SequencePanel({ history }: { history: Array<{ quality: string; san: string; cpl: number; eloDelta: number }> }) {
  return (
    <div className="bs-kit-panel">
      <div className="bs-kit-panel-title">Sequence</div>
      <div className="bs-kit-sequence-grid header"><span /><span /><span>CPL</span><span>Rating</span></div>
      {history.map((move, index) => (
        <div className="bs-kit-sequence-grid" key={`${move.san}-${index}`}>
          <img src={`/analyze/classification-icons/${move.quality}.png`} alt="" />
          <span>{move.san}</span>
          <span>{move.cpl}</span>
          <b>{move.eloDelta >= 0 ? "+" : ""}{move.eloDelta}</b>
        </div>
      ))}
    </div>
  );
}

function EngineLinesPanel({ lines }: { lines: Array<{ eval: string; line: string }> }) {
  return (
    <div className="bs-kit-panel">
      <div className="bs-kit-panel-title">Engine analysis</div>
      <div className="bs-kit-engine-lines">
        {lines.map((line, index) => (
          <div key={`${line.eval}-${index}`}>
            <b>{line.eval}</b>
            <span>{line.line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeedbackCard({ verdict, move, onNext }: { verdict: NonNullable<Verdict>; move: string; onNext: () => void }) {
  return (
    <div className="bs-kit-feedback">
      <div className="head">
        <img src={`/analyze/classification-icons/${verdict}.png`} alt="" />
        <div>
          <div className={`verdict ${verdict}`}>{verdict.charAt(0).toUpperCase() + verdict.slice(1)}.</div>
          <div className="played">you played {move}</div>
        </div>
      </div>
      <p>{REASONS[verdict]}</p>
      <button className="bs-kit-btn primary sm" onClick={onNext}>Next position</button>
    </div>
  );
}

function AddFenSheet({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (fen: string) => void;
}) {
  const [value, setValue] = useState("");
  if (!open) return null;
  return (
    <div className="bs-kit-add-fen">
      <div className="inner">
        <input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="r1bqk2r/pp2bppp/2n1pn2/3p4/3PP3/2NB1N2/PPP2PPP/R1BQK2R w KQkq - 0 7"
          onKeyDown={(event) => {
            if (event.key === "Enter" && value.trim()) onAdd(value.trim());
            if (event.key === "Escape") onClose();
          }}
        />
        <button className="bs-kit-btn primary sm" onClick={() => value.trim() && onAdd(value.trim())}>Add</button>
        <button className="bs-kit-btn ghost sm" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

const REASONS = {
  best: "Best move. Engine agrees at depth 22.",
  brilliant: "Brilliant. Engine needed depth 22 to find this.",
  inaccuracy: "Inaccuracy. Holds the position but cedes the initiative.",
  blunder: "Blunder. Material drops within two moves.",
};

function sanFromMove(move: { from: string; to: string }, current: typeof QUEUE[number]) {
  if (move.to === current.solution.to && move.from === current.solution.from) return current.solution.san;
  if (move.to === current.distractor.to && move.from === current.distractor.from) return current.distractor.san;
  return `${move.from}→${move.to}`;
}

function Icon({
  children,
  width = 16,
  height = 16,
  strokeWidth = 1.8,
}: {
  children: ReactNode;
  width?: number;
  height?: number;
  strokeWidth?: number;
}) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
function PlusIcon() { return <Icon width={14} height={14} strokeWidth={2}><path d="M12 5v14M5 12h14" /></Icon>; }
function MoonIcon() { return <Icon><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></Icon>; }
function SunIcon() { return <Icon><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></Icon>; }
function SettingsIcon() {
  return (
    <Icon>
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8.6 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1-.33H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 8.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 3.9l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15.4 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.18.38.52.68.93.82.2.07.42.1.63.1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1.08Z" />
    </Icon>
  );
}
function FlipIcon() { return <Icon><path d="M3 7h13M16 7l-3-3M16 7l-3 3M21 17H8M8 17l3-3M8 17l3 3" /></Icon>; }
function SkipIcon() { return <Icon><polyline points="9 18 15 12 9 6" /></Icon>; }
function StepBackIcon() { return <Icon><polyline points="15 18 9 12 15 6" /></Icon>; }
function StepForwardIcon() { return <Icon><polyline points="9 18 15 12 9 6" /></Icon>; }
function CheckIcon() { return <Icon><polyline points="20 6 9 17 4 12" /></Icon>; }
function HomeIcon() { return <Icon><path d="M3 11 12 3l9 8M5 10v10h14V10" /></Icon>; }

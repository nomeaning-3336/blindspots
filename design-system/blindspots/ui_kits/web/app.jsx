// app.jsx — Blindspots.gg training session.
// Signed-in user opens the app → board is already there with a decision position.
// Click a piece, click a destination square → submit. Feedback appears in-place. Next.

const { useState, useEffect } = React;

const USER = { initials: "EM", name: "elara_m" };

// A queue of decision positions. Each is served cold — no animation, no prelude.
// For the prototype we precompute three positions to step through.

// Position 1 — Caro-Kann middlegame, white to move. Solution: Nf5
const POS_CARO = [
  "bR", null, "bB", "bQ", null, "bR", "bK", null,
  "bP", "bP", null, "bB", "bP", "bP", "bP", "bP",
  null, null, "bN", "bP", "bN", null, null, null,
  null, null, null, null, null, null, null, null,
  null, null, null, "wP", "wP", null, null, null,
  null, null, "wN", "wB", null, "wN", null, null,
  "wP", "wP", "wP", null, null, "wP", "wP", "wP",
  "wR", null, "wB", "wQ", "wK", null, null, "wR",
];

// Position 2 — Rook & pawn endgame, white to move. Solution: Kc6 (activate king)
const POS_RPENDGAME = [
  null, null, null, null, null, null, null, null,
  null, null, null, null, null, null, null, "bK",
  null, null, null, null, null, "bP", null, null,
  null, "wP", null, null, null, null, null, null,
  null, null, "wK", null, null, null, null, null,
  null, null, null, null, null, null, null, null,
  null, null, "wR", null, null, null, null, null,
  null, null, null, null, null, null, "bR", null,
];

// Position 3 — Tactics: White to move, knight fork. Solution: Nxe5
const POS_TACTIC = [
  "bR", null, null, "bQ", "bK", "bB", null, "bR",
  "bP", null, null, "bP", null, "bP", "bP", "bP",
  null, "bP", "bN", null, null, "bN", null, null,
  null, null, null, null, "bP", null, "bB", null,
  null, null, null, null, "wP", null, null, null,
  null, null, "wN", null, null, "wN", null, null,
  "wP", "wP", "wP", null, null, "wP", "wP", "wP",
  "wR", null, "wB", "wQ", "wK", "wB", null, "wR",
];

const QUEUE = [
  {
    id: "q1",
    position: POS_CARO,
    sideToMove: "white",
    kind: "Review",
    theme: "Caro-Kann · Advance variation",
    origin: "From your game",
    solution: { from: "g3", to: "f5", san: "Nf5" },
    distractor: { from: "f3", to: "h4", san: "Nh4" },
    postAttempt: "You reached this position in a recent game. Your move lost 1.8 pawns.",
    history: [
      { quality: "brilliant",  san: "Nf5",   cpl: 0,  eloDelta: +12 },
      { quality: "best",       san: "exf5",  cpl: 0,  eloDelta:  +3 },
      { quality: "best",       san: "Rxe7",  cpl: 4,  eloDelta:  +2 },
      { quality: "excellent",  san: "Qxe7",  cpl: 8,  eloDelta:  +1 },
    ],
    engineLines: [
      { eval: "+2.4", line: "Nf5 exf5 Rxe7 Qxe7 Qxf5" },
      { eval: "+2.1", line: "Bxc6 Nxc6 Re1 Bf6 d4" },
      { eval: "+1.8", line: "d4 exd4 Nxd4 Nxd4 Qxd4" },
      { eval: "+1.2", line: "Nxe5 Nxe5 d4 Bg6 dxe5" },
      { eval: "+0.9", line: "Re1 Nf6 Bxc6 dxc6 d4" },
    ],
    eloBefore: 1842, eloAfter: 1860, eloChange: +18,
  },
  {
    id: "q2",
    position: POS_RPENDGAME,
    sideToMove: "white",
    kind: "Review",
    theme: "R+P endgame · king activation",
    origin: "Added by you",
    solution: { from: "c4", to: "c5", san: "Kc5" },
    distractor: { from: "b5", to: "b6", san: "b6" },
    postAttempt: "You first reviewed this 6 days ago. The pawn race holds if the king arrives first.",
    history: [
      { quality: "best",      san: "Kc5",   cpl: 0,  eloDelta: +10 },
      { quality: "best",      san: "Rxb5",  cpl: 0,  eloDelta:  +4 },
      { quality: "okay",      san: "Kd6",   cpl: 12, eloDelta:  +1 },
    ],
    engineLines: [
      { eval: "+5.2", line: "Kc5 Rxb5 Kd6 Rb6+ Kc7" },
      { eval: "+4.6", line: "b6 Rxb6 Kc5 Rb1 Kc6" },
      { eval: "+3.9", line: "Kb4 Rxb5+ Kxb5 Kg5 a4" },
      { eval: "+2.4", line: "Rb2 Kg5 Kb4 Kf5 a4" },
      { eval: "+1.8", line: "Rh2 Rxb5 a4 Rb1 a5" },
    ],
    eloBefore: 1842, eloAfter: 1860, eloChange: +18,
  },
  {
    id: "q3",
    position: POS_TACTIC,
    sideToMove: "white",
    kind: "New",
    theme: "Tactic · knight fork",
    origin: "From your game",
    solution: { from: "f3", to: "e5", san: "Nxe5" },
    distractor: { from: "c3", to: "d5", san: "Nd5" },
    postAttempt: "You reached this position 3 days ago vs blitz_demon. Your move lost 2.4 pawns.",
    history: [
      { quality: "brilliant", san: "Nxe5",  cpl: 0,  eloDelta: +14 },
      { quality: "best",      san: "Nxe5",  cpl: 0,  eloDelta:  +3 },
      { quality: "best",      san: "d4",    cpl: 0,  eloDelta:  +2 },
    ],
    engineLines: [
      { eval: "+1.9", line: "Nxe5 Nxe5 d4 Bg6 dxe5" },
      { eval: "+1.3", line: "Nd5 exd5 exd5 Nxd5 Re1+" },
      { eval: "+0.8", line: "d4 exd4 Nxd4 Nxd4 Qxd4" },
      { eval: "+0.5", line: "Bxc6 bxc6 Nxe5 Bxe5 d4" },
      { eval: "+0.2", line: "Re1 Bf5 d4 exd4 Nxd4" },
    ],
    eloBefore: 1842, eloAfter: 1860, eloChange: +18,
  },
];

const TODAY = {
  due: 3, done: 2, target: 10, reviewDue: 2, newFromGames: 1,
  rating: 1842,
  ratingHistory: [1801, 1798, 1812, 1820, 1818, 1824, 1831, 1835, 1842],
};

// ====== App ======

function App() {
  const [theme, setTheme] = useState("paper");
  const [queueIdx, setQueueIdx] = useState(0);
  const [selected, setSelected] = useState(null);    // src square selected by user
  const [committed, setCommitted] = useState(null);  // {from, to} after click-click
  const [verdict, setVerdict] = useState(null);      // "best" | "inaccuracy" | "blunder" | "brilliant" | null
  const [flipped, setFlipped] = useState(false);
  const [addFenOpen, setAddFenOpen] = useState(false);
  const [inSession, setInSession] = useState(false); // false on home; true once first move is made, stays true

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const current = QUEUE[queueIdx];

  // The board shown reflects committed move on the destination squares (highlight),
  // or the user's currently selected square.
  const lastMove = committed ? [committed.from, committed.to] : [];
  const highlight = selected && !committed ? [selected] : [];
  const correct  = (verdict === "best" || verdict === "brilliant") && committed ? [committed.to] : [];
  const incorrect = (verdict === "blunder" || verdict === "mistake") && committed ? [committed.to] : [];

  // Three stages of the training loop:
  //   loaded   — position served, no interaction yet  → Skip available
  //   playing  — a piece is picked up OR a move committed → Finish available; stats hidden, rating masked
  //   review   — verdict computed                     → Next sequence available
  const stage = verdict ? "review" : (committed || selected) ? "playing" : "loaded";

  function handleSquareClick(sq) {
    if (stage === "review") return; // wait for Next
    if (!selected) {
      // pick a piece — this starts the sequence
      setSelected(sq);
      setInSession(true);
    } else if (sq === selected) {
      setSelected(null);
    } else {
      // commit a move — DON'T evaluate yet; user finishes the sequence manually
      setCommitted({ from: selected, to: sq });
      setSelected(null);
    }
  }

  function finishSequence() {
    if (stage !== "playing" || !committed) return;
    const sq = committed.to, from = committed.from;
    if (sq === current.solution.to && from === current.solution.from) {
      setVerdict(queueIdx === 2 ? "brilliant" : "best");
    } else if (sq === current.distractor.to && from === current.distractor.from) {
      setVerdict("inaccuracy");
    } else {
      setVerdict("blunder");
    }
  }
  function nextPosition() {
    setQueueIdx((i) => (i + 1) % QUEUE.length);
    setSelected(null);
    setCommitted(null);
    setVerdict(null);
  }

  function goHome() {
    setQueueIdx(0);
    setSelected(null);
    setCommitted(null);
    setVerdict(null);
    setInSession(false);
  }

  function skipPosition() {
    nextPosition();
  }

  function handleAddFen(fen) {
    setAddFenOpen(false);
    // no-op in the prototype
  }

  const verdictMeta = verdict ? {
    move: committed ? sanFromMove(committed, current) : "",
    reason: REASONS[verdict] || "",
    engineLine: queueIdx === 1
      ? "1.Kc5 Rc7+ 2.Kd6 Rc6+ 3.Ke7"
      : queueIdx === 2
        ? "1.Nxe5 Nxe5 2.d4 Bg6 3.dxe5"
        : "1.Nf5 exf5 2.Rxe7 Qxe7 3.Qxf5 g6 4.Qf6",
  } : null;

  return (
    <div className="app">
      <TopBar
        user={USER}
        theme={theme}
        onToggleTheme={() => setTheme(theme === "paper" ? "dark" : "paper")}
        onAddFen={() => setAddFenOpen(true)}
      />

      <AddFenSheet open={addFenOpen} onClose={() => setAddFenOpen(false)} onAdd={handleAddFen}/>

      <div className="workspace">
        <div className="board-pane">
          <div className="board-stack">
            <div className="player-strip">
              <div className="who">
                <span className={"side " + (flipped ? "white" : "black")}></span>
                <span className="name">Opponent</span>
              </div>
            </div>
            <div className="board-wrap">
              <Board
                position={current.position}
                lastMove={lastMove}
                highlight={highlight}
                correct={correct}
                incorrect={incorrect}
                flipped={flipped}
                onSquareClick={handleSquareClick}
              />
            </div>
            <PlayerStrip
              side={flipped ? "black" : "white"}
              name="You"
              turn={!verdict}
            />
            <div className="board-actions">
              <div className="l">
                <button className="btn ghost sm" onClick={() => setFlipped(f => !f)}>
                  <Ic.Flip/> Flip
                </button>
              </div>
              <div className="r">
                {stage === "loaded" && (
                  <button className="btn ghost sm" onClick={skipPosition}>
                    <Ic.Skip/> Skip position
                  </button>
                )}
                {stage === "playing" && (
                  <button className="btn ghost sm" onClick={finishSequence}>
                    <Ic.Check/> Finish sequence
                  </button>
                )}
                {stage === "review" && (
                  <button className="btn ghost sm" onClick={nextPosition}>
                    <Ic.Skip/> Next sequence
                  </button>
                )}
                {inSession && (
                  <button className="btn ghost sm" onClick={goHome}>
                    <Ic.Home/> Home
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <aside className="sidebar">
          <TodayPanel
            {...TODAY}
            hideStats={inSession}
            hideRating={stage === "playing"}
            eloBefore={stage === "review" ? current.eloBefore : null}
            eloAfter={stage === "review" ? current.eloAfter : null}
            eloChange={stage === "review" ? current.eloChange : null}
          />

          {stage === "review" && <SequencePanel history={current.history}/>}
          {stage === "review" && <EngineLinesPanel lines={current.engineLines}/>}

          {!verdict && selected && (
            <div style={{
              padding: 14,
              background: "var(--bs-surface-1)",
              borderRadius: 10,
              fontSize: 13,
              color: "var(--bs-fg-2)",
              lineHeight: 1.5,
            }}>
              Piece on <b style={{fontFamily: "var(--bs-font-mono)", color: "var(--bs-fg-1)"}}>{selected}</b> selected. Click a destination.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function PlayerStrip({ side, name, turn }) {
  return (
    <div className="player-strip">
      <div className="who">
        <span className={"side " + side}></span>
        <span className="name">{name}</span>
      </div>
      {turn && <span className="turn-cue">your turn</span>}
    </div>
  );
}

const REASONS = {
  best:       "Best move. Engine agrees at depth 22.",
  brilliant:  "Brilliant. Engine needed depth 22 to find this. Saved to your good moves.",
  inaccuracy: "Inaccuracy. Holds the position but cedes the initiative.",
  mistake:    "Mistake. There was a sharper line — check the engine line.",
  blunder:    "Blunder. Material drops within two moves. Try again later.",
};

function sanFromMove(move, current) {
  if (move.to === current.solution.to && move.from === current.solution.from) return current.solution.san;
  if (move.to === current.distractor.to && move.from === current.distractor.from) return current.distractor.san;
  return move.from + "→" + move.to;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);

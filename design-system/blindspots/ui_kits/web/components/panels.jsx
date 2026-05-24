// panels.jsx — consolidated panels (TodayPanel, FeedbackCard, AddFenSheet).

// TodayPanel.jsx — compact Today widget. Shows queue work, not curriculum.

function TodayPanel({ due, done, target, reviewDue, newFromGames, rating, ratingHistory, hideRating, hideStats, eloBefore, eloAfter, eloChange }) {
  const showEloChange = eloBefore != null && eloAfter != null;
  return (
    <div style={{
      background: "var(--bs-surface-1)",
      borderRadius: 14,
      padding: 20,
      display: "flex",
      flexDirection: "column",
      gap: 14,
    }}>
      {!hideStats && (
        <div>
          <div style={{
            fontFamily: "var(--bs-font-display)",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--bs-fg-2)",
            letterSpacing: "-0.005em",
          }}>Today</div>
          <div style={{display: "flex", alignItems: "baseline", gap: 12, marginTop: 10}}>
            <span style={{
              fontFamily: "var(--bs-font-mono)",
              fontSize: 38,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--bs-fg-1)",
              lineHeight: 1,
            }}>{due}</span>
            <span style={{fontSize: 13, color: "var(--bs-fg-2)"}}>positions due</span>
          </div>
          <div style={{
            marginTop: 8,
            fontSize: 13,
            color: "var(--bs-fg-3)",
          }}>
            <b style={{color: "var(--bs-fg-1)", fontWeight: 700}}>{done}</b> / {target} complete
          </div>
        </div>
      )}

      {!hideStats && (
        <div style={{
          display: "flex", flexDirection: "column", gap: 6,
          paddingTop: 14, borderTop: "1px solid var(--bs-divider)",
        }}>
          <div style={{display: "flex", justifyContent: "space-between", fontSize: 13}}>
            <span style={{color: "var(--bs-fg-1)"}}>Review due</span>
            <span style={{fontFamily: "var(--bs-font-mono)", color: "var(--bs-fg-1)", fontWeight: 700, fontSize: 13}}>
              {reviewDue}
            </span>
          </div>
          <div style={{display: "flex", justifyContent: "space-between", fontSize: 13}}>
            <span style={{color: "var(--bs-fg-1)"}}>New from your games</span>
            <span style={{fontFamily: "var(--bs-font-mono)", color: "var(--bs-fg-1)", fontWeight: 700, fontSize: 13}}>
              {newFromGames}
            </span>
          </div>
        </div>
      )}

      {rating != null && (
        <div style={{
          display: "flex", flexDirection: "column", gap: 8,
          paddingTop: hideStats ? 0 : 14,
          borderTop: hideStats ? "none" : "1px solid var(--bs-divider)",
        }}>
          <div style={{
            fontFamily: "var(--bs-font-display)",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--bs-fg-2)",
          }}>Rating</div>
          <div style={{display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap"}}>
            {hideRating ? (
              <span style={{
                fontFamily: "var(--bs-font-mono)",
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: "-0.015em",
                color: "var(--bs-fg-3)",
                lineHeight: 1,
              }}>????</span>
            ) : showEloChange ? (
              <>
                <span style={{display: "inline-flex", alignItems: "baseline", gap: 8}}>
                  <span style={{
                    fontFamily: "var(--bs-font-mono)",
                    fontSize: 18,
                    fontWeight: 500,
                    letterSpacing: "-0.01em",
                    color: "var(--bs-fg-3)",
                    lineHeight: 1,
                  }}>{eloBefore}</span>
                  <span style={{color: "var(--bs-fg-3)", fontSize: 14}}>→</span>
                  <span style={{
                    fontFamily: "var(--bs-font-mono)",
                    fontSize: 30,
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    color: "var(--bs-fg-1)",
                    lineHeight: 1,
                  }}>{eloAfter}</span>
                </span>
                <span style={{
                  fontFamily: "var(--bs-font-mono)",
                  fontSize: 13,
                  fontWeight: 700,
                  color: eloChange >= 0 ? "#57913a" : "#a93128",
                }}>
                  {eloChange >= 0 ? "+" : ""}{eloChange}
                </span>
              </>
            ) : (
              <span style={{
                fontFamily: "var(--bs-font-mono)",
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: "-0.015em",
                color: "var(--bs-fg-1)",
                lineHeight: 1,
              }}>{rating}</span>
            )}
          </div>
          {!hideRating && ratingHistory && (
            <RatingSparkline points={ratingHistory}/>
          )}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { TodayPanel });

function RatingSparkline({ points, width = 252, height = 36 }) {
  if (!points || points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(max - min, 1);
  const stepX = width / (points.length - 1);
  const d = points.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
  }).join(" ");
  // Area fill path (close to bottom)
  const area = d + ` L${width.toFixed(1)},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{display: "block"}}>
      <path d={area} fill="var(--bs-accent)" opacity="0.12"/>
      <path d={d} fill="none" stroke="var(--bs-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

const VERDICT_COLOR = {
  brilliant:  "#149bbd",
  best:       "#57913a",
  excellent:  "#57913a",
  okay:       "#6a7a55",
  critical:   "#34556e",
  inaccuracy: "#a18424",
  mistake:    "#b96a20",
  blunder:    "#a93128",
};

function SequencePanel({ history }) {
  if (!history || !history.length) return null;
  return (
    <div style={{
      background: "var(--bs-surface-1)",
      borderRadius: 14,
      padding: 18,
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}>
      <div style={{
        fontFamily: "var(--bs-font-display)",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--bs-fg-2)",
      }}>Sequence</div>
      <div style={{display: "flex", flexDirection: "column", gap: 6}}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "24px 1fr 44px 48px",
          gap: 10,
          fontFamily: "var(--bs-font-mono)",
          fontSize: 10,
          color: "var(--bs-fg-3)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          fontWeight: 600,
          paddingBottom: 4,
          borderBottom: "1px solid var(--bs-divider)",
        }}>
          <span></span><span></span>
          <span style={{textAlign: "right"}}>CPL</span>
          <span style={{textAlign: "right"}}>Rating</span>
        </div>
        {history.map((m, i) => (
          <div key={i} style={{
            display: "grid",
            gridTemplateColumns: "24px 1fr 44px 48px",
            gap: 10,
            alignItems: "center",
          }}>
            <img
              src={"../../assets/move-quality/" + m.quality + ".png"}
              alt={m.quality}
              style={{width: 22, height: 22}}
            />
            <span style={{
              fontFamily: "var(--bs-font-mono)",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--bs-fg-1)",
            }}>{m.san}</span>
            <span style={{
              fontFamily: "var(--bs-font-mono)",
              fontSize: 12,
              color: m.cpl === 0 ? "var(--bs-fg-3)" : "var(--bs-fg-2)",
              textAlign: "right",
            }}>{m.cpl}</span>
            <span style={{
              fontFamily: "var(--bs-font-mono)",
              fontSize: 12,
              fontWeight: 600,
              color: m.eloDelta >= 0 ? "#57913a" : "#a93128",
              textAlign: "right",
            }}>{m.eloDelta >= 0 ? "+" : ""}{m.eloDelta}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EngineLinesPanel({ lines }) {
  if (!lines || !lines.length) return null;
  return (
    <div style={{
      background: "var(--bs-surface-1)",
      borderRadius: 14,
      padding: 18,
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      <div style={{
        fontFamily: "var(--bs-font-display)",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--bs-fg-2)",
      }}>Engine analysis</div>
      <div style={{display: "flex", flexDirection: "column", gap: 4}}>
        {lines.map((l, i) => (
          <div key={i} style={{
            display: "grid",
            gridTemplateColumns: "44px 1fr",
            gap: 10,
            alignItems: "baseline",
            padding: "6px 0",
            borderBottom: i < lines.length - 1 ? "1px solid var(--bs-divider)" : "none",
          }}>
            <span style={{
              fontFamily: "var(--bs-font-mono)",
              fontSize: 12,
              fontWeight: 700,
              color: parseFloat(l.eval) < 0 ? "#a93128" : "var(--bs-fg-1)",
            }}>{l.eval}</span>
            <span style={{
              fontFamily: "var(--bs-font-mono)",
              fontSize: 12,
              color: "var(--bs-fg-2)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>{l.line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { SequencePanel, EngineLinesPanel });
function FeedbackCard({ verdict, move, reason, engineLine, onNext, onShowLine }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 14,
      padding: 18, borderRadius: 12,
      background: "var(--bs-surface-0)",
      border: "1px solid var(--bs-divider)",
    }}>
      <div style={{display: "flex", alignItems: "center", gap: 14}}>
        <img
          src={"../../assets/move-quality/" + verdict + ".png"}
          alt={verdict}
          style={{width: 44, height: 44}}
        />
        <div style={{flex: 1, minWidth: 0}}>
          <div style={{
            fontFamily: "var(--bs-font-display)",
            fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em",
            color: VERDICT_COLOR[verdict],
            lineHeight: 1.1,
          }}>
            {verdict.charAt(0).toUpperCase() + verdict.slice(1)}.
          </div>
          <div style={{fontFamily: "var(--bs-font-mono)", fontSize: 12, color: "var(--bs-fg-3)", marginTop: 3}}>
            you played {move}
          </div>
        </div>
      </div>

      <div style={{fontSize: 13, color: "var(--bs-fg-2)", lineHeight: 1.5}}>
        {reason}
      </div>

      {engineLine && (
        <div style={{
          padding: "8px 10px",
          background: "var(--bs-surface-1)",
          borderRadius: 8,
          fontFamily: "var(--bs-font-mono)",
          fontSize: 12,
          color: "var(--bs-fg-2)",
        }}>
          <span style={{color: "var(--bs-fg-3)", marginRight: 6, fontSize: 10, letterSpacing: "0.1em"}}>BEST</span>
          {engineLine}
        </div>
      )}

      <div className="cta-row">
        <button className="btn ghost sm" onClick={onShowLine}>Show line</button>
        <button className="btn primary sm" onClick={onNext} style={{flex: 1}}>
          Next position
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { FeedbackCard, VERDICT_COLOR });


// AddFenSheet.jsx — a tiny inline form. One field, one button. Appears under top bar.

function AddFenSheet({ open, onClose, onAdd }) {
  const [value, setValue] = React.useState("");
  if (!open) return null;
  return (
    <div style={{
      position: "absolute",
      top: 56, left: 0, right: 0,
      display: "flex", justifyContent: "center",
      padding: "20px 24px",
      background: "var(--bs-bg)",
      borderBottom: "1px solid var(--bs-divider)",
      boxShadow: "var(--bs-shadow-md)",
      zIndex: 20,
    }}>
      <div style={{display: "flex", gap: 8, width: "100%", maxWidth: 720, alignItems: "center"}}>
        <div className="eyebrow" style={{minWidth: 70}}>Add FEN</div>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="r1bqk2r/pp2bppp/2n1pn2/3p4/3PP3/2NB1N2/PPP2PPP/R1BQK2R w KQkq - 0 7"
          style={{
            flex: 1,
            background: "var(--bs-surface-0)",
            border: "1px solid var(--bs-border)",
            borderRadius: 10,
            padding: "10px 14px",
            fontFamily: "var(--bs-font-mono)",
            fontSize: 12,
            color: "var(--bs-fg-1)",
            outline: "none",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) { onAdd(value); setValue(""); }
            if (e.key === "Escape") { onClose(); }
          }}
        />
        <button
          className="btn primary sm"
          onClick={() => { if (value.trim()) { onAdd(value); setValue(""); } }}
        >Add</button>
        <button className="btn ghost sm" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

Object.assign(window, { AddFenSheet });


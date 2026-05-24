// Board.jsx — 8x8 board using SVG piece sprites from assets/pieces/.

const FILES = ["a","b","c","d","e","f","g","h"];
const RANKS = ["8","7","6","5","4","3","2","1"];

function sqAt(i) {
  const f = i % 8, r = Math.floor(i / 8);
  return FILES[f] + RANKS[r];
}

function Board({ position, lastMove = [], highlight = [], check = null, correct = [], incorrect = [], flipped = false, onSquareClick }) {
  const squares = [];
  for (let i = 0; i < 64; i++) {
    const file = i % 8, rank = Math.floor(i / 8);
    const sqIdx = flipped ? 63 - i : i;
    const isLight = (Math.floor(sqIdx / 8) + (sqIdx % 8)) % 2 === 0;
    const name = sqAt(sqIdx);
    const piece = position[sqIdx];

    const cls = [
      "sq",
      isLight ? "light" : "dark",
      lastMove.includes(name) ? "lastmove" : "",
      highlight.includes(name) ? "highlight" : "",
      correct.includes(name) ? "correct" : "",
      incorrect.includes(name) ? "incorrect" : "",
      check === name ? "check" : "",
    ].filter(Boolean).join(" ");

    const showRankLabel = (i % 8) === 0;
    const showFileLabel = i >= 56;

    squares.push(
      <div className={cls} key={i} data-sq={name} onClick={onSquareClick ? () => onSquareClick(name) : undefined}>
        {piece && (
          <img
            className="piece"
            src={"../../assets/pieces/" + piece + ".svg"}
            alt={piece}
            draggable={false}
          />
        )}
        {showRankLabel && <span className="rank-label">{flipped ? RANKS[7-rank] : RANKS[rank]}</span>}
        {showFileLabel && <span className="file-label">{flipped ? FILES[7-file] : FILES[file]}</span>}
      </div>
    );
  }

  return <div className="board">{squares}</div>;
}

Object.assign(window, { Board, sqAt });

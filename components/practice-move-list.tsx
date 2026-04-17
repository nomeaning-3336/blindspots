"use client";

import type { PracticeMoveRecord } from "@/lib/practice";
import styles from "./practice.module.css";

interface PracticeMoveListProps {
  moves: PracticeMoveRecord[];
  currentPly: number;
}

export function PracticeMoveList({
  moves,
  currentPly,
}: PracticeMoveListProps) {
  const rows = [];
  for (let index = 0; index < moves.length; index += 2) {
    rows.push({
      moveNumber: Math.floor(index / 2) + 1,
      white: moves[index] || null,
      black: moves[index + 1] || null,
    });
  }

  return (
    <>
      <div className={styles.historyOpening} />
      <div className={styles.historyHead}>
        <h2 className={styles.historyHeadTitle}>Moves</h2>
        <span className={styles.historyHeadMeta}>
          {moves.length ? `${moves.length} plies` : "No moves yet"}
        </span>
      </div>
      <div className={styles.historyList}>
        {rows.length ? (
          <div className={styles.historyTable}>
            {rows.map((row) => (
              <div key={`move-row-${row.moveNumber}`} className={styles.historyRow}>
                <div className={styles.historyMoveIndex}>{row.moveNumber}.</div>
                <div
                  className={`${styles.historyMove} ${
                    row.white?.ply === currentPly ? styles.historyMoveActive : ""
                  }`}
                >
                  {row.white?.san || ""}
                </div>
                <div
                  className={`${styles.historyMove} ${
                    row.black?.ply === currentPly ? styles.historyMoveActive : ""
                  }`}
                >
                  {row.black?.san || ""}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.historyEmpty}>
            Empty like your move list right now. Start playing and the game will
            build here.
          </div>
        )}
      </div>
    </>
  );
}

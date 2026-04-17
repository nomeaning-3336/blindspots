"use client";

import styles from "./practice.module.css";

export function PracticeLoader({
  kicker = "Practice",
  title = "Preparing Game Room",
  description = "Setting the board, syncing the clock, and warming up your opponent.",
  hint = "Please wait. This should only take a moment.",
}: {
  kicker?: string;
  title?: string;
  description?: string;
  hint?: string;
}) {
  return (
    <div className={styles.loaderShell}>
      <div className={styles.loaderCard}>
        <div className={styles.heroKicker}>{kicker}</div>
        <h2 className={styles.setupTitle}>{title}</h2>
        <p className={styles.setupText}>{description}</p>
        <div className={styles.loaderGrid}>
          {Array.from({ length: 10 }).map((_, index) => (
            <div
              key={`practice-loader-${index}`}
              className={`${styles.loaderTile} ${
                index % 2 === 0 ? styles.loaderTileMain : styles.loaderTileAlt
              }`}
              style={{ animationDelay: `${index * 110}ms` }}
            />
          ))}
        </div>
        <div className={styles.loaderHint}>{hint}</div>
      </div>
    </div>
  );
}

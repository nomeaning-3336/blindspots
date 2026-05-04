"use client";

import { AnalysisBoard } from "@/components/chess/analysis-board";

export function PositionThumbnail({ fen, size = 88 }: { fen: string; size?: number }) {
  return (
    <div
      className="app-brutal-board-frame shrink-0 overflow-hidden"
      style={{ width: size, height: size }}
    >
      <AnalysisBoard
        fen={fen}
        mode="training"
        orientation="white"
        coordinates={false}
        disabled
        showLegalTargets={false}
        annotationsDisabled
        selectedSquare={null}
        legalTargets={[]}
        engineArrows={[]}
        lastMove={null}
        lastMoveBadge={null}
        className="!rounded-none"
      />
    </div>
  );
}

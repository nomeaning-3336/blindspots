import type { MoveClassification } from "@/lib/move-classification";

export type { MoveClassification } from "@/lib/move-classification";

export type LastMoveBadge = {
  label: string;
  icon: string;
  color: string;
};

export type ClassifiedSequencePosition = {
  move?: {
    classification?: MoveClassification;
  } & Record<string, unknown>;
} & Record<string, unknown>;

export type ClassifiedMoveLine = {
  bestMove?: string;
  classification?: MoveClassification;
  bestSan?: string;
  depth?: number;
  pv?: string[];
  pvSan?: string[];
  continuationSan?: string[];
};

export const DEFAULT_BLINDSPOTS_ELO = 1200;
export const DRIFT_BOARD_HIGHLIGHTS = {
  b8: "color-mix(in srgb, var(--app-class-mistake) 42%, #7f8190 58%)",
} as const;

export type SpotlightMaskRect = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  width?: number;
  height: number;
};

export function buildSpotlightMaskRects({
  spotlight,
  viewport,
}: {
  spotlight: { top: number; left: number; right: number; bottom: number };
  viewport: { width: number; height: number };
}) {
  const maskTop = Math.floor(spotlight.top);
  const maskLeft = Math.floor(spotlight.left);
  const maskRight = Math.ceil(spotlight.right);
  const maskBottom = Math.ceil(spotlight.bottom);

  return {
    top: { left: 0, right: 0, top: 0, height: Math.max(0, maskTop) },
    bottom: { left: 0, right: 0, bottom: 0, height: Math.max(0, viewport.height - maskBottom) },
    left: {
      left: 0,
      top: maskTop,
      width: Math.max(0, maskLeft),
      height: Math.max(0, maskBottom - maskTop),
    },
    right: {
      right: 0,
      top: maskTop,
      width: Math.max(0, viewport.width - maskRight),
      height: Math.max(0, maskBottom - maskTop),
    },
  } satisfies Record<"top" | "bottom" | "left" | "right", SpotlightMaskRect>;
}

export function buildLastMoveBadge(classification: MoveClassification): LastMoveBadge {
  return {
    label: classificationLabel(classification),
    icon: classificationIcon(classification),
    color: classificationColor(classification),
  };
}

export function moveBadgeForPosition(position?: ClassifiedSequencePosition | null) {
  const classification = position?.move?.classification;
  return classification ? buildLastMoveBadge(classification) : null;
}

export function classificationForPlayedMove(
  move: { uci?: string; classification?: MoveClassification } | null | undefined,
  lines: ClassifiedMoveLine[] = [],
) {
  if (move?.classification) return move.classification;
  const uci = move?.uci;
  if (!uci) return undefined;
  return lines.find((line) => line.bestMove === uci)?.classification;
}

export function moveClassification({
  move,
  moveScore,
}: {
  move?: { classification?: MoveClassification } | null;
  moveScore?: { classification?: MoveClassification } | null;
}) {
  return move?.classification ?? moveScore?.classification;
}

export function mergeEngineLineDetailsFrom<T extends ClassifiedMoveLine>(
  current: T,
  next: T,
  classificationSource: "current" | "next",
): T {
  return {
    ...current,
    ...next,
    classification:
      classificationSource === "current"
        ? current.classification ?? next.classification
        : next.classification ?? current.classification,
  };
}

export function engineLineContinuationSan(line: ClassifiedMoveLine) {
  if (Array.isArray(line.continuationSan)) {
    return line.continuationSan.slice(0, 12).join(" ");
  }

  const san = Array.isArray(line.pvSan) ? line.pvSan : [];
  if (san.length === 0) return "";

  const startsWithLead =
    san[0] === line.bestSan ||
    (Array.isArray(line.pv) && line.pv[0] === line.bestMove);
  const continuation = startsWithLead ? san.slice(1) : san;

  return continuation.slice(0, 12).join(" ");
}

export function getTrainingBoardHighlights(state: "active" | "resolving" | "complete" | "drift") {
  if (state === "drift") return DRIFT_BOARD_HIGHLIGHTS;
  return undefined;
}

export function moveHighlightFill(
  classification: MoveClassification | undefined,
  square: "from" | "to",
) {
  const alpha = square === "from" ? 34 : 52;
  return `color-mix(in srgb, ${classificationColor(classification)} ${alpha}%, transparent)`;
}

export function moveHighlightsForClassifiedMove(
  move: { from: string; to: string } | null | undefined,
  classification: MoveClassification | undefined,
) {
  if (!move) return undefined;
  return [
    { square: move.from, color: moveHighlightFill(classification, "from") },
    { square: move.to, color: moveHighlightFill(classification, "to") },
  ];
}

export function formatClassifiedMoveLead(lead: string, classification: MoveClassification | undefined) {
  return classification ? `${lead} (${classificationLabel(classification)})` : lead;
}

export function classificationColor(classification?: MoveClassification) {
  switch (classification) {
    case "brilliant":
      return "var(--app-class-brilliant)";
    case "critical":
      return "var(--app-class-critical)";
    case "best":
      return "var(--app-class-good)";
    case "excellent":
      return "var(--app-class-excellent)";
    case "good":
      return "var(--app-class-best)";
    case "okay":
      return "var(--app-class-okay)";
    case "inaccuracy":
      return "var(--app-class-inaccuracy)";
    case "mistake":
      return "var(--app-class-mistake)";
    case "blunder":
      return "var(--app-class-blunder)";
    default:
      return "var(--app-text)";
  }
}

export function classificationIcon(classification: MoveClassification) {
  switch (classification) {
    case "brilliant":
      return "/analyze/classification-icons/brilliant.png";
    case "critical":
      return "/analyze/classification-icons/critical.png";
    case "best":
      return "/analyze/classification-icons/best.png";
    case "excellent":
      return "/analyze/classification-icons/excellent.png";
    case "good":
    case "okay":
      return "/analyze/classification-icons/okay.png";
    case "inaccuracy":
      return "/analyze/classification-icons/inaccuracy.png";
    case "mistake":
      return "/analyze/classification-icons/mistake.png";
    case "blunder":
      return "/analyze/classification-icons/blunder.png";
  }
}

export function classificationLabel(classification: MoveClassification) {
  switch (classification) {
    case "brilliant":
      return "Brilliant";
    case "critical":
      return "Critical";
    case "best":
      return "Best";
    case "excellent":
      return "Excellent";
    case "good":
      return "Good";
    case "okay":
      return "Okay";
    case "inaccuracy":
      return "Inaccuracy";
    case "mistake":
      return "Mistake";
    case "blunder":
      return "Blunder";
  }
}

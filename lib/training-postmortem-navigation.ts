export type PostMortemNavigationKey =
  | "ArrowLeft"
  | "ArrowRight"
  | "ArrowUp"
  | "ArrowDown"
  | "Home"
  | "End";

export type PostMortemNavigationAction =
  | { type: "branch"; index: number }
  | { type: "sequence"; index: number; boundary: "start" | "end" }
  | { type: "enter-explore" }
  | { type: "none" };

export function postMortemNavigationAction({
  key,
  resultMode,
  activeExploreIndex,
  visibleSequenceLength,
  exploratoryHistoryLength,
  exploratoryHistoryIndex,
}: {
  key: PostMortemNavigationKey;
  resultMode: "results" | "explore";
  activeExploreIndex: number;
  visibleSequenceLength: number;
  exploratoryHistoryLength: number;
  exploratoryHistoryIndex: number;
}): PostMortemNavigationAction {
  const maxSequenceIndex = Math.max(0, visibleSequenceLength - 1);

  if (resultMode !== "explore") {
    return { type: "enter-explore" };
  }

  if (key === "Home") {
    return { type: "sequence", index: 0, boundary: "start" };
  }

  if (key === "End") {
    return { type: "sequence", index: maxSequenceIndex, boundary: "end" };
  }

  const isBackward = key === "ArrowLeft" || key === "ArrowUp";

  if (exploratoryHistoryLength > 0) {
    if (isBackward && exploratoryHistoryIndex >= 0) {
      return { type: "branch", index: exploratoryHistoryIndex - 1 };
    }

    if (!isBackward && exploratoryHistoryIndex < exploratoryHistoryLength - 1) {
      return { type: "branch", index: exploratoryHistoryIndex + 1 };
    }

    if (isBackward) {
      return {
        type: "sequence",
        index: activeExploreIndex - 1,
        boundary: "start",
      };
    }

    return {
      type: "sequence",
      index: activeExploreIndex + 1,
      boundary: "end",
    };
  }

  return {
    type: "sequence",
    index: isBackward ? activeExploreIndex - 1 : activeExploreIndex + 1,
    boundary: isBackward ? "start" : "end",
  };
}

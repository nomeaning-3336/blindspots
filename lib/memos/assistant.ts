import type {
  MemoAssistantAnswer,
  MemoAssistantEntry,
  MemoAssistantEvidence,
  MemoColor,
  MemoResult,
} from "@/lib/memos/types";

interface MemoThemeDefinition {
  key: string;
  label: string;
  patterns: RegExp[];
}

interface MemoQueryIntent {
  compareOpenings: [string, string] | null;
  result: MemoResult;
  color: MemoColor;
  lookbackDays: number | null;
  searchTerms: string[];
}

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "compare",
  "did",
  "do",
  "for",
  "from",
  "games",
  "how",
  "i",
  "in",
  "is",
  "it",
  "kinds",
  "last",
  "me",
  "mention",
  "most",
  "my",
  "of",
  "on",
  "questions",
  "repeating",
  "saved",
  "that",
  "the",
  "themes",
  "these",
  "to",
  "use",
  "what",
  "which",
  "with",
]);

const THEME_DEFINITIONS: MemoThemeDefinition[] = [
  {
    key: "hanging-pieces",
    label: "hanging pieces",
    patterns: [/hanging piece/i, /\bhung\b/i, /\bundefended\b/i, /\bloose piece/i],
  },
  {
    key: "queen-overreach",
    label: "overaggressive queen moves",
    patterns: [/\bqueen\b/i, /\boveraggressive\b/i, /\btoo early queen/i, /\bqueen raid/i],
  },
  {
    key: "king-safety",
    label: "king safety",
    patterns: [/\bking safety\b/i, /\bunsafe king\b/i, /\bexposed king\b/i, /\bcastl/i],
  },
  {
    key: "calculation",
    label: "missed calculation",
    patterns: [/\bmissed\b/i, /\bcalculation\b/i, /\bmiscalc/i, /\bforgot\b/i],
  },
  {
    key: "development",
    label: "development issues",
    patterns: [/\bdevelop/i, /\bundeveloped\b/i, /\bpiece out too late\b/i],
  },
  {
    key: "time-pressure",
    label: "time pressure",
    patterns: [/\btime pressure\b/i, /\brushed\b/i, /\blow on time\b/i, /\bpanic\b/i],
  },
  {
    key: "pawn-structure",
    label: "pawn structure",
    patterns: [/\bpawn structure\b/i, /\bisolated pawn\b/i, /\bbackward pawn\b/i, /\bweak pawn\b/i],
  },
  {
    key: "tactics",
    label: "missed tactics",
    patterns: [/\bfork\b/i, /\bpin\b/i, /\bskewer\b/i, /\btactic/i, /\bdiscovered attack/i],
  },
  {
    key: "endgame",
    label: "endgame technique",
    patterns: [/\bendgame\b/i, /\brook ending\b/i, /\bconversion\b/i],
  },
];

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ");
}

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function buildEntryCorpus(entry: MemoAssistantEntry) {
  return compactText(
    [
      entry.groupTitle || "",
      entry.noteText,
      entry.tags.join(" "),
      entry.openingName || "",
      entry.opponent || "",
      entry.result || "",
      entry.color || "",
    ].join(" "),
  );
}

function extractThemes(entries: MemoAssistantEntry[]) {
  const counts = new Map<string, { label: string; count: number }>();

  for (const entry of entries) {
    const corpus = buildEntryCorpus(entry);
    const seen = new Set<string>();

    for (const definition of THEME_DEFINITIONS) {
      if (definition.patterns.some((pattern) => pattern.test(corpus))) {
        seen.add(definition.key);
        const current = counts.get(definition.key);
        counts.set(definition.key, {
          label: definition.label,
          count: (current?.count || 0) + 1,
        });
      }
    }

    for (const tag of entry.tags) {
      const key = `tag:${tag}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const current = counts.get(key);
      counts.set(key, {
        label: tag,
        count: (current?.count || 0) + 1,
      });
    }
  }

  return Array.from(counts.entries())
    .map(([key, value]) => ({ key, ...value }))
    .sort((left, right) => {
      if (left.count !== right.count) return right.count - left.count;
      return left.label.localeCompare(right.label);
    });
}

function formatEvidenceExcerpt(noteText: string) {
  const compact = compactText(noteText);
  if (compact.length <= 120) return compact;
  return `${compact.slice(0, 117)}...`;
}

function selectEvidence(entries: MemoAssistantEntry[], limit = 4): MemoAssistantEvidence[] {
  return entries.slice(0, limit).map((entry) => ({
    entryId: entry.id,
    groupId: entry.groupId,
    groupTitle: entry.groupTitle,
    excerpt: formatEvidenceExcerpt(entry.noteText),
    playedAt: entry.playedAt,
    openingName: entry.openingName,
    tags: entry.tags,
  }));
}

function tokenizeQuestion(question: string) {
  return Array.from(
    new Set(
      normalizeText(question)
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !STOPWORDS.has(token)),
    ),
  ).slice(0, 6);
}

function detectLookbackDays(question: string) {
  const lower = question.toLowerCase();
  const explicitMatch = lower.match(/\blast\s+(\d+)\s+days?\b/);
  if (explicitMatch) {
    return Math.max(1, Number.parseInt(explicitMatch[1] || "0", 10));
  }
  if (/\blast\s+week\b/.test(lower)) return 7;
  if (/\blast\s+month\b/.test(lower)) return 30;
  if (/\blast\s+year\b/.test(lower)) return 365;
  return null;
}

function detectComparison(question: string): [string, string] | null {
  const match = question.match(
    /\bin\s+(.+?)\s+vs\.?\s+(.+?)(?:\s+games|\s+openings|\?|$)/i,
  );
  if (!match) return null;

  const left = compactText(match[1] || "");
  const right = compactText(match[2] || "");
  if (!left || !right) return null;
  return [left, right];
}

export function extractMemoQueryIntent(question: string): MemoQueryIntent {
  const lower = question.toLowerCase();

  return {
    compareOpenings: detectComparison(question),
    result: /\bloss(?:es|ing)?\b|\blost\b/.test(lower)
      ? "loss"
      : /\bwin(?:s|ning)?\b|\bwon\b/.test(lower)
        ? "win"
        : /\bdraw(?:s|ing)?\b/.test(lower)
          ? "draw"
          : null,
    color: /\bwhite games?\b|\bas white\b|\bwith white\b/.test(lower)
      ? "white"
      : /\bblack games?\b|\bas black\b|\bwith black\b/.test(lower)
        ? "black"
        : null,
    lookbackDays: detectLookbackDays(question),
    searchTerms: tokenizeQuestion(question),
  };
}

function applyIntentFilters(entries: MemoAssistantEntry[], intent: MemoQueryIntent) {
  return entries.filter((entry) => {
    if (intent.result && entry.result !== intent.result) return false;
    if (intent.color && entry.color !== intent.color) return false;
    return true;
  });
}

function entriesForOpening(entries: MemoAssistantEntry[], openingName: string) {
  const needle = openingName.toLowerCase();
  return entries.filter((entry) =>
    `${entry.eco || ""} ${entry.openingName || ""}`.toLowerCase().includes(needle),
  );
}

function summarizeSubset(label: string, entries: MemoAssistantEntry[]) {
  const themes = extractThemes(entries).slice(0, 3);
  if (!themes.length) {
    return `${label}: not enough repeated themes yet.`;
  }
  return `${label}: ${themes
    .map((theme) => `${theme.label} (${theme.count})`)
    .join(", ")}.`;
}

function buildAppliedFilterLabels(intent: MemoQueryIntent) {
  const labels: string[] = [];
  if (intent.lookbackDays) labels.push(`last ${intent.lookbackDays} days`);
  if (intent.result) labels.push(intent.result === "loss" ? "losses" : intent.result);
  if (intent.color) labels.push(intent.color);
  return labels;
}

export function buildMemoSuggestions(entries: MemoAssistantEntry[]) {
  if (entries.length < 2) {
    return ["Save a few more memo snapshots to unlock stronger reminders."];
  }

  const themes = extractThemes(entries).slice(0, 3);
  if (!themes.length) {
    return ["Your memos are still sparse, so there is not a strong repeated theme yet."];
  }

  return themes.map((theme) => {
    if (theme.key.startsWith("tag:")) {
      return `You keep tagging positions with "${theme.label}".`;
    }
    return `You often mention ${theme.label}.`;
  });
}

export function answerMemoQuestion(
  question: string,
  entries: MemoAssistantEntry[],
): MemoAssistantAnswer {
  const intent = extractMemoQueryIntent(question);
  const filteredEntries = applyIntentFilters(entries, intent);
  const filteredGroupCount = new Set(filteredEntries.map((entry) => entry.groupId)).size;
  const sparse = filteredEntries.length < 3 || filteredGroupCount < 2;
  const appliedFilters = buildAppliedFilterLabels(intent);

  if (!filteredEntries.length) {
    return {
      answer:
        "I could not find any saved memos matching that question. I only use saved memo text and memo metadata, so I need more memo evidence before I can answer confidently.",
      sparse: true,
      usedEntryCount: 0,
      usedGroupCount: 0,
      appliedFilters,
      evidence: [],
    };
  }

  if (intent.compareOpenings) {
    const [leftOpening, rightOpening] = intent.compareOpenings;
    const leftEntries = entriesForOpening(filteredEntries, leftOpening);
    const rightEntries = entriesForOpening(filteredEntries, rightOpening);
    const leftThemes = extractThemes(leftEntries).slice(0, 2);
    const rightThemes = extractThemes(rightEntries).slice(0, 2);
    const comparisonSparse = leftEntries.length < 2 || rightEntries.length < 2;

    const answer = [
      `I only used saved memos that mention ${leftOpening} or ${rightOpening}.`,
      summarizeSubset(leftOpening, leftEntries),
      summarizeSubset(rightOpening, rightEntries),
      comparisonSparse
        ? "Evidence is still sparse on at least one side, so treat this as an early pattern rather than a firm conclusion."
        : `The strongest contrast right now is ${leftThemes[0]?.label || "no strong theme"} in ${leftOpening} versus ${rightThemes[0]?.label || "no strong theme"} in ${rightOpening}.`,
    ].join(" ");

    return {
      answer,
      sparse: comparisonSparse,
      usedEntryCount: leftEntries.length + rightEntries.length,
      usedGroupCount: new Set(
        [...leftEntries, ...rightEntries].map((entry) => entry.groupId),
      ).size,
      appliedFilters,
      evidence: selectEvidence([...leftEntries, ...rightEntries]),
    };
  }

  const topThemes = extractThemes(filteredEntries).slice(0, 4);
  const answerParts = [
    `I only used ${filteredEntries.length} saved memo entr${
      filteredEntries.length === 1 ? "y" : "ies"
    } across ${filteredGroupCount} memo group${
      filteredGroupCount === 1 ? "" : "s"
    }.`,
  ];

  if (topThemes.length) {
    answerParts.push(
      `The most repeated themes in those memos are ${topThemes
        .slice(0, 3)
        .map((theme) => `${theme.label} (${theme.count})`)
        .join(", ")}.`,
    );
  } else {
    answerParts.push(
      "There are notes here, but they do not repeat enough clear themes to support a stronger pattern claim yet.",
    );
  }

  if (sparse) {
    answerParts.push(
      "The evidence is still sparse, so I would treat this as a tentative read rather than a full pattern report.",
    );
  }

  return {
    answer: answerParts.join(" "),
    sparse,
    usedEntryCount: filteredEntries.length,
    usedGroupCount: filteredGroupCount,
    appliedFilters,
    evidence: selectEvidence(filteredEntries),
  };
}

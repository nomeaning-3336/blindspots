import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const normalization: typeof import("../lib/memos/normalization") = require("../lib/memos/normalization.ts");
const assistant: typeof import("../lib/memos/assistant") = require("../lib/memos/assistant.ts");

const {
  buildMemoGameId,
  buildDefaultMemoGroupTitle,
  normalizeMemoTags,
} = normalization;
const { answerMemoQuestion, buildMemoSuggestions, extractMemoQueryIntent } = assistant;

test("buildMemoGameId is deterministic", () => {
  const first = buildMemoGameId("recent:lichess:abc123");
  const second = buildMemoGameId("recent:lichess:abc123");
  const other = buildMemoGameId("recent:lichess:def456");

  assert.equal(first, second);
  assert.notEqual(first, other);
  assert.match(first || "", /^[0-9a-f-]{36}$/);
});

test("normalizeMemoTags trims, lowers, and deduplicates", () => {
  assert.deepEqual(
    normalizeMemoTags([" Hanging Piece ", "king safety", "hanging piece", ""]),
    ["hanging piece", "king safety"],
  );
});

test("buildDefaultMemoGroupTitle prefers useful memo context", () => {
  assert.equal(
    buildDefaultMemoGroupTitle({
      sourceRef: "recent:lichess:1",
      sourceLabel: "Recent game",
      openingName: "Sicilian Defense",
      eco: "B20",
      color: "black",
      result: "loss",
      opponent: "Ada",
      playedAt: "2026-04-20T09:00:00.000Z",
      titleHint: null,
    }),
    "Sicilian Defense vs Ada",
  );
});

test("buildMemoSuggestions surfaces repeated memo themes", () => {
  const suggestions = buildMemoSuggestions([
    {
      id: "1",
      groupId: "g1",
      groupTitle: "Sicilian",
      noteText: "I left a hanging piece and forgot the king safety problem.",
      tags: ["hanging piece"],
      openingName: "Sicilian Defense",
      eco: "B20",
      color: "black",
      result: "loss",
      opponent: "Ada",
      playedAt: "2026-04-20T09:00:00.000Z",
      createdAt: "2026-04-20T09:00:00.000Z",
      updatedAt: "2026-04-20T09:00:00.000Z",
    },
    {
      id: "2",
      groupId: "g2",
      groupTitle: "Vienna",
      noteText: "Another hanging piece after a rushed queen move.",
      tags: ["queen"],
      openingName: "Vienna Game",
      eco: "C25",
      color: "white",
      result: "loss",
      opponent: "Turing",
      playedAt: "2026-04-19T09:00:00.000Z",
      createdAt: "2026-04-19T09:00:00.000Z",
      updatedAt: "2026-04-19T09:00:00.000Z",
    },
  ]);

  assert.equal(suggestions[0], "You often mention hanging pieces.");
});

test("extractMemoQueryIntent detects comparisons and metadata filters", () => {
  const intent = extractMemoQueryIntent(
    "Compare the kinds of mistakes I mention in Sicilian vs Vienna games from the last 30 days.",
  );

  assert.deepEqual(intent.compareOpenings, ["Sicilian", "Vienna"]);
  assert.equal(intent.lookbackDays, 30);
});

test("answerMemoQuestion stays memo-grounded and flags sparse evidence", () => {
  const answer = answerMemoQuestion("What themes do I keep mentioning in losing games?", [
    {
      id: "1",
      groupId: "g1",
      groupTitle: "Sicilian",
      noteText: "I forgot the g7 pawn was hanging.",
      tags: ["hanging piece"],
      openingName: "Sicilian Defense",
      eco: "B20",
      color: "black",
      result: "loss",
      opponent: "Ada",
      playedAt: "2026-04-20T09:00:00.000Z",
      createdAt: "2026-04-20T09:00:00.000Z",
      updatedAt: "2026-04-20T09:00:00.000Z",
    },
    {
      id: "2",
      groupId: "g2",
      groupTitle: "French",
      noteText: "I rushed and missed a tactic around my king.",
      tags: ["time pressure"],
      openingName: "French Defense",
      eco: "C00",
      color: "black",
      result: "loss",
      opponent: "Turing",
      playedAt: "2026-04-18T09:00:00.000Z",
      createdAt: "2026-04-18T09:00:00.000Z",
      updatedAt: "2026-04-18T09:00:00.000Z",
    },
  ]);

  assert.equal(answer.sparse, true);
  assert.match(answer.answer, /only used 2 saved memo entries/i);
  assert.match(answer.answer, /sparse/i);
});

export {};

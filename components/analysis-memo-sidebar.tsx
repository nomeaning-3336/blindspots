"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { normalizeMemoTags } from "@/lib/memos/normalization";
import type { AnalysisMemoSnapshot, MemoGroupSummary } from "@/lib/memos/types";
import { useChessApp } from "@/components/chess-app-context";

interface MemoGroupsResponse {
  groups?: MemoGroupSummary[];
}

function buildPositionSummary(snapshot: AnalysisMemoSnapshot | null) {
  if (!snapshot) return "No position loaded yet.";

  const parts = [`FEN ready`];
  if (Number.isFinite(snapshot.ply)) {
    parts.push(`Ply ${snapshot.ply}`);
  }
  if (snapshot.turnColor) {
    parts.push(`${snapshot.turnColor === "white" ? "White" : "Black"} to move`);
  }
  if (snapshot.lastMoveSan) {
    parts.push(`Last move ${snapshot.lastMoveSan}`);
  }
  return parts.join(" · ");
}

export function AnalysisMemoSidebar({ isSignedIn }: { isSignedIn: boolean }) {
  const { analysis, isReady } = useChessApp();
  const [noteText, setNoteText] = useState("");
  const [title, setTitle] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [mode, setMode] = useState<"new" | "append">("new");
  const [groups, setGroups] = useState<MemoGroupSummary[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const snapshot = analysis?.getMemoSnapshot?.() ?? null;
  const sameGameKey = snapshot?.context?.sourceRef || "";

  useEffect(() => {
    if (!isSignedIn || !sameGameKey) {
      setGroups([]);
      setSelectedGroupId(null);
      setMode("new");
      return;
    }

    let cancelled = false;

    const refresh = async () => {
      const response = await fetch(
        `/api/memos?gameRef=${encodeURIComponent(sameGameKey)}&limit=8`,
      );
      const payload = (await response.json()) as MemoGroupsResponse;
      if (!response.ok) {
        throw new Error("Memo groups could not be loaded.");
      }
      if (cancelled) return;
      const nextGroups = payload.groups || [];
      setGroups(nextGroups);
      setSelectedGroupId((current) =>
        current && nextGroups.some((group) => group.id === current)
          ? current
          : nextGroups[0]?.id || null,
      );
      setMode(nextGroups.length ? "append" : "new");
    };

    refresh().catch(() => {
        if (cancelled) return;
        setGroups([]);
        setSelectedGroupId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, sameGameKey]);

  const handleSave = () => {
    if (!snapshot) return;
    setStatus(null);

    startTransition(async () => {
      try {
        const parsedTags = normalizeMemoTags(tagsInput);

        if (mode === "append" && selectedGroupId) {
          const response = await fetch(`/api/memos/${selectedGroupId}/entries`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              snapshot,
              noteText,
              tags: parsedTags,
            }),
          });

          if (!response.ok) {
            throw new Error("Could not append the memo entry.");
          }
        } else {
          const response = await fetch("/api/memos", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title,
              snapshot,
              noteText,
              tags: parsedTags,
            }),
          });

          if (!response.ok) {
            throw new Error("Could not save the memo thread.");
          }
        }

        setNoteText("");
        setTagsInput("");
        setTitle("");
        setStatus("Memo saved.");
        if (sameGameKey) {
          const response = await fetch(
            `/api/memos?gameRef=${encodeURIComponent(sameGameKey)}&limit=8`,
          );
          const payload = (await response.json()) as MemoGroupsResponse;
          setGroups(payload.groups || []);
          if (payload.groups?.length) {
            setSelectedGroupId(payload.groups[0]?.id || null);
          }
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Memo save failed.");
      }
    });
  };

  return (
    <aside className="app-brutal-card flex min-h-0 flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--app-accent)]">
            Analysis Memo
          </p>
          <h2 className="mt-2 text-xl font-bold uppercase tracking-[0.12em] text-white">
            Capture This Position
          </h2>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        <div className="app-brutal-inset p-4 text-sm leading-6 text-[var(--app-muted)]">
          <p className="font-bold text-white">{buildPositionSummary(snapshot)}</p>
          {snapshot?.context?.openingName ? (
            <p className="mt-2">
              {snapshot.context.eco ? `${snapshot.context.eco} ` : ""}
              {snapshot.context.openingName}
            </p>
          ) : null}
          {snapshot?.context?.opponent ? (
            <p className="mt-1">Opponent: {snapshot.context.opponent}</p>
          ) : null}
        </div>

        {!isSignedIn ? (
          <div className="border border-[var(--app-border)] bg-[var(--app-panel-solid)] p-4 text-sm leading-6 text-[var(--app-muted)]">
            Sign in to save memo threads, revisit them later, and ask memo-grounded questions on the Memos page.
          </div>
        ) : null}

        {isSignedIn ? (
          <>
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMode("new")}
                  className={[
                    "border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition",
                    mode === "new"
                      ? "border-[var(--app-accent)] bg-[var(--app-accent)] !text-black"
                      : "border-[var(--app-border)] text-[var(--app-text)]",
                  ].join(" ")}
                >
                  New Thread
                </button>
                <button
                  type="button"
                  onClick={() => setMode("append")}
                  disabled={!groups.length}
                  className={[
                    "border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-50",
                    mode === "append"
                      ? "border-[var(--app-accent)] bg-[var(--app-accent)] !text-black"
                      : "border-[var(--app-border)] text-[var(--app-text)]",
                  ].join(" ")}
                >
                  Append To Thread
                </button>
              </div>

              {mode === "new" ? (
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--app-muted)]">
                    Thread Title
                  </span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={snapshot?.context?.titleHint || "Optional thread title"}
                    className="app-brutal-input h-11 px-4 text-sm outline-none transition"
                  />
                </label>
              ) : (
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--app-muted)]">
                    Existing Thread
                  </span>
                  <select
                    value={selectedGroupId || ""}
                    onChange={(event) => setSelectedGroupId(event.target.value || null)}
                    className="app-brutal-input h-11 px-4 text-sm outline-none transition"
                  >
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.title || "Untitled memo"} · {group.entryCount} entr
                        {group.entryCount === 1 ? "y" : "ies"}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <label className="grid gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--app-muted)]">
                Note
              </span>
              <textarea
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                placeholder="Here I played Nf6 but forgot that the pawn on g7 was hanging."
                className="app-brutal-input min-h-[140px] px-4 py-3 text-sm leading-6 outline-none transition"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--app-muted)]">
                Tags
              </span>
              <input
                value={tagsInput}
                onChange={(event) => setTagsInput(event.target.value)}
                placeholder="hanging piece, king safety, sicilian"
                className="app-brutal-input h-11 px-4 text-sm outline-none transition"
              />
            </label>

            <button
              type="button"
              onClick={handleSave}
              disabled={!isReady || !snapshot || isPending}
              className="border-2 border-[var(--app-accent)] bg-[var(--app-accent)] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.2em] !text-black transition hover:border-[var(--app-nav-hover-bg)] hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Saving..." : mode === "append" ? "Append Memo Entry" : "Save Memo Thread"}
            </button>

            {groups.length ? (
              <div className="grid gap-2 pt-2">
                <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--app-muted)]">
                  Same Game Threads
                </p>
                {groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => {
                      setMode("append");
                      setSelectedGroupId(group.id);
                    }}
                    className="border border-[var(--app-border)] bg-[var(--app-panel-solid)] px-4 py-3 text-left transition hover:border-[var(--app-nav-hover-bg)] hover:bg-[var(--app-nav-hover-bg)]"
                  >
                    <p className="text-sm font-bold text-white">
                      {group.title || "Untitled memo"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[var(--app-muted)]">
                      {group.entryCount} entr{group.entryCount === 1 ? "y" : "ies"}
                      {group.latestEntryExcerpt ? ` · ${group.latestEntryExcerpt}` : ""}
                    </p>
                  </button>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        {status ? (
          <div className="border border-[var(--app-border)] bg-[var(--app-panel-solid)] px-4 py-3 text-sm leading-6 text-[var(--app-text)]">
            {status}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { MemoBoard } from "@/components/memo-board";
import {
  memoTagsToInputValue,
  normalizeMemoFilters,
  normalizeMemoTags,
} from "@/lib/memos/normalization";
import type {
  MemoAssistantAnswer,
  MemoGroupDetail,
  MemoWorkspaceData,
} from "@/lib/memos/types";

function formatDate(value: string | null) {
  if (!value) return "Unknown date";
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function GroupMeta({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <span className="border border-[var(--app-border)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--app-muted)]">
      {label}: {value}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="app-brutal-card-strong p-8">
      <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--app-accent)]">
        Memos
      </p>
      <h1 className="mt-3 text-3xl font-bold uppercase tracking-[0.14em] text-white">
        No Memos Yet
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--app-muted)]">
        Save your first annotated position from Analysis and it will appear here with
        searchable notes, tags, structured board state, and memo-grounded reminders.
      </p>
      <div className="mt-6">
        <Link
          href="/analysis"
          className="inline-flex items-center justify-center border-2 border-[var(--app-accent)] bg-[var(--app-accent)] px-5 py-3 text-xs font-bold uppercase tracking-[0.18em] !text-black transition hover:border-[var(--app-nav-hover-bg)] hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)]"
        >
          Open Analysis
        </Link>
      </div>
    </div>
  );
}

export function MemosWorkspace({
  initialData,
}: {
  initialData: MemoWorkspaceData;
}) {
  const [data, setData] = useState(initialData);
  const [assistant, setAssistant] = useState<MemoAssistantAnswer | null>(null);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [filterForm, setFilterForm] = useState({
    search: initialData.filters.search,
    opening: initialData.filters.opening,
    tags: memoTagsToInputValue(initialData.filters.tags),
    dateFrom: initialData.filters.dateFrom || "",
    dateTo: initialData.filters.dateTo || "",
    result: initialData.filters.result,
    color: initialData.filters.color,
    sort: initialData.filters.sort,
  });
  const [isPending, startTransition] = useTransition();

  const selectedGroup = data.selectedGroup;

  const loadWorkspace = (overrides: Record<string, string | null | undefined> = {}) => {
    startTransition(async () => {
      try {
        setStatusMessage(null);
        const params = new URLSearchParams();
        const nextFilters = {
          ...data.filters,
          ...normalizeMemoFilters({
            ...filterForm,
            tags: filterForm.tags,
            selectedGroupId: data.filters.selectedGroupId,
          }),
        };

        const pushParam = (key: string, value: string | null | undefined) => {
          if (value) params.set(key, value);
        };

        pushParam("search", nextFilters.search);
        pushParam("opening", nextFilters.opening);
        pushParam("tags", memoTagsToInputValue(nextFilters.tags));
        pushParam("dateFrom", nextFilters.dateFrom);
        pushParam("dateTo", nextFilters.dateTo);
        pushParam("result", nextFilters.result === "all" ? "" : nextFilters.result);
        pushParam("color", nextFilters.color === "all" ? "" : nextFilters.color);
        pushParam("sort", nextFilters.sort);
        pushParam(
          "selectedGroupId",
          overrides.selectedGroupId ?? data.filters.selectedGroupId,
        );

        const response = await fetch(`/api/memos?${params.toString()}`);
        const payload = (await response.json()) as MemoWorkspaceData;
        if (!response.ok) {
          throw new Error("Memos could not be refreshed.");
        }
        setData(payload);
      } catch (error) {
        setStatusMessage(
          error instanceof Error ? error.message : "Memos could not be refreshed.",
        );
      }
    });
  };

  const saveGroupTitle = (groupId: string, title: string) => {
    startTransition(async () => {
      try {
        setStatusMessage(null);
        const response = await fetch(`/api/memos/${groupId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title }),
        });

        if (!response.ok) {
          throw new Error("Group title update failed.");
        }

        loadWorkspace({ selectedGroupId: groupId });
      } catch (error) {
        setStatusMessage(
          error instanceof Error ? error.message : "Group title update failed.",
        );
      }
    });
  };

  const deleteGroup = (groupId: string) => {
    startTransition(async () => {
      try {
        setStatusMessage(null);
        const response = await fetch(`/api/memos/${groupId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error("Group delete failed.");
        }

        loadWorkspace();
      } catch (error) {
        setStatusMessage(
          error instanceof Error ? error.message : "Group delete failed.",
        );
      }
    });
  };

  const askAssistant = () => {
    if (!assistantQuestion.trim()) return;

    startTransition(async () => {
      try {
        setStatusMessage(null);
        const response = await fetch("/api/memos/assistant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question: assistantQuestion,
            filters: data.filters,
          }),
        });

        const payload = (await response.json()) as MemoAssistantAnswer;
        if (!response.ok) {
          throw new Error("Memo assistant request failed.");
        }
        setAssistant(payload);
      } catch (error) {
        setStatusMessage(
          error instanceof Error ? error.message : "Memo assistant request failed.",
        );
      }
    });
  };

  const groupTitleValue = useMemo(
    () => selectedGroup?.title || "",
    [selectedGroup?.id, selectedGroup?.title],
  );

  if (!data.groups.length && !data.totalGroups) {
    return <EmptyState />;
  }

  return (
    <div className="grid min-h-0 gap-6 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
      <aside className="grid min-h-0 gap-6">
        <div className="app-brutal-card p-5">
          <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--app-accent)]">
            ChessMemo
          </p>
          <h1 className="mt-3 text-2xl font-bold uppercase tracking-[0.14em] text-white">
            Memo Groups
          </h1>
          <p className="mt-3 text-sm leading-7 text-[var(--app-muted)]">
            Search your saved notes, filter by metadata, and reopen structured board snapshots.
          </p>
        </div>

        <form
          className="app-brutal-card grid gap-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            loadWorkspace();
          }}
        >
          <input
            value={filterForm.search}
            onChange={(event) =>
              setFilterForm((current) => ({ ...current, search: event.target.value }))
            }
            placeholder="Search note text"
            className="app-brutal-input h-11 px-4 text-sm outline-none transition"
          />
          <input
            value={filterForm.opening}
            onChange={(event) =>
              setFilterForm((current) => ({ ...current, opening: event.target.value }))
            }
            placeholder="Opening"
            list="memo-opening-options"
            className="app-brutal-input h-11 px-4 text-sm outline-none transition"
          />
          <datalist id="memo-opening-options">
            {data.availableOpenings.map((opening) => (
              <option key={opening} value={opening} />
            ))}
          </datalist>
          <input
            value={filterForm.tags}
            onChange={(event) =>
              setFilterForm((current) => ({ ...current, tags: event.target.value }))
            }
            placeholder="Tags"
            className="app-brutal-input h-11 px-4 text-sm outline-none transition"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="date"
              value={filterForm.dateFrom}
              onChange={(event) =>
                setFilterForm((current) => ({ ...current, dateFrom: event.target.value }))
              }
              className="app-brutal-input h-11 px-4 text-sm outline-none transition"
            />
            <input
              type="date"
              value={filterForm.dateTo}
              onChange={(event) =>
                setFilterForm((current) => ({ ...current, dateTo: event.target.value }))
              }
              className="app-brutal-input h-11 px-4 text-sm outline-none transition"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <select
              value={filterForm.result}
              onChange={(event) =>
                setFilterForm((current) => ({ ...current, result: event.target.value as typeof current.result }))
              }
              className="app-brutal-input h-11 px-4 text-sm outline-none transition"
            >
              <option value="all">All Results</option>
              <option value="win">Wins</option>
              <option value="draw">Draws</option>
              <option value="loss">Losses</option>
            </select>
            <select
              value={filterForm.color}
              onChange={(event) =>
                setFilterForm((current) => ({ ...current, color: event.target.value as typeof current.color }))
              }
              className="app-brutal-input h-11 px-4 text-sm outline-none transition"
            >
              <option value="all">All Colors</option>
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>
            <select
              value={filterForm.sort}
              onChange={(event) =>
                setFilterForm((current) => ({ ...current, sort: event.target.value as typeof current.sort }))
              }
              className="app-brutal-input h-11 px-4 text-sm outline-none transition"
            >
              <option value="recently-updated">Recently Updated</option>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              className="flex-1 border-2 border-[var(--app-accent)] bg-[var(--app-accent)] px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] !text-black transition hover:border-[var(--app-nav-hover-bg)] hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)]"
            >
              Apply Filters
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterForm({
                  search: "",
                  opening: "",
                  tags: "",
                  dateFrom: "",
                  dateTo: "",
                  result: "all",
                  color: "all",
                  sort: "recently-updated",
                });
                startTransition(async () => {
                  try {
                    setStatusMessage(null);
                    const response = await fetch("/api/memos");
                    const payload = (await response.json()) as MemoWorkspaceData;
                    if (!response.ok) {
                      throw new Error("Memos could not be refreshed.");
                    }
                    setData(payload);
                  } catch (error) {
                    setStatusMessage(
                      error instanceof Error
                        ? error.message
                        : "Memos could not be refreshed.",
                    );
                  }
                });
              }}
              className="border border-[var(--app-border)] px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--app-text)] transition hover:border-[var(--app-nav-hover-bg)] hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)]"
            >
              Reset
            </button>
          </div>
        </form>

        <div className="grid min-h-0 gap-3 overflow-auto pr-1">
          {data.groups.map((group) => {
            const isActive = group.id === data.filters.selectedGroupId;

            return (
              <button
                key={group.id}
                type="button"
                onClick={() => loadWorkspace({ selectedGroupId: group.id })}
                className={[
                  "border p-4 text-left transition",
                  isActive
                    ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)]"
                    : "border-[var(--app-border)] bg-[var(--app-panel-solid)] hover:border-[var(--app-nav-hover-bg)] hover:bg-[var(--app-nav-hover-bg)]",
                ].join(" ")}
              >
                <p className="text-sm font-bold uppercase tracking-[0.12em] text-white">
                  {group.title || "Untitled memo"}
                </p>
                <p className="mt-2 text-xs leading-6 text-[var(--app-muted)]">
                  {group.latestEntryExcerpt || "No note text saved yet."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <GroupMeta label="Entries" value={String(group.entryCount)} />
                  <GroupMeta label="Opening" value={group.openingName} />
                  <GroupMeta label="Result" value={group.result} />
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="min-h-0 overflow-auto">
        {statusMessage ? (
          <div className="mb-4 border border-rose-400/35 bg-rose-400/10 px-4 py-3 text-sm leading-6 text-rose-100">
            {statusMessage}
          </div>
        ) : null}
        {selectedGroup ? (
          <div className="grid gap-6">
            <section className="app-brutal-card p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex-1">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--app-muted)]">
                    Memo Group
                  </p>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                    <input
                      key={selectedGroup.id}
                      defaultValue={groupTitleValue}
                      placeholder="Untitled memo"
                      className="app-brutal-input h-11 flex-1 px-4 text-sm outline-none transition"
                      onBlur={(event) =>
                        saveGroupTitle(selectedGroup.id, event.target.value)
                      }
                    />
                    <button
                      type="button"
                      onClick={() => deleteGroup(selectedGroup.id)}
                      className="border border-rose-400/40 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-rose-200 transition hover:bg-rose-400/12"
                    >
                      Delete Group
                    </button>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <GroupMeta label="Opening" value={selectedGroup.openingName} />
                    <GroupMeta label="ECO" value={selectedGroup.eco} />
                    <GroupMeta label="Result" value={selectedGroup.result} />
                    <GroupMeta label="Color" value={selectedGroup.color} />
                    <GroupMeta label="Opponent" value={selectedGroup.opponent} />
                  </div>
                  <p className="mt-4 text-sm leading-6 text-[var(--app-muted)]">
                    Played {formatDate(selectedGroup.playedAt || selectedGroup.createdAt)} · Updated{" "}
                    {formatDate(selectedGroup.updatedAt)}
                  </p>
                </div>
              </div>
            </section>

            <section className="grid gap-4">
              {selectedGroup.entries.map((entry) => (
                <MemoEntryCard
                  key={entry.id}
                  groupId={selectedGroup.id}
                  entry={entry}
                  onChangeComplete={() => loadWorkspace({ selectedGroupId: selectedGroup.id })}
                />
              ))}
            </section>
          </div>
        ) : (
          <EmptyState />
        )}
      </main>

      <aside className="grid min-h-0 gap-6">
        <section className="app-brutal-card p-5">
          <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--app-accent)]">
            Reminders
          </p>
          <div className="mt-4 grid gap-3">
            {data.suggestions.map((suggestion) => (
              <div
                key={suggestion}
                className="border border-[var(--app-border)] bg-[var(--app-panel-solid)] px-4 py-3 text-sm leading-6 text-[var(--app-text)]"
              >
                {suggestion}
              </div>
            ))}
          </div>
        </section>

        <section className="app-brutal-card flex min-h-0 flex-col p-5">
          <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--app-accent)]">
            Memo Assistant
          </p>
          <p className="mt-3 text-sm leading-7 text-[var(--app-muted)]">
            This assistant only uses saved memo text and memo metadata. It does not run fresh game analysis.
          </p>
          <textarea
            value={assistantQuestion}
            onChange={(event) => setAssistantQuestion(event.target.value)}
            placeholder="What mistakes am I repeating the most from the last 30 days?"
            className="app-brutal-input mt-4 min-h-[120px] px-4 py-3 text-sm leading-6 outline-none transition"
          />
          <button
            type="button"
            onClick={askAssistant}
            className="mt-4 border-2 border-[var(--app-accent)] bg-[var(--app-accent)] px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] !text-black transition hover:border-[var(--app-nav-hover-bg)] hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)]"
          >
            Ask
          </button>

          <div className="mt-5 min-h-0 flex-1 overflow-auto">
            {assistant ? (
              <div className="grid gap-4">
                <div className="border border-[var(--app-border)] bg-[var(--app-panel-solid)] px-4 py-4 text-sm leading-7 text-[var(--app-text)]">
                  {assistant.answer}
                </div>
                <div className="flex flex-wrap gap-2">
                  <GroupMeta label="Entries Used" value={String(assistant.usedEntryCount)} />
                  <GroupMeta label="Groups Used" value={String(assistant.usedGroupCount)} />
                  <GroupMeta label="Evidence" value={assistant.sparse ? "Sparse" : "Solid"} />
                </div>
                {assistant.evidence.length ? (
                  <div className="grid gap-3">
                    {assistant.evidence.map((entry) => (
                      <button
                        key={entry.entryId}
                        type="button"
                        onClick={() => loadWorkspace({ selectedGroupId: entry.groupId })}
                        className="border border-[var(--app-border)] bg-[var(--app-panel-solid)] px-4 py-3 text-left transition hover:border-[var(--app-nav-hover-bg)] hover:bg-[var(--app-nav-hover-bg)]"
                      >
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-white">
                          {entry.groupTitle || "Untitled memo"}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">
                          {entry.excerpt}
                        </p>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="border border-dashed border-[var(--app-border)] px-4 py-5 text-sm leading-6 text-[var(--app-muted)]">
                Ask about repeated patterns, opening-specific themes, or what you keep mentioning in wins and losses.
              </div>
            )}
          </div>
        </section>
      </aside>

      {isPending ? (
        <div className="fixed bottom-4 right-4 border border-[var(--app-border)] bg-[var(--app-panel-solid)] px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--app-text)] shadow-[4px_4px_0_var(--app-shell-shadow)]">
          Refreshing memos...
        </div>
      ) : null}
    </div>
  );
}

function MemoEntryCard({
  groupId,
  entry,
  onChangeComplete,
}: {
  groupId: string;
  entry: MemoGroupDetail["entries"][number];
  onChangeComplete: () => void;
}) {
  const [noteText, setNoteText] = useState(entry.noteText);
  const [tagsInput, setTagsInput] = useState(memoTagsToInputValue(entry.tags));
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const saveEntry = () => {
    startTransition(async () => {
      try {
        setMessage(null);
        const response = await fetch(`/api/memos/entries/${entry.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            noteText,
            tags: normalizeMemoTags(tagsInput),
          }),
        });

        if (!response.ok) {
          throw new Error("Memo entry update failed.");
        }

        onChangeComplete();
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Memo entry update failed.",
        );
      }
    });
  };

  const deleteEntry = () => {
    startTransition(async () => {
      try {
        setMessage(null);
        const response = await fetch(`/api/memos/entries/${entry.id}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error("Memo entry delete failed.");
        }

        onChangeComplete();
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Memo entry delete failed.",
        );
      }
    });
  };

  return (
    <article className="app-brutal-card grid gap-5 p-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div className="grid gap-3">
        <MemoBoard
          fen={entry.fen}
          orientation={entry.orientation || "white"}
          arrows={entry.arrows}
          highlightedSquares={entry.highlightedSquares}
        />
        <div className="text-xs leading-6 text-[var(--app-muted)]">
          <p>{formatDate(entry.createdAt)}</p>
          <p className="mt-1 font-mono text-[11px] text-[var(--app-muted-soft)]">
            {entry.lastMoveSan ? `Last move ${entry.lastMoveSan}` : "Position snapshot"}
          </p>
          <p className="mt-1 font-mono text-[11px] text-[var(--app-muted-soft)]">
            {entry.fen}
          </p>
        </div>
      </div>

      <div className="grid gap-4">
        <textarea
          value={noteText}
          onChange={(event) => setNoteText(event.target.value)}
          className="app-brutal-input min-h-[140px] px-4 py-3 text-sm leading-6 outline-none transition"
        />
        <input
          value={tagsInput}
          onChange={(event) => setTagsInput(event.target.value)}
          className="app-brutal-input h-11 px-4 text-sm outline-none transition"
        />
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveEntry}
            disabled={isPending}
            className="border-2 border-[var(--app-accent)] bg-[var(--app-accent)] px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] !text-black transition hover:border-[var(--app-nav-hover-bg)] hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)] disabled:opacity-50"
          >
            Save Entry
          </button>
          <button
            type="button"
            onClick={deleteEntry}
            disabled={isPending}
            className="border border-rose-400/40 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-rose-200 transition hover:bg-rose-400/12 disabled:opacity-50"
          >
            Delete Entry
          </button>
          <Link
            href={`/analysis`}
            className="border border-[var(--app-border)] px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--app-text)] transition hover:border-[var(--app-nav-hover-bg)] hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)]"
          >
            Back To Analysis
          </Link>
        </div>
        {message ? (
          <div className="border border-rose-400/35 bg-rose-400/10 px-4 py-3 text-sm leading-6 text-rose-100">
            {message}
          </div>
        ) : null}
      </div>
    </article>
  );
}

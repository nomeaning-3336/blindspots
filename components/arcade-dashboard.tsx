"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ArcadeGameSummary, ArcadeVariantKey } from "@/lib/arcade";
import { ARCADE_START_FEN, ARCADE_VARIANT_ORDER, ARCADE_VARIANTS } from "@/lib/arcade";

function brutalCardStyle(accent = "var(--app-text)") {
  return {
    border: "3px solid var(--app-text)",
    borderRadius: 0,
    boxShadow: `10px 10px 0 ${accent}`,
  } as const;
}

function formatSavedAt(value: string) {
  try {
    return new Date(value).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

export function ArcadeDashboard({
  canCreate,
  signInHref,
  activeGames,
}: {
  canCreate: boolean;
  signInHref: string;
  activeGames: ArcadeGameSummary[];
}) {
  const router = useRouter();
  const [pendingVariant, setPendingVariant] = useState<ArcadeVariantKey | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function launchVariant(variantKey: ArcadeVariantKey) {
    startTransition(async () => {
      setPendingVariant(variantKey);
      setError("");
      try {
        const response = await fetch("/api/arcade/games", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ variantKey }),
        });
        const data = (await response.json().catch(() => null)) as
          | { id?: string; error?: string }
          | null;

        if (!response.ok || !data?.id) {
          throw new Error(data?.error || "Could not create an Arcade game.");
        }

        router.push(`/arcade/${data.id}`);
      } catch (launchError) {
        setError(
          launchError instanceof Error
            ? launchError.message
            : "Could not create an Arcade game.",
        );
        setPendingVariant(null);
      }
    });
  }

  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-y-auto pr-1 pb-8">
        <section
          className="border-[3px] px-6 py-5 md:px-8 md:py-6"
        style={{
          borderColor: "var(--app-text)",
          background:
            "linear-gradient(135deg, var(--app-panel-solid) 0%, color-mix(in srgb, var(--app-accent) 10%, var(--app-panel-solid)) 100%)",
          boxShadow: "12px 12px 0 var(--app-shell-shadow)",
        }}
      >
        <div className="max-w-3xl">
            <div
              className="text-[11px] font-bold uppercase tracking-[0.28em]"
              style={{ color: "var(--app-accent)" }}
            >
              Arcade
            </div>
            <h1
              className="mt-3 text-4xl font-black uppercase leading-none md:text-6xl"
              style={{ color: "var(--app-text)" }}
            >
              Experimental Chess Cabinet
            </h1>
            <p
              className="mt-4 max-w-2xl text-sm font-medium uppercase leading-7 md:text-base"
              style={{ color: "var(--app-muted)" }}
            >
              Pick a mode, spawn a dedicated game room, and come back later to
              resume the exact position you left.
            </p>
        </div>
      </section>

      {!canCreate ? (
        <section
          className="border-[3px] px-6 py-5"
          style={{
            borderColor: "var(--app-text)",
            background: "var(--app-panel-solid)",
            boxShadow: "10px 10px 0 var(--app-shell-shadow)",
          }}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2
                className="text-2xl font-black uppercase"
                style={{ color: "var(--app-text)" }}
              >
                Sign In To Save Runs
              </h2>
              <p className="mt-2 text-sm uppercase leading-6 text-[var(--app-muted)]">
                Arcade sessions are stored per account so you can leave and resume
                the exact same game later.
              </p>
            </div>
            <a
              href={signInHref}
              className="inline-flex items-center justify-center border-[3px] px-5 py-3 text-sm font-black uppercase transition hover:translate-x-[3px] hover:translate-y-[3px]"
              style={brutalCardStyle("var(--app-accent)")}
            >
              Sign In
            </a>
          </div>
        </section>
      ) : null}

      {error ? (
        <div
          className="border-[3px] px-5 py-4 text-sm font-bold uppercase"
          style={{
            borderColor: "#ef4444",
            background: "color-mix(in srgb, #ef4444 12%, var(--app-panel-solid))",
            color: "var(--app-text)",
            boxShadow: "8px 8px 0 rgba(239,68,68,0.35)",
          }}
        >
          {error}
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-3">
        {ARCADE_VARIANT_ORDER.map((variant) => {
          const pending = isPending && pendingVariant === variant.key;
          const body = (
            <>
              <div>
                <div
                  className="text-[11px] font-bold uppercase tracking-[0.26em]"
                  style={{ color: "var(--app-accent)" }}
                >
                  {variant.subtitle}
                </div>
                <h2
                  className="mt-3 text-3xl font-black uppercase"
                  style={{ color: "var(--app-text)" }}
                >
                  {variant.title}
                </h2>
              </div>
              <p
                className="mt-6 text-sm font-medium uppercase leading-7"
                style={{ color: "var(--app-muted)" }}
              >
                {variant.description}
              </p>
              {pending ? (
                <div
                  className="mt-8 text-xs font-black uppercase"
                  style={{ color: "var(--app-accent)" }}
                >
                  Launching...
                </div>
              ) : null}
            </>
          );

          if (!canCreate) {
            return (
              <a
                key={variant.key}
                href={signInHref}
                className="block min-h-[240px] border-[3px] p-6 text-left transition hover:translate-x-[4px] hover:translate-y-[4px] md:p-7"
                style={{ ...brutalCardStyle("var(--app-accent)"), cursor: "pointer" }}
              >
                {body}
              </a>
            );
          }

          return (
            <button
              key={variant.key}
              type="button"
              className="min-h-[240px] border-[3px] p-6 text-left transition hover:translate-x-[4px] hover:translate-y-[4px] disabled:opacity-80 md:p-7"
              style={{
                ...brutalCardStyle("var(--app-accent)"),
                cursor: "pointer",
              }}
              onClick={() => launchVariant(variant.key)}
              disabled={isPending}
            >
              {body}
            </button>
          );
        })}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div
              className="text-[11px] font-bold uppercase tracking-[0.26em]"
              style={{ color: "var(--app-accent)" }}
            >
              Resume
            </div>
            <h2
              className="mt-2 text-2xl font-black uppercase"
              style={{ color: "var(--app-text)" }}
            >
              Currently Active Games
            </h2>
          </div>
          <div className="text-xs font-bold uppercase text-[var(--app-muted)]">
            {activeGames.length} saved
          </div>
        </div>

        {activeGames.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {activeGames.map((game) => {
              const variant = ARCADE_VARIANTS[game.variantKey];
              const isFresh = game.currentFen === ARCADE_START_FEN;
              return (
                <a
                  key={game.id}
                  href={`/arcade/${game.id}`}
                  className="block border-[3px] p-5 transition hover:translate-x-[4px] hover:translate-y-[4px]"
                  style={brutalCardStyle("var(--app-shell-shadow)")}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div
                        className="text-[11px] font-bold uppercase tracking-[0.22em]"
                        style={{ color: "var(--app-accent)" }}
                      >
                        Resume Game
                      </div>
                      <h3
                        className="mt-2 text-2xl font-black uppercase"
                        style={{ color: "var(--app-text)" }}
                      >
                        {variant.title}
                      </h3>
                    </div>
                    <div
                      className="border-[3px] px-3 py-1 text-[10px] font-black uppercase"
                      style={{
                        borderColor: "var(--app-text)",
                        background: "var(--app-bg)",
                        color: "var(--app-text)",
                      }}
                    >
                      Active
                    </div>
                  </div>
                  <p
                    className="mt-4 text-xs font-bold uppercase leading-6"
                    style={{ color: "var(--app-muted)" }}
                  >
                    {isFresh
                      ? "Fresh board saved and ready to begin."
                      : "Saved position waiting exactly where you left it."}
                  </p>
                  <div
                    className="mt-4 border-[3px] px-3 py-2 font-mono text-[10px] uppercase leading-5"
                    style={{
                      borderColor: "var(--app-border-strong)",
                      background: "var(--app-bg)",
                      color: "var(--app-text)",
                    }}
                  >
                    {game.currentFen}
                  </div>
                  <div className="mt-4 text-[11px] font-bold uppercase text-[var(--app-muted)]">
                    Last saved {formatSavedAt(game.lastPlayedAt)}
                  </div>
                </a>
              );
            })}
          </div>
        ) : (
          <div
            className="border-[3px] px-5 py-6 text-sm font-bold uppercase leading-7"
            style={{
              borderColor: "var(--app-border-strong)",
              background: "var(--app-panel-solid)",
              color: "var(--app-muted)",
              boxShadow: "8px 8px 0 var(--app-shell-shadow)",
            }}
          >
            No active Arcade runs yet. Start one above and it will show up here
            as a resume card.
          </div>
        )}
      </section>

      {pendingVariant ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center px-6"
          style={{
            background: "color-mix(in srgb, var(--app-bg) 88%, transparent)",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            className="w-full max-w-[760px] border-[3px] px-6 py-8 md:px-8 md:py-10"
            style={{
              borderColor: "var(--app-text)",
              background:
                "linear-gradient(180deg, var(--app-panel-solid), color-mix(in srgb, var(--app-accent) 8%, var(--app-panel-solid)))",
              boxShadow: "14px 14px 0 var(--app-accent)",
            }}
          >
            <div
              className="text-[11px] font-black uppercase tracking-[0.3em]"
              style={{ color: "var(--app-accent)" }}
            >
              Arcade
            </div>
            <h2
              className="mt-3 text-3xl font-black uppercase md:text-5xl"
              style={{ color: "var(--app-text)" }}
            >
              Spawning {ARCADE_VARIANTS[pendingVariant].title}
            </h2>
            <p
              className="mt-4 max-w-2xl text-sm font-bold uppercase leading-7"
              style={{ color: "var(--app-muted)" }}
            >
              Building the room, locking in the ruleset, and opening your run.
            </p>

            <div className="mt-8 grid grid-cols-4 gap-3 md:grid-cols-8">
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={`arcade-loader-${index}`}
                  className="h-8 border-[3px] animate-pulse"
                  style={{
                    borderColor: "var(--app-text)",
                    background:
                      index % 2 === 0
                        ? "var(--app-accent)"
                        : "color-mix(in srgb, var(--app-accent) 24%, var(--app-panel-solid))",
                    boxShadow: "4px 4px 0 var(--app-shell-shadow)",
                    animationDelay: `${index * 110}ms`,
                  }}
                />
              ))}
            </div>

            <div
              className="mt-8 border-[3px] px-4 py-4 text-xs font-black uppercase leading-6"
              style={{
                borderColor: "var(--app-text)",
                background: "var(--app-bg)",
                color: "var(--app-text)",
              }}
            >
              Please wait.
              <br />
              This should only take a moment.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import type { ChessProvider } from "@/lib/chess-profile";

type OnboardingScreen = "needs-profile" | "needs-training";

interface CloneOnboardingProps {
  screen: OnboardingScreen;
  initialProvider?: ChessProvider;
  initialUsername?: string;
  onSuccess: (provider: ChessProvider, username: string) => Promise<void>;
  onError: (provider: ChessProvider, username: string) => void;
}

export function CloneOnboarding({
  screen,
  initialProvider = "lichess",
  initialUsername = "",
  onSuccess,
  onError,
}: CloneOnboardingProps) {
  const [provider, setProvider] = useState<ChessProvider>(initialProvider);
  const [username, setUsername] = useState(initialUsername);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/clone/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, username: username.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save profile");
      }
      // Transition to needs-training screen
      await onSuccess(provider, username.trim());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
      setLoading(false);
    }
  }

  async function handleTrainSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/clone/train", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Training failed");
      }
      await onSuccess(provider, username);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Training failed");
      onError(provider, username);
      setLoading(false);
    }
  }

  if (screen === "needs-profile") {
    return (
      <form
        onSubmit={handleProfileSubmit}
        className="flex flex-col gap-4 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-8 shadow-lg"
      >
        <h2 className="text-xl font-bold text-[var(--app-text)]">
          Connect your chess profile
        </h2>
        <p className="text-sm text-[var(--app-muted)]">
          Import your recent games to build your clone.
        </p>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-[var(--app-text)]">
            Provider
          </label>
          <div className="flex gap-2">
            {(["lichess", "chesscom"] as ChessProvider[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  provider === p
                    ? "border-[var(--app-accent)] bg-[var(--app-accent)] text-[var(--app-bg)]"
                    : "border-[var(--app-border)] text-[var(--app-text)] hover:border-[var(--app-accent)]"
                }`}
              >
                {p === "lichess" ? "Lichess" : "Chess.com"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-[var(--app-text)]">
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            className="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-4 py-2 text-[var(--app-text)] placeholder:text-[var(--app-muted)] focus:border-[var(--app-accent)] focus:outline-none"
            required
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={loading || !username.trim()}
          className="rounded-lg bg-[var(--app-accent)] px-4 py-2 font-semibold text-[var(--app-bg)] hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Continue"}
        </button>
      </form>
    );
  }

  // needs-training screen
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-8 shadow-lg">
      <h2 className="text-xl font-bold text-[var(--app-text)]">
        Ready to train your clone
      </h2>
      <p className="text-sm text-[var(--app-muted)]">
        We will import your 20 most recent games from{" "}
        <span className="font-medium text-[var(--app-text)]">
          {provider === "lichess" ? "Lichess" : "Chess.com"}
        </span>{" "}
        as{" "}
        <span className="font-medium text-[var(--app-text)]">{username}</span>.
      </p>
      <p className="text-sm text-[var(--app-muted)]">
        Your clone will learn your playing style and mirror it in your next
        game.
      </p>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        onClick={handleTrainSubmit}
        disabled={loading}
        className="rounded-lg bg-[var(--app-accent)] px-4 py-2 font-semibold text-[var(--app-bg)] hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Training…" : "Train Clone"}
      </button>
    </div>
  );
}

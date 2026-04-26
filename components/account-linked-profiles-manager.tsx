"use client";

import { useState } from "react";
import {
  getChessProfileUrl,
  getChessProviderLabel,
  type ChessProvider,
  type LinkedChessProfile,
} from "@/lib/chess-profile";
import { AccountLinkedProfileForm } from "@/components/account-linked-profile-form";

interface LinkedProfileListItem extends LinkedChessProfile {
  provider: ChessProvider;
}

export function AccountLinkedProfilesManager({
  profiles,
}: {
  profiles: LinkedProfileListItem[];
}) {
  const hasProfiles = profiles.length > 0;
  const [isAdding, setIsAdding] = useState(!hasProfiles);

  return (
    <div className="mt-4 grid gap-5">
      {hasProfiles ? (
        <div className="grid gap-4">
          {profiles.map((profile) => (
            <div
              key={`${profile.provider}:${profile.username.toLowerCase()}`}
              className="border-2 border-[var(--app-accent)] bg-[var(--app-accent-soft)] p-5 shadow-[4px_4px_0_color-mix(in_srgb,var(--app-accent)_18%,transparent)]"
            >
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--app-muted)]">
                Account we are judging
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="border border-[var(--app-border)] bg-[var(--app-panel-deep)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--app-text)]">
                  {getChessProviderLabel(profile.provider)}
                </span>
                <span className="text-lg font-bold text-[var(--app-text)]">
                  {profile.username}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">
                Connected on {new Date(profile.linkedAt).toLocaleDateString()}.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  href={getChessProfileUrl(profile)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center border border-[var(--app-accent)] bg-[var(--app-accent)] px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--app-accent-contrast)] transition hover:border-[var(--app-nav-hover-bg)] hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)]"
                >
                  Open profile
                </a>
                <form action="/auth/profile/unlink" method="post" className="flex">
                  <input type="hidden" name="next" value="/account" />
                  <input type="hidden" name="provider" value={profile.provider} />
                  <input type="hidden" name="username" value={profile.username} />
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center border border-[var(--app-border)] px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--app-text)] transition hover:border-[var(--app-nav-hover-bg)] hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)]"
                  >
                    Remove
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-7 text-[var(--app-muted)]">
          Add a public Chess.com or Lichess account. We need actual games before we
          can point at the recurring damage.
        </p>
      )}

      <section className="app-brutal-inset p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--app-muted)]">
              Add another account
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--app-muted)]">
              Add more accounts if you want the dashboard to compare where the bad
              habits live.
            </p>
          </div>
          {hasProfiles ? (
            <button
              type="button"
              onClick={() => setIsAdding((current) => !current)}
              className="inline-flex items-center justify-center border border-[var(--app-accent)] px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--app-text)] transition hover:border-[var(--app-nav-hover-bg)] hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)]"
            >
              {isAdding ? "Close" : "+ Add account"}
            </button>
          ) : null}
        </div>

        {(isAdding || !hasProfiles) && (
          <AccountLinkedProfileForm onLinked={() => setIsAdding(false)} />
        )}
      </section>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AccountLinkedProfileForm({
  onLinked,
}: {
  onLinked?: () => void;
}) {
  const router = useRouter();
  const [provider, setProvider] = useState<"chesscom" | "lichess">("chesscom");
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState(
    "Pick a site. Type the public username. We do the rest.",
  );
  const [isPending, startTransition] = useTransition();
  const lastSubmittedRef = useRef("");

  useEffect(() => {
    const normalized = username.trim();
    if (!normalized) {
      setMessage("Start with the public username.");
      return;
    }

    const submissionKey = `${provider}:${normalized}`;
    if (submissionKey === lastSubmittedRef.current) return;

    const timeoutId = window.setTimeout(() => {
      startTransition(async () => {
        const formData = new FormData();
        formData.set("next", "/account");
        formData.set("provider", provider);
        formData.set("username", normalized);

        const response = await fetch("/auth/profile/link", {
          method: "POST",
          headers: {
            "x-chessview-fetch": "1",
          },
          body: formData,
        });

        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;

        if (!response.ok || !payload?.ok) {
          switch (payload?.error) {
            case "profile-not-found":
              setMessage("That profile does not exist. Or you typed it wrong.");
              break;
            case "invalid-username":
              setMessage("That username format looks wrong.");
              break;
            case "storage-needs-migration":
              setMessage("The linked-profile table is behind. Run the migration.");
              break;
            default:
              setMessage("Could not link that profile right now.");
          }
          return;
        }

        lastSubmittedRef.current = submissionKey;
        setMessage("Profile linked. The digging can start.");
        if (window.location.pathname !== "/train") {
          void fetch("/api/train/initialize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "analyze" }),
          }).catch(() => {});
        }
        onLinked?.();
        router.refresh();
      });
    }, 600);

    return () => window.clearTimeout(timeoutId);
  }, [onLinked, provider, router, startTransition, username]);

  return (
    <div className="mt-4 grid max-w-[520px] gap-4">
      <label className="grid gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--app-text)]">
          Provider
        </span>
        <select
          value={provider}
          onChange={(event) =>
            setProvider(event.target.value === "lichess" ? "lichess" : "chesscom")
          }
          className="app-brutal-input px-4 py-3 text-sm text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)]"
        >
          <option value="chesscom">Chess.com</option>
          <option value="lichess">Lichess</option>
        </select>
      </label>

      <label className="grid gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--app-text)]">
          Username
        </span>
        <input
          type="text"
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
            setMessage("");
          }}
          placeholder="e.g. hikaru or thibault"
          autoComplete="off"
          className="app-brutal-input px-4 py-3 text-sm text-[var(--app-text)] outline-none transition placeholder:text-[var(--app-muted-soft)] focus:border-[var(--app-accent)]"
        />
      </label>

      <p className="text-sm leading-6 text-[var(--app-muted)]">
        {isPending ? "Checking that account..." : message}
      </p>
    </div>
  );
}

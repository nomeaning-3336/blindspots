"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AccountLinkedProfileForm() {
  const router = useRouter();
  const [provider, setProvider] = useState<"chesscom" | "lichess">("chesscom");
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState(
    "Provider and username autosave once the profile looks valid.",
  );
  const [isPending, startTransition] = useTransition();
  const lastSubmittedRef = useRef("");

  useEffect(() => {
    const normalized = username.trim();
    if (!normalized) {
      setMessage("Enter a username to link a profile.");
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
              setMessage("That public profile could not be found.");
              break;
            case "invalid-username":
              setMessage("That username format does not look valid yet.");
              break;
            default:
              setMessage("Profile could not be linked right now.");
          }
          return;
        }

        lastSubmittedRef.current = submissionKey;
        setMessage("Profile linked.");
        router.refresh();
      });
    }, 600);

    return () => window.clearTimeout(timeoutId);
  }, [provider, router, startTransition, username]);

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
        {isPending ? "Linking profile..." : message}
      </p>
    </div>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { APP_THEMES, type AppTheme } from "@/lib/app-theme";

const THEME_LOCAL_STORAGE_KEY = "chessview-theme";
const THEME_COOKIE_NAME = "chessview-theme";

function setThemeCookie(theme: AppTheme) {
  // Set cookie with SameSite=Lax for cross-site requests
  document.cookie = `${THEME_COOKIE_NAME}=${theme};path=/;SameSite=Lax;max-age=31536000`;
}

export function AccountThemeForm({
  currentTheme,
}: {
  currentTheme: AppTheme | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  // For unauthenticated users, use the server-provided theme (from cookie)
  // For authenticated users, use the server-provided theme (from database)
  const selectedTheme = currentTheme ?? "midnight";
  const initialThemeRef = { current: selectedTheme };

  // Apply theme on mount
  useEffect(() => {
    document.documentElement.dataset.theme = selectedTheme;
  }, [selectedTheme]);

  const handleThemeChange = (newTheme: AppTheme) => {
    // Optimistically update
    document.documentElement.dataset.theme = newTheme;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("next", "/account");
      formData.set("theme", newTheme);

      const response = await fetch("/auth/theme/save", {
        method: "POST",
        headers: {
          "x-chessview-fetch": "1",
        },
        body: formData,
      });

      if (response.status === 401) {
        // Unauthenticated - save to localStorage AND set cookie
        try {
          localStorage.setItem(THEME_LOCAL_STORAGE_KEY, newTheme);
          setThemeCookie(newTheme);
          initialThemeRef.current = newTheme;
          setMessage("Saved on this browser at least.");
          return;
        } catch {
          setMessage("That did not save.");
          return;
        }
      }

      if (!response.ok) {
        setMessage("Theme did not save right now.");
        return;
      }

      initialThemeRef.current = newTheme;
      setMessage("Theme saved.");
    });
  };

  return (
    <div className="mt-6 grid gap-5">
      <div className="app-theme-grid">
        {APP_THEMES.map((theme) => (
          <label key={theme.id} className="app-theme-option">
            <input
              type="radio"
              name="theme"
              value={theme.id}
              checked={selectedTheme === theme.id}
              onChange={() => handleThemeChange(theme.id)}
            />
            <div className="app-theme-option-card">
              <div className="app-theme-preview">
                {theme.preview.map((color, index) => (
                  <span
                    key={`${theme.id}-${index}`}
                    className="app-theme-swatch"
                    style={{ background: color }}
                  />
                ))}
              </div>
              <div className="app-theme-meta mt-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--app-text)]">
                  {theme.label}
                </p>
                <p className="text-sm leading-6 text-[var(--app-muted)]">
                  {theme.description}
                </p>
              </div>
            </div>
          </label>
        ))}
      </div>

      <p className="text-sm leading-6 text-[var(--app-muted)]">
        {isPending ? "Saving theme..." : message}
      </p>
    </div>
  );
}

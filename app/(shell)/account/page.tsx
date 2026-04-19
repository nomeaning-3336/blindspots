import { getUserAppTheme } from "@/lib/app-theme-store";
import { getLinkedChessProfiles } from "@/lib/chess-profile-store";
import { getAnalyzePreferences } from "@/lib/analyze-preferences-store";
import { syncAnalyzePreferencesWithAppTheme } from "@/lib/analyze-preferences";
import { AccountThemeForm } from "@/components/account-theme-form";
import { AnalyzeSettingsForm } from "@/components/analyze-settings-form";
import { AccountLinkedProfilesManager } from "@/components/account-linked-profiles-manager";
import { getOptionalAppUserId } from "@/lib/app-auth";

function bannerCopy(status?: string | null, error?: string | null, provider?: string | null) {
  if (error === "invalid-provider") {
    return { tone: "error", message: "Choose either Chess.com or Lichess before linking." };
  }

  if (error === "invalid-username") {
    return { tone: "error", message: "That username format does not look valid yet." };
  }

  if (error === "profile-not-found") {
    return {
      tone: "error",
      message: "The public profile could not be found. Double-check the username and try again.",
    };
  }

  if (error === "storage-unavailable") {
    return {
      tone: "error",
      message:
        "Supabase storage is not ready yet. Run the linked-profile SQL migration, then try again.",
    };
  }

  if (error === "storage-needs-migration") {
    return {
      tone: "error",
      message:
        "The linked-profile table is still on the old schema. Run the latest Supabase migration for multiple linked accounts, then try again.",
    };
  }

  if (error === "theme-storage-unavailable") {
    return {
      tone: "error",
      message: "The theme could not be saved right now. Try again in a moment.",
    };
  }

  if (status === "linked") {
    return {
      tone: "success",
      message: `Linked ${provider ?? "the profile"} successfully. Performance can use it immediately.`,
    };
  }

  if (status === "unlinked") {
    return {
      tone: "success",
      message: "The linked chess profile was removed from your account.",
    };
  }

  if (status === "theme-saved") {
    return {
      tone: "success",
      message: "Theme updated for your account.",
    };
  }

  return null;
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    error?: string | string[];
    provider?: string | string[];
  }>;
}) {
  const userId = await getOptionalAppUserId();

  const [linkedProfiles, currentTheme, analyzePreferences, resolvedSearchParams] = await Promise.all([
    getLinkedChessProfiles(),
    getUserAppTheme(),
    getAnalyzePreferences(),
    searchParams,
  ]);

  const status = Array.isArray(resolvedSearchParams.status)
    ? resolvedSearchParams.status[0]
    : resolvedSearchParams.status;
  const error = Array.isArray(resolvedSearchParams.error)
    ? resolvedSearchParams.error[0]
    : resolvedSearchParams.error;
  const provider = Array.isArray(resolvedSearchParams.provider)
    ? resolvedSearchParams.provider[0]
    : resolvedSearchParams.provider;
  const banner = bannerCopy(status, error, provider);
  const currentAnalyzePreferences = syncAnalyzePreferencesWithAppTheme(
    analyzePreferences,
    currentTheme,
  );

  return (
    <section className="w-full overflow-auto pb-2">
      <div className="mx-auto grid w-full max-w-[1180px] gap-6">
        <div className="app-brutal-card-strong p-8">
          <h1 className="text-3xl font-bold uppercase tracking-[0.16em] text-white">
            Account
          </h1>
        </div>

        {banner ? (
          <div
            className={[
              "border-2 px-5 py-4 text-sm leading-6 shadow-[4px_4px_0_color-mix(in_srgb,var(--app-border-strong)_14%,transparent)]",
              banner.tone === "error"
                ? "border-rose-400/40 bg-rose-400/10 text-rose-100"
                : "border-emerald-400/35 bg-emerald-400/10 text-emerald-100",
            ].join(" ")}
          >
            {banner.message}
          </div>
        ) : null}

        <article className="app-brutal-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--app-muted)]">
                Analyze
              </p>
              <h2 className="mt-3 text-2xl font-bold uppercase tracking-[0.14em] text-white">
                Engine Search Settings
              </h2>
            </div>
          </div>

          <AnalyzeSettingsForm
            currentPreferences={currentAnalyzePreferences}
            sections="search"
          />
        </article>

        {userId && (
          <article className="app-brutal-card p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--app-muted)]">
              Linked Profiles
            </p>

            <AccountLinkedProfilesManager profiles={linkedProfiles} />
          </article>
        )}

        <article className="app-brutal-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--app-muted)]">
                Appearance
              </p>
              <h2 className="mt-3 text-2xl font-bold uppercase tracking-[0.14em] text-white">
                Themes & Visuals
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--app-muted)]">
                Your app theme now drives the board colors automatically, while piece sets stay configurable here.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-5">
            <section className="app-brutal-inset p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--app-muted)]">
                App Theme
              </p>
              <AccountThemeForm currentTheme={currentTheme} />
            </section>

            <AnalyzeSettingsForm
              currentPreferences={currentAnalyzePreferences}
              sections="visual"
              saveLabel="Save Visual Settings"
            />
          </div>
        </article>
      </div>
    </section>
  );
}

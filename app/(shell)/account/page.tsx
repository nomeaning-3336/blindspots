import { getUserAppTheme } from "@/lib/app-theme-store";
import { getLinkedChessProfiles } from "@/lib/chess-profile-store";
import { getAnalyzePreferences } from "@/lib/analyze-preferences-store";
import { syncAnalyzePreferencesWithAppTheme } from "@/lib/analyze-preferences";
import { AccountThemeForm } from "@/components/account-theme-form";
import { AnalyzeSettingsForm } from "@/components/analyze-settings-form";
import { AccountTrainingPreferencesForm } from "@/components/account-training-preferences-form";
import { AccountLinkedProfilesManager } from "@/components/account-linked-profiles-manager";
import { getVerifiedAppUserId } from "@/lib/app-auth";
import { getTrainingPreferences } from "@/lib/training-preferences-store";
import { redirect } from "next/navigation";

function bannerCopy(status?: string | null, error?: string | null, provider?: string | null) {
  if (error === "invalid-provider") {
    return { tone: "error", message: "Pick Chess.com or Lichess first. We cannot infer intent from vibes." };
  }

  if (error === "invalid-username") {
    return { tone: "error", message: "That username does not look valid. Try the public one, not the imaginary one." };
  }

  if (error === "profile-not-found") {
    return {
      tone: "error",
      message: "That public profile could not be found. Double-check the username and try again.",
    };
  }

  if (error === "storage-unavailable") {
    return {
      tone: "error",
      message:
        "Supabase storage is not ready. Run the migration, then come back.",
    };
  }

  if (error === "storage-needs-migration") {
    return {
      tone: "error",
      message:
        "The linked-profile table is still on the old schema. Run the latest migration and stop fighting the database.",
    };
  }

  if (error === "theme-storage-unavailable") {
    return {
      tone: "error",
      message: "The theme would not save. Try again.",
    };
  }

  if (status === "linked") {
    return {
      tone: "success",
      message: `Linked ${provider ?? "the profile"}. The dashboard can start digging through it immediately.`,
    };
  }

  if (status === "unlinked") {
    return {
      tone: "success",
      message: "Linked profile removed. The mistakes remain.",
    };
  }

  if (status === "theme-saved") {
    return {
      tone: "success",
      message: "Theme updated. A cosmetic victory.",
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
  const userIdResult = await getVerifiedAppUserId();

  if (userIdResult.status !== "valid") {
    if (process.env.NODE_ENV !== "production") {
      console.log("[auth] /account redirecting — status:", userIdResult.status);
    }
    redirect("/sign-in?next=/account");
  }

  const userId = userIdResult.userId;

  const [
    linkedProfiles,
    currentTheme,
    analyzePreferences,
    trainingPreferences,
    resolvedSearchParams,
  ] = await Promise.all([
    getLinkedChessProfiles(),
    getUserAppTheme(),
    getAnalyzePreferences(),
    getTrainingPreferences(),
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
                <h2 className="text-2xl font-bold uppercase tracking-[0.14em] text-white">
                  Engine search settings
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
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold uppercase tracking-[0.14em] text-white">
                  Linked profiles
                </h2>
              </div>
            </div>

            <AccountLinkedProfilesManager profiles={linkedProfiles} />
          </article>
        )}

        {userId && (
          <article className="app-brutal-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold uppercase tracking-[0.14em] text-white">
                  Things you can change about how you suffer
                </h2>
              </div>
            </div>

            <AccountTrainingPreferencesForm
              currentPreferences={trainingPreferences ?? { sequenceLength: 4 }}
            />
          </article>
        )}

        <article className="app-brutal-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
                <h2 className="text-2xl font-bold uppercase tracking-[0.14em] text-white">
                  Themes and visuals
                </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--app-muted)]">
                The app theme drives the board colors automatically. Piece sets still live here because apparently people care.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-5">
            <section className="app-brutal-inset p-5">
              <AccountThemeForm currentTheme={currentTheme} />
            </section>

            <AnalyzeSettingsForm
              currentPreferences={currentAnalyzePreferences}
              sections="visual"
              saveLabel="Save visual settings"
            />
          </div>
        </article>
      </div>
    </section>
  );
}

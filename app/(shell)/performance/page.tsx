import { PerformanceDashboard } from "@/components/performance-dashboard";
import {
  buildLinkedChessProfileKey,
  normalizeGameType,
  normalizeLinkedChessProfileKey,
  normalizeRangeDays,
  type PerformanceGameType,
  type PerformanceRangeDays,
} from "@/lib/chess-profile";
import { getLinkedChessProfiles } from "@/lib/chess-profile-store";
import { getPerformanceReport } from "@/lib/chess-performance-server";
import { requireAppAuth } from "@/lib/app-auth";

const PERFORMANCE_PAGE_SCROLL_CLASS = "w-full overflow-auto pb-2";

function buildFilterHref(
  rangeDays: PerformanceRangeDays,
  gameType: PerformanceGameType,
  profileKeys: string[],
) {
  const params = new URLSearchParams();
  params.set("range", String(rangeDays));
  params.set("type", gameType);
  if (profileKeys.length > 0) {
    params.set("profiles", profileKeys.join(","));
  }
  return `/performance?${params.toString()}`;
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string | string[];
    type?: string | string[];
    profiles?: string | string[];
  }>;
}) {
  await requireAppAuth("/performance");

  const [linkedProfiles, resolvedSearchParams] = await Promise.all([
    getLinkedChessProfiles(),
    searchParams,
  ]);
  const preferenceSeedProfile =
    linkedProfiles.find((profile) => profile.performancePreferences) ?? linkedProfiles[0] ?? null;

  const rangeDays =
    typeof resolvedSearchParams.range !== "undefined"
      ? normalizeRangeDays(resolvedSearchParams.range)
      : preferenceSeedProfile?.performancePreferences?.rangeDays ?? 90;
  const gameType =
    typeof resolvedSearchParams.type !== "undefined"
      ? normalizeGameType(resolvedSearchParams.type)
      : preferenceSeedProfile?.performancePreferences?.gameType ?? "all";
  const availableProfileKeys = new Set(
    linkedProfiles.map((profile) => buildLinkedChessProfileKey(profile)),
  );
  const requestedProfileValues = Array.isArray(resolvedSearchParams.profiles)
    ? resolvedSearchParams.profiles
    : typeof resolvedSearchParams.profiles === "string"
      ? [resolvedSearchParams.profiles]
      : [];
  const initialProfileKeys = Array.from(
    new Set(
      requestedProfileValues
        .flatMap((value) => String(value || "").split(","))
        .map((value) => normalizeLinkedChessProfileKey(value))
        .filter((value): value is string => Boolean(value && availableProfileKeys.has(value))),
    ),
  );
  const selectedProfileKeys =
    initialProfileKeys.length > 0
      ? initialProfileKeys
      : linkedProfiles.map((profile) => buildLinkedChessProfileKey(profile));

  if (!linkedProfiles.length) {
    return (
      <section className={PERFORMANCE_PAGE_SCROLL_CLASS}>
        <div className="mx-auto grid w-full max-w-[1180px] gap-6">
          <div className="app-brutal-card-strong p-8">
            <h1 className="text-3xl font-bold uppercase tracking-[0.16em] text-white">
              Link A Chess Profile First
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--app-muted)]">
              The dashboard needs at least one public Chess.com or Lichess username
              tied to your account before it can fetch games and compute your metrics.
            </p>
            <div className="mt-6">
              <a
                href="/account"
                className="inline-flex items-center justify-center border border-[var(--app-accent)] bg-[var(--app-accent)] px-5 py-3 text-xs font-bold uppercase tracking-[0.18em] !text-black transition hover:border-[var(--app-nav-hover-bg)] hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)]"
              >
                Open Account Linking
              </a>
            </div>
          </div>
        </div>
      </section>
    );
  }

  try {
    const report = await getPerformanceReport(linkedProfiles);

    return (
      <section className={PERFORMANCE_PAGE_SCROLL_CLASS}>
        <PerformanceDashboard
          report={report}
          initialRangeDays={rangeDays}
          initialGameType={gameType}
          initialProfileKeys={selectedProfileKeys}
        />
      </section>
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "The provider request failed.";

    return (
      <section className={PERFORMANCE_PAGE_SCROLL_CLASS}>
        <div className="mx-auto grid w-full max-w-[1180px] gap-6">
          <div className="app-brutal-card-strong p-8">
            <h1 className="text-3xl font-bold uppercase tracking-[0.16em] text-white">
              Data Fetch Failed
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--app-muted)]">
              The linked provider could not be reached cleanly right now. Try the
              same filter again, or relink the account if the username changed.
            </p>
            <div className="mt-6 border-2 border-rose-400/35 bg-rose-400/10 px-5 py-4 text-sm leading-6 text-rose-100 shadow-[4px_4px_0_color-mix(in_srgb,rgba(251,113,133,1)_18%,transparent)]">
              {errorMessage}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={buildFilterHref(rangeDays, gameType, selectedProfileKeys)}
                className="inline-flex items-center justify-center border border-[var(--app-accent)] bg-[var(--app-accent)] px-5 py-3 text-xs font-bold uppercase tracking-[0.18em] !text-black transition hover:border-[var(--app-nav-hover-bg)] hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)]"
              >
                Retry
              </a>
              <a
                href="/account"
                className="inline-flex items-center justify-center border border-[var(--app-border)] px-5 py-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--app-text)] transition hover:border-[var(--app-nav-hover-bg)] hover:bg-[var(--app-nav-hover-bg)] hover:text-[var(--app-nav-hover-text)]"
              >
                Manage Linked Profiles
              </a>
            </div>
          </div>
        </div>
      </section>
    );
  }
}

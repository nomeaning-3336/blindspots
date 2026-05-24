import { PublicHeaderClient } from "@/components/public-header";
import { getOptionalAppUserId } from "@/lib/app-auth";

export default async function HomePage() {
  const userId = await getOptionalAppUserId();

  if (userId) {
    const { BlindspotsSpaPrototype } = await import("@/components/blindspots-spa-prototype");
    return <BlindspotsSpaPrototype />;
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-transparent">
      <PublicHeaderClient />
      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-clip">
        <section className="mx-auto grid min-h-[calc(100dvh-64px)] w-full min-w-0 max-w-full overflow-x-clip gap-10 px-6 py-10 md:max-w-6xl md:grid-cols-[minmax(0,1fr)_minmax(22rem,1.1fr)] md:items-center md:gap-14 md:px-10 md:py-16">
          <div className="flex min-w-0 flex-col items-center justify-center px-2 text-center md:px-0">
            <h1 className="max-w-[11ch] text-[clamp(2.5rem,4.4vw,4.05rem)] font-black leading-[0.98] tracking-[-0.035em] text-[var(--app-text)]">
              This website is{" "}
              <span className="italic text-[var(--app-accent)]">still under development</span>.
            </h1>

            <p className="mt-6 max-w-md text-base leading-8 text-[var(--app-muted)]">
              You can use it while we build. Some things will break. We are not sorry.
            </p>
          </div>
        </section>

        <footer className="mx-auto flex w-full min-w-0 max-w-full flex-col gap-4 overflow-x-clip border-t border-[var(--app-border)] px-6 py-6 md:max-w-7xl md:flex-row md:items-center md:justify-between md:px-10">
          <span className="inline-flex items-center gap-3 text-sm font-semibold text-[var(--app-text)]">
            <img src="/blindspots-logo.svg" width={20} height={20} alt="" className="shrink-0" />
            Blindspots<span className="text-[var(--app-accent)]">.gg</span>
          </span>
          <p className="max-w-full break-words text-[10px] uppercase text-[var(--app-muted)]">
            (c) 2026 / No rooks were sacrificed
          </p>
        </footer>
      </main>
    </div>
  );
}
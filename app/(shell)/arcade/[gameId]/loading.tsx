export default function ArcadeGameLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center px-6">
      <div
        className="w-full max-w-[760px] border-[3px] px-6 py-8 md:px-8 md:py-10"
        style={{
          borderColor: "var(--app-text)",
          background:
            "linear-gradient(180deg, var(--app-panel-solid), color-mix(in srgb, var(--app-accent) 8%, var(--app-panel-solid)))",
          boxShadow: "14px 14px 0 var(--app-shell-shadow)",
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
          Opening Game Room
        </h2>
        <p
          className="mt-4 max-w-2xl text-sm font-bold uppercase leading-7"
          style={{ color: "var(--app-muted)" }}
        >
          Restoring the board, loading the saved run, and preparing the cabinet.
        </p>

        <div className="mt-8 grid grid-cols-5 gap-3 md:grid-cols-10">
          {Array.from({ length: 10 }).map((_, index) => (
            <div
              key={`arcade-route-loader-${index}`}
              className="h-8 border-[3px] animate-pulse"
              style={{
                borderColor: "var(--app-text)",
                background:
                  index % 2 === 0
                    ? "var(--app-accent)"
                    : "color-mix(in srgb, var(--app-accent) 24%, var(--app-panel-solid))",
                boxShadow: "4px 4px 0 var(--app-shell-shadow)",
                animationDelay: `${index * 90}ms`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ShellLoading() {
  return (
    <div className="relative z-10 flex min-h-0 w-full flex-1 items-center justify-center">
      <div
        className="h-10 w-10 animate-spin rounded-full border-2"
        style={{
          borderColor: "color-mix(in srgb, var(--app-border-strong) 12%, transparent)",
          borderTopColor: "var(--app-accent)",
        }}
        aria-label="Loading"
      />
    </div>
  );
}

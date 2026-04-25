export default function TrainLoading() {
  return (
    <div
      className="relative flex h-full w-full items-center justify-center"
      data-route-loading="true"
    >
      <div
        className="h-10 w-10 animate-spin rounded-full border-2"
        style={{
          borderColor: "color-mix(in srgb, var(--app-border-strong) 12%, transparent)",
          borderTopColor: "var(--app-accent)",
        }}
        aria-label="Loading train"
      />
    </div>
  );
}

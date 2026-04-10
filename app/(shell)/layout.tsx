import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { AppShellNav } from "@/components/app-shell-nav";

export default async function ProtectedAppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const { userId } = await auth();
  const isSignedIn = Boolean(userId);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-transparent">
      <header className="relative z-40 shrink-0 px-4 md:px-6">
        <div
          className="w-full px-5 py-4"
          style={{
            border: "2px solid var(--app-shell-border)",
            background: "var(--app-panel-solid)",
            boxShadow: "4px 4px 0 var(--app-shell-shadow)",
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <h1>
              <a
                href="/"
                className="font-bold uppercase tracking-[0.24em] text-[var(--app-text)] transition hover:text-[var(--app-accent)]"
                style={{ fontSize: "20px", lineHeight: 1 }}
              >
                chessview.ai
              </a>
            </h1>
            <AppShellNav isSignedIn={isSignedIn} />
          </div>
        </div>
      </header>
      <main className="flex min-h-0 w-full flex-1 overflow-hidden px-4 pb-4 md:px-6">
        {children}
      </main>
    </div>
  );
}

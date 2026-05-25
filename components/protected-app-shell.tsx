import type { ReactNode } from "react";

export function ProtectedAppShell({
  children,
  isSignedIn: _isSignedIn,
}: Readonly<{
  children: ReactNode;
  isSignedIn: boolean;
}>) {
  return (
    <div className="relative flex h-[100dvh] overflow-hidden bg-transparent">
      <div aria-hidden="true" className="app-ambient" />
      <main className="relative z-10 flex min-h-0 w-full overflow-hidden">
        {children}
      </main>
    </div>
  );
}

import type { ReactNode } from "react";
import { getShellAuthHint } from "@/lib/app-auth";
import { ProtectedAppShell } from "@/components/protected-app-shell";

export default async function ProtectedAppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const isSignedIn = await getShellAuthHint();

  return <ProtectedAppShell isSignedIn={isSignedIn}>{children}</ProtectedAppShell>;
}

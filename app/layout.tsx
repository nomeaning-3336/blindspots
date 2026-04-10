import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { getUserAppTheme } from "@/lib/app-theme-store";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Chessview",
    template: "%s | Chessview",
  },
  description:
    "Incremental local-first Next.js shell for the Chessview analysis app.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const theme = await getUserAppTheme();

  return (
    <html lang="en" className={jetbrainsMono.variable} data-theme={theme}>
      <body>
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          afterSignOutUrl="/"
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { PageTransition } from "@/components/navigation/page-transition";
import { getUserAppTheme } from "@/lib/app-theme-store";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Blindspots.gg",
    template: "%s | Blindspots.gg",
  },
  description:
    "Position-based chess training for finding and drilling blindspots.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const theme = await getUserAppTheme();

  return (
    <html
      lang="en"
      className={jetbrainsMono.variable}
      data-theme={theme ?? undefined}
    >
      <body>
        <PageTransition>{children}</PageTransition>
      </body>
    </html>
  );
}

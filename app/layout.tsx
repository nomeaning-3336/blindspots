import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { PageTransition } from "@/components/navigation/page-transition";
import { getCookieAppThemeOnly } from "@/lib/app-theme-store";
import { PostHogProvider } from "./providers";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: "https://blindspots.gg",
  title: {
    default: "Blindspots.gg - Chess Training for the Positions You Keep Getting Wrong",
    template: "%s | Blindspots.gg",
  },
  description:
    "Blindspots.gg is position-based chess training that finds recurring chess mistakes and recommends similar positions you are likely to struggle with.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Blindspots.gg - Chess Training for the Positions You Keep Getting Wrong",
    description:
      "Position-based chess training that finds recurring mistakes and recommends similar positions you are likely to struggle with.",
    url: "https://blindspots.gg",
    siteName: "Blindspots.gg",
    type: "website",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blindspots.gg - Chess Training for the Positions You Keep Getting Wrong",
    description:
      "Position-based chess training that finds recurring mistakes and recommends similar positions you are likely to struggle with.",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const theme = await getCookieAppThemeOnly();

  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable}`}
      data-theme={theme ?? undefined}
    >
      <body>
        <PostHogProvider>
          <PageTransition>{children}</PageTransition>
        </PostHogProvider>
      </body>
    </html>
  );
}

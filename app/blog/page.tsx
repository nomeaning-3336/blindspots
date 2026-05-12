import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeaderClient } from "@/components/public-header";
import { blogPosts } from "@/lib/blog-posts";

export const metadata: Metadata = {
  title: "Chess Training Blog",
  description:
    "Practical chess training notes on blindspots, game review, puzzle plateaus, and improving with positions from your own games.",
  alternates: {
    canonical: "/blog",
  },
  openGraph: {
    title: "Chess Training Blog | Blindspots.gg",
    description:
      "Practical chess training notes on blindspots, game review, puzzle plateaus, and improving with positions from your own games.",
    url: "https://blindspots.gg/blog",
    siteName: "Blindspots.gg",
    type: "website",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Chess Training Blog | Blindspots.gg",
    description:
      "Practical chess training notes on blindspots, game review, puzzle plateaus, and improving with positions from your own games.",
  },
};

export default function BlogPage() {
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-transparent">
      <PublicHeaderClient isSignedIn={false} />

      <main className="app-scroll min-h-0 flex-1 overflow-y-auto overflow-x-clip">
        <section className="mx-auto w-full max-w-5xl px-6 py-12 md:px-10 md:py-16">
          <div className="max-w-3xl">
            <h1 className="mt-4 text-[clamp(2.5rem,5vw,4.75rem)] font-black leading-[0.95] tracking-[-0.04em] text-[var(--app-text)]">
              Another chess improvement blog™.
            </h1>
          </div>

          <div className="mt-12 grid gap-5">
            {blogPosts.map((post) => (
              <article
                key={post.slug}
                className="app-brutal-section relative p-6 transition hover:-translate-y-0.5 md:p-7"
                style={{
                  "--hover-border": "var(--app-accent)",
                } as React.CSSProperties}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.borderColor = "var(--app-accent)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.borderColor = "")
                }
              >
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-muted)]">
                  <time dateTime={post.publishedAt}>{post.publishedAt}</time>
                </div>

                <h2 className="mt-4 text-2xl font-black tracking-[-0.03em] text-[var(--app-text)] md:text-3xl">
                  {post.title}
                </h2>

                <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--app-muted)] md:text-base">
                  {post.excerpt}
                </p>

                <Link
                  href={`/blog/${post.slug}`}
                  className="absolute inset-0 z-10 opacity-0"
                  aria-label={post.title}
                />
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
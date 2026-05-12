import type { Metadata } from "next";
import { PublicHeaderClient } from "@/components/public-header";
import { blogPosts } from "@/lib/blog-posts";
import { BlogCard } from "@/components/blog-card";

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
              <BlogCard
                key={post.slug}
                slug={post.slug}
                title={post.title}
                excerpt={post.excerpt}
                publishedAt={post.publishedAt}
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
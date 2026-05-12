import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicHeaderClient } from "@/components/public-header";
import { blogPosts, getBlogPostBySlug } from "@/lib/blog-posts";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export const dynamic = "force-static";

export function generateStaticParams() {
  return blogPosts.map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);

  if (!post) {
    return {
      title: "Article Not Found",
    };
  }

  const url = `https://blindspots.gg/blog/${post.slug}`;

  return {
    title: post.title,
    description: post.excerpt,
    keywords: post.keywords,
    alternates: {
      canonical: `/blog/${post.slug}`,
    },
    openGraph: {
      title: `${post.title} | Blindspots.gg`,
      description: post.excerpt,
      url,
      siteName: "Blindspots.gg",
      type: "article",
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: ["Blindspots.gg"],
      tags: post.keywords,
      images: ["/og.png"],
    },
    twitter: {
      card: "summary_large_image",
      title: `${post.title} | Blindspots.gg`,
      description: post.excerpt,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: {
      "@type": "Organization",
      name: "Blindspots.gg",
      url: "https://blindspots.gg",
    },
    publisher: {
      "@type": "Organization",
      name: "Blindspots.gg",
      url: "https://blindspots.gg",
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://blindspots.gg/blog/${post.slug}`,
    },
  };

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-transparent">
      <PublicHeaderClient isSignedIn={false} />

      <main className="app-scroll min-h-0 flex-1 overflow-y-auto overflow-x-clip">
        <article className="mx-auto w-full max-w-3xl px-6 py-12 md:px-10 md:py-16">
          <Link
            href="/blog"
            className="app-brutal-button-secondary inline-flex min-h-10 min-w-0 items-center justify-center px-3 py-2 text-center text-sm font-bold uppercase leading-none tracking-[0.1em] text-[var(--app-muted)] transition hover:text-[var(--app-text)] hover:!text-black"
          >
            Back to blog
          </Link>

          <header className="mt-8">
            <div className="flex flex-wrap items-center gap-3 text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-muted)]">
              <span>{post.category}</span>
              <span aria-hidden="true">/</span>
              <time dateTime={post.publishedAt}>{post.publishedAt}</time>
              <span aria-hidden="true">/</span>
              <span>{post.readingMinutes} min read</span>
            </div>

            <h1 className="mt-5 text-[clamp(2.25rem,5vw,4.4rem)] font-black leading-[0.98] tracking-[-0.045em] text-[var(--app-text)]">
              {post.title}
            </h1>

            <p className="mt-6 text-lg leading-8 text-[var(--app-muted)]">
              {post.excerpt}
            </p>
          </header>

          <div className="mt-12 space-y-10">
            {post.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-2xl font-black tracking-[-0.03em] text-[var(--app-text)]">
                  {section.heading}
                </h2>

                <div className="mt-4 space-y-4">
                  {section.body.map((paragraph) => (
                    <p
                      key={paragraph}
                      className="text-base leading-8 text-[var(--app-muted)]"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>

                {section.bullets ? (
                  <ul className="mt-5 list-disc space-y-3 pl-6 text-base leading-7 text-[var(--app-muted)]">
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        </article>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
        />
      </main>
    </div>
  );
}
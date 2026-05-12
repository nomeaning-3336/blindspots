"use client";

import Link from "next/link";

type BlogCardProps = {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string;
};

export function BlogCard({ slug, title, excerpt, publishedAt }: BlogCardProps) {
  return (
    <article className="app-brutal-section blog-card relative p-6 transition hover:-translate-y-0.5 md:p-7">
      <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-muted)]">
        <time dateTime={publishedAt}>{publishedAt}</time>
      </div>

      <h2 className="mt-4 text-2xl font-black tracking-[-0.03em] text-[var(--app-text)] md:text-3xl">
        {title}
      </h2>

      <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--app-muted)] md:text-base">
        {excerpt}
      </p>

      <Link
        href={`/blog/${slug}`}
        className="absolute inset-0 z-10 opacity-0"
        aria-label={title}
      />
    </article>
  );
}
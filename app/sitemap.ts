import type { MetadataRoute } from "next";
import { blogPosts } from "@/lib/blog-posts";

const siteUrl = "https://blindspots.gg";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified: new Date("2026-05-12"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/blog`,
      lastModified: new Date("2026-05-12"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...blogPosts.map((post) => ({
      url: `${siteUrl}/blog/${post.slug}`,
      lastModified: new Date(post.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
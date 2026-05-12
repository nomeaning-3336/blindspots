import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/auth/",
        "/settings",
        "/train",
        "/sign-in",
        "/sign-up",
      ],
    },
    sitemap: "https://blindspots.gg/sitemap.xml",
  };
}
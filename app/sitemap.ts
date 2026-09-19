import type { MetadataRoute } from "next";
import { docHref, docsNav } from "@/src/content/docs";
import { siteContent } from "@/src/content/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/launch", "/vibeathon", ...docsNav.map(([slug]) => docHref(slug))].map(path => ({
    url: new URL(path, siteContent.url).href,
    changeFrequency: path.startsWith("/docs") ? "monthly" : "daily",
    priority: path === "/" ? 1 : 0.8,
  }));
}
